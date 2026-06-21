import { appendFile, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

export type EmailDeliveryMethod = "BREVO_API" | "SMTP" | "WEBHOOK" | "OUTBOX";

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SmtpResponse {
  code: number;
  message: string;
}

type SmtpSocket = net.Socket | tls.TLSSocket;

class SmtpResponseReader {
  private buffer = "";
  private closed = false;
  private lastError: Error | null = null;
  private pending:
    | {
        resolve: (response: SmtpResponse) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
      }
    | undefined;

  private readonly handleData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    this.flush();
  };

  private readonly handleError = (error: Error) => {
    this.lastError = error;
    this.rejectPending(error);
  };

  private readonly handleClose = () => {
    this.closed = true;
    this.rejectPending(new Error("SMTP connection closed before completing the request."));
  };

  constructor(private readonly socket: SmtpSocket) {
    socket.on("data", this.handleData);
    socket.on("error", this.handleError);
    socket.on("close", this.handleClose);
  }

  dispose() {
    this.socket.off("data", this.handleData);
    this.socket.off("error", this.handleError);
    this.socket.off("close", this.handleClose);
  }

  read(timeoutMs: number): Promise<SmtpResponse> {
    const parsed = this.parseResponse();

    if (parsed) {
      return Promise.resolve(parsed);
    }

    if (this.lastError) {
      return Promise.reject(this.lastError);
    }

    if (this.closed) {
      return Promise.reject(new Error("SMTP connection is closed."));
    }

    if (this.pending) {
      return Promise.reject(new Error("SMTP response reader is already waiting for a response."));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejectPending(new Error("SMTP server response timed out."));
      }, timeoutMs);

      this.pending = {
        resolve,
        reject,
        timer
      };
      this.flush();
    });
  }

  private flush() {
    if (!this.pending) {
      return;
    }

    const parsed = this.parseResponse();

    if (!parsed) {
      return;
    }

    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve(parsed);
  }

  private rejectPending(error: Error) {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private parseResponse(): SmtpResponse | null {
    const lines: Array<{ raw: string; end: number }> = [];
    let cursor = 0;

    while (cursor < this.buffer.length) {
      const lineEnd = this.buffer.indexOf("\n", cursor);

      if (lineEnd === -1) {
        break;
      }

      lines.push({
        raw: this.buffer.slice(cursor, lineEnd).replace(/\r$/, ""),
        end: lineEnd + 1
      });
      cursor = lineEnd + 1;
    }

    const responseLines: string[] = [];

    for (const line of lines) {
      responseLines.push(line.raw);

      const match = /^(\d{3})([\s-])/.exec(line.raw);

      if (match && match[2] === " ") {
        this.buffer = this.buffer.slice(line.end);
        return {
          code: Number(match[1]),
          message: responseLines.join("\n")
        };
      }
    }

    return null;
  }
}

async function appendEmailToOutbox(payload: EmailPayload) {
  const outboxDir = path.resolve(__dirname, "../../../..", "runtime-logs");
  const outboxFile = path.join(outboxDir, "email-outbox.log");

  await mkdir(outboxDir, { recursive: true });
  await appendFile(
    outboxFile,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      ...payload
    })}\n`,
    "utf8"
  );
}

function emailDeliveryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getEmailTimeoutMs() {
  return Number(process.env.EMAIL_TIMEOUT_MS ?? process.env.SMTP_TIMEOUT_MS ?? 10000);
}

function shouldRejectUnauthorizedSmtpTls() {
  return process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const timeoutMs = getEmailTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseEmailAddress(value: string) {
  const match = /<([^>]+)>/.exec(value);
  const address = (match ? match[1] : value).trim();

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error(`Invalid email address: ${value}`);
  }

  return address;
}

function parseEmailIdentity(value: string) {
  const match = /^(.*?)<([^>]+)>$/.exec(value);
  const email = parseEmailAddress(match ? match[2] : value);
  const rawName = match ? match[1].trim().replace(/^"|"$/g, "") : "";

  return {
    email,
    name: rawName || undefined
  };
}

function encodeMimeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function formatAddressHeader(value: string) {
  const match = /^(.*?)<([^>]+)>$/.exec(value);

  if (!match) {
    return parseEmailAddress(value);
  }

  const name = match[1].trim().replace(/^"|"$/g, "");
  const address = parseEmailAddress(match[2]);

  return name ? `${encodeMimeHeader(name)} <${address}>` : address;
}

function encodeBase64Lines(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function normalizeCrlf(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function dotStuff(message: string) {
  return normalizeCrlf(message)
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildMimeMessage(payload: EmailPayload, from: string) {
  const fromHeader = formatAddressHeader(from);
  const toHeader = formatAddressHeader(payload.to);
  const headers = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${encodeMimeHeader(payload.subject)}`,
    "MIME-Version: 1.0",
    "Date: " + new Date().toUTCString()
  ];

  if (!payload.html) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Lines(payload.text)
    ].join("\r\n");
  }

  const boundary = `healthcare-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(payload.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(payload.html),
    `--${boundary}--`
  ].join("\r\n");
}

function isExpectedResponse(response: SmtpResponse, expectedCodes: number[]) {
  return expectedCodes.includes(response.code);
}

async function sendSmtpCommand(
  socket: SmtpSocket,
  reader: SmtpResponseReader,
  command: string,
  expectedCodes: number[],
  timeoutMs: number
) {
  socket.write(`${command}\r\n`);
  const response = await reader.read(timeoutMs);

  if (!isExpectedResponse(response, expectedCodes)) {
    throw new Error(`Unexpected SMTP response ${response.code}: ${response.message}`);
  }

  return response;
}

async function trySmtpCommand(
  socket: SmtpSocket,
  reader: SmtpResponseReader,
  command: string,
  expectedCodes: number[],
  timeoutMs: number
) {
  socket.write(`${command}\r\n`);
  const response = await reader.read(timeoutMs);

  return isExpectedResponse(response, expectedCodes) ? response : null;
}

async function connectSmtpSocket(host: string, port: number, secure: boolean, timeoutMs: number) {
  return new Promise<SmtpSocket>((resolve, reject) => {
    const onConnect = () => {
      socket.setTimeout(0);
      resolve(socket);
    };
    const socket: SmtpSocket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: shouldRejectUnauthorizedSmtpTls() }, onConnect)
      : net.createConnection({ host, port }, onConnect);

    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error("SMTP connection timed out."));
    });
    socket.once("error", reject);
  });
}

async function authenticateSmtp(
  socket: SmtpSocket,
  reader: SmtpResponseReader,
  username: string,
  password: string,
  timeoutMs: number
) {
  const plainToken = Buffer.from(`\u0000${username}\u0000${password}`, "utf8").toString("base64");
  const plainResponse = await trySmtpCommand(socket, reader, `AUTH PLAIN ${plainToken}`, [235], timeoutMs);

  if (plainResponse) {
    return;
  }

  await sendSmtpCommand(socket, reader, "AUTH LOGIN", [334], timeoutMs);
  await sendSmtpCommand(socket, reader, Buffer.from(username, "utf8").toString("base64"), [334], timeoutMs);
  await sendSmtpCommand(socket, reader, Buffer.from(password, "utf8").toString("base64"), [235], timeoutMs);
}

async function sendSmtpEmail(payload: EmailPayload, from: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();

  if (!host) {
    return false;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === "true" : Number(process.env.SMTP_PORT) === 465;
  const username = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS?.trim();
  const timeoutMs = getEmailTimeoutMs();
  const fromAddress = parseEmailAddress(from);
  const toAddress = parseEmailAddress(payload.to);
  let socket = await connectSmtpSocket(host, port, secure, timeoutMs);
  let reader = new SmtpResponseReader(socket);

  try {
    let response = await reader.read(timeoutMs);

    if (response.code !== 220) {
      throw new Error(`Unexpected SMTP greeting ${response.code}: ${response.message}`);
    }

    response = await sendSmtpCommand(socket, reader, `EHLO ${process.env.SMTP_HELO_NAME ?? "localhost"}`, [250], timeoutMs);

    if (!secure && response.message.toUpperCase().includes("STARTTLS") && process.env.SMTP_DISABLE_STARTTLS !== "true") {
      await sendSmtpCommand(socket, reader, "STARTTLS", [220], timeoutMs);
      reader.dispose();
      socket = tls.connect({ socket, servername: host, rejectUnauthorized: shouldRejectUnauthorizedSmtpTls() });
      await new Promise<void>((resolve, reject) => {
        socket.once("secureConnect", resolve);
        socket.once("error", reject);
      });
      reader = new SmtpResponseReader(socket);
      await sendSmtpCommand(socket, reader, `EHLO ${process.env.SMTP_HELO_NAME ?? "localhost"}`, [250], timeoutMs);
    }

    if (username && password) {
      await authenticateSmtp(socket, reader, username, password, timeoutMs);
    }

    await sendSmtpCommand(socket, reader, `MAIL FROM:<${fromAddress}>`, [250], timeoutMs);
    await sendSmtpCommand(socket, reader, `RCPT TO:<${toAddress}>`, [250, 251], timeoutMs);
    await sendSmtpCommand(socket, reader, "DATA", [354], timeoutMs);
    socket.write(`${dotStuff(buildMimeMessage(payload, from))}\r\n.\r\n`);
    response = await reader.read(timeoutMs);

    if (!isExpectedResponse(response, [250])) {
      throw new Error(`Unexpected SMTP DATA response ${response.code}: ${response.message}`);
    }

    socket.write("QUIT\r\n");
    return true;
  } finally {
    reader.dispose();
    socket.end();
  }
}

async function sendBrevoApiEmail(payload: EmailPayload, from: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim() || process.env.SENDINBLUE_API_KEY?.trim();

  if (!apiKey) {
    return false;
  }

  const sender = parseEmailIdentity(process.env.BREVO_FROM?.trim() || from);
  const response = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      sender,
      to: [parseEmailIdentity(payload.to)],
      subject: payload.subject,
      textContent: payload.text,
      ...(payload.html ? { htmlContent: payload.html } : {})
    })
  });

  if (response.ok) {
    return true;
  }

  throw new Error(`Brevo API failed ${response.status}: ${await response.text()}`);
}

export async function sendSystemEmail(payload: EmailPayload): Promise<EmailDeliveryMethod> {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Healthcare Ecosystem <no-reply@healthcare.local>";
  const smtpFrom = process.env.SMTP_FROM?.trim() || from;
  const brevoFrom = process.env.BREVO_FROM?.trim() || smtpFrom;

  try {
    if (await sendBrevoApiEmail(payload, brevoFrom)) {
      return "BREVO_API";
    }
  } catch (error) {
    console.error("Brevo API email delivery failed", emailDeliveryErrorMessage(error));
  }

  try {
    if (await sendSmtpEmail(payload, smtpFrom)) {
      return "SMTP";
    }
  } catch (error) {
    console.error("SMTP email delivery failed", emailDeliveryErrorMessage(error));
  }

  if (webhookUrl) {
    try {
      const response = await fetchWithTimeout(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          from,
          ...payload
        })
      });

      if (response.ok) {
        return "WEBHOOK";
      }

      console.error("Email webhook failed", await response.text());
    } catch (error) {
      console.error("Email webhook request failed", error);
    }
  }

  await appendEmailToOutbox(payload);
  return "OUTBOX";
}

export function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}
