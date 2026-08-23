/**
 * Fluss C: suchen, filtern, gruppieren (Spec 1 §4.5,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3596-3637`). Fachlich
 * unveraendert portiert aus
 * `radio-inventar/apps/frontend/src/lib/device-filter.ts` — Spec:3600 schreibt „wandert
 * fachlich unveraendert mit", damit die vorhandenen Testfaelle mitwandern koennen.
 *
 * ⛔ KEIN `"use client"`. Diese Datei wird von BEIDEN Seiten der RSC-Grenze gelesen: die
 * Server Component berechnet mit `normalisiereSuchtext` den `suchschluessel` vor (A15,
 * Spec:3629-3632), die Client-Insel filtert und gruppiert damit (A18). Ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an, sondern als Client-Referenz —
 * HTTP 500 fuer die ganze Seite, das `pnpm build` nicht sieht und Vitest strukturell nicht
 * sehen KANN (Falle 6, `CLAUDE.md`). Durchgesetzt von
 * `src/app/m/radio/riegel.test.ts:921-940`.
 *
 * ⛔ DIE SUCHE LAEUFT IM CLIENT, DIE GRUNDMENGE KOMMT VOM SERVER (§4.5.2, Spec:3620-3637).
 * Unter hundert Geraeten ist eine Filterung im Browser sofort und netzlos; ein
 * Server-Roundtrip je Tastendruck waere auf einem Telefon spuerbar. Die AUSNAHME ist die
 * Seriennummer: sie wandert nach §4.1 Punkt 2 nicht in den Client, deshalb sucht die Insel
 * im vorberechneten `suchschluessel` und nicht in einem Seriennummernfeld.
 *
 * ⛔ DER SUCHTEXT STEHT NICHT IN DER URL (Spec:3633-3635). Er ist fluechtig; ein Rufname
 * oder Entleihername im Verlauf eines geteilten Telefons ist eine Spur, die niemand
 * braucht. Nur `?geraete=` ist URL-Zustand — der Vertrag dazu steht in `_lib/auswahl.ts`.
 *
 * ⛔ DIE SORTIERUNG NACH STATUS HAT IHREN EINZIGEN ORT HIER, in `filtereGeraete`. Im
 * Alt-Kiosk sortiert die Datenholung (`radio-inventar/apps/frontend/src/api/devices.ts:144-150`),
 * hier tut es der Filter — das Ergebnis ist dasselbe, weil `filter` die Reihenfolge haelt
 * und die Sortierung stabil ist. ⚠️ AUFLAGE AN A15: `geraeteMitLeihstand` bekommt KEIN
 * zweites `ORDER BY` nach Status. Zwei Sortierorte waeren zwei Wahrheiten, und die zweite
 * saehe man erst, wenn sie auseinanderlaufen.
 */

import type { GeraeteStatus } from "./status";

/**
 * Die vier Filterstufen der Filterleiste, 1:1 aus
 * `radio-inventar/apps/frontend/src/lib/device-filter.ts:3`.
 */
export type StatusFilter = "ALL" | "AVAILABLE" | "ON_LOAN" | "UNAVAILABLE";

/**
 * Der geschlossene Satz als WERT — dieselbe Anordnung wie `GERAETE_STATUS`
 * (`_lib/status.ts`) und `GATE_GRUENDE` (`_lib/gateTexte.ts:37-43`): die Insel baut ihre
 * Knopfreihe daraus, statt die vier Namen ein zweites Mal zu schreiben.
 */
export const STATUS_FILTER: readonly StatusFilter[] = [
  "ALL",
  "AVAILABLE",
  "ON_LOAN",
  "UNAVAILABLE",
] as const;

/**
 * Die vier Beschriftungen, woertlich aus
 * `radio-inventar/apps/frontend/src/components/features/DeviceFilterBar.tsx:6-11`.
 *
 * ⛔ SIE STEHEN HIER UND NICHT IN DER INSEL, damit A18 sie von hier liest statt sie neu zu
 * erfinden — dieselbe Anordnung, die A12 fuer `STATUS_HEX` und A16 getroffen hat
 * (`_lib/status.ts`, Kopf). „Defekt·Wartung" ist EIN Wort mit einem Mittelpunkt; die
 * naheliegende Erfindung waere „Defekt/Wartung", und sie waere still falsch.
 *
 * ⚠️ BILDSCHIRMTEXTE MIT UMLAUT — die eine benannte Ausnahme der Hausregel
 * (`.superpowers/sdd/planteil3/briefs/KOPF.md:264-272`).
 */
export const STATUS_FILTER_ETIKETT: Record<StatusFilter, string> = {
  ALL: "Alle",
  AVAILABLE: "Frei",
  ON_LOAN: "Vergeben",
  UNAVAILABLE: "Defekt·Wartung",
};

/** Der Zustand der Filterleiste. `suchtext` ist der ROHE Text aus dem Eingabefeld. */
export type FilterZustand = {
  readonly suchtext: string;
  readonly status: StatusFilter;
};

/**
 * Was `filtereGeraete` von einer Zeile braucht — nicht mehr.
 *
 * ⛔ `status` IST DER GEFALTETE WERT, NIE DIE ROHE SPALTE. `_db/schema.ts:30` fuehrt
 * `status: text("status")` als nullable Freitextspalte; `GeraeteStatus` kennt kein `null`
 * (⬜ A-L13, `_lib/status.ts`). Wer die rohe Spalte hier einsetzt, bekommt einen Typfehler
 * und nicht ein Geraet, das durch alle vier Filter faellt
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:189`).
 */
export type SuchbaresGeraet = {
  readonly status: GeraeteStatus;
  readonly suchschluessel: string;
};

/**
 * Klein, ohne Diakritika, Eszett auf Doppel-s, getrimmt — 1:1 aus
 * `radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`. „muller" findet „Müller",
 * „strasse" findet „Straße".
 *
 * ⚠️ DIE REIHENFOLGE DER VIER SCHRITTE IST TRAGEND: erst kleinschreiben, dann NFD zerlegen,
 * dann die kombinierenden Zeichen wegnehmen, dann das Eszett ersetzen. Das Eszett ist KEIN
 * kombinierendes Zeichen — NFD laesst es unberuehrt, und ohne die eigene Ersetzung bliebe
 * es stehen (Alt-Kommentar `device-filter.ts:21-22`).
 *
 * ⚠️ DER BEREICH U+0300..U+036F IST DER BLOCK „Combining Diacritical Marks". Die Alt-Quelle
 * schreibt ihn als zwei unsichtbare Zeichen in ein Zeichenklassenpaar; hier stehen die
 * Codepunkte ausgeschrieben, weil ein unsichtbares Zeichen im Quelltext beim naechsten
 * Kopieren still verlorengeht.
 */
export function normalisiereSuchtext(eingabe: string): string {
  return eingabe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .trim();
}

/**
 * Statuspriorität für die Sortierung, 1:1 aus
 * `radio-inventar/apps/frontend/src/api/devices.ts:44-49`: kleinere Zahl zuerst,
 * AVAILABLE vor ON_LOAN vor DEFECT vor MAINTENANCE.
 */
const PRIORITAET: Record<GeraeteStatus, number> = {
  AVAILABLE: 1,
  ON_LOAN: 2,
  DEFECT: 3,
  MAINTENANCE: 4,
};

/**
 * Trifft die Zeile ALLE Begriffe? `device-filter.ts:33-41`.
 *
 * ⛔ `every`, NICHT `some` (`device-filter.ts:40`). Wer zwei Begriffe eintippt, meint eine
 * Verengung; mit `some` faende „motorola zelt" jedes Motorola und jedes Zelt.
 */
function trifftSuchtext(geraet: SuchbaresGeraet, begriffe: readonly string[]): boolean {
  if (begriffe.length === 0) return true;
  return begriffe.every((begriff) => geraet.suchschluessel.includes(begriff));
}

/**
 * Trifft die Zeile die gewaehlte Filterstufe? `device-filter.ts:43-54`.
 *
 * ⛔ `UNAVAILABLE` FASST ZWEI ZUSTAENDE ZUSAMMEN (`device-filter.ts:51-52`) — es ist der
 * einzige der vier, der das tut, und auf dem Bildschirm heisst er danach
 * (`STATUS_FILTER_ETIKETT` oben).
 */
function trifftStatus(geraet: SuchbaresGeraet, filter: StatusFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "AVAILABLE":
      return geraet.status === "AVAILABLE";
    case "ON_LOAN":
      return geraet.status === "ON_LOAN";
    case "UNAVAILABLE":
      return geraet.status === "DEFECT" || geraet.status === "MAINTENANCE";
  }
}

/**
 * Die gefilterte und nach Statuspriorität sortierte Liste — eine NEUE Liste.
 *
 * ⛔ DIE EINGABE WIRD NIE AN ORT UND STELLE SORTIERT. Sie kommt als Prop aus einer Server
 * Component (A18); ein `sort()` auf ihr veraenderte sie dort still mit. Die Alt-Quelle
 * schreibt denselben Grund aus (`api/devices.ts:144`: „create new array to avoid
 * mutation").
 *
 * Die Sortierung ist stabil (ECMA-262 verlangt das seit ES2019 fuer `Array#sort`), also
 * bleibt die Eingabereihenfolge innerhalb eines Zustands erhalten — sonst mischte jede
 * Aktualisierung die Liste neu, obwohl sich nichts geaendert hat.
 */
export function filtereGeraete<T extends SuchbaresGeraet>(
  geraete: readonly T[],
  zustand: FilterZustand,
): T[] {
  const begriffe = normalisiereSuchtext(zustand.suchtext).split(/\s+/).filter(Boolean);
  return geraete
    .filter((g) => trifftStatus(g, zustand.status) && trifftSuchtext(g, begriffe))
    .sort((a, b) => PRIORITAET[a.status] - PRIORITAET[b.status]);
}

/**
 * Der Schluessel der Sammelgruppe, 1:1 aus `device-filter.ts:16`. ⛔ KEIN Standortname,
 * sondern ein Wert, den kein Standort tragen kann — sonst kollidierte er mit einem echten
 * Standort, der zufaellig so hiesse.
 */
export const OHNE_STANDORT_SCHLUESSEL = "__none__";

/** Das Etikett der Sammelgruppe, 1:1 aus `device-filter.ts:17`. Bildschirmtext. */
export const OHNE_STANDORT_ETIKETT = "Ohne Standort";

/** Was `gruppiereNachStandort` von einer Zeile braucht — nicht mehr. */
export type VerortetesGeraet = {
  readonly standort: string | null;
};

/** Eine Standortgruppe. `schluessel` ist stabil, `etikett` ist der Bildschirmtext. */
export type StandortGruppe<T> = {
  readonly schluessel: string;
  readonly etikett: string;
  readonly geraete: T[];
};

/**
 * Gruppiert nach getrimmtem Standort — 1:1 aus `device-filter.ts:71-95`.
 *
 * Benannte Standorte zuerst, alphabetisch nach de-Kollation (`device-filter.ts:87`);
 * Geraete ohne Standort fallen in EINE Sammelgruppe, die ANGEHAENGT wird
 * (`device-filter.ts:90-92`). Innerhalb einer Gruppe bleibt die Eingabereihenfolge
 * erhalten.
 *
 * ⛔ `localeCompare(…, "de")`, NICHT `<`. Nach Zeichenwerten stuende „Bahnhof" (U+0042) vor
 * „Ärztehaus" (U+00C4) — ein Standort mit Umlaut rutschte hinter alle anderen, und die
 * Liste saehe aus wie ein Fehler.
 *
 * ⛔ DIE SAMMELGRUPPE ENTSTEHT NUR, WENN SIE JEMANDEN ENTHAELT (`device-filter.ts:90`). Ein
 * leerer Kopf „Ohne Standort" ueber nichts waere eine Zeile, die der Mensch lesen muss,
 * ohne dass sie etwas sagt.
 *
 * ⚠️ WAS DIESE FUNKTION NICHT ENTSCHEIDET: ob eine EINZELNE Gruppe flach ohne Kopfzeile
 * gerendert wird (`DeviceGroupedList.tsx:34-36`) und ob die Koepfe bei aktivem Suchtext
 * unklickbar sind (`DeviceGroupedList.tsx:31`, `DeviceGroup.tsx:22`). Das sind Aussagen
 * ueber das Markup und gehoeren zu `_ui/GeraeteListe.tsx` in A18.
 */
export function gruppiereNachStandort<T extends VerortetesGeraet>(
  geraete: readonly T[],
): StandortGruppe<T>[] {
  const benannt = new Map<string, T[]>();
  const ohne: T[] = [];

  for (const geraet of geraete) {
    const standort = geraet.standort?.trim();
    if (standort) {
      const eimer = benannt.get(standort);
      if (eimer) eimer.push(geraet);
      else benannt.set(standort, [geraet]);
    } else {
      ohne.push(geraet);
    }
  }

  const gruppen: StandortGruppe<T>[] = [...benannt.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "de"))
    .map(([etikett, ihreGeraete]) => ({ schluessel: etikett, etikett, geraete: ihreGeraete }));

  if (ohne.length > 0) {
    gruppen.push({
      schluessel: OHNE_STANDORT_SCHLUESSEL,
      etikett: OHNE_STANDORT_ETIKETT,
      geraete: ohne,
    });
  }

  return gruppen;
}
