import { qrPng } from "@/core/qr";
import { getDb } from "../../../_db/client";
import { istKastenSecret } from "../../../_lib/ehrlich/daten";
import { einwurfUrlAus } from "../../../_lib/ehrlich/adresse";

/** Der QR-Code des Einwurfs (Aushang und Verwaltung). Ein falsches Secret ist ein 404, kein Bild. */
export async function GET(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!istKastenSecret(getDb(), secret)) return new Response("Not found", { status: 404 });
  const roh = Number.parseInt(new URL(req.url).searchParams.get("w") ?? "", 10);
  const breite = Number.isFinite(roh) && roh > 0 ? Math.min(roh, 2048) : 512;
  const png = await qrPng(einwurfUrlAus(req.headers, secret), { width: breite });
  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=600" },
  });
}
