import { getDb } from "../../../../../_db/client";
import { hostAbweisung } from "../../../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../../../_lib/requireUavAdmin";
import { csvAntwort } from "../../../../../_lib/csv";
import { NotFound, teilnehmerDetail } from "../../../../../_lib/queries";

export const dynamic = "force-dynamic";

const notFoundJson = (e: NotFound) => Response.json({ error: { code: e.code, message: e.message } }, { status: 404 });

/** Ein Teilnehmer, eine Zeile je Aufgabe. Alt `admin.ts:71-86`. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
  const { id } = await ctx.params;
  let detail;
  try {
    detail = teilnehmerDetail(getDb(), id);
  } catch (e) {
    if (e instanceof NotFound) return notFoundJson(e);
    throw e;
  }
  const header = ["Teil", "Nummer", "Titel", "Anzahl", "Ziel", "Erledigt", "NichtAnwendbar", "LetzteDurchführung"];
  const rows = detail.aufgaben.map((a) => [
    String(a.teil),
    a.nummer,
    a.titel,
    String(a.anzahl),
    String(a.ziel),
    a.erledigt ? "ja" : "nein",
    a.nichtAnwendbar ? "ja" : "nein",
    a.letzteDurchfuehrung ?? "",
  ]);
  const dateiSlug = detail.participant.name.replace(/[^\w-]+/g, "_");
  return csvAntwort([header, ...rows], `teilnehmer-${dateiSlug}-auswertung.csv`);
}
