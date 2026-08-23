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
 * ⬜ A-L9 — OB DIESER RIEGEL BEI EINEM ECHTEN ABRUF GREIFT, ist bis heute unbewiesen
 * (Erbe von ⬜ Z-L1, `riegel.test.ts:49-53`). Belegt ist, dass die Zeile hier steht
 * (Quelltext-Scan), nicht dass sie wirkt; abgelesen wird das in Planteil 5, beim ersten
 * e2e-Lauf. Kein Test dieses Planteils darf etwas anderes behaupten.
 */
export default async function AusleiheLayout({ children }: { children: ReactNode }) {
  await requireAusleihZugang(getDb());
  return children;
}
