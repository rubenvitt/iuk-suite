import { checkModuleHealth } from "@/core/health";

export async function GET(_req: Request, ctx: { params: Promise<{ modul: string }> }) {
  const { modul } = await ctx.params;
  const result = checkModuleHealth(modul);
  return Response.json(result, { status: result.status === "ok" ? 200 : 503 });
}
