"use client";

/**
 * DIE TABELLEN-SEMANTIK EINER VIRTUALISIERTEN TABELLE — nachgerüstet.
 *
 * ⚠️ WAS VERLOREN GING (DRK-336, gemessen an `@rc-component/table@1.11.1`):
 * schaltet `core/tabelle` die Virtualisierung ein, rendert rc-table Zeilen und
 * Zellen als `div`s statt als `tr`/`td` (`VirtualTable/BodyLine.js:40-41`:
 * `getComponent(['body','row'], 'div')`), und diese `div`s tragen KEINE Rolle.
 * Für Hilfstechnik ist die Tabelle damit keine Tabelle mehr, sondern ein Haufen
 * Kästen: `getByRole("row")` fand auf der Artikelseite genau EINS — die
 * Kopfzeile, die als echte `<table>` daneben stehen bleibt.
 *
 * ⚠️ WARUM `table`/`row`/`cell` UND NICHT `grid`/`gridcell`: `grid` ist eine
 * Zusage über die BEDIENUNG — eine Rasternavigation mit Pfeiltasten und einem
 * einzigen Tabstopp (WAI-ARIA Authoring Practices). Die hat diese Tabelle
 * nicht, weder virtuell noch gewöhnlich. `table`/`row`/`cell` ist genau das,
 * was dieselbe Tabelle unterhalb der Schwelle als `<table>`/`<tr>`/`<td>`
 * ohnehin ergibt. Das Ziel ist GLEICHSTAND mit der nicht virtualisierten
 * Tabelle, nicht ein Versprechen darüber hinaus.
 *
 * ⚠️ DIESE DATEI TRÄGT `"use client"`, und das ist Pflicht, nicht Geschmack:
 * sie ruft `createContext` auf MODULEBENE. Ohne die Direktive würde ein Import
 * aus einer Server Component das Modul in der RSC-Ebene auswerten, wo es
 * `createContext` nicht gibt — `TypeError` schon beim Import, HTTP 500 für die
 * ganze Seite (Falle 7). Umgekehrt gilt Falle 6: aus einer `"use client"`-Datei
 * kommt ein WERT in einer Server Component nicht an. Deshalb steht hier nichts
 * in `index.ts` — die Rollen sind Innenausstattung der `Datentabelle`, kein
 * Werkzeug für Aufrufer.
 */

import {
  createContext,
  createElement,
  useContext,
  type ComponentPropsWithRef,
  type ComponentType,
} from "react";
import type { TableProps } from "antd";

type KastenProps = ComponentPropsWithRef<"div">;

export type Tabellenrollen = {
  /** Der Name, unter dem die Tabelle für Hilfstechnik auftritt. */
  beschriftung?: string;
  /**
   * Wie viele Zeilen die Tabelle INSGESAMT hat — nicht, wie viele gerade im DOM
   * stehen. Genau dafür gibt es `aria-rowcount`: eine virtualisierte Tabelle
   * hält nur das Sichtfenster im Baum, und ohne diese Zahl hört eine
   * Vorleseanwendung „20 Zeilen", wo 800 stehen.
   */
  zeilen: number;
};

const RollenKontext = createContext<Tabellenrollen>({ zeilen: 0 });

/**
 * ⚠️ DIE WERTE KOMMEN ÜBER EINEN KONTEXT, NICHT ÜBER GESCHLOSSENE PROPS, und
 * der Grund ist teuer erkauftes Wissen über React: `components.body.*` ist ein
 * KOMPONENTENTYP. Baute man ihn je Render neu, um `aria-rowcount` einzunähen,
 * sähe React bei jeder Änderung der Zeilenzahl einen ANDEREN Typ und würde den
 * ganzen Tabellenkörper abbauen und neu aufbauen — Scrollstand weg, Auswahl
 * neu gezeichnet, und das bei jedem Tastendruck in der Suche darüber. Ein
 * Kontext hält den Typ konstant und lässt trotzdem den Wert wandern.
 */
export const RollenAnbieter = RollenKontext.Provider;

/**
 * Der Scrollcontainer des Körpers (`…-tbody-virtual-holder`) trägt die Rolle
 * der Tabelle. Er ist der oberste Knoten, den `components` überhaupt erreicht;
 * die Kopfzeile steht als eigene `<table>` daneben und bleibt außen vor.
 *
 * ⚠️ DASS DIE KOPFZEILE AUSSEN VOR BLEIBT, IST KEIN NEUER VERLUST. Sobald eine
 * Tabelle `scroll.y` setzt — und `virtuell` setzt es immer —, teilt rc-table
 * sie in ZWEI `<table>`-Elemente auf (`Table.js:485` Kopf, `:507` Körper): der
 * Kopf trägt nur `thead`, der Körper nur `tbody`. Die Zuordnung Spaltenkopf →
 * Zelle ist damit schon ohne Virtualisierung dahin — bewusst hingenommen (DRK-362,
 * keine Screenreader-Zusage). Nachgerüstet ist nur, was Virtualisierung kostete.
 */
function Koerper(props: KastenProps) {
  const { beschriftung, zeilen } = useContext(RollenKontext);
  return <div {...props} role="table" aria-label={beschriftung} aria-rowcount={zeilen} />;
}

function Zeile(props: KastenProps) {
  return <div {...props} role="row" />;
}

function Zelle(props: KastenProps) {
  return <div {...props} role="cell" />;
}

if (process.env.NODE_ENV !== "production") {
  Koerper.displayName = "TabellenrolleKoerper";
  Zeile.displayName = "TabellenrolleZeile";
  Zelle.displayName = "TabellenrolleZelle";
}

/**
 * ⚠️ EINE KONSTANTE, KEIN OBJEKTLITERAL AN DER AUFRUFSTELLE. Dieselbe
 * Begründung wie beim Kontext: rc-table liest die Komponenten über
 * `getComponent`, und ein frisch gebautes Objekt mit frisch gebauten
 * Komponenten wäre je Render ein neuer Typ.
 */
const KOERPERROLLEN = { wrapper: Koerper, row: Zeile, cell: Zelle };

/** Was antd als Bauteil zulässt: eine Komponente ODER ein Elementname. */
type Eigenbauteil = ComponentType<Record<string, unknown>> | string;

/**
 * Das Bauteil des Aufrufers UMHÜLLEN statt es zu ersetzen.
 *
 * ⚠️ DER UNTERSCHIED IST NICHT THEORETISCH. Wer `components.body.cell` setzt,
 * tut das für sein eigenes Rendern, seine Ereignisse, sein `ref`. Überschriebe
 * die Rollen-Nachrüstung das, fiele all das aus — und zwar erst ab 150 Zeilen,
 * also lange nach dem Zeitpunkt, an dem jemand es geschrieben und geprüft hat.
 *
 * ⚠️ DASS DIE DURCHREICHUNG TRÄGT, IST KEIN GUTER GLAUBE: rc-table gibt jedem
 * dieser Bauteile `className`, `style` und `ref` und verlässt sich darauf, dass
 * sie ankommen — ein Bauteil, das seine Props verschluckt, zerlegt die Tabelle
 * ohnehin. Die Rolle reist auf demselben Weg mit.
 */
/**
 * ⚠️ DIE HÜLLE WIRD GEMERKT, UND ZWAR AM BAUTEIL SELBST — nicht am
 * `components`-Objekt, in dem es steckt.
 *
 * Der Unterschied ist der Normalfall: `components={{ body: { cell: Zelle } }}`
 * als Literal im JSX ist bei JEDEM Render ein anderes Objekt. Ein `useMemo` auf
 * dieses Objekt liefe also jedes Mal neu, baute eine neue Hülle — und damit
 * einen neuen KOMPONENTENTYP. React baut daraufhin ab und neu auf: Scrollstand
 * des Halters weg, Fokus und Eingabestand einer bearbeitbaren Zelle weg, bei
 * jedem unbeteiligten Render der Elternkomponente. Dieselbe Falle, die die
 * Modulkonstanten für den Normalfall schon abwenden — hier nur eine Ebene
 * tiefer.
 *
 * Eine `WeakMap` je Rolle für Komponenten (kein Festhalten, was der Aufrufer
 * fallen lässt) und eine gewöhnliche `Map` für Elementnamen, von denen es eine
 * Handvoll gibt.
 */
const HUELLEN = new Map<string, WeakMap<object, ComponentType<KastenProps>>>();
const HUELLEN_TEXT = new Map<string, ComponentType<KastenProps>>();

function gemerkt(
  rolle: string,
  eigenes: Eigenbauteil,
  bauen: () => ComponentType<KastenProps>,
): ComponentType<KastenProps> {
  if (typeof eigenes === "string") {
    const schluessel = `${rolle}:${eigenes}`;
    const vorhanden = HUELLEN_TEXT.get(schluessel);
    if (vorhanden) return vorhanden;
    const gebaut = bauen();
    HUELLEN_TEXT.set(schluessel, gebaut);
    return gebaut;
  }
  let proRolle = HUELLEN.get(rolle);
  if (!proRolle) {
    proRolle = new WeakMap();
    HUELLEN.set(rolle, proRolle);
  }
  const vorhanden = proRolle.get(eigenes);
  if (vorhanden) return vorhanden;
  const gebaut = bauen();
  proRolle.set(eigenes, gebaut);
  return gebaut;
}

function umhuellt(rolle: string, eigenes: Eigenbauteil): ComponentType<KastenProps> {
  return gemerkt(rolle, eigenes, () => {
    const Gehuellt = (props: KastenProps) =>
      createElement(eigenes, { ...props, role: rolle } as Record<string, unknown>);
    if (process.env.NODE_ENV !== "production") Gehuellt.displayName = `Tabellenrolle(${rolle})`;
    return Gehuellt;
  });
}

function koerperUm(eigenes: Eigenbauteil): ComponentType<KastenProps> {
  return gemerkt("table", eigenes, () => {
    const Gehuellt = (props: KastenProps) => {
      const { beschriftung, zeilen } = useContext(RollenKontext);
      return createElement(eigenes, {
        ...props,
        role: "table",
        "aria-label": beschriftung,
        "aria-rowcount": zeilen,
      } as Record<string, unknown>);
    };
    if (process.env.NODE_ENV !== "production") Gehuellt.displayName = "Tabellenrolle(table)";
    return Gehuellt;
  });
}

/** Was `mitRollen` entschieden hat — beides wird gebraucht, nicht nur das erste. */
export type Rolleneinbau<T> = {
  bauteile: TableProps<T>["components"];
  /**
   * Ob die Rollen tatsächlich eingehängt sind.
   *
   * ⚠️ DIESES FELD IST KEIN BEIWERK. Am Einbau hängt, WO die Beschriftung
   * stehen darf: nimmt `Datentabelle` sie antd weg, ohne dass ein Element sie
   * auffängt, trägt die Tabelle am Ende GAR KEINEN Namen — schlechter als der
   * Zustand, den dieser Umbau verbessern sollte.
   */
  gesetzt: boolean;
};

/**
 * Die Rollen in die `components` des Aufrufers einhängen — aber NUR, solange
 * tatsächlich virtualisiert wird.
 *
 * ⚠️ DAS „NUR" IST DER GANZE PUNKT. Dieselben drei Steckplätze bedeuten in der
 * gewöhnlichen Tabelle etwas anderes: dort ist die Vorgabe `tbody`/`tr`/`td`
 * (`Body/index.js`, `Body/BodyRow.js`), und wer sie durch `div`s ersetzt,
 * ZERSTÖRT die Tabelle, die er retten wollte — samt Spaltenbreiten, denn ein
 * `colgroup` wirkt nur auf eine echte `<table>`.
 */
export function mitRollen<T>(
  eigene: TableProps<T>["components"],
  virtuellAktiv: boolean,
): Rolleneinbau<T> {
  if (!virtuellAktiv) return { bauteile: eigene, gesetzt: false };
  // Ein `body` als FUNKTION ist rc-tables eigener Ausweg („render props"); dann
  // gibt es die drei Steckplätze gar nicht. Wir halten uns heraus UND sagen es,
  // damit die Beschriftung dort bleibt, wo antd sie hinhängt — sonst trüge die
  // Tabelle am Ende GAR KEINEN Namen.
  //
  // ⚠️ GEMESSEN: virtuell läuft diese Funktion ohnehin nicht. rc-table ersetzt
  // `components.body` im virtuellen Zweig durch sein eigenes Raster
  // (`VirtualTable/index.js`: `body: data?.length ? renderBody : undefined`),
  // und `getComponent(['body','wrapper'])` findet auf einer Funktion keinen
  // Steckplatz. Wir könnten die Rollen hier also gefahrlos einhängen — und tun
  // es trotzdem nicht: das wäre eine Wette auf ein Internum, das sich ändern
  // darf, für einen Fall, den heute niemand baut.
  if (typeof eigene?.body === "function") return { bauteile: eigene, gesetzt: false };

  const koerper = eigene?.body;
  const unveraendert = !koerper?.wrapper && !koerper?.row && !koerper?.cell;
  // Der Normalfall bekommt die Konstanten — gleiche Typen, kein Neuaufbau.
  const rollen = unveraendert ? KOERPERROLLEN : {
    wrapper: koerper.wrapper ? koerperUm(koerper.wrapper as Eigenbauteil) : Koerper,
    row: koerper.row ? umhuellt("row", koerper.row as Eigenbauteil) : Zeile,
    cell: koerper.cell ? umhuellt("cell", koerper.cell as Eigenbauteil) : Zelle,
  };
  return { bauteile: { ...eigene, body: { ...koerper, ...rollen } }, gesetzt: true };
}

/**
 * `aria-rowindex` an jede Zeile — die zweite Hälfte von `aria-rowcount`.
 *
 * ⚠️ OHNE DIESE ZAHL IST DIE ERSTE EINE LÜGE: `aria-rowcount={800}` an einer
 * Tabelle, in der zwanzig Zeilen stehen, lässt eine Vorleseanwendung die
 * zwanzig als die ersten zwanzig ansagen — egal, wohin gescrollt wurde. Erst
 * `aria-rowindex` sagt, WELCHE zwanzig es sind. Der Index, den rc-table
 * durchreicht, ist der ABSOLUTE in der Liste, nicht der im Sichtfenster
 * (`@rc-component/virtual-list`, `hooks/useChildren.js:16`:
 * `eleIndex = startIndex + index`) — genau der, der hier gebraucht wird.
 *
 * ⚠️ 1-BASIERT UND OHNE KOPFZEILE. `aria-rowindex` zählt ab 1; die Kopfzeile
 * steht in einer anderen `<table>` (s. `Koerper`) und zählt hier deshalb nicht
 * mit. Damit passen `aria-rowindex` und `aria-rowcount` zueinander — beide
 * beschreiben genau diese Tabelle.
 */
export function mitZeilenindex<T>(
  eigenes: TableProps<T>["onRow"],
  rollenGesetzt: boolean,
): TableProps<T>["onRow"] {
  // ⚠️ AN `gesetzt`, NICHT AN DER VIRTUALISIERUNG. Ohne `role="row"` an der
  // Zeile ist `aria-rowindex` nichts weiter als ein Attribut, das niemand
  // liest — und eine Zusicherung darauf wäre eine, die nichts bezeugt.
  if (!rollenGesetzt) return eigenes;
  return (datensatz, index) => ({
    ...eigenes?.(datensatz, index),
    "aria-rowindex": (index ?? 0) + 1,
  });
}
