"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../_db/client";
import { bucheAusleihe, bucheRueckgabe, sucheEntleiher } from "../_db/leihen";
import type { Vorschlag } from "../_db/leihen";
import { AUSWAHL_PARAMETER, auswahlLesen } from "../_lib/auswahl";
import { requireAusleihSchreibend } from "../_lib/ausleihZugang";
import { ausleihText, rueckgabeText } from "../_lib/meldungen";
import type { AusleihErgebnis, RueckgabeErgebnis } from "../_lib/meldungen";

/**
 * DIE VIER SERVER ACTIONS DER AUSLEIHFLAECHE (Spec 1 §4.3 und §4.4,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3417-3592`).
 *
 * ⛔ `"use server";` STEHT IN ZEILE 1, OHNE PFADKOMMENTAR DAVOR. Der Scan in
 * `_actions/guards.test.ts:713-717` liest `trimStart().split("\n")[0]` — ein Pfadkommentar
 * davor faerbt ihn rot, und der naheliegende „Fix", ihn auf fuehrende Kommentare
 * aufzuweichen, ist der falsche. Fuer TESTdateien lautet die Hausform umgekehrt.
 *
 * ⛔ DIE ZWEI ERGEBNISTYPEN WERDEN RE-EXPORTIERT UND HIER NICHT DEKLARIERT
 * (Entscheidung E11, `.superpowers/sdd/planteil3/briefs/KOPF.md:649-671`). Spec:3446-3455
 * und Spec:3566-3568 schreiben sie in DIESE Datei; das ergaebe einen Zyklus, sobald man
 * beide Seiten aufschreibt: `_db/leihen.ts#bucheAusleihe` GIBT `AusleihErgebnis` zurueck
 * (`_db/leihen.ts:470`) und diese Datei IMPORTIERT `bucheAusleihe`. Ihr Wortlaut steht
 * einmal, in `_lib/meldungen.ts:217-224`.
 *
 * ⛔ B12 (Spec:101): die DATENFUNKTION heisst `sucheEntleiher` (`_db/leihen.ts:342`), die
 * SERVER ACTION `entleiherVorschlaege`. Diese Datei importiert die eine und exportiert die
 * andere — gleiche Namen kollidierten in derselben Datei.
 *
 * ⛔ ALLE VIER RUFEN `requireAusleihSchreibend(getDb())` ALS ERSTE ANWEISUNG, und alle vier
 * PRUEFEN das Ergebnis (§4.2.1, Spec:3405-3406). Der Aufruf ohne Pruefung ist typkorrekt,
 * lint-sauber und OEFFNET DIE ACTION FUER JEDEN (Spec:2780-2784,
 * Bauform-Zulaessigkeitstafel Zeile 10). `_actions/guards.test.ts:549-697` prueft beides.
 * ⚠️ AUCH DIE ZWEI LESENDEN (`entleiherVorschlaege`, `listeAktualisieren`): die
 * Ausnahmeliste des Scans hat GENAU DREI Eintraege (`_actions/guards.test.ts:56-60`), und
 * ein VIERTER waere ein roter Test.
 *
 * ⛔ DER HOST-RIEGEL WIRD HIER NICHT ZUSAETZLICH GERUFEN. `requireAusleihSchreibend` ruft
 * ihn intern als erste Anweisung (`_lib/ausleihZugang.ts:120`, NS-Z1, §4.2.1
 * Spec:3408-3413); ein zweiter Aufruf behauptete, das Praedikat sei host-blind, und die
 * naechste Person entfernte dann den falschen der beiden.
 *
 * ⛔ DIE RATENBEGRENZUNG DIESER VIER ACTIONS IST NICHT GEBAUT. Zusage §4.12 Nr. 4
 * (Spec:4074-4076) nennt sie als VORAUSSETZUNG und setzt sie nicht um; sie steht mit
 * Eigentuemer in „Was Planteil 3 NICHT liefert". Diese Zeile steht hier, damit kein
 * Kommentar dieser Datei das Gegenteil behauptet.
 *
 * ⚠️ DIE DREI FELDNAMEN SIND MODULPRIVAT UND KOENNEN ES NICHT ANDERS SEIN: `EXPORT_FORM`
 * (`_actions/guards.test.ts:122`) laesst unter `_actions/` ausschliesslich
 * `export [async] function`, `export type` und `export interface` zu — ein
 * `export const FELD_… = "…"` waere ein roter Test, und der Grund dafuer ist gemessen
 * (`_actions/guards.test.ts:106-114`). ⬜ AUFLAGE AN A19 UND A20: dieselben Namen
 * verwenden; `geraete` kommt fuer beide Seiten aus `AUSWAHL_PARAMETER`
 * (`_lib/auswahl.ts:61`), damit wenigstens der eine Name nur einmal existiert.
 * `ausleiheId` und `zustandsnotiz` stehen woertlich in Spec:3572; `entleiher` ist eine
 * Bau-Entscheidung dieser Aufgabe und traegt den Namen des Feldes in `AusleihEingabe`
 * (`_db/leihen.ts:162`).
 */
export type { AusleihErgebnis, RueckgabeErgebnis };

const FELD_ENTLEIHER = "entleiher";
const FELD_AUSLEIHE_ID = "ausleiheId";
const FELD_ZUSTANDSNOTIZ = "zustandsnotiz";

/**
 * DIE MEHRFACH-AUSLEIHE — EINE Transaktion ueber alle gewaehlten Geraete (§4.3.2,
 * Spec:3435-3448).
 *
 * ⛔ DIE `useActionState`-SIGNATUR IST BINDEND (Spec:3452-3455). Der erste Parameter ist der
 * VORHERIGE Zustand und wird nicht gelesen. Faellt er weg, uebergibt React zur Laufzeit
 * trotzdem beide Argumente: `formular` bekaeme den VORZUSTAND, die Auswahl waere IMMER leer,
 * und jeder Vorgang endete als `keine-auswahl` — `pnpm build` sieht das nicht (dieselbe Falle
 * wie bei `einloesenAmGate`, `_actions/gate.ts:35-40`).
 * ⚠️ WAS DIESE DATEI DAGEGEN HAT, IST GEMESSEN UND NICHT DAS, WAS DER PLAN ERWARTETE: die
 * Sonde S-A17d (`_vorher` entfernt) macht `pnpm typecheck` ROT — 13 Fehler `TS2554`, weil
 * `_actions/ausleihe.test.ts` mit zwei Argumenten ruft — und zusaetzlich sieben Faelle rot.
 * Der Brief sagte „typecheck gruen, Test rot"; gruen bliebe `typecheck` nur ohne einen
 * zweiargumentigen Aufrufer im Baum.
 *
 * ⛔ RUECKGABEWERT STATT WURF (Spec:3458-3459): ein Wurf aus einer Server Action erreicht
 * die Flaeche als generischer Fehler und verliert genau die Auskunft, die der Mensch
 * braucht — „Ruf 41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts
 * gebucht." Die Saetze stehen in `_lib/meldungen.ts:331-362`, nie hier.
 *
 * ⚠️ `getDb()` WIRD ZWEIMAL GERUFEN, UND ZWAR ABSICHTLICH. Ein vorgezogenes
 * `const db = getDb();` schoebe den Riegel auf Platz zwei und faerbte
 * `_actions/guards.test.ts:597-609` rot — dieselbe Form, in der `_actions/gate.ts:55-61`
 * das vorgezogene `const kopf = await headers()` verbietet. Der zweite Aufruf ist derselbe
 * Handle: `getModuleDb` gibt aus einem Cache je Modulschluessel zurueck
 * (`src/core/db/index.ts:31-35`).
 */
export async function ausleiheAnlegen(
  _vorher: AusleihErgebnis | null,
  formular: FormData,
): Promise<AusleihErgebnis> {
  const schreibend = await requireAusleihSchreibend(getDb());
  if (!schreibend.ok) {
    /*
     * ⛔ ENTSCHEIDUNG E13 (`.superpowers/sdd/planteil3/briefs/KOPF.md:732-778`): der `grund`
     * geht UNVERAENDERT an das Formular. ⛔ NICHT auf `"unbekannt"` einfalten — daran haengt
     * Zusage §3.10 Nr. 8 (Spec:3235-3236): die Inline-Erneuerung wird NUR bei
     * `grund === "sitzung"` angeboten, NIE bei `"gesperrt"`, weil derselbe Code dort genauso
     * scheitert. Ohne die Unterscheidung erschiene sie nie oder immer.
     *
     * ⛔ `betroffen` IST HIER DIE LEERE LISTE (`KOPF.md:774-775`): es gibt kein betroffenes
     * Geraet, der Vorgang ist am Riegel gescheitert.
     */
    return {
      ok: false,
      grund: schreibend.grund,
      text: ausleihText({ grund: schreibend.grund }),
      betroffen: [],
    };
  }

  /*
   * ⛔ DER DECKEL 20 HAT GENAU EINEN EIGENTUEMER: `AUSWAHL_MAX` (`_lib/auswahl.ts:53`),
   * durchgesetzt in `normalisiereIds` (`_lib/auswahl.ts:76-85`). Hier steht KEINE zweite
   * Zahl daneben — zwei Zahlen fuer dieselbe Grenze laufen beim ersten Aendern auseinander.
   * `auswahlLesen` wirft nie (`_lib/auswahl.ts:91-93`): der Wert ist Nutzereingabe.
   */
  const geraeteIds = auswahlLesen(String(formular.get(AUSWAHL_PARAMETER) ?? ""));

  /*
   * ⛔ DER NAME WIRD UNVERAENDERT DURCHGEREICHT (Spec:3587-3592, §4.12 Nr. 9 Spec:4095):
   * `sanitizeForDisplay` wandert NICHT mit (`ConfirmLoanButton.tsx:52`), und auch ein
   * `trim()` waere eine dauerhafte Veraenderung der gespeicherten Zeichenkette — bei
   * „Mueller & Sohn" ein Datenschaden, kein Schutz. Geprueft wird auf NICHTLEERE, und zwar
   * in `bucheAusleihe` (`_db/leihen.ts:474`): „Der Server prueft erneut — eine Regel, die
   * nur im Client steht, ist keine Regel" (Spec:3583-3585).
   *
   * ⬜ A-L17 — EINE LAENGENGRENZE FUER DEN ENTLEIHERNAMEN GIBT ES WEITERHIN NICHT, und sie
   * faellt auch hier NICHT. Der Alt-Bestand klemmt bei 100 (`BORROWER_NAME_MAX` in
   * `radio-admin/shared/src/loan.ts:5`, ausgeschrieben an `_db/leihen.ts:147-161`). Das
   * Ledger weist den Posten dieser Aufgabe zu, mit dem Hinweis, auf FORMULAREBENE gebe es
   * Feldfehler ohne `grund`. ⛔ EINE SERVER ACTION HAT DIESE EBENE NICHT: ihr einziger
   * Fehlerkanal ist `AusleihErgebnis`, dessen `grund`-Union keinen Zweig fuer „zu lang"
   * traegt (`_lib/meldungen.ts:157-166`), `kein-name` waere der falsche Satz, und einen
   * achten `grund` verbietet Entscheidung E13 — sie setzt die Vollzaehligkeitszahlen auf
   * SIEBEN und SECHS fest (`KOPF.md:775-778`). ⬜ EIGENTUEMER IST DAMIT A19: das Namensfeld
   * traegt die Grenze als `maxLength` plus einen Feldfehler neben dem Feld, so wie A20 es
   * fuer die Zustandsnotiz tut. ⚠️ DER PREIS BLEIBT BENANNT: dies ist der einzige ANONYME
   * Schreibpfad des Moduls — bis dahin landet ein beliebig langer Name ungekuerzt in
   * `loans.borrower_name`.
   */
  const entleiher = String(formular.get(FELD_ENTLEIHER) ?? "");

  /*
   * ⛔ AUFLAGE 9 — DIE HERKUNFT DES ZUGANGS (Spec:2159-2164): `zugang.codeId` bei
   * `weg: "code"`, `null` bei `weg: "suite"`. ⛔ OHNE DIESE ZEILE SCHREIBT NIEMAND DIE
   * SPALTE `loans.zugangscode_id` — sie bliebe dauerhaft leer, und das Loeschverbot aus
   * §3.2.4 (Spec:2218-2220, „Beides oder nichts") verloere die Haelfte, die ihm Wirkung
   * gibt. Ueber sie loest die Historienanzeige aus Planteil 4 die `bezeichnung` auf.
   */
  const ergebnis = bucheAusleihe(getDb(), {
    geraeteIds,
    entleiher,
    zugangscodeId: schreibend.zugang.weg === "code" ? schreibend.zugang.codeId : null,
  });
  if (!ergebnis.ok) return ergebnis;

  /*
   * ⛔ BEIDES, NICHT EINES VON BEIDEN (`.superpowers/sdd/planteil3/VORABSCAN-A.md:415-424`,
   * Fund F26): `export const dynamic = "force-dynamic"` (A18-A20, Spec:3827)
   * verhindert, dass die SERVERANTWORT vorgerendert ist; `revalidatePath` entwertet
   * zusaetzlich den ROUTER-CACHE DES CLIENTS, den der `redirect` unmittelbar danach
   * benutzt. Ein spaeterer Leser streicht sonst den, den er fuer ueberfluessig haelt.
   *
   * ⛔ `/geraete` UND NICHT `/` (Entscheidung E1, `KOPF.md:416-455`): Spec:3429 schreibt
   * `revalidatePath` auf `/` und `redirect("/?gebucht=2")` — `/` ist in dieser Suite aber
   * das GATE, und die Uebersicht liegt an `/geraete`. Zwei Dateien auf demselben Pfad
   * lehnt Next beim Build ab, und ein Riegel-Layout ueber `/` liefe in einen endlosen
   * Redirect.
   *
   * ⚠️ `redirect()` NICHT in einem `try`/`catch` — es arbeitet ueber einen geworfenen
   * Sentinel, ein `catch` verschluckt ihn und die Weiterleitung findet still nicht statt
   * (Bauform-Zulaessigkeitstafel Zeile 6, `KOPF.md:347`). ⚠️ Die Tafel spricht die Warnung
   * nur fuer `page.tsx`/`layout.tsx` aus; sie gilt fuer eine Server Action genauso
   * (`VORABSCAN-A.md:140`, Fund F20c), und deshalb steht sie hier.
   */
  revalidatePath("/geraete");
  revalidatePath("/rueckgabe");
  redirect(`/geraete?gebucht=${ergebnis.anzahl}`);
}

/**
 * DIE RUECKGABE MIT ZUSTANDSNOTIZ (§4.4, Spec:3554-3574).
 *
 * ⛔ SIE LEITET NICHT UM, und das ist eine Entscheidung mit Grund: Spec:3562 laesst die
 * Erfolgszeile die SEITE rendern, und der Dialog aus A20 zeigt `rufname` aus dem
 * Rueckgabewert. Ein `redirect()` verwuerfe ihn — samt der getippten Notiz, die bei
 * `ok: false` ausdruecklich STEHEN BLEIBEN soll (`ReturnDialog.tsx:66-73`, Feinheit 1 in
 * `.superpowers/sdd/planteil3/briefs/A20.md:35-38`). Der Wert `gebucht=<n>` aus §4.3 hat
 * hier ausserdem keine Entsprechung: es geht um EINE Ausleihe.
 *
 * ⛔ DIE ZEICHENGRENZE HAT GENAU EINEN EIGENTUEMER: `ZUSTANDSNOTIZ_MAX`
 * (`_lib/meldungen.ts:88`), geprueft in `bucheRueckgabe` (`_db/leihen.ts:599-601`). Hier
 * steht KEINE zweite Zahl und KEINE Kuerzung — eine Kuerzung liesse die Rueckgabe gelingen,
 * wo sie abgelehnt gehoert, und das `maxLength` am Feld (A20) ist eine Bequemlichkeit,
 * keine Zusage (Spec:3583-3585).
 */
export async function rueckgabeBuchen(
  _vorher: RueckgabeErgebnis | null,
  formular: FormData,
): Promise<RueckgabeErgebnis> {
  const schreibend = await requireAusleihSchreibend(getDb());
  if (!schreibend.ok) {
    // Entscheidung E13, dieselbe Durchreiche wie oben — der `grund` bleibt unveraendert.
    return {
      ok: false,
      grund: schreibend.grund,
      text: rueckgabeText({ grund: schreibend.grund }),
    };
  }

  const ausleiheId = String(formular.get(FELD_AUSLEIHE_ID) ?? "");

  /*
   * ⚠️ DIE EINZIGE UMFORMUNG AUF DEM WEG IN DIE DATENBANK, und sie ist keine Bereinigung:
   * ein nicht ausgefuelltes optionales Feld (Spec:3560, „Optional: Zustandsnotiz
   * hinterlassen") schickt `""`. Als `""` gespeichert waere es spaeter von einer abgegebenen
   * leeren Notiz nicht zu unterscheiden, und `_db/schema.ts` fuehrt die Spalte nullable.
   * ⛔ KEIN `trim()`, KEIN `sanitizeForDisplay` (Spec:3587-3592, `ReturnDialog.tsx:58`).
   */
  const roh = formular.get(FELD_ZUSTANDSNOTIZ);
  const notiz = typeof roh === "string" && roh.length > 0 ? roh : null;

  const ergebnis = bucheRueckgabe(getDb(), ausleiheId, notiz);
  if (!ergebnis.ok) return ergebnis;

  // Beide Flaechen, aus demselben Grund wie oben (Spec:3562; `/` → `/geraete` nach E1): ein
  // zurueckgegebenes Geraet steht auf der Uebersicht wieder frei.
  revalidatePath("/geraete");
  revalidatePath("/rueckgabe");
  return ergebnis;
}

/**
 * DIE ENTLEIHER-VORSCHLAEGE (§4.3.4, Spec:3490-3512).
 *
 * ⛔ EINE SERVER ACTION UND KEIN ROUTE HANDLER (Spec:3514-3516): ein zweiter anonymer
 * GET-Endpunkt braeuchte seine eigene Ratenbegrenzung, und der Suchtext stuende in JEDER
 * Zugriffszeile des Proxys.
 *
 * ⛔ ZWEI SCHWELLEN, BEIDE MIT GENAU EINEM EIGENTUEMER, UND KEINE DAVON HIER:
 * `VORSCHLAG_MIN_ZEICHEN = 2` (`_db/leihen.ts:178`) und der Deckel `10` als Vorgabewert an
 * `sucheEntleiher` (`_db/leihen.ts:342`, Spec:4084). ⛔ HIER STEHT KEINE DRITTE ZAHL —
 * zwei Zahlen fuer dieselbe Grenze laufen auseinander, und der Testname „liefert
 * HOECHSTENS zehn" ist eine Obergrenze, unter der ein zweiter, kleinerer Deckel unsichtbar
 * bliebe.
 *
 * ⛔ DIE ANTWORT TRAEGT NUR `{ name, zuletztText }` — kein Geraet, keine Millisekunden,
 * keine ID (Spec:3506-3512). ⚠️ `zuletztText`, NICHT `zuletzt`: Spec:3511 schreibt
 * `zuletzt`, wird aber im selben Kapitel ueberholt (Spec:4084-4085, `:5035`) — eine
 * FERTIGE Zeichenkette, kein Zeitstempel.
 *
 * ⚠️ DIE DATENSCHUTZ-ENTSCHEIDUNG IST AUSGESCHRIEBEN UND BLEIBT SO (Spec:3505-3512): wer
 * den Code hat, sieht auf der Uebersicht ohnehin JEDEN aktiven Entleihernamen samt Uhrzeit
 * — die Vorschlaege erweitern das um vergangene Namen, keine neue Klasse.
 */
export async function entleiherVorschlaege(suchtext: string): Promise<Vorschlag[]> {
  const schreibend = await requireAusleihSchreibend(getDb());
  // Bei `{ ok: false }` eine LEERE LISTE, kein Wurf: der Aufrufer ist ein Eingabefeld
  // (A19), und ein Wurf machte daraus einen Fehlerzustand mitten im Tippen.
  if (!schreibend.ok) return [];
  return sucheEntleiher(getDb(), suchtext);
}

/**
 * DER AKTUALISIEREN-KNOPF DER UEBERSICHT (§4.7, Spec:3814-3818).
 *
 * Er bleibt (`DeviceList.tsx:132-140`), denn ohne TanStack Query gibt es kein
 * Hintergrund-Refetch mehr. Aus dem Knopf wird ein `<form action={…}>` mit `useFormStatus`
 * (A18) — ⛔ kein `useState`-Fehlerkasten mit Fuenf-Sekunden-Selbstschluss mehr
 * (`DeviceList.tsx:19`, `:35-49`, `:143-165`): ein fehlgeschlagenes Neuladen ist genau der
 * Fall, den man nicht nach fuenf Sekunden verstecken sollte.
 *
 * ⚠️ NUR `/geraete`, UND DAS IST EINE ENTSCHEIDUNG DIESER AUFGABE: der Knopf steht auf der
 * Uebersicht, und eine Entwertung von `/rueckgabe` waere eine Wirkung ohne Aufrufer. Die
 * zwei SCHREIBENDEN Actions oben entwerten beide Flaechen, weil sie beide veraendern.
 *
 * ⛔ AUCH SIE RUFT DEN RIEGEL, obwohl sie nur liest: die Ausnahmeliste des Guard-Scans hat
 * GENAU DREI Eintraege (`_actions/guards.test.ts:56-60`, Spec:6762 plus Entscheidung E12),
 * und ein VIERTER waere ein roter Test. Bei `{ ok: false }` tut sie NICHTS.
 */
export async function listeAktualisieren(): Promise<void> {
  const schreibend = await requireAusleihSchreibend(getDb());
  if (!schreibend.ok) return;
  revalidatePath("/geraete");
}
