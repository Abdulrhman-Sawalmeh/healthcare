function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function printableText(value: string) {
  return value.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

function wrapText(value: string, maxLength = 96) {
  const text = printableText(value).replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function paginate(lines: string[]) {
  const pages: string[][] = [];
  const pageSize = 44;

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  return pages.length > 0 ? pages : [[]];
}

function pageContent(title: string, lines: string[], pageNumber: number, pageCount: number) {
  const commands = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(${escapePdfText(printableText(title))}) Tj`,
    "/F1 9 Tf",
    "0 -16 Td",
    `(${escapePdfText(`Page ${pageNumber} of ${pageCount}`)}) Tj`,
    "/F1 10 Tf",
    "0 -24 Td"
  ];

  for (const line of lines) {
    commands.push(`(${escapePdfText(line)}) Tj`);
    commands.push("0 -15 Td");
  }

  commands.push("ET");

  return commands.join("\n");
}

export function createSimplePdf(params: { title: string; lines: string[] }) {
  const wrappedLines = params.lines.flatMap((line) => (line.trim() ? wrapText(line) : [""]));
  const pages = paginate(wrappedLines);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = pageContent(params.title, pageLines, index + 1, pages.length);

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";

  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(output, "utf8");
}
