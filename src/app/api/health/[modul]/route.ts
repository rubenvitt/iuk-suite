import { checkModuleHealth } from "@/core/health";
import { laufendeRevision } from "@/core/version";

export async function GET(_req: Request, ctx: { params: Promise<{ modul: string }> }) {
  const { modul } = await ctx.params;
  const result = checkModuleHealth(modul);
  /*
   * `revision` trägt der automatische Rollout (`docs/runbooks/auto-rollout.md`): sie ist
   * der einzige Beleg, dass nach `docker compose up -d` auch WIRKLICH der neue Stand
   * antwortet und nicht der alte Container weiterläuft.
   *
   * BEWUSST NUR HIER UND NICHT IN `/api/health`: diese Route ist über `params`
   * dynamisch, die andere hat weder Parameter noch Request-Zugriff und kann von Next
   * prerendert werden — dort stünde dann der Bauzeit-Wert (`unbekannt`) in einer
   * Antwort, die zur Laufzeit nie wieder entsteht. `/api/health/portal` ist ohnehin der
   * Pfad, den der Docker-Healthcheck und alle Runbooks benutzen.
   *
   * Der Wert steht auf einem UNAUTHENTIFIZIERTEN Endpunkt (`core/routing.ts` lässt
   * `/api/health` als Passthrough durch) — der Commit-SHA ist damit öffentlich. Bewusste
   * Entscheidung: er verrät nichts, was das Repo nicht ohnehin zeigt, und ohne ihn ist
   * ein Rollout von außen nicht prüfbar.
   */
  return Response.json(
    { ...result, revision: laufendeRevision() },
    { status: result.status === "ok" ? 200 : 503 },
  );
}
