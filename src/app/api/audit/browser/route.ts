import { auth } from "@/core/auth";
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { recordAuditEvent } from "@/core/audit/storage";
import { parseBrowserExport } from "@/core/audit/browser-schema";
import { canAccess, getModule } from "@/core/registry";
import { resolveHost } from "@/core/routing";

const MAX_BYTES = 256;
// Bounded process-local brake: at most 300 keys, cleared each minute. Anonymous requests
// share one budget; neither spoofable IP headers nor a client identity create fresh keys.
let windowStart = 0;
let total = 0;
const hits = new Map<string, number>();
function admit(key: string): boolean {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; total = 0; hits.clear(); }
  if (total >= 300 || (hits.get(key) ?? 0) >= 30) return false;
  total++; hits.set(key, (hits.get(key) ?? 0) + 1); return true;
}
function sameOrigin(request: Request): boolean {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? new URL(request.url).protocol.slice(0, -1);
    return ["http:", "https:"].includes(origin.protocol) && origin.origin === request.headers.get("origin") &&
      origin.host.toLowerCase() === resolveHost(request.headers).toLowerCase() && origin.protocol === protocol + ":" &&
      (!request.headers.has("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
  } catch { return false; }
}
/** Warm-up is deliberately read-free and writes no audit event. */
export async function GET() { return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return new Response(null, { status: 415 });
  const size = request.headers.get("content-length");
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > MAX_BYTES)) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(chunk.value);
    }
  } catch { return new Response(null, { status: 400 }); }
  let event;
  try { event = parseBrowserExport(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return new Response(null, { status: 400 }); }
  if (!event) return new Response(null, { status: 400 });
  const session = await auth();
  const actor = auditActor(session?.user);
  // Charge every validated claim before either success or denial can write an event.
  if (!admit(actor.kind === "user" ? actor.id : "anonymous")) return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  if (!canAccess(getModule(event.module), session?.user?.groups ?? null)) {
    auditDenied(event.module, actor, "browser_export");
    return new Response(null, { status: 403 });
  }
  try {
    withAuditContext({ actor }, () => recordAuditEvent({ module: event.module, action: "export", objectType: `${event.module}_${event.format}`, origin: "browser", result: "success" }));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[audit] Browsermeldung konnte nicht gespeichert werden.");
    return new Response(null, { status: 503 });
  }
}
