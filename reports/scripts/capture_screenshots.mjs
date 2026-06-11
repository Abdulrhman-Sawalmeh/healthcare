import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const screenshotsDir = resolve(repoRoot, "reports", "screenshots");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 9333;
const userDataDir = resolve(repoRoot, ".tmp-report-chrome-profile");
const viewport = { width: 1440, height: 1050, deviceScaleFactor: 1 };

const apps = {
  central: {
    baseUrl: "http://localhost:5174",
    apiUrl: "http://localhost:4000/api",
    storageKey: "healthcare.central-web.token",
    account: { identifier: "central-admin", password: "Password123!" }
  },
  smallManager: {
    baseUrl: "http://localhost:5176",
    apiUrl: "http://localhost:4200/api",
    storageKey: "healthcare.small-center-web.token",
    account: { identifier: "small-manager", password: "Password123!" }
  },
  smallPatient: {
    baseUrl: "http://localhost:5176",
    apiUrl: "http://localhost:4200/api",
    storageKey: "healthcare.small-center-web.token",
    account: { identifier: "small-patient", password: "Password123!" }
  },
  mediumManager: {
    baseUrl: "http://localhost:5175",
    apiUrl: "http://localhost:4100/api",
    storageKey: "healthcare.medium-center-web.token",
    account: { identifier: "medium-manager", password: "Password123!" }
  },
  mediumPatient: {
    baseUrl: "http://localhost:5175",
    apiUrl: "http://localhost:4100/api",
    storageKey: "healthcare.medium-center-web.token",
    account: { identifier: "medium-patient", password: "Password123!" }
  },
  mediumNurse: {
    baseUrl: "http://localhost:5175",
    apiUrl: "http://localhost:4100/api",
    storageKey: "healthcare.medium-center-web.token",
    account: { identifier: "medium-nurse", password: "Password123!" }
  },
  mediumLab: {
    baseUrl: "http://localhost:5175",
    apiUrl: "http://localhost:4100/api",
    storageKey: "healthcare.medium-center-web.token",
    account: { identifier: "medium-lab", password: "Password123!" }
  },
  mediumPharmacist: {
    baseUrl: "http://localhost:5175",
    apiUrl: "http://localhost:4100/api",
    storageKey: "healthcare.medium-center-web.token",
    account: { identifier: "medium-pharmacist", password: "Password123!" }
  }
};

const shots = [
  ["central", "/", "central-dashboard"],
  ["central", "/centers", "central-centers"],
  ["central", "/patients", "central-patients"],
  ["central", "/referrals", "central-referrals"],
  ["central", "/master-data", "central-master-data"],
  ["central", "/reports", "central-reports"],
  ["central", "/notifications", "central-notifications"],
  ["central", "/audit-logs", "central-audit-logs"],
  ["smallManager", "/", "small-dashboard"],
  ["smallManager", "/patients", "small-patients"],
  ["smallManager", "/visits", "small-visits"],
  ["smallManager", "/visit-workflow", "small-visit-workflow"],
  ["smallManager", "/referrals", "small-referrals"],
  ["smallManager", "/doctors", "small-doctors-management"],
  ["smallManager", "/prescription-verification", "small-prescription-verification"],
  ["smallPatient", "/appointments", "small-patient-appointments"],
  ["smallPatient", "/medical-record", "small-patient-medical-record"],
  ["smallPatient", "/doctors", "small-patient-doctors"],
  ["smallPatient", "/messages", "small-patient-messages"],
  ["smallPatient", "/ai-assistant", "small-ai-assistant"],
  ["smallPatient", "/notifications", "small-patient-notifications"],
  ["mediumManager", "/", "medium-dashboard"],
  ["mediumManager", "/patients", "medium-patients"],
  ["mediumManager", "/visit-workflow", "medium-visit-workflow-manager"],
  ["mediumNurse", "/visit-workflow", "medium-visit-workflow-nurse"],
  ["mediumLab", "/visit-workflow", "medium-visit-workflow-lab"],
  ["mediumPharmacist", "/visit-workflow", "medium-visit-workflow-pharmacy"],
  ["mediumManager", "/referrals", "medium-referrals"],
  ["mediumManager", "/doctors", "medium-doctors-management"],
  ["mediumManager", "/prescription-verification", "medium-prescription-verification"],
  ["mediumPatient", "/appointments", "medium-patient-appointments"],
  ["mediumPatient", "/medical-record", "medium-patient-medical-record"],
  ["mediumPatient", "/messages", "medium-patient-messages"],
  ["mediumPatient", "/ai-assistant", "medium-ai-assistant"],
  ["mediumPatient", "/notifications", "medium-patient-notifications"]
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(app) {
  const response = await fetch(`${app.apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(app.account)
  });

  if (!response.ok) {
    throw new Error(`Login failed for ${app.account.identifier}: ${response.status}`);
  }

  return (await response.json()).token;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${url} (${response.status})`);
  }
  return response.json();
}

function startChrome() {
  return spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank"
  ], {
    stdio: "ignore"
  });
}

async function waitForChrome() {
  for (let index = 0; index < 60; index += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
    } catch {
      await sleep(500);
    }
  }

  throw new Error("Chrome DevTools did not become ready.");
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
        return;
      }

      const callbacks = this.listeners.get(message.method) ?? [];
      callbacks.forEach((callback) => callback(message));
    });
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  once(method, sessionId) {
    return new Promise((resolve) => {
      const callback = (message) => {
        if (sessionId && message.sessionId !== sessionId) {
          return;
        }
        const callbacks = this.listeners.get(method) ?? [];
        this.listeners.set(method, callbacks.filter((item) => item !== callback));
        resolve(message);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), callback]);
    });
  }

  close() {
    this.ws.close();
  }
}

async function navigate(client, sessionId, url) {
  const loaded = client.once("Page.loadEventFired", sessionId);
  await client.send("Page.navigate", { url }, sessionId);
  await loaded;
}

async function captureShot(client, tokenCache, appName, route, name) {
  const app = apps[appName];
  const token = tokenCache.get(appName);
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true
  });
  const sessionId = attached.sessionId;

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    mobile: false
  }, sessionId);

  await navigate(client, sessionId, app.baseUrl);
  await client.send("Runtime.evaluate", {
    expression: `localStorage.setItem(${JSON.stringify(app.storageKey)}, ${JSON.stringify(token)});`,
    awaitPromise: true
  }, sessionId);
  await navigate(client, sessionId, `${app.baseUrl}${route}`);
  await sleep(2200);

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true
  }, sessionId);
  const filePath = resolve(screenshotsDir, `${name}.png`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
  await client.send("Target.closeTarget", { targetId: target.targetId });
  console.log(`saved ${filePath}`);
}

async function main() {
  await mkdir(screenshotsDir, { recursive: true });
  await rm(userDataDir, { recursive: true, force: true });

  const tokenCache = new Map();
  for (const appName of new Set(shots.map(([name]) => name))) {
    tokenCache.set(appName, await login(apps[appName]));
  }

  const chrome = startChrome();
  try {
    const version = await waitForChrome();
    const client = new CdpClient(version.webSocketDebuggerUrl);
    await client.ready;

    for (const [appName, route, name] of shots) {
      await captureShot(client, tokenCache, appName, route, name);
    }

    client.close();
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
