"use client";

/**
 * DER REITER „Bestand" (Spec 6.3) — Ist je Soll-Position, Verfall je Fach.
 *
 * Tablet: `Datentabelle` mit Fach-Filter im Spaltenkopf; Telefon: Karten mit
 * `Schmalfilter` (ohne Kategorien). Beide schreiben in denselben Zählstand und
 * filtern über DENSELBEN Spaltenzustand — die zwei Darstellungen zeigen nie
 * verschiedene Mengen (Begründung in `inventur/Schmalfilter.tsx`).
 *
 * ⚠️ `render` UND JSX STEHEN NUR HIER IM CLIENT (Falle 9), die Spaltentitel
 * sind Zeichenketten (Falle 17) — den Kicker setzt `Datentabelle`.
 *
 * ⚠️ JEDE SPALTE TRÄGT EINE ZAHL (Falle 14): ab `VIRTUELL_AB_ZEILEN` scrollt
 * die Tabelle virtuell, und ohne numerische Breiten fiele sie auf ein Pixel
 * zusammen. „Ist" ist die breiteste: drei 44px-Bedienelemente (Falle 4).
 */

import { useCallback, useMemo, useState } from "react";
import { Flex, type TableProps } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import {
  Datentabelle,
  nachText,
  Schmalkarten,
  TabellenVollhoehe,
  trifftWert,
  werteAlsFilter,
  type FilterZustand,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { sollText } from "../../../../../_lib/domain/sollBereich";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { ZaehlZustand } from "../../../../../_lib/verwaltungscheck";
import { Suchfeld } from "../../../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../../../_ui/Trefferanzeige";
import s from "../../../../../_ui/verwaltung.module.css";
import { Schmalfilter } from "../../../inventur/Schmalfilter";
import { BestandKarte } from "./BestandKarte";
import { IstZelle, StimmtZelle, VerfallZelle, type BestandZeile } from "./BestandZellen";
import type { ReiterProps } from "./reiter";
import k from "./zaehlen.module.css";

/*
 * ⚠️ DREI SPALTEN, NICHT SECHS — gemessen bei 768px mit offener Seitenleiste:
 * dort bleiben der Tabelle 472px (834px: 538px). Sechs Spalten (Fach, Artikel,
 * Soll, Stimmt, Ist, Verfall) summierten sich auf 932px, und Ist und Verfall —
 * die Bedienung — lagen rechts außerhalb des Bildes. Deshalb stehen Fach und
 * Soll beim Artikel, der Verfall unter dem Stepper; zusammen 464px.
 */
const BREITE = {
  // „Fach · Artikel" mit Kicker, Sortierer und Fach-Filter im Kopf.
  artikel: 156,
  // „Stimmt" mit Haken bei schmalem Polster, 44px hoch (Falle 4).
  stimmt: 112,
  // Drei Bedienelemente (44 + Feld + 44) über die Zellenbreite, darunter das Monatsfeld.
  ist: 196,
} as const;

/** Die Fachbezeichnung zur Anzeige und als Filterwert — dieselbe wie in den Sperrgründen. */
function fachText(fachLabel: string | null): string {
  return fachLabel === null ? "ohne Fach" : `Fach ${fachLabel}`;
}

function bestandZeilen(daten: VerwaltungscheckDaten): BestandZeile[] {
  const faecherJeArtikel = new Map<string, number>();
  for (const p of daten.positionen) faecherJeArtikel.set(p.artikelId, (faecherJeArtikel.get(p.artikelId) ?? 0) + 1);
  return daten.positionen.map((p) => {
    const fach = fachText(p.fachLabel);
    const faecher = faecherJeArtikel.get(p.artikelId) ?? 1;
    // Spec 6.3: der Buchstand gilt je ARTIKEL, nicht je Fach — mehrere Fächer sagen es dazu.
    const menge = `im Lagerbuch: ${daten.buchstand[p.artikelId] ?? 0} ${p.einheit}`;
    return {
      ...p,
      fach,
      benannt: `${p.artikelName}, ${fach}`,
      buchstand: faecher > 1 ? `${menge}, in ${faecher} Fächern zusammen` : menge,
      verfallVorher: daten.verfallFach[p.id] ?? daten.verfallArtikel[p.artikelId] ?? null,
    };
  });
}

/** Was nach der Eingabe gilt: der eingegebene Wert (auch `null`), sonst der vorherige. */
function verfallNachher(zeile: BestandZeile, verfall: ZaehlZustand["verfall"]): string | null {
  return Object.hasOwn(verfall, zeile.id) ? verfall[zeile.id] ?? null : zeile.verfallVorher;
}

function sucheTrifft(zeile: BestandZeile, begriff: string): boolean {
  const b = begriff.trim().toLocaleLowerCase("de");
  return b === "" || zeile.artikelName.toLocaleLowerCase("de").includes(b) || zeile.fach.toLocaleLowerCase("de").includes(b);
}

export function BestandReiter({ daten, zustand, aendere, gesperrt, rand }: ReiterProps & {
  /** Luft unter der Tabelle für die klebende Abschlussleiste (`TabellenVollhoehe rand`, Falle 16). */
  rand: number;
}) {
  const { ist, verfall } = zustand;
  const zeilen = useMemo(() => bestandZeilen(daten), [daten]);
  const [suche, setSuche] = useState("");
  /**
   * „Offen" IST EIN SCHNAPPSCHUSS, kein laufender Filter (wie in der Inventur,
   * `offenStand` in `InventurForm.tsx`): ein laufender verlöre die Zeile unter
   * dem Finger, sobald „Stimmt" sie zählt. Gemerkt werden die beim Einschalten
   * gezählten Positionen; `null` heißt „Alle".
   */
  const [offenStand, setOffenStand] = useState<ReadonlySet<string> | null>(null);
  /** Gemerkt wird der Zustand der Spaltenköpfe, nie die Liste daraus (Falle 15). */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});

  const fachFilter = useMemo(() => werteAlsFilter(zeilen, (z) => z.fach), [zeilen]);
  const faecher = useMemo(() => fachFilter.map((f) => String(f.value)), [fachFilter]);

  // Suche und „Offen" VOR der Tabelle, das Fach IN ihr (antds `onFilter`, gesteuert).
  const vorgefiltert = useMemo(
    () => zeilen.filter((z) => sucheTrifft(z, suche) && (offenStand === null || !offenStand.has(z.id))),
    [zeilen, suche, offenStand],
  );
  const sichtbar = useMemo(() => {
    const gewaehlt = (spaltenFilter.fach ?? []).map(String);
    return gewaehlt.length === 0 ? vorgefiltert : vorgefiltert.filter((z) => gewaehlt.includes(z.fach));
  }, [vorgefiltert, spaltenFilter]);

  /*
   * ⚠️ DIE SPALTEN HÄNGEN AN `ist` UND `verfall`, NICHT AM GANZEN ZÄHLSTAND:
   * das Tippen im Kommentar der Leiste (auch Zählstand) ließe sonst jede Zeile
   * neu rechnen. `Datentabelle` hängt mehrere Rechnungen an die Identität von
   * `columns` (Begründung in `InventurForm.tsx` an `spalten`).
   */
  const spalten = useMemo<TableProps<BestandZeile>["columns"]>(() => [
    {
      // Der Fach-Filter bleibt im Spaltenkopf (Spec 6.3) — der Schlüssel heißt „fach" wie der des `Schmalfilter`.
      title: "Fach · Artikel",
      key: "fach",
      dataIndex: "artikelName",
      width: BREITE.artikel,
      sorter: nachText<BestandZeile>((z) => `${z.fach} ${z.artikelName}`),
      filters: fachFilter,
      filteredValue: spaltenFilter.fach ?? null,
      onFilter: trifftWert<BestandZeile>((z) => z.fach),
      render: (wert: string, zeile) => (
        <Flex vertical gap={SPACE.xs} align="flex-start">
          <span className={s.fach}>{zeile.fach}</span>
          <span style={{ fontWeight: 600 }}>{wert}</span>
          <span className={s.footnote} data-rolle="soll">
            Soll {sollText(zeile.soll, zeile.sollMax)} {zeile.einheit}
          </span>
          <span className={s.footnote} data-rolle="buchstand">{zeile.buchstand}</span>
        </Flex>
      ),
    },
    // ⚠️ KEIN SORTIERER AUF „Stimmt" UND „Ist": beide lesen den Zählstand und
    // sortierten sich beim Zählen unter dem Finger um.
    {
      title: "Stimmt",
      key: "stimmt",
      dataIndex: "id",
      width: BREITE.stimmt,
      render: (_wert: string, zeile) => (
        <StimmtZelle zeile={zeile} ist={ist[zeile.id]} aendere={aendere} gesperrt={gesperrt} />
      ),
    },
    {
      // Spec 6.3: gemeint ist der Verfall NACH dem Ausgleich — der Kopf sagt es.
      title: "Ist · Verfall danach",
      key: "ist",
      dataIndex: "id",
      width: BREITE.ist,
      render: (_wert: string, zeile) => (
        <Flex vertical gap={SPACE.sm}>
          <IstZelle zeile={zeile} ist={ist[zeile.id]} aendere={aendere} gesperrt={gesperrt} className={k.stepper} />
          <VerfallZelle
            zeile={zeile}
            wert={verfallNachher(zeile, verfall)}
            gezaehlt={ist[zeile.id] !== undefined}
            aendere={aendere}
            gesperrt={gesperrt}
            schwellen={daten.schwellen}
          />
        </Flex>
      ),
    },
  ], [fachFilter, spaltenFilter, ist, verfall, aendere, gesperrt, daten.schwellen]);

  const karte = useCallback((zeile: BestandZeile) => (
    <BestandKarte
      zeile={zeile}
      ist={ist[zeile.id]}
      verfall={verfallNachher(zeile, verfall)}
      aendere={aendere}
      gesperrt={gesperrt}
      schwellen={daten.schwellen}
    />
  ), [ist, verfall, aendere, gesperrt, daten.schwellen]);

  const leertext = zeilen.length === 0
    ? "Noch keine Soll-Position. Lege sie auf dem Blatt der Einheit an."
    : offenStand !== null && suche.trim() === "" && sichtbar.length === 0
      ? "Alles gezählt."
      : "Keine Position passt zu Suche und Filter.";

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
          <Suchfeld
            wert={suche}
            onWert={(begriff) => {
              setSuche(begriff);
              // Eine neue Suche ist eine neue Frage — „Offen" gilt dann für jetzt.
              setOffenStand((vorher) => (vorher === null ? null : new Set(Object.keys(ist))));
            }}
            platzhalter="Artikel oder Fach suchen…"
            breite={360}
          />
        </div>
        <Filterchips<"alle" | "offen">
          aria-label="Positionen"
          wert={offenStand === null ? "alle" : "offen"}
          onChange={(wert) => setOffenStand(wert === "offen" ? new Set(Object.keys(ist)) : null)}
          optionen={[{ wert: "alle", label: "Alle" }, { wert: "offen", label: "Offen" }]}
        />
        <Trefferanzeige gezeigt={sichtbar.length} gesamt={zeilen.length} />
      </Flex>
      <Schmalfilter kategorien={[]} faecher={faecher} zustand={spaltenFilter} onZustand={setSpaltenFilter} />
      <Schmalkarten
        zeilen={sichtbar}
        schluessel={(zeile) => zeile.id}
        aria-label="Bestand"
        leertext={leertext}
        kartenHoehe={230}
        karte={karte}
      >
        <TabellenVollhoehe rand={rand}>
          {(koerperHoehe) => (
            <Datentabelle<BestandZeile>
              rowKey="id"
              virtuell={koerperHoehe}
              aria-label="Bestand"
              dataSource={vorgefiltert}
              onChange={(_seite, zustandSpalten) => setSpaltenFilter(zustandSpalten)}
              locale={{ emptyText: leertext }}
              columns={spalten}
            />
          )}
        </TabellenVollhoehe>
      </Schmalkarten>
    </>
  );
}
