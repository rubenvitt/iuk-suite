"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Flex, Input, InputNumber, Select } from "antd";
import {
  Datentabelle,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  type Filterwert,
  type FilterZustand,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { inventurKorrektur, type InventurNutzlast } from "../../../_actions/inventur";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import {
  filterIstLeer,
  inventurTrifft,
  type InventurFilter,
} from "../../../_lib/inventurFilter";
import { ZAEHLORT_ALLE, zaehlOrtWert, type ZaehlOrt } from "../../../_lib/inventurOrt";
import { INVENTUR_ABWEISUNGEN, INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import { kategorieOptionen } from "../../../_lib/kategorie";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import s from "../../../_ui/verwaltung.module.css";
import { ChargenZaehlung } from "./ChargenZaehlung";
import {
  abweichungenIn,
  artikelSetzen,
  ausgeblendetGezaehlt,
  positionenAus,
  summeFuer,
  type ZaehlStand,
} from "./inventurZustand";

/**
 * KATEGORIE UND FACH FILTERN IM SPALTENKOPF, UND ZWAR MIT DERSELBEN FUNKTION, DIE
 * ALLES ANDERE FRAGT (DRK-333).
 *
 * ⚠️ DAS IST DER PUNKT, AN DEM ZWEI PRAEDIKATE AUSEINANDERLAUFEN WUERDEN. antds
 * `onFilter` entscheidet, was in der Tabelle steht; `inventurTrifft` entscheidet,
 * was als „ausgeblendet, wird trotzdem gebucht" gezaehlt wird und was als Umfang
 * in den append-only Verlauf geht. Schriebe man beides einzeln hin, zeigte die
 * Tabelle eines Tages etwas anderes, als der Hinweis daneben behauptet — und der
 * Verlauf traege einen Umfang, der nie auf dem Schirm stand. Deshalb delegieren
 * die zwei `onFilter` hierher.
 *
 * ⚠️ UND DIE VERKNUEPFUNG STIMMT DAMIT AUCH: antd ruft `onFilter` je angekreuztem
 * Wert EINER Spalte einzeln und verodert (`useFilter/index.js`, `realKeys.some`),
 * verschiedene Spalten schneidet es — genau das tut `inventurTrifft` mit seinem
 * `includes` je Merkmal und den zwei Pruefungen nacheinander.
 */
function trifftKategorie(zeile: InventurZeile, wert: Filterwert): boolean {
  return inventurTrifft(zeile, { kategorien: [String(wert)], faecher: [] });
}

export function InventurForm({ zeilen, ortId, orte }: {
  zeilen: InventurZeile[];
  /** `null` = ganzer Handlager. Kommt aus der URL, nicht aus dieser Insel. */
  ortId: string | null;
  orte: ZaehlOrt[];
}) {
  const [stand, setStand] = useState<ZaehlStand>({});
  /**
   * ⚠️ GEMERKT WIRD DER ZUSTAND DER SPALTENKOEPFE, NIE DIE LISTE DARAUS (Falle 15).
   * `onChange` feuert nur bei Bedienung DER TABELLE; laedt die Seite daneben einen
   * neuen Serverstand, filtert antd zwar korrekt neu, meldet es aber nicht. Der
   * Hinweis „N Positionen sind ausgeblendet" und der Umfang im Verlauf haengen an
   * dieser Zahl — ein gemerkter Stand waere dort still veraltet.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  const [kommentar, setKommentar] = useState("");
  const [meldung, setMeldung] = useState<ReactNode>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [absendetGerade, startTransition] = useTransition();
  /**
   * DRK-337, P1-Befund von Codex — DER WETTLAUF ZWISCHEN AUSWAHL UND SERVER.
   *
   * `router.replace` STOESST die Navigation nur an. Bis die neue RSC-Antwort da
   * ist, steht hier weiter der ALTE Ort, stehen die alten Erwartungszahlen, und
   * `key` in `page.tsx` hat die Insel noch nicht neu aufgesetzt. Ohne diesen
   * Riegel koennte in genau diesem Fenster jemand einen Kommentar tippen, eine
   * Menge erfassen und abschicken — gebucht wuerde gegen den Schrank, den er
   * gerade verlassen hat. Dieselbe Fehlbuchung, gegen die das ganze Ticket
   * antritt, nur durch eine langsame Leitung statt durch einen Denkfehler.
   *
   * `useTransition` um `router.replace` ist der vorgesehene Weg: `isPending`
   * bleibt wahr, BIS die Navigation uebernommen hat.
   *
   * ⚠️ DAS ZEITFENSTER SELBST SIEHT KEIN VITEST-FALL, und das ist keine Luecke,
   * sondern eine Eigenschaft der Umgebung: der Router ist dort gemockt und
   * kehrt SYNCHRON zurueck, die Transition ist also beendet, bevor eine
   * Zusicherung greifen koennte. Oeffnen laesst sich das Fenster nur durch eine
   * echte, langsame Navigation. Geprueft ist deshalb die VERDRAHTUNG (der
   * Wechsel laeuft ueber diese Transition), nicht die Dauer.
   */
  const [wechseltOrt, startOrtswechsel] = useTransition();
  /** Alles, was den Zaehlstand oder die Buchung anfasst, haengt an DIESEM Wert. */
  const laeuft = absendetGerade || wechseltOrt;
  const absendenLaeuft = useRef(false);
  const setzeUrl = useUrlFilter();

  const kategorien = useMemo(() => kategorieOptionen(zeilen.map((z) => z.kategorie)), [zeilen]);

  /**
   * Der fachliche Filter, ABGELEITET aus dem Spaltenzustand — eine Quelle, aus der
   * der Ausgeblendet-Hinweis, die Trefferanzeige und der Umfang der Buchung folgen.
   * Die Kategorien stehen als GEFALTETE Schluessel darin (so vergibt sie
   * `kategorieOptionen`); das Label kommt erst beim Absenden dazu.
   */
  const filter = useMemo<InventurFilter>(() => ({
    kategorien: (spaltenFilter.kategorie ?? []).map(String),
    faecher: (spaltenFilter.fach ?? []).map(String),
  }), [spaltenFilter]);

  const positionen = positionenAus(stand);
  const abweichungen = abweichungenIn(zeilen, stand);
  const ausgeblendet = ausgeblendetGezaehlt(zeilen, stand, filter);
  const sichtbar = zeilen.filter((zeile) => inventurTrifft(zeile, filter));

  function wertSetzen(id: string, wert: number | null): void {
    setStand((aktuell) => artikelSetzen(aktuell, id, wert ?? 0));
    setFehler(null);
    setMeldung(null);
  }

  function kommentarSetzen(wert: string): void {
    setKommentar(wert);
    setFehler(null);
    setMeldung(null);
  }

  function abschliessen(): void {
    // `wechseltOrt` steht hier noch einmal, nicht nur am Knopf: ein Absenden
    // waehrend der Navigation buchte gegen den verlassenen Ort.
    if (absendenLaeuft.current || wechseltOrt || !kommentar.trim() || positionen.length === 0) return;
    absendenLaeuft.current = true;
    // Der Umfang ist BESCHREIBEND und bleibt im append-only Verlauf stehen: er
    // traegt die LABELS, nie die gefalteten Schluessel des Filters.
    const labelJeSchluessel = new Map(kategorien.map((o) => [o.schluessel, o.label]));
    const nutzlast: InventurNutzlast = {
      kommentar: kommentar.trim(),
      // DRK-337 — die KENNUNG, nicht der Name: den Namen fuer den Verlauf holt
      // die Action aus der Datenbank (`umfangJson`).
      ortId,
      umfang: filterIstLeer(filter)
        ? null
        : {
            kategorien: filter.kategorien.map((k) => labelJeSchluessel.get(k) ?? k),
            faecher: [...filter.faecher],
          },
      positionen,
    };
    startTransition(async () => {
      try {
        const ergebnis = await inventurKorrektur(nutzlast);
        if (!ergebnis.ok) {
          setFehler(INVENTUR_ABWEISUNGEN.has(ergebnis.fehler)
            ? ergebnis.fehler
            : INVENTUR_TEXTE.buchungsFehler);
          return;
        }
        const { korrigiert, inventurId } = ergebnis.wert;
        setFehler(null);
        setMeldung(
          <>
            {`Inventur gebucht — ${korrigiert} ${korrigiert === 1 ? "Position" : "Positionen"} korrigiert. `}
            <Link href={`/verwaltung/inventur/verlauf/${inventurId}`}>Im Verlauf ansehen</Link>
          </>,
        );
        // Der Filter bleibt stehen: wer fachweise zaehlt, zaehlt das naechste Fach.
        setStand({});
        setKommentar("");
      } catch {
        setFehler(INVENTUR_TEXTE.buchungsFehler);
      } finally {
        absendenLaeuft.current = false;
      }
    });
  }

  return (
    <>
      {/*
        HIER STAND EINE LEISTE MIT ZWEI AUSWAHLFELDERN (Kategorie, Fach). Sie ist mit
        DRK-333 in die Spaltenkoepfe gewandert — dieselbe Aufloesung, die DRK-331
        ueberall sonst gemacht hat: ein Praedikat ueber der Zeile ist ein Spaltenfilter,
        und es gehoert in den Kopf der Spalte, die es betrifft.

        Was bleibt, ist der ZAEHLER: ohne die Leiste zeigt nur noch antds Trichter, dass
        ueberhaupt gefiltert ist. ⚠️ Er ist ABGELEITET, nicht gemerkt (Falle 15) — die
        Zahl folgt aus `filter`, also aus dem Spaltenzustand, nicht aus
        `onChange(…, extra.currentDataSource)`.
      */}
      {/*
        DRK-337 — DIE ORTSAUSWAHL, und sie steht bewusst NICHT im Spaltenkopf wie
        Kategorie und Fach (DRK-333). Der Unterschied ist fachlich: jene beiden
        BLENDEN Zeilen aus, die gezaehlten Werte bleiben und werden mitgebucht.
        Der Ort dagegen bestimmt, WOGEGEN gerechnet wird — jede Erwartungszahl und
        jede Korrektur haengt daran. Ein Filter, der die Bedeutung der Zahlen
        daneben aendert, gehoert ueber die Tabelle, nicht in ihren Kopf.
      */}
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Select<string>
          value={zaehlOrtWert(ortId)}
          aria-label="Zählort"
          // ⚠️ GESPERRT, SOBALD ETWAS GEZAEHLT IST. Der Wechsel steigt die Insel
          // neu ein (`key` in `page.tsx`) und verwirft damit den Zaehlstand —
          // das darf nicht unter der Hand passieren, waehrend jemand vor einem
          // Schrank steht. Der Knopf daneben ist der ausdrueckliche Weg.
          disabled={laeuft || positionen.length > 0}
          onChange={(wert) => startOrtswechsel(() => {
            setzeUrl({ ort: wert === ZAEHLORT_ALLE ? "" : wert });
          })}
          style={{ minWidth: 240 }}
          // ⚠️ `zaehlOrtWert` UND NICHT `o.id` (DRK-371): die rohe Kennung stuende
          // im selben Wertebereich wie der Waechter, und ein Schrank namens
          // `alle` waere nicht mehr waehlbar — sein Klick zaehlte den ganzen
          // Handlager, samt der Korrekturen, die daraus folgen.
          options={orte.map((o) => ({ value: zaehlOrtWert(o.id), label: o.label }))}
          virtual={false}
        />
        {positionen.length > 0 ? (
          <>
            <span data-rolle="ort-gesperrt">
              {`${positionen.length} ${positionen.length === 1 ? "Position ist" : "Positionen sind"} gezählt — der Zählort ist bis zum Abschluss festgelegt.`}
            </span>
            <Button
              disabled={laeuft}
              data-rolle="zaehlung-verwerfen"
              onClick={() => { setStand({}); setFehler(null); setMeldung(null); }}
            >
              Zählung verwerfen
            </Button>
          </>
        ) : null}
        {/* ⚠️ DER ZAEHLER STEHT IN DERSELBEN LEISTE, nicht in einer zweiten
            darunter: seit DRK-337 steht hier IMMER etwas, und zwei Leisten
            uebereinander trugen ihren Aussenabstand zweimal. Er erscheint
            weiterhin nur, wenn wirklich gefiltert ist — „2 von 2" waere Laerm. */}
        {sichtbar.length === zeilen.length ? null : (
          <Trefferanzeige gezeigt={sichtbar.length} gesamt={zeilen.length} />
        )}
      </Flex>
      <Datentabelle<InventurZeile>
        rowKey="id"
        aria-label="Inventur"
        dataSource={zeilen}
        onChange={(_seite, spalten) => setSpaltenFilter(spalten)}
        // Spec §B: JEDE Zeile ist aufklappbar — auch ohne Charge, dort bleibt die
        // Ergaenzen-Zeile. Deshalb kein `rowExpandable`.
        expandable={{
          expandedRowRender: (zeile) => (
            <ChargenZaehlung
              zeile={zeile}
              zaehlung={stand[zeile.id]}
              gesperrt={laeuft}
              ortText={ortId === null ? "im Handlager" : "an diesem Zählort"}
              onAendern={(umbau) => { setStand(umbau); setFehler(null); setMeldung(null); }}
            />
          ),
          // antds Standard-Aufklappknopf misst ~17px und unterschreitet die
          // Arbeitsdichte (Falle 4). Ein `Button` OHNE `size` traegt die 44px.
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              aria-label={expanded ? `Chargen ${record.name} ausblenden` : `Chargen ${record.name} anzeigen`}
              aria-expanded={expanded}
              onClick={(e) => onExpand(record, e)}
              icon={<Ikone name={expanded ? "zuklappen" : "aufklappen"} groesse={14} />}
            />
          ),
        }}
        // Punkt 5 der Pruefliste: der Leertext nennt den naechsten Schritt.
        locale={{
          emptyText: zeilen.length === 0
            ? "Keine Artikel vorhanden. Lege sie zuerst unter Artikel & Bestand an."
            : "Kein Artikel passt zum Filter.",
        }}
        // Den Spaltenkopf-Kicker setzt `Datentabelle` selbst, sobald `title`
        // eine Zeichenkette ist (docs/design/README.md).
        //
        // ⚠️ KEINE SORTIERUNG AUF „Abweichung" UND „Ist": beide lesen
        // `beruehrt`, also den Zaehlstand DIESER Sitzung. Eine Spalte, die sich
        // waehrend des Zaehlens selbst umsortiert, verliert die Zeile unter dem
        // Finger. ⛔ AUS DEMSELBEN GRUND HAT DIE NEUE KATEGORIE-SPALTE KEINEN
        // SORTIERER BEKOMMEN, obwohl ihr Wert statisch waere: dieses Ticket
        // (DRK-333) bringt hier einen FILTER, keine zweite Ordnung.
        columns={[
          {
            title: "Artikel",
            dataIndex: "name",
            sorter: nachText<InventurZeile>((zeile) => zeile.name),
            render: (wert: string) => <span style={{ fontWeight: 600 }}>{wert}</span>,
          },
          {
            title: "Kategorie",
            dataIndex: "kategorie",
            /*
             * DIE SPALTE IST MIT DEM FILTER GEKOMMEN (DRK-333) — ein Filter gehoert in
             * den Kopf der Spalte, die er betrifft, und eine Kategorie, nach der man
             * filtern kann, muss man auch lesen koennen.
             *
             * ⚠️ DIE WERTE SIND GEFALTETE SCHLUESSEL, DIE BESCHRIFTUNG IST DIE
             * HAEUFIGSTE SCHREIBWEISE (`kategorieOptionen`, DRK-294) — nicht
             * `werteAlsFilter`, das die Rohwerte nimmt und „Hygiene" von „hygiene"
             * als zwei Optionen anboete. ⛔ UND KEIN „ohne Kategorie": ein Artikel
             * ohne Kategorie erscheint nur OHNE Kategorienfilter, das ist die
             * Entscheidung aus DRK-299 (`_lib/inventurFilter.ts`) und bleibt.
             */
            filters: kategorien.map((o) => ({ text: o.label, value: o.schluessel })),
            onFilter: (wert: Filterwert, zeile: InventurZeile) => trifftKategorie(zeile, wert),
            render: (wert: string | null) => wert ?? "—",
          },
          {
            title: "Fach",
            dataIndex: "fach",
            sorter: nachText<InventurZeile>((zeile) => zeile.fach),
            // Der Fachfilter, der in DRK-331 kurz hier stand und beim Merge wieder
            // weichen musste, weil die Leiste daneben dasselbe Merkmal traf.
            filters: werteAlsFilter(zeilen, (zeile) => zeile.fach),
            onFilter: trifftWert<InventurZeile>((zeile) => zeile.fach),
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: "MHD",
            dataIndex: "chargen",
            // `chargen[0]` ist FEFO-naechste Handlager-Charge. `2099-12` („ohne
            // Verfall") zeigt wie die Artikelliste schlicht `fmtVerfall` — dort
            // gibt es keinen Sonderfall, hier auch nicht.
            render: (_wert: unknown, zeile) => {
              const naechste = zeile.chargen[0];
              return naechste
                ? <Chip ton={ampelTon(naechste.ampel)}>{fmtVerfall(naechste.verfall)}</Chip>
                : "—";
            },
          },
          {
            title: "Min.",
            dataIndex: "mindestbestand",
            align: "right",
            render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
          },
          {
            title: "Bestand",
            dataIndex: "bestand",
            align: "right",
            // Gezeigt wird „3 Stk", sortiert wird ueber die nackte Zahl.
            sorter: nachZahl<InventurZeile>((zeile) => zeile.bestand),
            render: (wert: number, zeile) => (
              <span style={SCHRIFT.mono}>{wert} {zeile.einheit}</span>
            ),
          },
          {
            title: "Abweichung",
            dataIndex: "id",
            render: (_wert: string, zeile) => {
              if (!(zeile.id in stand)) return null;
              const differenz = summeFuer(zeile, stand[zeile.id]) - zeile.bestand;
              if (differenz === 0) return null;
              return (
                <Chip ton={differenz < 0 ? "rot" : "gelb"}>
                  {differenz > 0 ? `+${differenz}` : `${differenz}`}
                </Chip>
              );
            },
          },
          {
            title: "Ist",
            dataIndex: "id",
            align: "right",
            render: (_wert: string, zeile) => {
              // Einmal berechnet, von Minus-Knopf, Feld und Plus-Knopf gelesen --
              // zwei Ableitungen desselben Werts liefen sonst auseinander.
              const aktuell = summeFuer(zeile, stand[zeile.id]);
              // Im Chargenmodus ist das Feld nur die Summe (Spec §B).
              const nurSumme = stand[zeile.id]?.art === "chargen";
              return (
                // KEIN size="small" an den drei Bedienelementen: die alte
                // Zeilenaktions-Ausnahme (Falle 4, docs/design/README.md) ist
                // mit der Arbeitsdichte gefallen -- 44px ist hier bereits die
                // volle wie die halbe Bediendichte, "small" unterbietet die
                // Mindesttapflaeche (WCAG 2.5.5). e2e/lagerbuch-mobil.spec.ts:312
                // misst das heute nur auf /verwaltung/bestellung -- diese Seite
                // ist (noch) nicht im Testpfad, die Regel gilt trotzdem.
                <Flex gap={SPACE.xs} align="center" justify="flex-end">
                  {nurSumme ? <Chip ton="grau">je Charge</Chip> : null}
                  <Button
                    disabled={laeuft || nurSumme || aktuell <= 0}
                    aria-label={`Ist-Bestand ${zeile.name} verringern`}
                    onClick={() => wertSetzen(zeile.id, aktuell - 1)}
                    icon={<Ikone name="minus" groesse={14} />}
                  />
                  <InputNumber<number>
                    min={0}
                    max={nurSumme ? 99_999 : 9999}
                    disabled={laeuft || nurSumme}
                    aria-label={`Ist-Bestand ${zeile.name}`}
                    value={aktuell}
                    onChange={(wert) => wertSetzen(zeile.id, wert)}
                  />
                  <Button
                    disabled={laeuft || nurSumme || aktuell >= 9999}
                    aria-label={`Ist-Bestand ${zeile.name} erhöhen`}
                    onClick={() => wertSetzen(zeile.id, aktuell + 1)}
                    icon={<Ikone name="plus" groesse={14} />}
                  />
                </Flex>
              );
            },
          },
        ]}
      />
      <Flex vertical gap={SPACE.sm} style={{ marginBlockStart: SPACE.md }}>
        <Input
          aria-label="Kommentar"
          placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
          disabled={laeuft}
          value={kommentar}
          onChange={(ereignis) => kommentarSetzen(ereignis.target.value)}
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
        {meldung ? (
          <Alert type="success" showIcon={false} title={meldung} />
        ) : null}
        {fehler ? (
          <Alert type="warning" showIcon={false} title={fehler} />
        ) : null}
      </Flex>
    </>
  );
}
