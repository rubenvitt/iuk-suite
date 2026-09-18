"use client";

/**
 * DRK-421 — DIE LEISTE UNTER DER TABELLE: Kommentar, Ausgeblendet-Hinweis,
 * Abschlussknopf, Ergebnis.
 *
 * ⚠️ SIE IST HERAUSGELOEST, WEIL DAS KOMMENTARFELD DIE TABELLE NICHTS ANGEHT.
 * Solange `kommentar` als `useState` im Formular lag, kostete ein einzelner
 * Tastendruck darin bei 600 Artikeln 1.135 ms — fast so viel wie ein
 * vollstaendiger Aufbau der Seite (Messung im Kopf von `zaehlspeicher.ts`).
 * Hier oben horcht die Leiste auf den GESAMTSTAND und rendert bei jeder
 * Zaehlaenderung mit; das sind ein Dutzend Knoten, nicht sechshundert Zeilen.
 *
 * ⚠️ UND DESHALB LIEGT AUCH DAS ABSENDEN HIER. Der Knopf haengt an `kommentar`
 * — stuende die Transition im Formular, muesste der Kommentar wieder hinauf,
 * und die Lawine waere zurueck. Was das Formular braucht, ist allein die
 * Auskunft „es laeuft gerade", und die geht als eine Meldung nach oben
 * (`onAbsenden`), nicht als Zustand.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Flex, Input } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { inventurKorrektur, type InventurNutzlast } from "../../../_actions/inventur";
import { filterIstLeer, type InventurFilter } from "../../../_lib/inventurFilter";
import { INVENTUR_ABWEISUNGEN, INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import {
  abweichungenIn,
  ausgeblendetGezaehlt,
  positionenAus,
  type ZaehlStand,
} from "./inventurZustand";
import { useZaehlstand, type Zaehlspeicher } from "./zaehlspeicher";

/**
 * ⚠️ EIN ERGEBNIS GEHOERT ZU DEM STAND, AUS DEM ES ENTSTANDEN IST — und
 * verschwindet, sobald der sich aendert.
 *
 * Frueher raeumte jeder Setzer `setMeldung(null)` und `setFehler(null)` von
 * Hand ab. Das ging nur, solange alles im selben Bauteil lag; verteilt ueber
 * Zellen und Leisten waere es eine Aufraeumpflicht an jeder Schreibstelle, und
 * die erste vergessene traegt eine Erfolgsmeldung ueber eine laengst wieder
 * angefasste Zaehlung. Stattdessen merkt sich das Ergebnis, WOFUER es gilt, und
 * die Anzeige leitet sich daraus ab — ohne Effekt, ohne zweiten Zustand.
 */
type Ergebnis = { stand: ZaehlStand; kommentar: string; inhalt: ReactNode };

function gilt(ergebnis: Ergebnis | null, stand: ZaehlStand, kommentar: string): ReactNode {
  if (!ergebnis) return null;
  return ergebnis.stand === stand && ergebnis.kommentar === kommentar ? ergebnis.inhalt : null;
}

export function Abschlussleiste({
  zeilen,
  speicher,
  filter,
  kategorieLabels,
  ortId,
  gesperrt,
  onAbsenden,
}: {
  zeilen: readonly InventurZeile[];
  speicher: Zaehlspeicher;
  /** Der abgeleitete Spaltenfilter — er bestimmt den Umfang der Buchung. */
  filter: InventurFilter;
  /** Gefalteter Schluessel → Beschriftung, fuer den beschreibenden Umfang. */
  kategorieLabels: ReadonlyMap<string, string>;
  ortId: string | null;
  /** Der Ortswechsel laeuft; absenden wuerde gegen den verlassenen Ort buchen. */
  gesperrt: boolean;
  /** Meldet dem Formular, ob gerade abgesendet wird — es sperrt daraufhin. */
  onAbsenden: (laeuft: boolean) => void;
}) {
  const stand = useZaehlstand(speicher);
  const [kommentar, setKommentar] = useState("");
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [absendetGerade, startTransition] = useTransition();
  const absendenLaeuft = useRef(false);

  // Die Sperre gilt fuer die ganze Seite (Zellen, Ortsauswahl), nicht nur fuer
  // diese Leiste — sie muss also hinauf. `useEffect` und nicht der Aufruf im
  // Rumpf: ein `setState` im Elternteil waehrend des eigenen Renderns ist in
  // React ein Fehler.
  useEffect(() => { onAbsenden(absendetGerade); }, [absendetGerade, onAbsenden]);

  const positionen = useMemo(() => positionenAus(stand), [stand]);
  const abweichungen = abweichungenIn(zeilen, stand);
  const ausgeblendet = ausgeblendetGezaehlt(zeilen, stand, filter);
  const laeuft = absendetGerade || gesperrt;
  const meldung = gilt(ergebnis, stand, kommentar);

  function abschliessen(): void {
    // `gesperrt` steht hier noch einmal, nicht nur am Knopf: ein Absenden
    // waehrend der Navigation buchte gegen den verlassenen Ort.
    if (absendenLaeuft.current || gesperrt || !kommentar.trim() || positionen.length === 0) return;
    absendenLaeuft.current = true;
    const nutzlast: InventurNutzlast = {
      kommentar: kommentar.trim(),
      // DRK-337 — die KENNUNG, nicht der Name: den Namen fuer den Verlauf holt
      // die Action aus der Datenbank (`umfangJson`).
      ortId,
      // Der Umfang ist BESCHREIBEND und bleibt im append-only Verlauf stehen: er
      // traegt die LABELS, nie die gefalteten Schluessel des Filters.
      umfang: filterIstLeer(filter)
        ? null
        : {
            kategorien: filter.kategorien.map((k) => kategorieLabels.get(k) ?? k),
            faecher: [...filter.faecher],
          },
      positionen,
    };
    startTransition(async () => {
      try {
        const antwort = await inventurKorrektur(nutzlast);
        if (!antwort.ok) {
          const text = INVENTUR_ABWEISUNGEN.has(antwort.fehler)
            ? antwort.fehler
            : INVENTUR_TEXTE.buchungsFehler;
          // Der Stand bleibt stehen (nichts wurde gebucht), also gilt die
          // Warnung fuer genau ihn — und verschwindet beim naechsten Eingriff.
          setErgebnis({
            stand: speicher.lies(),
            kommentar,
            inhalt: <Alert type="warning" showIcon={false} title={text} />,
          });
          return;
        }
        const { korrigiert, inventurId } = antwort.wert;
        // ⚠️ ERST LEEREN, DANN MERKEN. Das Ergebnis gilt fuer den Stand DANACH
        // — also den leeren, mit leerem Kommentar. Umgekehrt zeigte die Meldung
        // sich gar nicht erst, weil sie zum Stand von vorher gehoerte.
        speicher.leeren();
        setKommentar("");
        setErgebnis({
          stand: speicher.lies(),
          kommentar: "",
          inhalt: (
            <Alert
              type="success"
              showIcon={false}
              title={
                <>
                  {`Inventur gebucht — ${korrigiert} ${korrigiert === 1 ? "Position" : "Positionen"} korrigiert. `}
                  <Link href={`/verwaltung/inventur/verlauf/${inventurId}`}>Im Verlauf ansehen</Link>
                </>
              }
            />
          ),
        });
      } catch {
        setErgebnis({
          stand: speicher.lies(),
          kommentar,
          inhalt: <Alert type="warning" showIcon={false} title={INVENTUR_TEXTE.buchungsFehler} />,
        });
      } finally {
        absendenLaeuft.current = false;
      }
    });
  }

  return (
    <Flex vertical gap={SPACE.sm} style={{ marginBlockStart: SPACE.md }}>
      <Input
        aria-label="Kommentar"
        placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
        disabled={laeuft}
        value={kommentar}
        onChange={(ereignis) => setKommentar(ereignis.target.value)}
      />
      {ausgeblendet > 0 ? (
        // Der Filter blendet aus, er verwirft nicht (Spec §A): ohne diesen
        // Hinweis buchte der Knopf etwas, das man nicht sieht.
        <Alert
          type="info"
          showIcon={false}
          data-rolle="ausgeblendet-hinweis"
          title={`${ausgeblendet} gezählte ${
            ausgeblendet === 1 ? "Position ist ausgeblendet und wird" : "Positionen sind ausgeblendet und werden"
          } mitgebucht.`}
        />
      ) : null}
      <Button
        type="primary"
        data-rolle="abschluss"
        loading={absendetGerade}
        disabled={laeuft || !kommentar.trim() || positionen.length === 0}
        onClick={abschliessen}
      >
        Inventur abschließen ({abweichungen} Abweichung{abweichungen === 1 ? "" : "en"})
      </Button>
      {meldung}
    </Flex>
  );
}
