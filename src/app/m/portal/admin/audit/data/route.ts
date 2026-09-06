import { AuditAccessDenied } from "@/core/audit/access";
import { readAuditView } from "../read";
import type { AuditSearch } from "../filters";
export async function GET(request: Request) {
  try {
    const search: AuditSearch = {};
    new URL(request.url).searchParams.forEach((value,key,params) => { search[key] = params.getAll(key).length > 1 ? params.getAll(key) : value; });
    const view = await readAuditView(search);
    return Response.json(view, { status: view.state === "invalid" ? 400 : view.state === "unavailable" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuditAccessDenied) return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
