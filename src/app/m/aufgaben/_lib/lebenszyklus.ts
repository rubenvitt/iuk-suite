import type { AufgabeRow, PersonRow, Status } from "../_db/schema";
import { darfEinstellenFuerAndere, darfFreigeben, darfPlanAendern, darfVerteilen, istAktiv } from "./zugang";

/*
 * DIE UEBERGANGSTABELLE — Spec §5.2, NORMATIV. Reine Funktionen, keine Datenbank, keine Sitzung
 * (Aufgabe 4-Vorgabe fuer dieses Modul: Rollen kommen aus der Datenbank, aber DIESE Datei liest
 * nicht selbst — Aufgabe 9/10 reichen die Zeile durch). KEIN "use client".
 *
 * Spec §5.2 wird hier zu einer Datenstruktur (`TABELLE`), nicht zu verstreuten `if`s: die Tabelle
 * steht an GENAU EINER Stelle, und `uebergang()` lehnt alles ab, was dort nicht steht.
 *
 * DREI ENTWURFSENTSCHEIDUNGEN, DIE DER BRIEF OFFEN LIESS:
 *
 * 1. ZURUECKZIEHEN HAT KEINEN ZIELZUSTAND — es LOESCHT die Aufgabe samt Verlauf (Spec §5.2). Die
 *    vorgeschlagene Signatur `{ erlaubt: true; nach: Status }` passt dafuer nicht, und ein siebter
 *    Status ("zurueckgezogen") ist explizit ausgeschlossen (Spec §5.2, letzter Punkt: er wuerde in
 *    jeder Liste und jedem Filter mitgeschleppt, und GENAU DAS soll die Loeschung ersparen).
 *    Entscheidung: der Erfolgsfall traegt ein `wirkung`-Feld, das ENTWEDER "aendern" (mit `nach`)
 *    ODER "loeschen" ist. Ein `nach: Status | "geloescht"` haette denselben Fall in den Status-Typ
 *    hineingezwungen, den Spec §5.2 fuer die DATENBANK ausdruecklich vermeidet — falsch waere es
 *    also nicht nur dort, sondern auch hier in der Ergebnisform.
 *
 * 2. UMVERTEILEN RAEUMT DIE PLANUNG (Regel 3) — das ist eine WIRKUNG, kein Zielzustand
 *    (`plan_datum`/`plan_uhrzeit`/`plan_rang` bleiben `verteilt`, nur die Planungsfelder werden
 *    geleert). `planLoeschen` ist deshalb NICHT optional: als Pflichtfeld auf jedem
 *    "aendern"-Erfolgsfall kann Aufgabe 9 es nicht vergessen abzufragen, so wie sie `nach` nicht
 *    vergessen kann — ein optionales Feld liesse sich schweigend ignorieren, ein Pflichtfeld nicht.
 *
 * 3. "ZUGEWIESENER BUFDI" (fuenf der elf Tabellenzeilen: einplanen, starten, zuruecksetzen, fertig,
 *    wiederaufnehmen) ist NICHT `darfPlanAendern` fuer alle fuenf — nur `einplanen` AENDERT
 *    tatsaechlich den Plan, und nur dort ist `darfPlanAendern(p, a.zugewiesenAn, heute)` die
 *    passende Berechtigung, wortgleich zum Brief ("Wo die Tabelle 'zugewiesener BuFDi' sagt, ist
 *    die Pruefung `p.id === a.zugewiesenAn` PLUS `istAktiv`"). Fuer die anderen vier steht dieselbe
 *    Formel als lokaler Helfer `istZugewiesenerBuFDi`, gebaut auf dem importierten `istAktiv` — eine
 *    eigene, benannte Berechtigung fuer `darfPlanAendern` querzuverwenden waere die falsche Naht:
 *    ihr Vertrag ("wer darf DIESEN Plan aendern") hat mit "wer darf DIESE Aufgabe starten" nichts zu
 *    tun, obwohl beide heute densselben Ausdruck auswerten. Eine spaetere, plan-spezifische
 *    Erweiterung von `darfPlanAendern` duerfte diese vier Zeilen nicht aendern koennen.
 *
 * BERECHTIGUNG KOMMT AUSSCHLIESSLICH AUS `_lib/zugang.ts` — `darfVerteilen`, `darfFreigeben`,
 * `darfPlanAendern`, `darfEinstellenFuerAndere`, `istAktiv`. Keine dieser Bedingungen wird hier
 * nachgebaut; `darfFreigeben` insbesondere traegt zwei Klauseln (Selbstaufgaben nie, der
 * Zugewiesene nie — Betreiberentscheidung 2026-08-13), die ein Nachbau genau nicht mitschriebe.
 */

export type Aktion =
  | "verteilen"
  | "umverteilen"
  | "einplanen"
  | "starten"
  | "zuruecksetzen"
  | "fertig"
  | "freigeben"
  | "zurueckweisen"
  | "wiederaufnehmen"
  | "zurueckziehen";

export type UebergangErgebnis =
  | { erlaubt: true; wirkung: "aendern"; nach: Status; planLoeschen: boolean }
  | { erlaubt: true; wirkung: "loeschen" }
  | { erlaubt: false; grund: string };

/**
 * `p.id === a.zugewiesenAn` PLUS `istAktiv` — die Formel, die der Brief fuer "zugewiesener BuFDi"
 * vorschreibt. Eine ausgeschiedene Person bewegt nichts, auch wenn sie noch als `zugewiesenAn`
 * eingetragen ist.
 */
function istZugewiesenerBuFDi(p: PersonRow, a: AufgabeRow, heute: string): boolean {
  return p.id === a.zugewiesenAn && istAktiv(p, heute);
}

interface Regel {
  von: Status;
  aktion: Aktion;
  /**
   * Zusatzbedingung UEBER DIE AUFGABE (nicht ueber Person/Rolle) — ausschliesslich fuer die
   * `fertig`-Verzweigung gebraucht: `in_arbeit` × `fertig` hat ZWEI Zeilen, unterschieden durch
   * `istSelbst`, mit unterschiedlichem `nach`. Ohne `gilt` waere die erste Zeile mit passendem
   * `von`+`aktion` immer die gewaehlte, unabhaengig davon, ob die Aufgabe wirklich passt.
   */
  gilt?: (a: AufgabeRow) => boolean;
  nach: Status;
  wer: (p: PersonRow, a: AufgabeRow, heute: string) => boolean;
  /** Regel 3 (Spec §5.2): nur bei `umverteilen` wahr. */
  planLoeschen?: boolean;
}

/**
 * SPEC §5.2, ZEILE FUER ZEILE — zehn der elf Tabellenzeilen (die elfte, `zurueckziehen`, hat
 * keinen Zielzustand und steht deshalb als Sonderfall in `uebergang()`, nicht hier).
 */
const TABELLE: Regel[] = [
  {
    von: "eingegangen",
    aktion: "verteilen",
    nach: "verteilt",
    // `a` bleibt ungenutzt: "verteilen" fragt nur nach der Rolle, nicht nach der Aufgabe selbst.
    wer: (p, _a, heute) => darfVerteilen(p, heute),
  },
  {
    von: "verteilt",
    aktion: "umverteilen",
    nach: "verteilt",
    wer: (p, _a, heute) => darfVerteilen(p, heute),
    planLoeschen: true,
  },
  {
    von: "verteilt",
    aktion: "einplanen",
    nach: "verteilt",
    // `a.zugewiesenAn` ist im Zustand "verteilt" immer gesetzt (die Aufgabe kam nur ueber
    // "verteilen"/"umverteilen" hierher, und beide setzen zugewiesenAn). Der explizite
    // `null`-Ausstieg statt eines Sentinel-Strings (Review Fix-Runde 1): ein Fallback wie `?? ""`
    // waere eine stille Falle, sobald `id`-Werte je normalisiert wuerden — `null` sagt direkt, dass
    // dieser Fall nach der Invariante nie eintritt, statt ihn hinter einem erfundenen Wert zu verstecken.
    wer: (p, a, heute) => a.zugewiesenAn !== null && darfPlanAendern(p, a.zugewiesenAn, heute),
  },
  { von: "verteilt", aktion: "starten", nach: "in_arbeit", wer: istZugewiesenerBuFDi },
  { von: "in_arbeit", aktion: "zuruecksetzen", nach: "verteilt", wer: istZugewiesenerBuFDi },
  {
    von: "in_arbeit",
    aktion: "fertig",
    gilt: (a) => !a.istSelbst,
    nach: "freigabe_offen",
    wer: istZugewiesenerBuFDi,
  },
  {
    von: "in_arbeit",
    aktion: "fertig",
    gilt: (a) => a.istSelbst,
    nach: "abgeschlossen",
    wer: istZugewiesenerBuFDi,
  },
  { von: "freigabe_offen", aktion: "freigeben", nach: "abgeschlossen", wer: darfFreigeben },
  { von: "freigabe_offen", aktion: "zurueckweisen", nach: "zurueckgewiesen", wer: darfFreigeben },
  { von: "zurueckgewiesen", aktion: "wiederaufnehmen", nach: "in_arbeit", wer: istZugewiesenerBuFDi },
];

/**
 * DIE EINE STELLE, AN DER SPEC §5.2 GEPRUEFT WIRD. Jedes Paar (Status, Aktion), das nicht in
 * `TABELLE` steht (oder dessen `gilt`-Bedingung nicht zutrifft), wird abgelehnt — nicht als
 * Sonderfall, sondern weil `TABELLE.find` nichts findet.
 *
 * `zurueckziehen` ist eigens behandelt: es hat keinen `nach`-Zustand (siehe Kopfkommentar,
 * Entscheidung 1) und keine Zeile in `TABELLE`.
 */
export function uebergang(a: AufgabeRow, aktion: Aktion, p: PersonRow, heute: string): UebergangErgebnis {
  if (aktion === "zurueckziehen") {
    if (a.status !== "eingegangen") {
      return {
        erlaubt: false,
        grund: `Zurueckziehen ist nur aus dem Zustand "eingegangen" moeglich — diese Aufgabe ist "${a.status}" und hat bereits eine Geschichte mit Dokumentationswert.`,
      };
    }
    const darf = (p.id === a.erstellerId && istAktiv(p, heute)) || darfVerteilen(p, heute);
    if (!darf) {
      return {
        erlaubt: false,
        grund: "Nur die Erstellerin bzw. der Ersteller oder die Koordination kann diese Aufgabe zurueckziehen.",
      };
    }
    return { erlaubt: true, wirkung: "loeschen" };
  }

  const regel = TABELLE.find(
    (r) => r.von === a.status && r.aktion === aktion && (r.gilt === undefined || r.gilt(a)),
  );
  if (!regel) {
    return {
      erlaubt: false,
      grund: `Die Aktion "${aktion}" ist im Zustand "${a.status}" nicht vorgesehen.`,
    };
  }
  if (!regel.wer(p, a, heute)) {
    return {
      erlaubt: false,
      grund: `Diese Person darf die Aktion "${aktion}" fuer diese Aufgabe nicht ausfuehren.`,
    };
  }
  return { erlaubt: true, wirkung: "aendern", nach: regel.nach, planLoeschen: regel.planLoeschen ?? false };
}

export type AnfangsZustandErgebnis =
  | { erlaubt: true; status: Status; zugewiesenAn: string | null; istSelbst: boolean }
  | { erlaubt: false; grund: string };

/**
 * `einstellen` IST BEWUSST KEINE `Aktion` (Brief) — es hat keinen Ausgangszustand, ist also kein
 * Uebergang. Welchen Anfangszustand eine neue Aufgabe bekommt, gehoert trotzdem in diese Datei
 * und nicht in die Server-Action von Aufgabe 9: sonst liegt die halbe Tabelle in `actions.ts`.
 *
 * ZWEI AUSPRAEGUNGEN (Spec §5.2):
 *  - fremd:    `eingegangen`, NICHT zugewiesen — die Zuweisung passiert erst beim "verteilen".
 *              Nur `auftrag` oder `koordination` (`darfEinstellenFuerAndere`, traegt `istAktiv`).
 *  - fuer sich: `verteilt`, direkt an sich selbst zugewiesen, `istSelbst: true` — jede Rolle.
 *
 * `istAktiv(ersteller, heute)` gilt fuer BEIDE Zweige, auch wenn Spec §5.2 das fuer den
 * Selbst-Zweig nicht ausdruecklich nennt: jedes andere Handlungspraedikat in `_lib/zugang.ts`
 * prueft `istAktiv` fuer sich selbst statt sich auf ein Gate zu verlassen (Kopfkommentar dort),
 * und eine ausgeschiedene Person, die sich selbst neue Arbeit zuweist, waere sonst die eine
 * Luecke, die dieses Muster nicht deckt.
 */
export function anfangsZustand(
  ersteller: PersonRow,
  fuerSichSelbst: boolean,
  heute: string,
): AnfangsZustandErgebnis {
  if (fuerSichSelbst) {
    if (!istAktiv(ersteller, heute)) {
      return {
        erlaubt: false,
        grund: "Eine ausgeschiedene Person kann sich keine neue Aufgabe mehr einstellen.",
      };
    }
    return { erlaubt: true, status: "verteilt", zugewiesenAn: ersteller.id, istSelbst: true };
  }
  if (!darfEinstellenFuerAndere(ersteller, heute)) {
    return {
      erlaubt: false,
      grund: "Nur Auftraggeber oder die Koordination koennen Aufgaben fuer andere einstellen.",
    };
  }
  return { erlaubt: true, status: "eingegangen", zugewiesenAn: null, istSelbst: false };
}
