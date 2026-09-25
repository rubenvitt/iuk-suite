/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port und die drei Token-Codes
 * (Festlegung H9, Spec §12.6 Punkt 2).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende die Admin-Gruppe einmal in
 * `webServer.env` und einmal im Spec, haette man ZWEI Literale — und der
 * Fehlerfall ist nicht laut, sondern GEGENTEILIG: ohne (oder mit falschem)
 * `groups` bezeugt der Lauf den 404 aus §11.5, Zustand 19 und sieht dabei aus wie
 * ein bestandener Test.
 *
 * Dieselbe Klasse steht in `playwright.config.ts` schon ausgeschrieben (am Import
 * von `AV_MODUS_DATEI`): „Zwei Literale liefen auseinander, ohne dass ein Lauf rot
 * wuerde — er waere rennabhaengig gruen."
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const LAGERBUCH_HOST = "lagerbuch.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host fuer die „fremder Host"-Zusagen (§3.8.3,
 * §12.2, §12.6 Punkt 3).
 *
 * ⚠️ ER EXISTIERT BEREITS: `webServer.url` in `playwright.config.ts` wartet schon auf
 * `http://feedback.localtest.me:3100/login`. Es wird KEIN dritter Host
 * eingefuehrt — und `feedback` ist zugleich die schaerfere Probe, weil
 * `moduleForHost` dort tatsaechlich ein Modul liefert (Festlegung H8).
 */
export const FREMDER_HOST = "feedback.localtest.me";

/**
 * Der Wert, den `SUITE_ADMIN_GROUP_LAGERBUCH` im E2E-Server traegt UND den
 * `devLogin(…, { groups })` mitgeben MUSS.
 *
 * ⚠️ Annahme A-T3-2: der produktive Wert ist eine Betreiberentscheidung und wird
 * beim Cutover als eine `.env`-Zeile gesetzt. Fuer E2E gilt der
 * Registry-Vorgabewert.
 */
export const LAGERBUCH_ADMIN_GRUPPE = "lagerbuch_nutzer";

import { E2E_PORT } from "./ports"; // Derselbe Port wie `playwright.config.ts` (DRK-346).
export const LAGERBUCH_PORT = E2E_PORT;

/**
 * VIER aktive Token-Codes, nicht einer.
 *
 * ⚠️ `lagerbuch/e2e/migrate-db.ts:84-88` schreibt aus, warum ein zweiter noetig
 * war: sonst bucht der Check ins Journal des Helfer-Flows hinein — Playwright
 * faehrt alle Spec-Dateien in EINEM Worker gegen EINE SQLite-Datei. Der dritte
 * trennt den Geraete-Check vom Artikel-Check.
 *
 * ⚠️ DER VIERTE IST DER EINZIGE MIT EINER FAHRZEUGBINDUNG (DRK-302), und er
 * musste ein eigener sein: die drei anderen tragen `ziel_typ = null`, und genau
 * darauf beruht, dass sie in `/helfer/check` weiter die volle Fahrzeugwahl
 * sehen. Haette einer von ihnen die Bindung bekommen, waere die Zusage „ein
 * ungebundenes Kaertchen waehlt weiter frei" in derselben Zeile verschwunden,
 * die sie beweisen soll.
 */
export const E2E_TOKEN_HELFER = "111-111";
export const E2E_TOKEN_CHECK = "222-222";
export const E2E_TOKEN_GERAETE = "333-333";
export const E2E_TOKEN_FAHRZEUG = "444-444";

/**
 * Das Fahrzeug, an dem `E2E_TOKEN_FAHRZEUG` haengt — dasselbe, das
 * `checkFixtures()` ohnehin anlegt. Name und Id stehen HIER und nicht als
 * Literal im Spec: liefen Seed und Zusicherung auseinander, suchte der Test
 * eine Ueberschrift, die es nicht gibt, und die Ursache staende in der falschen
 * Datei.
 */
export const E2E_FAHRZEUG_ID = "e2e-fahrzeug";
export const E2E_FAHRZEUG_NAME = "E2E RTW";
/** Ein ZWEITES aktives Fahrzeug — ohne es waere „keine Wahl" trivial wahr. */
export const E2E_FAHRZEUG_ANDERES_NAME = "E2E Geräte RTW";
export const E2E_FAHRZEUG_ANDERES_ID = "e2e-geraete-fahrzeug";

/**
 * Der Organisationsname im E2E-Server — die einzige Zeile der Wortmarke, die
 * ueber die Umgebung kommt (`_lib/marke.ts`; Marke und Unterzeile daneben sind
 * Konstanten).
 */
export const LAGERBUCH_ORGANISATION_E2E = "DRK Bereitschaft E2E";

/**
 * Die ZEHN Lagerbuch-Zeilen fuer `webServer.env` (§10.3, „Werte fuer Dev und
 * E2E") — neun aus §10.3 plus `LAGERBUCH_ORGANISATION`. „Klein" ist hier KEIN
 * zulaessiger Eintrag: die Kopplungen aus §10.5 greifen sonst, bevor ein Test
 * laeuft.
 *
 * ⚠️ `SUITE_ACCESS_GROUP_LAGERBUCH` steht bewusst NICHT darunter — ein gesetzter
 * Wert bricht den Boot ab (§2.5, §10.5 Pruefung 6).
 */
export const LAGERBUCH_ENV: Record<string, string> = {
  // Der Host-Riegel braeuchte sie nicht (§2.6), aber die Boot-Pruefungen haengen
  // an `prodHostsFor(...).length > 0`, und der Zwei-Host-E2E ist sonst nicht
  // darstellbar.
  SUITE_HOST_LAGERBUCH: LAGERBUCH_HOST,
  SUITE_ADMIN_GROUP_LAGERBUCH: LAGERBUCH_ADMIN_GRUPPE,
  // ⚠️ ABSICHTLICH NICHT DIE VORGABE aus `_lib/marke.ts`: die stuende auch ohne
  // jede Variable da, und `lagerbuch-organisation.spec.ts` belegte damit nichts.
  LAGERBUCH_ORGANISATION: LAGERBUCH_ORGANISATION_E2E,
  // ≠ leer, ≠ Alt-Default, ≠ AUTH_SECRET der E2E-Konfiguration ("test-secret"),
  // ≥ 32 Zeichen — alle vier Bedingungen aus Boot-Pruefung 4.
  LAGERBUCH_HELFER_SITZUNG_SECRET: "e2e-helfer-secret-nicht-produktiv-32z",
  // Fixtures rechnen gegen die Vorgaben.
  LAGERBUCH_VERFALL_ROT_TAGE: "31",
  LAGERBUCH_VERFALL_GELB_TAGE: "56",
  // 1:1; kuerzer bringt nichts, weil kein Test 12 h wartet.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: "12",
  // Der Sperrtest braucht eine erreichbare Grenze: bei 5 sind es sechs
  // Fehleingaben.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5",
  // ≥ ABSENDER — der Absendertest darf die Gesamtbremse nicht ausloesen und damit
  // die Ursache verwischen.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
};

/** Absolute Per-Host-URL (§12.6, Punkt 3): `baseURL` zeigt auf den PORTAL-Host,
 *  und portal traegt `requiresAuth: true` — jeder relative Aufruf landete im
 *  Login. */
export function lagerbuchUrl(pfad: string): string {
  return `http://${LAGERBUCH_HOST}:${LAGERBUCH_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host — fuer die 404-Schleife aus §3.8.3. */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${LAGERBUCH_PORT}${pfad}`;
}

/**
 * DIE LAST-ARTIKEL — die einzige Fixture, die es allein wegen einer ZAHL gibt
 * (DRK-334).
 *
 * `core/tabelle` virtualisiert erst ab `VIRTUELL_AB_ZEILEN` (150). Genau dort
 * entsteht der zweite Scrollcontainer, um den es geht — mit sechs Artikeln gibt
 * es ihn nicht, und ein Test dagegen bewiese nichts. Die Menge steht deshalb
 * hier und nicht als Literal im Spec: liefen Seed und Zusicherung auseinander,
 * bliebe der Lauf gruen und pruefte nur eine gewoehnliche Tabelle.
 *
 * ⚠️ SIE SIND INAKTIV, und das ist derselbe Kniff wie bei `kategorieFixtures`
 * und `sammelFixtures`: NUR `/verwaltung/artikel` liest `inklInaktiv: true`
 * (`_lib/lesepfade/artikel.ts`). Inventur, Helfer, Etiketten, Bestellliste,
 * Fahrzeug- und Vorlagenblatt sehen sie nicht — sonst zaehlte ein halbes Dutzend
 * fremder Specs ploetzlich 200 Zeilen mehr.
 *
 * ⚠️ UND DER NAME BEGINNT MIT „ZZZ", DAMIT SIE GANZ UNTEN STEHEN. Das ist keine
 * Kosmetik, sondern die zweite Haelfte derselben Abschirmung: die Artikeltabelle
 * sortiert VON SICH AUS aufsteigend nach Namen (`ArtikelTable.tsx`, `sortierung`
 * startet auf `name`/`ascend` und haengt als `sortOrder` an der Spalte) — die
 * Einfuegereihenfolge im Seed spielt also ueberhaupt keine Rolle. Unter „E2E
 * Last" waeren die 200 Zeilen zwischen „E2E Kategorie" und „E2E Sammel"
 * gelandet, und alles dahinter (die beiden Sammel-Artikel,
 * „E2E Verbandpaeckchen", „E2E Verfall NaCl") stuende in der virtuellen Tabelle
 * NICHT MEHR IM DOM — `lagerbuch-sammelbearbeitung.spec.ts` sucht seine beiden
 * Zeilen ohne vorher zu suchen oder zu scrollen. Hinter „ZZZ" sortiert nichts
 * mehr, also bleiben alle gezielten Fixtures in den ersten Zeilen.
 */
export const E2E_LAST_PRAEFIX = "ZZZ E2E Last";
/** Deutlich ueber 150, damit die Schwelle nicht knapp erreicht wird. */
export const E2E_LAST_ANZAHL = 200;

/**
 * DRK-372 — der ueberlange Kommentar, an dem `lagerbuch-zellentext.spec.ts` die
 * Deckelung misst.
 *
 * ⚠️ ER STEHT HIER UND NICHT IM SEED, aus demselben Grund wie alles andere in
 * dieser Datei: der Spec sichert zu, dass die Zelle SCHMALER ist als ihr Satz.
 * Liefen Seed und Zusicherung auseinander, fiele der Test nicht auf — er faende
 * seine Zeile nicht und meldete das als Anzeigefehler.
 *
 * ⚠️ UND ER MUSS LANG BLEIBEN. Kuerzt ihn jemand auf einen Halbsatz, passt er
 * ohne Deckel in die Spalte, und die Messung ist still trivial wahr.
 */
export const E2E_ZELLENTEXT_ARTIKEL = "E2E Zellentext Warnweste";
export const E2E_ZELLENTEXT_KOMMENTAR =
  "Bei der Uebergabe faellt auf, dass die Sendung aus zwei Teillieferungen "
  + "besteht; die zweite traegt einen abweichenden Lieferschein, der dem "
  + "Vorgang lose beilag und im Ordner Wareneingang abgeheftet wurde.";
