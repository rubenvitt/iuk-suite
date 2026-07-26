import { qrPng } from "@/core/qr";
import { resolveHost } from "@/core/routing";
import { getDb } from "../../../_db/client";
import { getGroupBySlug } from "../../../_db/queries";
import { parseToken } from "../../../_lib/token";

/** Vorgabe wie bisher: 200px-Vorschau und Handy-Scan brauchen nicht mehr. */
const BREITE_VORGABE = 512;
/**
 * Der Aushang druckt den Code auf 90mm (Entwurf §3.5) — 512px sind dort ~145 dpi
 * und sichtbar ausgefranst. 1024px ergeben ~290 dpi und sind der einzige Wert,
 * den das Modul selbst anfragt; 2048 ist die Obergrenze für Sonderfälle.
 */
const BREITE_MAX = 2048;

/**
 * `?w=` GEKLEMMT, nicht durchgereicht. Diese Route ist ÖFFENTLICH und
 * unangemeldet, `qrPng` gibt `width` direkt an den Kodierer, und
 * `cache-control: public` schlüsselt auf die ganze URL: ein ungeprüftes
 * `?w=100000` wäre Rechenlast- UND Cache-Verstärkung mit einer Zeichenfolge als
 * Eintrittskarte. Unsinn (leer, 0, negativ, Text) fällt auf die Vorgabe zurück,
 * statt einen Fehler zu erzeugen — ein 400 auf einem gedruckten Code wäre die
 * schlechtere Antwort.
 */
function breiteAus(anfrage: string): number {
  const rohwert = new URL(anfrage).searchParams.get("w");
  if (!rohwert) return BREITE_VORGABE;
  const zahl = Number.parseInt(rohwert, 10);
  if (!Number.isFinite(zahl) || zahl <= 0) return BREITE_VORGABE;
  return Math.min(zahl, BREITE_MAX);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slugSecret: string }> },
) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  if (!parsed) return new Response("Not found", { status: 404 });
  const group = getGroupBySlug(getDb(), parsed.slug);
  if (!group || group.secret !== parsed.secret) return new Response("Not found", { status: 404 });

  // req.url trägt NICHT den öffentlichen Host: nach dem Host-Middleware-Rewrite
  // (proxy.ts/decideRoute) zeigt req.url auf die interne next-Adresse (verifiziert
  // in Task 11: req.url=http://localhost:3000/... während der Client
  // feedback.localtest.me:3000 anfragte) — die Header tragen dagegen korrekt den
  // Original-Host. Ohne diese Korrektur würde ein gedruckter QR-Code auf eine
  // falsche/unerreichbare Adresse zeigen.
  //
  // `host` ALLEIN reicht dafür nicht: schreibt der Reverse-Proxy ihn auf die
  // Upstream-Adresse um, steht der öffentliche Host nur in `x-forwarded-host`.
  // Die Vorrangregel kommt aus `core/routing.resolveHost` — WIEDERVERWENDET, weil
  // eine zweite Auflösung genau der Ort wäre, an dem beide auseinanderlaufen.
  const host = resolveHost(req.headers) || new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const url = `${proto}://${host}/f/${slugSecret}`;
  const png = await qrPng(url, { width: breiteAus(req.url) });
  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
