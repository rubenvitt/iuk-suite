/**
 * Eine Datei aus einem Multipart-POST lesen (Feld `datei`), mit frühem Verzicht bei zu großem `content-length`.
 * Für die Route Handler des Mietvertrags (IDA-343); Größe und Inhalt prüft danach der Aufrufer selbst.
 */

/** Rand für Multipart-Grenzen und Feldnamen — keine zweite Größengrenze, nur ein früher Verzicht aufs Puffern. */
const MULTIPART_UEBERHANG = 64 * 1024;

export type GeleseneDatei = { ok: true; name: string; typ: string; bytes: Buffer } | { ok: false; status: 400 | 413; fehler: string };

export async function leseDatei(req: Request, maxBytes: number, fehltSatz: string): Promise<GeleseneDatei> {
  const zuGross = { ok: false, status: 413, fehler: `Die Datei ist größer als ${Math.round(maxBytes / 1_000_000)} MB.` } as const;
  const laenge = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(laenge) && laenge > maxBytes + MULTIPART_UEBERHANG) return zuGross;
  let datei: FormDataEntryValue | null;
  try {
    datei = (await req.formData()).get("datei");
  } catch {
    return { ok: false, status: 400, fehler: "Die Datei kam nicht vollständig an. Bitte noch einmal versuchen." };
  }
  if (!(datei instanceof File)) return { ok: false, status: 400, fehler: fehltSatz };
  if (datei.size > maxBytes) return zuGross;
  return { ok: true, name: datei.name, typ: datei.type, bytes: Buffer.from(await datei.arrayBuffer()) };
}

export function jsonAntwort(status: number, rumpf: unknown): Response {
  return new Response(JSON.stringify(rumpf), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export const NICHT_DA = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });

export function pdfAntwort(inhalt: Buffer | Uint8Array, disposition: string): Response {
  return new Response(new Uint8Array(inhalt), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": disposition,
      "content-length": String(inhalt.length),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
