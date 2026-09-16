import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { kontoZugangAus } from "../../_lib/helferZugang";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { artikelDetailAuffuellen } from "../../_lib/lesepfade/artikel";
import { zugangsZiele } from "../../_lib/lesepfade/orte";
import { getDb } from "../../_db/client";
import { AuffuellRahmen } from "../../_ui/AuffuellRahmen";
import { Auffuellen } from "../../_ui/Auffuellen";
import { LeerZustand } from "../../_ui/LeerZustand";
// Die EINE Stelle, die diesen Buchungsweg verdrahtet — die Insel importiert die
// Action NICHT selbst, dieselbe Bauform wie bei `_ui/Entnahme.tsx`.
import { bucheAuffuellung } from "../../_actions/buchung";

/**
 * DIE AUFFUELLANSICHT EINES ARTIKELS — DRK-313.
 *
 * ⚠️ SIE HAT KEINE ROLLEN-WEICHE, anders als `a/[artikelId]/page.tsx`. Dort gibt
 * es drei gueltige Ausgaenge (Kaertchen, Konto, gar nichts), weil ein
 * Regaletikett von jedem gescannt werden kann. Hier gibt es EINEN: das
 * angemeldete Konto in der Lagerbuch-Gruppe. `requireLagerbuchAdmin` beantwortet
 * die beiden anderen Lagen selbst — ohne Sitzung `/login`, mit Sitzung ohne
 * Gruppe `notFound()`.
 *
 * ⚠️ DIE CHARGENLISTE KOMMT AUS `artikelDetailAuffuellen` UND NICHT AUS
 * `artikelDetailHelfer` (Codex-Befund P1 zu PR #174). Der Unterschied ist EIN
 * Filter, und er entscheidet ueber einen stillen Datenfehler: der Helfer-Weg
 * laesst nur Chargen mit Bestand stehen — richtig fuers Entnehmen, falsch
 * fuers Annehmen. Kommt Nachschub aus einem Los, dessen Vorgaenger ueberall
 * aufgebraucht ist, stuende die vorhandene Charge sonst gar nicht zur Wahl,
 * und die einzige Ausweichform waere „Neue Charge" mit derselben Nummer —
 * also genau die zweite, in FEFO nicht unterscheidbare Zeile, gegen die das
 * Umschalten nach der Buchung gebaut ist.
 *
 * Die FEFO-Reihenfolge ist DIESELBE wie auf dem Entnahmeschirm: beide Listen
 * kommen aus `chargenMitRest`, nur eine davon wird danach gefiltert.
 *
 * ⚠️ DIE VERTEILUNG (`orte`, `restGesamt`) WIRD NICHT DURCHGEREICHT. Sie
 * beantwortet die Frage „wo liegt das Material?", und das ist die Frage der
 * ENTNAHME. Wer auffuellt, hat das Material in der Hand und entscheidet, wohin
 * es kommt; die Liste der Orte waere hier Ballast im RSC-Payload und eine
 * zweite, unbenutzte Ortsangabe direkt neben der Schrankwahl.
 */
export const dynamic = "force-dynamic";

export default async function AuffuellenArtikelSeite({
  params,
}: {
  params: Promise<{ artikelId: string }>;
}) {
  const viewer = await requireLagerbuchAdmin();
  const { artikelId } = await params;
  const db = getDb();

  const detail = artikelDetailAuffuellen(db, artikelId);
  const etikett = sitzungsEtikett(kontoZugangAus(viewer));

  return (
    <AuffuellRahmen etikett={etikett}>
      {detail ? (
        <Auffuellen
          detail={{
            id: detail.id,
            name: detail.name,
            einheit: detail.einheit,
            fach: detail.fach,
            bestand: detail.bestand,
            chargen: detail.chargen.map((c) => ({
              id: c.id,
              chargenNr: c.chargenNr,
              verfall: c.verfall,
              rest: c.rest,
              ampel: c.ampel,
              text: c.text,
            })),
          }}
          /*
           * DIE WAEHLBAREN SCHRAENKE WERDEN BEI JEDEM AUFRUF NEU AUFGELOEST,
           * nicht einmal gemerkt: die Verwaltung kann in der Zwischenzeit einen
           * Schrank stilllegen. Die Action prueft dieselbe Liste noch einmal —
           * die Seite zeigt damit nichts an, was die Buchung danach verwirft.
           */
          ziele={zugangsZiele(db)}
          buchen={bucheAuffuellung}
        />
      ) : (
        /*
         * HTTP 200 MIT EINEM SATZ statt einer Suite-404 — dieselbe Entscheidung
         * wie in `a/[artikelId]/page.tsx`: nach einer 404 weiss niemand, ob der
         * Artikel geloescht wurde oder der Link veraltet ist.
         */
        <LeerZustand
          titel="Diesen Artikel gibt es nicht"
          text={
            "Der Artikel wurde gelöscht oder der Link ist veraltet. " +
            "Der Bestand ist davon nicht betroffen."
          }
          weg={{ href: "/auffuellen", text: "Artikel suchen" }}
        />
      )}
    </AuffuellRahmen>
  );
}
