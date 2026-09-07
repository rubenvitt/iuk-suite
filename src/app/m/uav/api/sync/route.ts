import { withAuditContext, auditParticipantActor, auditDenied, auditActor } from "@/core/audit/server";
import { RateLimiter } from "@/core/ratelimit";
import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { auditOutbox } from "../../_db/schema";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { identitaetAus } from "../../_lib/identitaet";
import { sync } from "../../_lib/queries";
import { syncSchema } from "../../_lib/syncSchema";

export const dynamic = "force-dynamic";

export const SYNC_MAX_BODY_BYTES = 128 * 1024;
const SYNC_MAX_REQUESTS_PER_MINUTE = 10;
export const SYNC_MAX_PENDING_AUDIT_EVENTS = 5_000;
const syncRequests = new RateLimiter({ windowMs: 60_000, max: SYNC_MAX_REQUESTS_PER_MINUTE });

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

async function begrenztesJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > SYNC_MAX_BODY_BYTES)) {
    return { ok: false, response: fehler(413, "body_too_large", "Sync-Body ist zu groß") };
  }
  const reader = req.body?.getReader();
  if (!reader) return { ok: false, response: fehler(400, "invalid_json", "Ungültiger JSON-Body") };
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > SYNC_MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, response: fehler(413, "body_too_large", "Sync-Body ist zu groß") };
      }
      chunks.push(chunk.value);
    }
    return { ok: true, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, response: fehler(400, "invalid_json", "Ungültiger JSON-Body") };
  }
}

/** Nur Teilnehmer — participantId stammt aus der Identität, nie aus dem Body. */
export async function POST(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > SYNC_MAX_BODY_BYTES)) return fehler(413, "body_too_large", "Sync-Body ist zu groß");
  const db = getDb();
  const identitaet = await identitaetAus(req, db);
  if (identitaet.kind !== "participant") { auditDenied("uav", identitaet.kind === "admin" ? auditActor(identitaet) : { kind: "anonymous" }); return fehler(401, "unauthorized", "Nur für Teilnehmer"); }
  if (!syncRequests.check(identitaet.id)) return fehler(429, "rate_limit", "Zu viele Sync-Anfragen");
  const body = await begrenztesJson(req);
  if (!body.ok) return body.response;
  const parsed = syncSchema.safeParse(body.body);
  if (!parsed.success) return fehler(400, "validation_error", parsed.error.message);
  const pending = db.select({ count: count() }).from(auditOutbox).get();
  const newEvents = parsed.data.executions.length + parsed.data.taskStatus.length;
  if (!pending || pending.count + newEvents > SYNC_MAX_PENDING_AUDIT_EVENTS) return fehler(503, "audit_backpressure", "Sync vorübergehend nicht verfügbar");
  return withAuditContext({ actor: auditParticipantActor(identitaet.id) }, () => NextResponse.json(sync(db, identitaet.id, parsed.data)));
}
