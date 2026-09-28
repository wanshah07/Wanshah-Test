import crypto from "node:crypto";

// A multipart/form-data body, for handing an uploaded file to the existing
// upload routes through app.inject().

export interface Part {
  field: string;
  value: string | Buffer;
  filename?: string;
  type?: string;
}

export function multipartBody(parts: Part[]): { body: Buffer; contentType: string } {
  const boundary = "----slidecraft" + crypto.randomBytes(12).toString("hex");
  const chunks: Buffer[] = [];
  const q = (s: string) => s.replace(/[\r\n"]/g, "_");
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${q(p.field)}"`;
    if (p.filename !== undefined) head += `; filename="${q(p.filename)}"\r\nContent-Type: ${p.type || "application/octet-stream"}`;
    chunks.push(Buffer.from(head + "\r\n\r\n"), Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
