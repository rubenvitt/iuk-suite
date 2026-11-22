"use client";

/**
 * DIE INSEL DER ZÄHLSEITE (Verwaltungscheck, Spec 6.2) — fünf Reiter, darunter
 * die klebende Abschlussleiste, der Zählstand im Entwurf.
 *
 * ⚠️ DER ZÄHLSTAND LIEGT IN `useEntwurf` (`lagerbuch:verwaltungscheck:<id>`),
 * NICHT NUR IN `useState`: er überlebt Neuladen und `router.refresh()`, und die
 * Sendungs-ID des Entwurfs wird die ID des Checks — ein wiederholter Versuch
 * bucht nicht doppelt (`_actions/verwaltungscheck.ts`, IDA-358 wie
 * `checkAbschluss` in `_ui/CheckFlow.tsx`). Solange ein Abschluss liegt, ist
 * alles gesperrt: wer weiterzählte, schickte unter derselben ID einen anderen
 * Stand, und der Server antwortete mit dem ersten.
 *
 * ⚠️ ALLES, WAS DIE LEISTE SAGT, RECHNET `_lib/verwaltungscheck.ts` — Zähler,
 * Sperrgründe, Nutzlast. Hier wird nichts nachgerechnet; zwei Rechnungen über
 * denselben Stand liefen auseinander, und die Leiste sperrte etwas anderes, als
 * der Server abweist.
 */

import { useCallback, useState } from "react";
import { Alert, Button, Flex, Input, Popconfirm, Result, Tabs } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf, type Entwurf } from "@/core/entwurf/useEntwurf";
import { SPACE } from "@/core/theme/tokens";
import {
  verwaltungscheckAbschluss,
  type VerwaltungscheckWert,
} from "../../../../../_actions/verwaltungscheck";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import {
  ausgleichZeilen,
  baueNutzlast,
  fortschritt,
  leererZustand,
  sperrGruende,
  sperrZeilenKurz,
  type Fortschritt,
  type Sperrgrund,
  type VerwaltungscheckNutzlast,
  type ZaehlZustand,
} from "../../../../../_lib/verwaltungscheck";
import { verwaltungDetailPfad } from "../../../../../_lib/verwaltungPfad";
import { LinkKnopf } from "../../../../../_ui/LinkKnopf";
import { AusgleichReiter } from "./AusgleichReiter";
import { BestandReiter } from "./BestandReiter";
import { GeraeteReiter } from "./GeraeteReiter";
import { PlombenReiter } from "./PlombenReiter";
import type { ReiterProps } from "./reiter";
import { SauerstoffReiter } from "./SauerstoffReiter";
import k from "./zaehlen.module.css";

/**
 * Eine Absage gilt für den Stand, aus dem sie entstand, und verschwindet beim
 * nächsten Eingriff (Muster `gilt` in `inventur/Abschlussleiste.tsx`) — ohne
 * Aufräumpflicht an jeder Schreibstelle.
 */
type Absage = { stand: ZaehlZustand; text: string };

export function VerwaltungsZaehlung({ daten }: { daten: VerwaltungscheckDaten }) {
  const [zustand, setZustand] = useState<ZaehlZustand>(leererZustand);
  const [absage, setAbsage] = useState<Absage | null>(null);
  const [ergebnis, setErgebnis] = useState<VerwaltungscheckWert | null>(null);
  /** Höhe der klebenden Leiste — sie geht als `rand` an die Tabelle (Falle 16). */
  const [leistenHoehe, setLeistenHoehe] = useState(0);
  const aendere = useCallback((f: (z: ZaehlZustand) => ZaehlZustand) => setZustand(f), []);

  const entwurf = useEntwurf<
    ZaehlZustand,
    VerwaltungscheckNutzlast,
    Awaited<ReturnType<typeof verwaltungscheckAbschluss>>
  >({
    schluessel: `lagerbuch:verwaltungscheck:${daten.fahrzeug.id}`,
    stand: zustand,
    // Ein Entwurf einer älteren Fassung bekommt fehlende Felder leer, statt am Lesen zu scheitern.
    wiederherstellen: (w) => setZustand({ ...leererZustand(), ...w }),
    senden: (nutzlast, sendungId) => verwaltungscheckAbschluss({ ...nutzlast, sendungId }),
    antwort: (r) => {
      if (!r.ok) {
        // Der Server hat den Text; die Insel formuliert ihn nicht neu. Der Stand bleibt.
        setAbsage({ stand: zustand, text: r.fehler });
        return false;
      }
      // Erst leeren: der leere Stand gleicht dem Anfang, der Entwurf verschwindet mit.
      setZustand(leererZustand());
      setAbsage(null);
      setErgebnis(r.wert);
      return true;
    },
  });
  const laeuft = entwurf.zustand !== "ruhe";

  if (ergebnis) return <Ergebnis daten={daten} wert={ergebnis} />;

  const jetzt = new Date();
  const stand = fortschritt(daten, zustand);
  const ausgleich = ausgleichZeilen(daten, zustand, jetzt).length;
  const gruende = sperrGruende(daten, zustand, jetzt);
  const reiter: ReiterProps = { daten, zustand, aendere, gesperrt: laeuft };

  return (
    <>
      <Tabs
        defaultActiveKey="bestand"
        items={[
          {
            key: "bestand",
            label: `Bestand ${stand.positionenGezaehlt}/${stand.positionenGesamt}`,
            children: <BestandReiter {...reiter} rand={SPACE.lg + SPACE.md + leistenHoehe} />,
          },
          // Die Zahl sind ARTIKEL (`ausgleichZeilen`), nicht die abweichenden Positionen der Leiste.
          { key: "ausgleichen", label: `Ausgleichen ${ausgleich}`, children: <AusgleichReiter {...reiter} /> },
          // Ohne Plomben, Geräte oder Flaschen trotzdem da: dort wird angelegt (Spec 6.2).
          { key: "plomben", label: "Plomben", children: <PlombenReiter {...reiter} /> },
          {
            key: "geraete",
            label: `Geräte ${stand.geraeteBeantwortet}/${stand.geraeteGesamt}`,
            children: <GeraeteReiter {...reiter} />,
          },
          {
            key: "sauerstoff",
            label: `Sauerstoff ${stand.flaschenAbgelesen}/${stand.flaschenGesamt}`,
            children: <SauerstoffReiter {...reiter} />,
          },
        ]}
      />
      <Abschlussleiste
        stand={stand}
        gruende={gruende}
        kommentar={zustand.kommentar}
        onKommentar={(kommentar) => aendere((z) => ({ ...z, kommentar }))}
        absage={absage && absage.stand === zustand ? absage.text : null}
        entwurf={entwurf}
        laeuft={laeuft}
        onAbschliessen={() => {
          if (laeuft || gruende.length > 0) return;
          // Die Sendungs-ID setzt `senden` — sie gehört dem Entwurf, nicht dem Stand.
          entwurf.sende(baueNutzlast(daten, zustand, ""));
        }}
        onHoehe={setLeistenHoehe}
      />
    </>
  );
}

function mehrzahl(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

/** „x von y Positionen gezählt · n Abweichungen · Geräte a/b · Flaschen c/d" (Spec 6.2). */
function fortschrittText(f: Fortschritt): string {
  return [
    `${f.positionenGezaehlt} von ${f.positionenGesamt} Positionen gezählt`,
    mehrzahl(f.abweichungen, "Abweichung", "Abweichungen"),
    ...(f.geraeteGesamt > 0 ? [`Geräte ${f.geraeteBeantwortet}/${f.geraeteGesamt}`] : []),
    ...(f.flaschenGesamt > 0 ? [`Flaschen ${f.flaschenAbgelesen}/${f.flaschenGesamt}`] : []),
  ].join(" · ");
}

/**
 * DIE KLEBENDE LEISTE — Vorbild `inventur/Abschlussleiste.tsx`. „Abschließen"
 * ist die einzige Primäraktion der Insel; gesperrt steht der Grund SICHTBAR
 * darüber (docs/design/README.md, Formulare Regel 1), nie nur im Tooltip.
 *
 * ⚠️ ERST FRAGEN, DANN BUCHEN (Formulare Regel 4, wie IDA-379 in der Inventur):
 * das Journal nimmt nichts zurück, und ein Tipp auf den Knopf buchte sonst
 * Korrektur und Bewegungen sofort.
 */
function Abschlussleiste({
  stand, gruende, kommentar, onKommentar, absage, entwurf, laeuft, onAbschliessen, onHoehe,
}: {
  stand: Fortschritt;
  gruende: readonly Sperrgrund[];
  kommentar: string;
  onKommentar: (kommentar: string) => void;
  absage: string | null;
  /** Ohne `sende` — wie `EntwurfHinweis`; gesendet wird oben über `onAbschliessen`. */
  entwurf: Omit<Entwurf<unknown>, "sende">;
  laeuft: boolean;
  onAbschliessen: () => void;
  onHoehe: (hoehe: number) => void;
}) {
  const [frage, setFrage] = useState(false);
  // Die Leiste klebt: die Gründe stehen gekürzt da, die volle Liste auf Wunsch (`sperrZeilenKurz`).
  const [alleGruende, setAlleGruende] = useState(false);
  const kurz = sperrZeilenKurz(gruende);
  const knopfGesperrt = laeuft || gruende.length > 0;
  // Die Höhe geht hinauf (Falle 16). jsdom kennt keinen `ResizeObserver`.
  const leiste = useCallback((element: HTMLDivElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const melde = () => onHoehe(Math.ceil(element.getBoundingClientRect().height));
    melde();
    const beobachter = new ResizeObserver(melde);
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [onHoehe]);

  return (
    <div ref={leiste} className={k.abschluss} data-rolle="abschlussleiste" data-fussleiste="">
      <EntwurfHinweis entwurf={entwurf} />
      {absage ? (
        // Fehlerzeilen tragen `warning` wie überall in der Suite (Falle 3, `EntwurfHinweis`).
        <Alert type="warning" showIcon={false} title={<span data-rolle="abschluss-fehler">{absage}</span>} />
      ) : null}
      {gruende.length > 0 ? (
        <ul className={k.sperrgruende} data-rolle="sperrgruende" aria-label="Noch nicht abschließbar">
          {(alleGruende ? gruende.map((g) => g.text) : kurz.zeilen).map((text) => <li key={text}>{text}</li>)}
          {kurz.gekuerzt ? (
            <li className={k.sperrUmschalter}>
              <Button type="link" data-rolle="sperrgruende-alle" onClick={() => setAlleGruende((a) => !a)}>
                {alleGruende ? "weniger zeigen" : kurz.weitere > 0 ? `und ${kurz.weitere} weitere — alle zeigen` : "alle zeigen"}
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
      <div className={k.abschlussZeile}>
        <span className={k.fortschritt} data-rolle="fortschritt">{fortschrittText(stand)}</span>
        <div className={k.kommentar}>
          <Input
            aria-label="Kommentar"
            placeholder="Kommentar, z. B. Erstbestückung"
            maxLength={500}
            disabled={laeuft}
            value={kommentar}
            onChange={(e) => onKommentar(e.target.value)}
          />
        </div>
        <div className={k.knopf}>
          <Popconfirm
            title="Abschließen und buchen?"
            description="Zählung, Ausgleich und Ergebnisse werden gebucht. Das lässt sich nicht rückgängig machen."
            okText="Buchen"
            cancelText="Abbrechen"
            placement="topRight"
            disabled={knopfGesperrt}
            open={frage && !knopfGesperrt}
            onOpenChange={setFrage}
            onConfirm={() => { setFrage(false); onAbschliessen(); }}
          >
            <Button
              type="primary"
              data-rolle="abschluss"
              loading={entwurf.zustand === "sendet"}
              disabled={knopfGesperrt}
            >
              Abschließen
            </Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

/** Die Kennzahlen des gebuchten Checks — nur, was nicht null ist. */
function kennzahlen(w: VerwaltungscheckWert): string[] {
  return [
    w.korrigiert > 0 ? `Bestand um ${w.korrigiert} korrigiert` : null,
    w.ausgesondert > 0 ? `${w.ausgesondert} ausgesondert` : null,
    w.zurueckgelegt > 0 ? `${w.zurueckgelegt} zurückgelegt` : null,
    w.aufgefuellt > 0 ? `${w.aufgefuellt} aufgefüllt` : null,
    w.offen > 0 ? `${w.offen} ${w.offen === 1 ? "fehlt" : "fehlen"} noch` : null,
    w.plombenGesetzt > 0 ? mehrzahl(w.plombenGesetzt, "Plombe gesetzt", "Plomben gesetzt") : null,
    w.geraeteAuffaellig > 0 ? mehrzahl(w.geraeteAuffaellig, "Gerät auffällig", "Geräte auffällig") : null,
    w.geraeteGemeldet > 0 ? mehrzahl(w.geraeteGemeldet, "Mangel gemeldet", "Mängel gemeldet") : null,
    w.flaschenAuffaellig > 0 ? mehrzahl(w.flaschenAuffaellig, "Flasche auffällig", "Flaschen auffällig") : null,
  ].filter((z): z is string => z !== null);
}

function Ergebnis({ daten, wert }: { daten: VerwaltungscheckDaten; wert: VerwaltungscheckWert }) {
  const zahlen = kennzahlen(wert);
  return (
    <div data-rolle="ergebnis">
      <Result
        status="success"
        title="Check gespeichert"
        subTitle={zahlen.length === 0 ? "Es wurde nichts bewegt." : undefined}
        extra={(
          <Flex gap={SPACE.sm} wrap justify="center">
            <LinkKnopf href={verwaltungDetailPfad("checks", wert.checkId)} primaer>Zum Check</LinkKnopf>
            <LinkKnopf href={verwaltungDetailPfad("fahrzeuge", daten.fahrzeug.id)}>Zurück zur Einheit</LinkKnopf>
          </Flex>
        )}
      >
        {zahlen.length > 0 ? (
          <ul className={k.kennzahlen} data-rolle="kennzahlen">
            {zahlen.map((z) => <li key={z}>{z}</li>)}
          </ul>
        ) : null}
      </Result>
    </div>
  );
}
