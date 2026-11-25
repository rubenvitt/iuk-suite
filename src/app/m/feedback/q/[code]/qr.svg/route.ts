// QR-CODE DER LOBBY (`/q/<code>/qr.svg`), als `<img>` am Beamer. Eigener Weg statt eingebettetem
// SVG, damit ein neuer Code (neue Runde) am Beamer nur das `src` wechselt. Zeigt auf die
// Handy-Seite am öffentlichen Host (Herleitung `_lib/quiz/adresse.ts`, nie aus `req.url`).
// Nur für eine laufende Runde; ein beendeter oder unbekannter Code bekommt 404 wie die Handy-Seite.
import { qrSvg } from "@/core/qr";
import { getDb } from "@/app/m/feedback/_db/client";
import { offeneRundePerCode } from "@/app/m/feedback/_db/quiz";
import { handyUrlAus } from "@/app/m/feedback/_lib/quiz/adresse";
import { CODE_MAX } from "@/app/m/feedback/_lib/quiz/http";
import { holeAutoEndeNach } from "@/app/m/feedback/_lib/quiz/stand";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (code.length > CODE_MAX) return new Response("Not found", { status: 404 });
  const db = getDb();
  const jetzt = new Date();
  holeAutoEndeNach(db, jetzt);
  const runde = offeneRundePerCode(db, code, jetzt);
  if (!runde) return new Response("Not found", { status: 404 });
  const svg = await qrSvg(handyUrlAus(req.headers, runde.beitrittCode));
  // `no-store`: der Code gilt nur, solange die Runde läuft (§5.6).
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
}
