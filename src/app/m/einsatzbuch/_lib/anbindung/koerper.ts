/**
 * Körper eines Route Handlers begrenzt lesen (Vorbild `uav/_lib/begrenztesJson.ts`; hierher
 * kopiert, denn ein zweites Modul in `core` bräuchte diese eine Funktion nicht — Falle „nach
 * `src/core` kommt nur, was ein zweites, heute belegbares Modul braucht", `CLAUDE.md`).
 */
import { fehler } from "./vertrag";

type Ergebnis = { ok: true; body: unknown } | { ok: false; response: Response };

/** Ist der ANGEGEBENE `content-length` unlesbar oder zu groß? Spart das Lesen, bevor es beginnt. */
export function angegebenZuGross(req: Request, maxBytes: number): boolean {
  const declared = req.headers.get("content-length");
  return declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes);
}

/**
 * Den Body als JSON lesen, aber nie mehr als `maxBytes` — `content-length` kann fehlen oder
 * lügen, gezählt wird deshalb beim Lesen und abgebrochen, sobald die Grenze überschritten ist.
 * Ein riesiges Array (`freigeben`) wird so nie ganz geparst.
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
