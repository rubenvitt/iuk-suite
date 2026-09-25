import { NextResponse } from "next/server";

type Ergebnis = { ok: true; body: unknown } | { ok: false; response: NextResponse };

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Ist der ANGEGEBENE `content-length` unlesbar oder zu groß? Spart das Lesen, bevor es beginnt. */
export function angegebenZuGross(req: Request, maxBytes: number): boolean {
  const declared = req.headers.get("content-length");
  return declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes);
}

/**
 * Den Body als JSON lesen, aber nie mehr als `maxBytes` — `content-length` kann fehlen oder
 * lügen, gezählt wird deshalb beim Lesen und abgebrochen, sobald die Grenze überschritten ist.
 * Zuerst gebaut für `api/sync`, geteilt mit `api/anmeldung` (DRK-447).
 */
export async function begrenztesJson(req: Request, maxBytes: number, zuGross: string): Promise<Ergebnis> {
  if (angegebenZuGross(req, maxBytes)) return { ok: false, response: fehler(413, "body_too_large", zuGross) };
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, response: fehler(400, "invalid_json", "Ungültiger JSON-Body") };
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return { ok: false, response: fehler(413, "body_too_large", zuGross) };
      }
      chunks.push(chunk.value);
    }
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, response: fehler(400, "invalid_json", "Ungültiger JSON-Body") };
  }
}
