import QRCode from "qrcode";
import { getDb } from "../../../_db/client";
import { getGroupBySlug } from "../../../_db/queries";
import { parseToken } from "../../../_lib/token";

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
  // feedback.localtest.me:3000 anfragte) — der Host-Header trägt dagegen
  // korrekt den Original-Host. Ohne diese Korrektur würde ein gedruckter
  // QR-Code auf eine falsche/unerreichbare Adresse zeigen.
  const host = req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const url = `${proto}://${host}/f/${slugSecret}`;
  const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
