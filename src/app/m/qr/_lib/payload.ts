import type { QrPayload } from "./types";

function escapeWifi(s: string): string {
  return s.replace(/([\\;,:"])/g, "\\$1");
}

function encodeWifi(v: Extract<QrPayload, { kind: "wifi" }>["value"]): string {
  const s = escapeWifi(v.ssid);
  const p = escapeWifi(v.password);
  const h = v.hidden ? "true" : "false";
  return `WIFI:T:${v.encryption};S:${s};P:${p};H:${h};;`;
}

function escapeVcardText(s: string): string {
  return s.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

function encodeVcard(v: Extract<QrPayload, { kind: "vcard" }>["value"]): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcardText(v.name)}`];
  if (v.tel) lines.push(`TEL:${escapeVcardText(v.tel)}`);
  if (v.email) lines.push(`EMAIL:${escapeVcardText(v.email)}`);
  if (v.org) lines.push(`ORG:${escapeVcardText(v.org)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export function payloadToQrString(p: QrPayload): string {
  switch (p.kind) {
    case "url":
    case "text":
      return p.value;
    case "tel":
      return `tel:${p.value}`;
    case "wifi":
      return encodeWifi(p.value);
    case "vcard":
      return encodeVcard(p.value);
    default: {
      const _exhaustive: never = p;
      throw new Error(`Unsupported kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
