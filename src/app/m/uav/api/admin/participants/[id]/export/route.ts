import { auditDelivery, auditActor } from "@/core/audit/server";
import { blatt, dateinameSlug, freiesBlatt } from "@/core/export";
import { xlsxAntwort } from "@/core/export/server";
import { getDb } from "../../../../../_db/client";
import { hostAbweisung } from "../../../../../_lib/hostRiegel";
import { adminZugang } from "../../../../../_lib/requireUavAdmin";
import { AUFGABEN_BLATT, AUFGABEN_SPALTEN } from "../../../../../_lib/export";
import { NotFound, teilnehmerDetail } from "../../../../../_lib/queries";

export const dynamic = "force-dynamic";

const notFoundJson = (e: NotFound) => Response.json({ error: { code: e.code, message: e.message } }, { status: 404 });

/**
 * Ein Teilnehmer, eine Zeile je Aufgabe. Alt `admin.ts:71-86`, seit DRK-186
 * `.xlsx` statt `.csv`.
 *
 * ⛔ DER NAME STAND BISHER NUR IM DATEINAMEN. Wer die Datei umbenannte oder
 * mehrere nebeneinander öffnete, hatte acht Spalten ohne jeden Hinweis, wessen
 * Auswertung er liest. Eine CSV hatte dafür keinen Platz — ein Vorspann über
 * der Kopfzeile verschöbe Sortieren und Filtern. Eine Mappe hat ein zweites
 * Blatt; genau dafür steht `freiesBlatt` im Baustein.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return auditDelivery("uav", "export", "participant_export", auditActor(zugang.viewer), async (target) => {
    const { id } = await ctx.params;
    let detail;
    try {
      detail = teilnehmerDetail(getDb(), id);
    } catch (e) {
      if (e instanceof NotFound) return notFoundJson(e);
      throw e;
    }
    target(detail.participant.id);

    const zeilen = detail.aufgaben.map((a) => ({
      teil: a.teil,
      nummer: a.nummer,
      titel: a.titel,
      anzahl: a.anzahl,
      ziel: a.ziel,
      erledigt: a.erledigt,
      nichtAnwendbar: a.nichtAnwendbar,
      letzteDurchfuehrung: a.letzteDurchfuehrung,
    }));

    return xlsxAntwort(
      `teilnehmer-${dateinameSlug(detail.participant.name)}-auswertung.xlsx`,
      [
        blatt(AUFGABEN_BLATT, AUFGABEN_SPALTEN, zeilen),
        freiesBlatt(
          "Kopfdaten",
          [
            ["Teilnehmer", detail.participant.name],
            ["Beginn", detail.participant.beginn],
            ["Status", detail.participant.aktiv ? "aktiv" : "inaktiv"],
            ["Aufgaben", zeilen.length],
          ],
          [20, 34],
        ),
      ],
    );
  });
}
