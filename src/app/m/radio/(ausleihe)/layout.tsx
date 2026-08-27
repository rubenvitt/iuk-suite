// src/app/m/radio/(ausleihe)/layout.tsx
import type { ReactNode } from "react";
import { getDb } from "../_db/client";
import { requireAusleihZugang } from "../_lib/ausleihZugang";

/**
 * DIE HUELLE DES AUSLEIH-ZWEIGS — EIN Aufruf, sonst nichts (§4.2.1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3401-3406`; Vorbild
 * `src/app/m/lagerbuch/helfer/layout.tsx:41-45`).
 *
 * ⛔ BEQUEMLICHKEIT, KEINE SICHERHEITSGRENZE, und der Unterschied traegt den ganzen Zweig
 * (Spec:3402-3404): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein Layout kann
 * einer Seite KEINE Props reichen. Deshalb ruft jede der drei Seiten den Riegel SELBST noch
 * einmal — sie braucht Sitzungsetikett und Ablaufzeitpunkt fuer den Rahmen
 * (`_ui/AusleihRahmen.tsx:62-65`). Wer diese Datei fuer die Sicherung haelt und den Aufruf
 * aus einer Seite entfernt, bekommt `riegel.test.ts` Klausel (f) rot.
 *
 * ⛔ DER HOST-RIEGEL WIRD HIER NICHT ZUSAETZLICH GERUFEN (Spec:3408-3413, NS-Z1, Pflicht 16
 * `docs/radio-portierung-analyse.md:973-977`): `requireAusleihZugang` ruft ihn INTERN als
 * erste Anweisung (`_lib/ausleihZugang.ts:120`). Ein zweiter Aufruf behauptete, das
 * Praedikat sei hostblind, und machte aus „hostgebunden durch Konstruktion" wieder eine
 * Liste, die die naechste Datei vergisst. ⚠️ Das GATE (`src/app/m/radio/page.tsx:32-36`)
 * ruft ihn sehr wohl zusaetzlich — das ist die eine angeordnete Ausnahme und gilt nur dort;
 * Klausel (f) haelt beide Haelften auseinander.
 *
 * ⛔ SIE UMLEITET UND RAEUMT NICHT SELBST (Bauform-Zulaessigkeitstafel Zeilen 3 und 7): dies
 * ist eine SERVER COMPONENT, dort ist `cookies()` versiegelt und `set`/`delete` WERFEN.
 * `requireAusleihZugang` leitet stattdessen auf `/abmelden?grund=…` um, und der ROUTE
 * HANDLER raeumt (`abmelden/route.ts:16-24`, Spec:2568-2570).
 *
 * ⛔ KEIN `try`/`catch` UM DEN AUFRUF. `redirect()` arbeitet ueber einen geworfenen Sentinel;
 * ein `catch` verschluckt ihn, und die Weiterleitung findet STILL nicht statt.
 *
 * ⛔ SIE TRAEGT KEINEN RAHMEN UND KEINE `<Shell>` (Entscheidung E9): der `AusleihRahmen`
 * braucht `zugang` und `aktiv`, und beides kann ein Layout einer Seite nicht reichen. Er
 * steht deshalb IN den drei Seiten.
 *
 * ✅ ⬜ A-L9 IST AM 2026-08-27 ABGELESEN — MIT MESSWERTEN, NICHT ALS „geprueft" (Vorbild der
 * Fortschreibung: `riegel.test.ts:50-79`, wo V23 dasselbe fuer den Verwaltungszweig getan
 * hat). Bis dahin stand hier: „OB DIESER RIEGEL BEI EINEM ECHTEN ABRUF GREIFT, ist bis heute
 * unbewiesen (Erbe von ⬜ Z-L1, `riegel.test.ts:50-55`). Belegt ist, dass die Zeile hier
 * steht (Quelltext-Scan), nicht dass sie wirkt; abgelesen wird das in Planteil 5, beim
 * ersten e2e-Lauf." Abgelesen hat es die Fix-Runde 1 zu Aufgabe T3 (Fund W1 des Reviews) an
 * `e2e/radio-zugang.spec.ts`, gegen einen laufenden `next dev` auf
 * `radio.localtest.me:3100`:
 *
 *   P1  die Riegelzeile dieser Datei (heute `:71`; bei der Messung `:44` — dieser Kommentar
 *       ist seither gewachsen) auskommentiert, die drei Seitenzeilen unveraendert
 *       -> `4 passed (17.6s)`, KEIN Fall rot. Die Seitenzeilen tragen allein.
 *   P2  umgekehrt: `geraete/page.tsx:86` neutralisiert (der `const zugang` durch ein Literal
 *       derselben Form ersetzt, damit die Seite uebersetzt und NICHT riegelt), `:71` hier
 *       unveraendert -> `4 passed (12.2s)`; Fall 4, Hop 1 auf `/geraete` antwortet nach der
 *       Sperrung weiterhin `307` mit `Location: /abmelden?grund=gesperrt`.
 *       ✅ **DAS LAYOUT TRAEGT** — Next fuehrt das Group-Layout aus, und der Riegel darin
 *       wirkt bei einem echten Abruf.
 *
 * ⛔ WAS DAS NICHT HEISST, und es steht hier, statt verschwiegen zu werden: die zwei Proben
 * belegen, dass BEIDE Ebenen unabhaengig voneinander greifen — nicht, dass eine von ihnen
 * entbehrlich waere. Genau das ist die Doppelung, die Spec:2759-2763 verlangt. Beide Sonden
 * sind zurueckgenommen, der Arbeitsbaum danach byteweise gleich
 * (`rtk git status --short` und `rtk git diff --stat` beide leer).
 * ⛔ UND ES BLEIBT EINE PROBE VON HAND, KEIN DAUERFALL: ein automatischer Test kann die
 * Seitenzeile nicht entfernen. Der Dauerschutz fuer beide Zeilen ist der Quelltext-Scan
 * `riegel.test.ts:855-892` (Klausel (f)), und der belegt weiterhin eine BAUFORM, keine
 * Wirkung.
 * ⚠️ ⬜ Z-L1 ist damit um den Ausleihzweig kleiner, aber NICHT geschlossen: die Host-Schleife
 * ueber alle Pfade, der Personenriegel im `(druck)`-Zweig (⬜ V-L14) und die Flaechen
 * `/sw.js` und `/api/health/radio` stehen aus (T4/T5).
 */
export default async function AusleiheLayout({ children }: { children: ReactNode }) {
  await requireAusleihZugang(getDb());
  return children;
}
