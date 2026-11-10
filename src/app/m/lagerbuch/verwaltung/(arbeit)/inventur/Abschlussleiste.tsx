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
 *
 * IDA-237 — SIE STEHT FEST AM UNTEREN RAND (`position: sticky`) und sagt, wie
 * weit die Zaehlung ist („x von y erfasst"). Vorher stand sie unter der letzten
 * Zeile: bei 230 Artikeln auf dem Telefon zwanzig Bildschirme Scrollweg bis zum
 * Kommentarfeld, und wie viel noch fehlt, stand nirgends.
 *
 * ⚠️ IHRE HOEHE GEHT HINAUF (`onHoehe`), UND DAS IST FALLE 16, NICHT KOSMETIK.
 * Am Schreibtisch fuellt der virtuelle Tabellenkoerper das Fenster bis zum
 * unteren Rand (`TabellenVollhoehe`). Eine feste Leiste darueber verdeckte
 * genau die letzten Zeilen dieses zweiten Scrollers — und das Dokument bekaeme
 * wieder einen Scrollweg in Hoehe der Leiste, also zwei Scrollbalken. Mit der
 * gemessenen Hoehe als `rand` endet der Koerper ueber der Leiste.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurfMeldung } from "@/core/entwurf/useEntwurfMeldung";
import { Alert, Button, Flex, Input, Popconfirm } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { inventurKorrektur, type InventurNutzlast } from "../../../_actions/inventur";
import { filterIstLeer, type InventurFilter } from "../../../_lib/inventurFilter";
import { INVENTUR_ABWEISUNGEN, INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import {
  abschlussFolge,
  abweichungenIn,
  ausgeblendetGezaehlt,
  fortschritt,
  korrekturenIn,
  positionenAus,
  type ZaehlStand,
} from "./inventurZustand";
import { useZaehlstand, type Zaehlspeicher } from "./zaehlspeicher";
import { verwaltungDetailPfad } from "../../../_lib/verwaltungPfad";
import k from "./inventurkarte.module.css";

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
  onHoehe,
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
  /** Die gemessene Hoehe der Leiste — Begruendung im Kopf (Falle 16). */
  onHoehe?: (hoehe: number) => void;
}) {
  const stand = useZaehlstand(speicher);
  const [kommentar, setKommentar] = useState("");
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  /** IDA-379 — die Rueckfrage vor dem Buchen ist offen. */
  const [frage, setFrage] = useState(false);

  /*
   * IDA-358 — DIE ZAEHLUNG LIEGT AUF DEM GERAET, NICHT NUR IM SPEICHER NEBEN
   * REACT. Eine Inventur ist eine Stunde Zaehlen mit dem Tablet am Regal; ein
   * Neuladen oder ein Rollout mitten im Abschliessen kostete sie bis hierher
   * ganz. `useEntwurf` legt Zaehlstand und Kommentar je Zaehlort ab, stellt sie
   * wieder her und haelt den Abschluss fest, bis der Server ihn bestaetigt —
   * samt erneuten Versuchen; die Sendungs-ID wird die ID des Laufs, eine
   * Wiederholung bucht nicht doppelt (`_actions/inventur.ts`). Deshalb Modus
   * „senden" und nicht nur Wiederherstellen: die Zaehlung ist eine Pruefung im
   * Feld, keine Schreibtischeingabe.
   *
   * ⚠️ DER HOOK STEHT HIER UND NICHT IM FORMULAR: nur diese Leiste horcht ohnehin
   * auf den ganzen Stand (`useZaehlstand`), das Formular darf er nicht wecken
   * (DRK-421, Kopf von `zaehlspeicher.ts`).
   *
   * ⚠️ SOLANGE EIN ABSCHLUSS LIEGT, IST DIE SEITE GESPERRT: wer weiterzaehlte und
   * erneut abschloesse, schickte unter derselben ID einen anderen Stand — kam
   * der erste an, antwortete der Server mit ihm, und die Nachtraege waeren weg.
   */
  const entwurf = useEntwurf<
    { zaehlung: ZaehlStand; kommentar: string },
    InventurNutzlast,
    Awaited<ReturnType<typeof inventurKorrektur>>
  >({
    schluessel: `lagerbuch:inventur:${ortId ?? "alle"}`,
    stand: { zaehlung: stand, kommentar },
    wiederherstellen: (w) => {
      speicher.aendere(() => w.zaehlung);
      setKommentar(w.kommentar);
    },
    senden: (nutzlast, sendungId) => inventurKorrektur({ ...nutzlast, sendungId }),
    antwort: (antwort) => {
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
        return false;
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
                <Link href={verwaltungDetailPfad("inventur/verlauf", inventurId)}>Im Verlauf ansehen</Link>
              </>
            }
          />
        ),
      });
      return true;
    },
  });
  const absendetGerade = entwurf.zustand === "sendet";
  const sendungLiegt = entwurf.zustand !== "ruhe";
  const entwurfZeile = useEntwurfMeldung(entwurf) !== null;

  // Die Sperre gilt fuer die ganze Seite (Zellen, Ortsauswahl), nicht nur fuer
  // diese Leiste — sie muss also hinauf. `useEffect` und nicht der Aufruf im
  // Rumpf: ein `setState` im Elternteil waehrend des eigenen Renderns ist in
  // React ein Fehler.
  useEffect(() => { onAbsenden(sendungLiegt); }, [sendungLiegt, onAbsenden]);

  const leiste = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = leiste.current;
    // jsdom kennt keinen `ResizeObserver` und rechnet ohnehin keine Kaesten.
    if (!element || !onHoehe || typeof ResizeObserver === "undefined") return;
    const melde = () => onHoehe(Math.ceil(element.getBoundingClientRect().height));
    melde();
    const beobachter = new ResizeObserver(melde);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [onHoehe]);

  const positionen = useMemo(() => positionenAus(stand, zeilen), [stand, zeilen]);
  const abweichungen = abweichungenIn(zeilen, stand);
  const ausgeblendet = ausgeblendetGezaehlt(zeilen, stand, filter);
  const { erfasst, gesamt } = fortschritt(zeilen, stand, filter);
  const laeuft = sendungLiegt || gesperrt;
  const meldung = gilt(ergebnis, stand, kommentar);
  const knopfGesperrt = laeuft || !kommentar.trim() || positionen.length === 0;
  /*
   * IDA-379 — DIE FOLGE WIRD NUR BEI OFFENER RUECKFRAGE GERECHNET. Die Leiste
   * rendert bei jeder Zaehlaenderung mit (Kopf); die Namensliste der
   * Korrekturen braucht dort niemand, solange niemand abschliessen will.
   */
  const folge = frage ? abschlussFolge(gesamt - erfasst, korrekturenIn(zeilen, stand)) : [];

  function abschliessen(): void {
    // `gesperrt` steht hier noch einmal, nicht nur am Knopf: ein Absenden
    // waehrend der Navigation buchte gegen den verlassenen Ort.
    if (sendungLiegt || gesperrt || !kommentar.trim() || positionen.length === 0) return;
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
      // IDA-379 — damit der Verlauf „2 von 14" sagen kann statt „vollständig".
      abdeckung: { erfasst, gesamt },
      positionen,
    };
    // Einen Wurf (Netz, Rollout) faengt `useEntwurf`; die Statuszeile ueber der
    // Leiste sagt „Nicht gesendet" und bietet „Jetzt senden".
    entwurf.sende(nutzlast);
  }

  return (
    <div ref={leiste} className={k.abschluss} data-rolle="abschlussleiste" data-fussleiste="">
      {ausgeblendet > 0 || meldung || entwurfZeile ? (
        <Flex vertical gap={SPACE.sm}>
          {entwurfZeile ? <EntwurfHinweis entwurf={entwurf} /> : null}
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
          {meldung}
        </Flex>
      ) : null}
      <div className={k.abschlussZeile}>
        {/* ⚠️ DIE ABWEICHUNGEN STEHEN HIER UND NICHT MEHR IM KNOPF (IDA-237):
            „Inventur abschließen (12 Abweichungen)" passte auf 390px neben
            nichts anderes mehr in die Zeile. */}
        <span className={k.fortschritt} data-rolle="fortschritt">
          <strong>{`${erfasst} von ${gesamt}`}</strong>
          {` erfasst · ${abweichungen} Abweichung${abweichungen === 1 ? "" : "en"}`}
        </span>
        <div className={k.kommentar}>
          <Input
            aria-label="Kommentar"
            placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
            disabled={laeuft}
            value={kommentar}
            onChange={(ereignis) => setKommentar(ereignis.target.value)}
          />
        </div>
        <div className={k.knopf}>
          {/* IDA-379 — ERST FRAGEN, DANN BUCHEN, und die Frage nennt die Folge:
              was ungezaehlt bleibt und welche Bestaende sich aendern. Vorher
              buchte ein Tipp auf den Knopf sofort, auch bei 2 von 14 Artikeln. */}
          <Popconfirm
            title="Inventur buchen?"
            description={
              <Flex vertical gap={SPACE.xs} className={k.folge} data-rolle="abschluss-folge">
                {folge.map((zeile) => <span key={zeile}>{zeile}</span>)}
              </Flex>
            }
            okText="Buchen"
            cancelText="Abbrechen"
            placement="topRight"
            disabled={knopfGesperrt}
            open={frage && !knopfGesperrt}
            onOpenChange={setFrage}
            onConfirm={() => { setFrage(false); abschliessen(); }}
          >
            <Button
              type="primary"
              data-rolle="abschluss"
              loading={absendetGerade}
              disabled={knopfGesperrt}
            >
              Inventur abschließen
            </Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}
