/**
 * Die Scrollmaße einer Tabelle — als REINE Funktion, absichtlich getrennt von
 * der Komponente.
 *
 * WARUM SIE NICHT IN `Datentabelle.tsx` STEHT: sie ist der Teil, der still
 * kaputtgehen kann, und in einer Client-Komponente wäre sie nur über jsdom
 * erreichbar — wo `getBoundingClientRect()` überall Nullen liefert und keine
 * Layoutbox gerechnet wird (Falle 13). Hier ist sie eine Funktion von Spalten
 * auf Zahlen und damit vollständig prüfbar, ohne irgendetwas zu rendern.
 *
 * KEIN "use client" (Falle 6).
 */

/** Was von einer Spalte für die Maßrechnung zählt. */
export type MassSpalte = {
  width?: string | number;
  children?: readonly MassSpalte[];
};

export type Scrollmass = {
  x: number | string;
  y?: number;
};

export type MasseErgebnis = {
  /**
   * ⚠️ `undefined` IST EIN EIGENER, GEWOLLTER FALL und nicht „nicht gesetzt".
   * Eine Tabelle, die unter 768px ohnehin ausgeblendet wird (Vorbild
   * `feedback/_ui/Verlauf.tsx`), braucht kein `scroll` — und die Vorgabe
   * `max-content` schadet ihr messbar: rc-table gibt der Tabelle dann
   * `width: max-content` plus eigenen Scrollcontainer, und eine Spalte mit
   * `ellipsis` waechst statt abzuschneiden. Ihr Zweck war gerade das
   * Abschneiden.
   */
  scroll: Scrollmass | undefined;
  /**
   * Ob virtuelles Scrollen tatsächlich eingeschaltet wird. Weicht von der
   * Absicht des Aufrufers ab, wenn die Spaltenbreiten fehlen.
   */
  virtuellAktiv: boolean;
  /** Gesetzt, wenn die Absicht nicht erfüllt werden konnte — der Aufrufer meldet es. */
  hinweis?: string;
};

/**
 * Die Summe der Spaltenbreiten — oder `null`, sobald eine Spalte keine
 * numerische `width` trägt.
 *
 * ⚠️ `width: "20%"` ZÄHLT NICHT ALS BREITE. Eine Prozentangabe ist erst nach dem
 * Layout eine Zahl; sie hier zu addieren ergäbe eine erfundene Pixelsumme.
 * Gruppierte Spaltenköpfe zählen über ihre Blätter — nur die tragen eine eigene
 * Breite.
 */
export function breitenSumme(spalten: readonly MassSpalte[] | undefined): number | null {
  if (!spalten || spalten.length === 0) return null;
  let summe = 0;
  for (const spalte of spalten) {
    if (spalte.children && spalte.children.length > 0) {
      const teil = breitenSumme(spalte.children);
      if (teil === null) return null;
      summe += teil;
      continue;
    }
    if (typeof spalte.width !== "number") return null;
    summe += spalte.width;
  }
  return summe;
}

/**
 * Die Vorgabe der Suite für eine Tabelle, die nicht virtualisiert:
 * `"max-content"` ist die einzige ehrliche Angabe, solange die Spalten keine
 * Breite tragen (`docs/design/README.md`).
 */
export const BREITE_NACH_INHALT = "max-content";

/**
 * Die Scrollmasse einer NICHT virtualisierten Tabelle.
 *
 * Drei Faelle, und der dritte ist der, den ein `??` verschluckt haette:
 * eigene Masse werden durchgereicht, `undefined` bekommt die Vorgabe, und
 * `false` heisst ausdruecklich „gar kein `scroll`".
 */
function ohneVirtuell(eigenes: Scrollmass | false | undefined): Scrollmass | undefined {
  if (eigenes === false) return undefined;
  return eigenes ?? { x: BREITE_NACH_INHALT };
}

/**
 * Ab wie vielen Zeilen sich virtuelles Scrollen überhaupt lohnt.
 *
 * ⚠️ DIE SCHWELLE IST KEINE VORSICHT, SIE IST DER PUNKT. Unterhalb davon kostet
 * Virtualisierung mehr, als sie spart: rc-virtual-list misst jede Zeile, hängt
 * einen Scrollcontainer dazwischen und zwingt rc-table auf
 * `table-layout: fixed` — für 30 Zeilen ist das reiner Aufwand.
 *
 * ⚠️ SIE HAT EINE ZWEITE, UNBEQUEME FOLGE, und die gehört ausgeschrieben: eine
 * virtuelle Tabelle rendert **in jsdom überhaupt keine Zeile**. jsdom rechnet
 * keine Layoutboxen, rc-virtual-list kommt damit auf null sichtbare Einträge,
 * und `tr[data-row-key=…]` findet nichts mehr — jeder DOM-Test gegen so eine
 * Tabelle wäre blind, und zwar lautlos. Mit der Schwelle bleiben Tests mit
 * einer Handvoll Zeilen gewöhnlich und prüfen weiter echtes Markup; was
 * virtualisiert, ist allein die große Liste im Browser. Wer die Wirkung der
 * Virtualisierung selbst prüfen will, braucht einen echten Browser
 * (Playwright) — Vitest kann sie strukturell nicht sehen.
 *
 * ⚠️ UND EINE DRITTE FOLGE, DIE AUCH IM BROWSER GILT: eine virtualisierte
 * Tabelle hat KEIN `tbody` und KEINE `tr`. `@rc-component/table` rendert ihre
 * Zeilen und Zellen als `div`s (`VirtualTable/BodyLine.js:40-41`,
 * `getComponent(['body','row'], 'div')`). Für Greifer heißt das unverändert:
 * `[data-row-key]` statt `tbody tr` — das setzt rc-table in beiden
 * Betriebsarten, ein `tbody tr` findet ab der Schwelle gar nichts mehr.
 *
 * ⚠️ DIE ROLLEN SIND NACHGERÜSTET, DIE ELEMENTE NICHT (DRK-336). `rollen.tsx`
 * hängt über `components.body.*` wieder `role="table"`/`"row"`/`"cell"` samt
 * `aria-rowcount`/`aria-rowindex` ein; `getByRole("row")` trägt also wieder.
 * Das gilt NUR über `Datentabelle` — eine nackte antd-`Table` mit `virtual`
 * hat weiterhin keine einzige Rolle im Körper.
 */
export const VIRTUELL_AB_ZEILEN = 150;

/**
 * ⚠️ DER GRUND, WARUM ES DIESE FUNKTION ÜBERHAUPT GIBT.
 *
 * `@rc-component/table` (1.11.1, `VirtualTable/index.js:38-50`) prüft beide
 * Scrollmaße einer virtuellen Tabelle auf `typeof … === "number"` und fällt
 * sonst still zurück: `scroll.x` wird zu **1** (die Tabelle fällt auf ein Pixel
 * zusammen), `scroll.y` zu **500**. Die Warnung steht allein in der
 * Entwicklungskonsole.
 *
 * Kein Tor sieht das: `typecheck` kennt `"max-content"` als gültigen Wert,
 * `build` serialisiert es klaglos, und Vitest kann die Wirkung strukturell
 * nicht sehen, weil jsdom keine Layoutboxen rechnet. Deshalb entscheidet diese
 * Funktion die Frage VOR dem Rendern — und schaltet die Virtualisierung lieber
 * ab, als eine unbrauchbare Tabelle auszuliefern.
 */
export function scrollMasse(
  spalten: readonly MassSpalte[] | undefined,
  virtuell: number | false,
  eigenes?: Scrollmass | false,
  /**
   * Breite der Spalten, die antd SELBST hinzufügt und die deshalb nicht in
   * `columns` stehen — die Auswahlspalte aus `rowSelection` und die
   * Aufklappspalte aus `expandable`. Ohne sie wäre die gerechnete Gesamtbreite
   * um genau diese Spalte zu schmal, und die letzte echte Spalte geriete unter
   * den waagerechten Rand.
   *
   * ⚠️ `null` HEISST „ES GIBT EINE SOLCHE SPALTE, ABER IHRE BREITE IST
   * UNBEKANNT" — und wird behandelt wie eine `columns`-Spalte ohne `width`:
   * Virtualisierung aus, mit Hinweis. Eine 0 an dieser Stelle wäre die
   * gefährlichere Antwort, weil sie eine Summe liefert, die um eine ganze
   * Spalte danebenliegt, und im virtuellen Modus (`table-layout: fixed`) steht
   * die letzte Spalte dann unter dem Rand. Heute trifft das die Aufklappspalte,
   * deren Breite erst `expandable.columnWidth` festlegt (`@rc-component/table`,
   * `hooks/useColumns/index.js`, `width: columnWidth`) — ohne die Angabe kennt
   * sie nur antds Stylesheet, und das sieht diese Rechnung nicht.
   */
  zusatzBreite: number | null = 0,
  /**
   * Wie viele Zeilen die Tabelle trägt, und ab wann sich Virtualisierung lohnt.
   * Ohne Angabe entscheidet allein `virtuell` — dann trägt der Aufrufer die
   * Verantwortung für die Schwelle.
   */
  zeilen?: { anzahl: number; ab?: number },
): MasseErgebnis {
  if (virtuell === false || !Number.isFinite(virtuell) || virtuell <= 0) {
    return { scroll: ohneVirtuell(eigenes), virtuellAktiv: false };
  }

  if (zeilen && zeilen.anzahl < (zeilen.ab ?? VIRTUELL_AB_ZEILEN)) {
    return { scroll: ohneVirtuell(eigenes), virtuellAktiv: false };
  }

  const summe = breitenSumme(spalten);
  if (summe === null || zusatzBreite === null) {
    return {
      scroll: ohneVirtuell(eigenes),
      virtuellAktiv: false,
      hinweis: summe === null
        ? "Virtuelles Scrollen verlangt eine numerische `width` an JEDER Spalte — "
          + "sonst setzt @rc-component/table `scroll.x` still auf 1 und die Tabelle "
          + "fällt auf ein Pixel zusammen. Virtualisierung bleibt für diese Tabelle aus."
        : "Virtuelles Scrollen verlangt auch für die Aufklappspalte eine Breite "
          + "(`expandable.columnWidth`) — sie steht nicht in `columns`, und ohne sie "
          + "läge die Gesamtbreite um eine ganze Spalte daneben. Virtualisierung "
          + "bleibt für diese Tabelle aus.",
    };
  }

  return { scroll: { x: summe + zusatzBreite, y: virtuell }, virtuellAktiv: true };
}
