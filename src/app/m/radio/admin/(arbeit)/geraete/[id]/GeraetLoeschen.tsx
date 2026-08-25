"use client";

// src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetLoeschen.tsx
import { useState } from "react";
import { Button, Popconfirm } from "antd";
import { geraetLoeschenAction } from "../../../actions";
import s from "../../../../_ui/verwaltung.module.css";

/**
 * DIE LOESCHFLAECHE — 1:1 aus `DeviceDetailDrawer.tsx:111-123`.
 *
 * ⛔ EIGENE INSEL NEBEN DEM FORMULAR (Entscheidung **E-V6**): sie teilt mit ihm keinen Zustand
 * und haengt an einer anderen Action. ⛔ Die Action wird DIREKT importiert
 * (Bauform-Zulaessigkeitstafel Nr. 6).
 *
 * ⛔ NUR FUER DIE ADMIN-STUFE GERENDERT — die Entscheidung faellt in `page.tsx`
 * (`{istAdmin && …}`, 1:1 zu `DeviceDetailDrawer.tsx:111`). ⚠️ Das ist die ANZEIGE; die SPERRE
 * ist `requireRadioAdmin()` als erste Anweisung von `geraetLoeschenAction`
 * (`admin/actions.ts`), und die Rechtetafel fuehrt „Geraet anlegen / loeschen | ja | nein"
 * (`Spec:4444-4454`).
 *
 * ⛔ DIE WARNUNG AUS ⬜ **V-L6** — Betreiberentscheidung vom 2026-08-24
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L6"). ⚠️ SIE UEBERHOLT DEN PLAN:
 * `briefs/V14.md:99-101` und `planteil4/briefs/KOPF.md:378` schreiben noch, das Loeschen
 * werde bei offener Leihe ABGELEHNT. Das Ledger entscheidet anders — die offene Leihe wird
 * beim Loeschen automatisch als zurueckgegeben gebucht (`admin/actions.ts`,
 * `geraetLoeschenAction`), und der Bedienende bekommt eine WARNUNG.
 *
 * ⛔ SIE STEHT VOR DEM LOESCHEN, ALS BESTAETIGUNGSSCHRITT (Ausformung 1 der Entscheidung):
 * „sonst ist sie keine Warnung, sondern eine Meldung ueber etwas bereits Geschehenes". Deshalb
 * traegt sie der `Popconfirm`, nicht ein Kasten neben dem Knopf — und ⛔ der Knopf wird NICHT
 * versteckt (`briefs/V14.md:99-101`, diese Haelfte gilt unveraendert).
 *
 * ⛔ SIE NENNT DEN ENTLEIHER (Ausformung 1). Er kommt als vorformatierter, serialisierbarer
 * Prop ueber die Grenze (`offeneLeiheZuGeraet`, `_db/leihen.ts:379`) — Vorabscan-Fund F2
 * Punkt c: „Ohne den Namen als serialisierten Prop kann die Warnung ihn nicht nennen."
 *
 * ⚠️ BENANNTE ABWEICHUNG: DER KNOPF TRAEGT KEIN MUELLEIMERZEICHEN. Der Bestand setzt
 * `icon={<FiTrash2 />}` (`DeviceDetailDrawer.tsx:119`). Die eine Zeichenquelle des Moduls ist
 * `_ui/ikonen.tsx` (Entscheidung E-V7, NS-A8b) und auf ZWOELF Namen festgenagelt
 * (`_ui/ikonen.tsx:55-67`, festgehalten von `_ui/ikonen.test.tsx:108`); ein Muelleimer ist dort
 * nicht dabei. ⛔ Ein `react-icons`-Import an dieser Stelle waere Falle 7 und eine dreizehnte
 * Zeichenquelle. Die Beschriftung „Gerät löschen" plus `danger` traegt die Aussage — dieselbe
 * Behandlung wie beim Warndreieck der Abweichungszeile (`page.tsx`, Abweichung A9).
 *
 * ⛔ KEIN TOAST — Entscheidung E6: das „Gerät gelöscht" aus `DeviceDetailDrawer.tsx:54` faellt
 * als benannte Abweichung weg. Es waere ohnehin unsichtbar: die Action endet in einem
 * `redirect()` auf die Geraeteliste, die Seite lebt danach nicht mehr. Der FEHLERtext kommt aus
 * der Action (`admin/actions.ts`).
 */

export type GeraetLoeschenProps = {
  geraetId: string;
  /** Der Name aus der offenen Leihe, oder `null`, wenn keine offen ist. */
  offeneLeiheEntleiher: string | null;
};

export function GeraetLoeschen({ geraetId, offeneLeiheEntleiher }: GeraetLoeschenProps) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const loeschen = async () => {
    setLaeuft(true);
    setFehler(null);
    /*
     * ⛔ IM ERFOLGSFALL KEHRT DIESER AUFRUF NIE ZURUECK: `geraetLoeschenAction` endet in
     * `redirect(...)` (`admin/actions.ts`), und `redirect` arbeitet ueber einen geworfenen
     * Sentinel. Ein `try`/`catch` um diese Zeile machte aus dem gelungenen Loeschen eine
     * Fehlermeldung — dieselbe Falle, die die Action in ihrem eigenen Kommentar benennt.
     */
    const ergebnis = await geraetLoeschenAction(geraetId);
    setLaeuft(false);
    if (!ergebnis.ok) setFehler(ergebnis.fehler);
  };

  return (
    <div className={s.loeschZeile}>
      <Popconfirm
        title="Gerät wirklich löschen?"
        description={
          offeneLeiheEntleiher === null ? undefined : (
            <span data-rolle="radio-loeschen-warnung" className={s.loeschWarnung}>
              {`Das Gerät ist an ${offeneLeiheEntleiher} verliehen. Die Leihe wird beim Löschen als zurückgegeben gebucht.`}
            </span>
          )
        }
        okText="Löschen"
        okButtonProps={{ danger: true }}
        cancelText="Abbrechen"
        onConfirm={loeschen}
      >
        <Button danger loading={laeuft} data-rolle="radio-loeschen-knopf">
          Gerät löschen
        </Button>
      </Popconfirm>
      {fehler !== null && (
        <p className={s.dialogFehler} role="alert" data-rolle="radio-loeschen-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}
