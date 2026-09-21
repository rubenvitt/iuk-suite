"use client";

import { useMemo } from "react";
import { Button } from "antd";
import { Kartentabelle, nachText, nachZahl, trifftWert, werteAlsFilter } from "@/core/tabelle";

import { avWiederholenAction } from "../(verwaltung)/actions";

/**
 * DIE DATEILISTE DER SHARE-DETAILSEITE — eine Client-Insel, und das ist seit der
 * Umstellung auf `@/core/tabelle` keine Wahl mehr:
 *
 * Sortierung und Spaltenfilter sind FUNKTIONEN in `columns` (`sorter`,
 * `onFilter`), und eine Funktion überquert die RSC-Grenze nicht (`CLAUDE.md`,
 * Falle 9). Die Spalten standen bis hierher in `shares/[id]/page.tsx` — einer
 * Server Component, die es bleibt: sie lädt, rechnet und reicht FERTIGE,
 * serialisierbare Zeilen herein. Vorbild ist
 * `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx`.
 *
 * DIE SERVER ACTION WIRD HIER DIREKT IMPORTIERT, nicht als Prop durchgereicht
 * (`CLAUDE.md`: Server Actions dürfen als einzige über die Grenze — aber
 * importiert). Ein Import aus einem `"use server"`-Modul reicht keinen Wert
 * herein, sondern eine Aktionsreferenz; `_lib/av.ts` mit seinem `node:net` kommt
 * darüber nicht ins Client-Bundle. Dieselbe Bauform wie in
 * `_ui/PosteingangTabelle.tsx`.
 */

/**
 * DIE ZUSTANDSSYMBOLE ALS EIGENES INLINE-SVG. Der Grund lag ursprünglich in der
 * RSC-Umgebung (`@ant-design/icons` ruft `createContext` auf Modulebene, in RSC
 * HTTP 500 — Falle 7); in dieser Insel wären antd-Icons erlaubt. Sie bleiben
 * trotzdem SVG: die Symbole sind hier dieselben wie vor der Umstellung, und ein
 * Wechsel des Symbolsatzes wäre eine Bildänderung ohne Auftrag.
 *
 * Jedes Symbol ist ein Kreis plus eine Innenform, alle in derselben
 * 16er-Zeichenfläche und in `currentColor`, damit sie mit dem Text der Zelle
 * hell/dunkel mitgehen (kein `--ant-*` in eigenem Markup — antd deklariert
 * seine Variablen auf seiner eigenen Scope-Klasse, `docs/design/README.md`,
 * Falle 2).
 *
 * DAS SYMBOL IST DIE VERZICHTBARE SCHICHT. Bedeutung nie allein über Farbe oder
 * Form (`docs/design/README.md:133-137`) — der TEXT daneben trägt die Aussage,
 * deshalb steht das SVG auf `aria-hidden`.
 */
const SYMBOL_INNEN = {
  /** Haken. */
  haken: "M5 8.2 l2.2 2.2 L11.2 5.8",
  /** Uhrzeiger. */
  uhr: "M8 4.8 V8.2 L10.4 9.6",
  /** Querbalken — „gesperrt". */
  balken: "M4.8 8 H11.2",
  /** Ausrufezeichen: Strich plus Punkt (zwei Teilpfade). */
  ruf: "M8 4.6 V8.8 M8 10.8 v0.01",
  /** Schrägstrich — „nicht da". */
  strich: "M5.2 10.8 L10.8 5.2",
  /** Drei Punkte — „noch in Arbeit". */
  punkte: "M5.4 8 h0.01 M8 8 h0.01 M10.6 8 h0.01",
} as const;

/**
 * NUR DER TYP wandert in die Server Component, nie der Wert: ein WERT aus einem
 * `"use client"`-Modul kommt dort als Client-Referenz an, HTTP 500 für die ganze
 * Seite (`CLAUDE.md`, Falle 6). Ein Typ ist nach dem Übersetzen verschwunden.
 */
export type SymbolName = keyof typeof SYMBOL_INNEN;

function Zustandssymbol({ name }: { name: SymbolName }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.6" />
      <path d={SYMBOL_INNEN[name]} />
    </svg>
  );
}

export type ShareDateiZeile = {
  id: string;
  dateiname: string;
  /** `—`, wo es nichts zu zeigen gibt: ohne Bytes und ohne Blob wäre eine Zahl
   *  eine Behauptung über Bytes, die niemand ausliefern kann. */
  groesseText: string;
  /**
   * ⚠️ DIESELBE GRÖSSE ALS ZAHL — allein für die Sortierung, angezeigt wird
   * `groesseText`. „2,4 MiB" sortierte als Zeichenkette neben „11 KiB" falsch,
   * und zwar still. `null`, wo auch der Text ein „—" ist; `nachZahl` stellt
   * fehlende Werte aufsteigend ans Ende.
   */
  groesseBytes: number | null;
  zustandText: string;
  zustandSymbol: SymbolName;
  /**
   * Der Knopf „Prüfung wiederholen" steht an jeder Zeile in `error` und an
   * keiner anderen — SERVERSEITIG entschieden, damit Oberfläche und Action
   * dasselbe Prädikat anwenden (§6.2, §10.2).
   */
  pruefungWiederholbar: boolean;
};

/**
 * DIE WIEDERHOLUNG DER AV-PRÜFUNG (§6.2, §10.2; Plan T45) — ein natives
 * `<form>` mit der Server Action, kein `onClick`. Es funktioniert damit
 * zusätzlich **ohne JavaScript**.
 *
 * KEIN `size="small"` (korrigiert Aufgabe 12, nach Aufgabe 8): die alte Ausnahme
 * „size in einer Tabellenzeile" galt der 56px-`controlHeight` — eine
 * 44px-Zeilenaktion (`ARBEITSDICHTE`) sprengt keine Zeile mehr, während
 * `size="small"` auf 24px fällt und die Mindesttapfläche unterbietet
 * (`docs/design/README.md`, Falle 4).
 */
function AvWiederholen({ fileId }: { fileId: string }) {
  return (
    <form action={avWiederholenAction}>
      {/* `share`, nicht `share_files`: die Action spricht die Sprache von
          `BlobZiel` (`_lib/storage.ts`), damit niemand unterwegs übersetzt. */}
      <input type="hidden" name="art" value="share" />
      <input type="hidden" name="id" value={fileId} />
      {/* `htmlType="submit"` ausgeschrieben: antds Vorgabe ist `"button"`, und
          ohne die Angabe schickte der Knopf still nichts ab. */}
      <Button htmlType="submit" data-testid={`files-detail-av-wiederholen-${fileId}`}>
        Prüfung wiederholen
      </Button>
    </form>
  );
}

/**
 * SPALTENBREITEN IN PIXELN — die Einheit steht im Namen (§9.1). Die Summe wird
 * gerechnet, nicht getippt: tragen die Spalten `width`, ist sie die einzige
 * ehrliche `scroll.x`-Angabe (`docs/design/README.md:176-182`).
 *
 * `SPALTE_AKTION_PX` 200 → 240 (Aufgabe 12): die Zeilenaktion `AvWiederholen`
 * verlor `size="small"` (siehe dort) und ist damit etwas breiter — `default`
 * trägt ein größeres `paddingInline` als `small`. Kein Wert ist hier
 * GEMESSEN; die Spalte ist deshalb nicht knapp berechnet, sondern bewusst
 * großzügig verbreitert. `table-layout` bleibt `auto` (keine Spalte trägt
 * `fixed`/`ellipsis`, `scroll.y` ist nicht gesetzt), die Verbreiterung nimmt
 * also keiner Nachbarspalte etwas weg — sie vergrößert nur die Summe.
 */
const SPALTE_NAME_PX = 340;
const SPALTE_GROESSE_PX = 160;
const SPALTE_ZUSTAND_PX = 280;
const SPALTE_AKTION_PX = 240;
const DATEI_TABELLE_BREITE_PX =
  SPALTE_NAME_PX + SPALTE_GROESSE_PX + SPALTE_ZUSTAND_PX + SPALTE_AKTION_PX;

export function ShareDateienTabelle({ zeilen }: { zeilen: ShareDateiZeile[] }) {
  /**
   * Die Kicker-Rolle der Spaltenköpfe setzt `Datentabelle` selbst; `title` ist
   * hier eine gewöhnliche Zeichenkette (`docs/design/README.md`).
   *
   * Der Zustandsfilter entsteht AUS DEN ZEILEN: die Werte sind die sechs Sätze
   * aus `AV_TEXT` plus „nicht vollständig übertragen" — wenige, wiederkehrende
   * Werte, und eine gepflegte Liste böte Einträge an, die keine Zeile trifft.
   */
  const spalten = useMemo(
    () => [
      {
        key: "name",
        title: "Datei",
        dataIndex: "dateiname",
        width: SPALTE_NAME_PX,
        sorter: nachText<ShareDateiZeile>((zeile) => zeile.dateiname),
      },
      {
        key: "groesse",
        title: "Größe",
        dataIndex: "groesseText",
        width: SPALTE_GROESSE_PX,
        sorter: nachZahl<ShareDateiZeile>((zeile) => zeile.groesseBytes),
      },
      {
        key: "zustand",
        title: "Zustand",
        width: SPALTE_ZUSTAND_PX,
        sorter: nachText<ShareDateiZeile>((zeile) => zeile.zustandText),
        filters: werteAlsFilter(zeilen, (zeile) => zeile.zustandText),
        onFilter: trifftWert<ShareDateiZeile>((zeile) => zeile.zustandText),
        render: (_: unknown, zeile: ShareDateiZeile) => (
          <span>
            <Zustandssymbol name={zeile.zustandSymbol} /> {zeile.zustandText}
          </span>
        ),
      },
      /* Die Aktion steht in einer EIGENEN Spalte, nicht in der Zustandszelle: der
         Zustand ist ein Wert, der Knopf eine Handlung — dieselbe Trennung wie in
         `_ui/PosteingangTabelle.tsx`. Die Zelle bleibt leer, wo es nichts zu tun
         gibt; ein „—" behauptete einen Wert, den es hier nicht gibt. Und kein
         `sorter`: eine Spalte, in der fast jede Zelle leer ist, ordnet nichts. */
      {
        key: "aktion",
        title: "Aktion",
        width: SPALTE_AKTION_PX,
        render: (_: unknown, zeile: ShareDateiZeile) =>
          zeile.pruefungWiederholbar ? <AvWiederholen fileId={zeile.id} /> : null,
      },
    ],
    [zeilen],
  );

  return (
    <Kartentabelle<ShareDateiZeile>
      rowKey="id"
      aria-label="Dateien dieser Freigabe"
      dataSource={zeilen}
      leer={{ nichts: "Keine Datei in dieser Freigabe.", gefiltert: "Keine Datei passt zum Filter." }}
      columns={spalten}
      /* Die Summe der Spaltenbreiten: eine Tabelle scrollt auf schmalen
         Geräten, sie bricht nicht um (`docs/design/README.md:174`). Sie bleibt
         gesetzt — die Vorgabe `{ x: "max-content" }` der `Datentabelle` gilt
         Tabellen OHNE Spaltenbreiten, diese hier trägt welche. */
      scroll={{ x: DATEI_TABELLE_BREITE_PX }}
    />
  );
}
