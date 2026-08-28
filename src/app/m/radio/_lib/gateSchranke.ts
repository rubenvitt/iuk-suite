import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";

/**
 * DIE GATE-SCHRANKE DES MODULS `radio` — drei Zaehler, und sie zaehlen NUR
 * Fehlversuche (Spec 1 §3.7.2, `docs/superpowers/specs/2026-08-17-radio-modul-design.md`
 * :2996-3035).
 *
 * KEIN "use client" in dieser Datei — Falle 6 (`CLAUDE.md`): ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an, sondern als Client-Referenz,
 * HTTP 500 fuer die ganze Seite. `pnpm build` sieht es nicht, und Vitest KANN es
 * strukturell nicht sehen. Durchgesetzt von `src/app/m/radio/riegel.test.ts:909-962`.
 *
 * ⛔ UND KEIN DATENBANKZUGRIFF, IN KEINER FORM — weder ein Import noch ein Aufruf.
 * `gateGesperrt` ist die Vorpruefung, die den Datenbankzugriff des Einloeseweges
 * DECKELT; naehme sie selbst einen vor, deckelte sie genau das, was sie ist. Die
 * naheliegende „Verbesserung" waere, die Sperre in einer Tabelle zu fuehren, damit sie
 * einen Neustart ueberlebt — sie ist deshalb hier ausdruecklich verboten und von einem
 * Quelltext-Scan bewacht (`_lib/gateSchranke.test.ts`, Fall „gateGesperrt macht keinen
 * Datenbankzugriff — Quelltext-Scan"). Der Preis steht in
 * `src/core/ratelimit.ts:6-10`: die Treffer liegen im Prozessspeicher und sind nach
 * einem Neustart weg. Fuer eine Notbremse ist das tragbar.
 *
 * ⛔ DIE ABWEHR SIND DIE ZWEI MODULWEITEN ZAEHLER, NICHT DER ABSENDER-EIMER. Woertlich
 * aus dem Bestand (`src/app/m/lagerbuch/_lib/absender.ts:30-33`): „Der Per-Absender-
 * Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und ungezieltes Klopfen
 * — NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden modulweiten Zaehler in
 * `gateSchranke.ts`, weil ihr Schluessel der einzige ist, den niemand rotieren kann."
 *
 * ⬜ A-L12 — OB `cf-connecting-ip` AUF EINEM MODUL-HOST HEUTE DIE CLIENT-ADRESSE TRAEGT,
 * IST UNBESTIMMT. Der Befund vom 2026-08-22 sagt nein: dort liefert der Kopf bei jeder
 * Anfrage die Egress-Adresse dieses Servers, weil der Modul-Host-Rewrite einen zweiten,
 * externen Round-Trip erzeugt (`src/core/ratelimit.ts:98-111`). Der Umbau dagegen ist
 * gebaut (`src/core/routing.ts:59-61`: „Seit `src/proxy.ts` das Rewrite-Ziel auf die
 * Origin der Anfrage zurueckschreibt, entfaellt der zweite, externe Round-Trip"). Die
 * Abnahme am Server steht aus
 * (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:29-32`: „⛔ Es ist
 * NICHT belegt, dass der Befund behoben ist … Belegt ist die Reparatur erst mit P6" —
 * P1 und P6 sind offen).
 *
 * ⛔ DIESE DATEI SETZT KEINE DER BEIDEN ANTWORTEN VORAUS, und sie muss es nicht: der
 * Absender-Eimer ist so oder so nur die Bequemlichkeitsgrenze, und die beiden
 * modulweiten Zaehler haengen an Modulkonstanten, die keine Antwort auf A-L12 aendert.
 * Kollabiert der Absenderschluessel, sind sie die einzige Schranke; kollabiert er nicht,
 * sind sie die Kappe gegen Rotation. Beide Male tragen sie.
 *
 * ⬜ A-L6 — eine Abhilfe fuer den Egress-IP-Kollaps ist als Bauplan beschrieben, NICHT
 * gebaut: `.superpowers/sdd/VORARBEIT-selfhop.md`; sie hat selbst zwei offene
 * Leerstellen (⬜ L1: wie die eigene Egress-IP zur Laufzeit erkannt wird; ⬜ L2: welche
 * internen Hops es wirklich gibt). Diese Datei setzt NICHT voraus, dass sie kommt.
 *
 * ⛔ UND SIE BRAUCHT KEINE ZWISCHENSCHICHT (Spec:3033-3035): `radio` ruft
 * `clientIpAus(kopf)` (`src/core/ratelimit.ts:113-116`) unmittelbar an der Aufrufstelle
 * und reicht das Ergebnis als `absender` herein. `lagerbuch`s `_lib/absender.ts` wird
 * hier NICHT nachgebaut.
 *
 * ⚠️ `grenzen()` STEHT HIER AUF MODULEBENE, UND DAS IST ZULAESSIG: alle vier Zahlen
 * haben eine Vorbelegung (`./grenzen.ts:76-91`, 12/5/30/300), `grenzen()` laeuft also
 * auf einer leeren Umgebung klaglos durch (`./grenzen.ts:140`: ein fehlender oder leerer
 * Wert faellt auf `regel.vorgabe` zurueck) — genau das braucht `next build`, das mit
 * NODE_ENV=production und OHNE .env laeuft. Ein GESETZTER ungueltiger Wert bricht
 * dagegen schon den Import ab, und das ist gewollt: ein Modul, das mit einer kaputten
 * Zahl gar nicht erst startet, ist richtiger als eines, das still eine andere Grenze
 * faehrt als die, die in der .env steht (`./grenzen.ts:132-135`).
 *
 * ⚠️ AUSDRUECKLICH NICHT auf Modulebene gelesen wird das Sitzungsgeheimnis: es ist
 * Pflicht OHNE Vorgabe und braeche `next build` (`./grenzen.ts:212-220`).
 *
 * FOLGE, die man kennen muss (Spec:3029-3031): die drei Grenzen sind ab dem ersten
 * Import EINGEFROREN. Eine geaenderte .env wirkt erst nach einem Neustart. Das ist
 * inhaerent — die Zaehler sind Singletons und muessen es sein, sonst zaehlte jeder
 * Aufruf in einen frischen Eimer.
 */
const g = grenzen();

/**
 * Je Absender und Minute, Vorgabe 5 (Spec:3006).
 * Env: RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN (`./grenzen.ts:82`).
 *
 * ⚠️ DIE BEQUEMLICHKEITSGRENZE, NICHT DIE ABWEHR — gegen Tippfehler und ungezieltes
 * Klopfen. Der Schluessel ist rotierbar (und auf einem Modul-Host moeglicherweise fuer
 * alle derselbe, ⬜ A-L12 im Kopfkommentar); was er allein deckelt, deckelt er nur fuer
 * den, der nicht rotiert.
 */
const proAbsender = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });

/**
 * Modulweit ueber die Minute, gegen Rotation des Absenderschluessels — die BURST-Kappe,
 * nicht die eigentliche Abwehr (das ist `gateStunde`).
 * 30 = sechs Absender-Budgets (Spec:3007).
 * Env: RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN, Vorgabe 30 (`./grenzen.ts:86`).
 *
 * WARUM EINE MODULWEITE MINUTENSPERRE VERTRETBAR IST, obwohl sie alle trifft: sie kann
 * nur Fehleingaben verzoegern. Der Budgetverbrauch liegt HINTER der Codepruefung — ein
 * RICHTIGER Code wird eingeloest, auch waehrend die Sperre laeuft (§3.7.3,
 * Spec:3037-3054). Der Sprengradius ist damit genau: „wer sich vertippt, wartet bis zu
 * eine Minute".
 */
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });

/**
 * Modulweit ueber die Stunde — DER tragende Zaehler (Spec:3008-3009).
 * 300 = 5/min x 60. Die Zahl ist nicht gegriffen: sie stellt genau die Zusage WIEDER
 * HER, die das Per-Absender-Limit nur unter der Annahme einer wahrhaftigen
 * Absenderadresse je hatte. Der schlimmste Fall nach dieser Spec (unbegrenzte Rotation)
 * ist damit nicht schlechter als der beste Fall unter jener Annahme (ein Absender).
 * Env: RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE, Vorgabe 300 (`./grenzen.ts:91`).
 */
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — der Speicher, ohne den `gateGesperrt` gar nicht geht.
 * Schluessel → Zeitpunkt in ms, bis zu dem dieser Eimer als erschoepft gilt.
 *
 * `RateLimiter.check()` prueft und BUCHT in einem Zug (`src/core/ratelimit.ts:26-37`);
 * ein reines Nachsehen gibt es dort nicht. Deshalb merkt sich diese Datei jedes `false`
 * selbst, und `gateGesperrt` liest nur noch diese Zahl — ohne zu buchen.
 *
 * ⚠️ Wuerde erst NACH der Codepruefung gebucht und dabei nur die MELDUNG umgeschaltet,
 * liefe die Codepruefung selbst unbegrenzt weiter — der Deckel aenderte dann die
 * Fehlermeldung und nicht den Angriff.
 */
const gesperrtBis = new Map<string, number>();

/**
 * Die beiden modulweiten Schluessel sind Konstanten DIESER Datei und gehen keinen
 * Aufrufer etwas an — deshalb nimmt keine der beiden Funktionen sie entgegen
 * (`src/app/m/lagerbuch/_lib/gateSchranke.ts:69-73`). Genau darin liegt die Abwehr: ein
 * Schluessel, den kein Angreifer setzt, ist einer, den er nicht rotieren kann.
 */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";

function restMs(schluessel: string, jetzt: number): number {
  const bis = gesperrtBis.get(schluessel);
  if (bis === undefined) return 0;
  if (bis <= jetzt) { gesperrtBis.delete(schluessel); return 0; }   // laeuft von selbst ab
  return bis - jetzt;
}

/**
 * SCHRITT 2 der Reihenfolge aus §3.3.1. LIEST NUR — bucht nichts und oeffnet nichts.
 *
 * Rueckgabe: die verbleibenden SEKUNDEN, aufgerundet und MINDESTENS 1, wenn einer der
 * drei Eimer gesperrt ist; sonst `null`. NIE 0 (Spec:3020-3021): ein
 * `if (gateGesperrt(…))` waere sonst in der letzten Sekunde still falsch. Die Aufrufer
 * (A9, A10, A11) pruefen trotzdem ausdruecklich gegen `null` — die Zusage steht im Typ,
 * nicht in der Wahrheitswertumwandlung.
 *
 * ⚠️ WO „NIE 0" WIRKLICH HAENGT — im Waechter `ms > 0`, NICHT im `Math.max(1, …)`-Mantel
 * eine Zeile weiter unten. `ms` ist eine ganzzahlige Millisekundendifferenz (`restMs`
 * rechnet zwei `Date.now()`-Werte gegeneinander, `:134-139`) und durch diesen Waechter
 * mindestens 1; `Math.ceil(1 / 1000)` ist bereits 1. Der Mantel ist damit HEUTE
 * unerreichbar — gemessen (Fund K2 aus `REVIEW-A3.md`: ohne ihn bleiben alle Faelle
 * gruen, mit `Math.floor` statt `Math.ceil` wird „gateGesperrt liefert nie 0" rot). Er
 * bleibt trotzdem stehen: er ist Bauform 1:1 aus dem Vorbild
 * (`src/app/m/lagerbuch/_lib/gateSchranke.ts:109`) und die Rueckfallsicherung fuer den
 * Tag, an dem `ms` aus einer nicht-ganzzahligen Quelle kaeme. Wer die Zusage „nie 0"
 * aendern will, aendert den Waechter, nicht den Mantel.
 *
 * Zurueck kommt die GROESSTE der drei Restzeiten: wer den Stundendeckel gerissen hat,
 * soll nicht „noch 12 Sekunden" lesen. Diese Zahl ist das *n* aus dem Text zu
 * `grund=zuviele` (A5).
 *
 * ⚠️ UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT, nicht der Absender-Eimer
 * (Spec:3013-3019): wer den Absenderschluessel rotiert, startet jeden Versuch mit LEEREM
 * Absender-Eimer und bekaeme so oder so genau einen Lookup. Gedeckelt wird das
 * ausschliesslich durch `gateMinute` und `gateStunde` — und die lesen ihre Sperrzeit
 * hier, VOR jedem Lookup.
 */
export function gateGesperrt(absender: string): number | null {
  const jetzt = Date.now();
  const ms = Math.max(restMs(absender, jetzt),
                      restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — NIE ein Erfolg (§3.7.3, Spec:3037-3054).
 * Genau das macht den modulweiten Deckel vertretbar: wuerden Erfolge mitzaehlen, waere
 * ein modulweites Limit ein Ausfall der Ausgabe. So ist der Sprengradius scharf
 * umrissen — ein richtiger Code funktioniert immer, auch waehrend eines Angriffs und
 * auch waehrend laufender Sperre; wer sich vertippt, wird vertroestet.
 *
 * ⛔ FUER `radio` IST DAS KEIN RANDFALL, SONDERN DER REGELFALL: ein Funkraum voller
 * Personen, die denselben Aufsteller nacheinander scannen, teilt sich einen Uplink und
 * damit einen Absenderschluessel. Genau dieser Fehler ist in dieser Suite bereits
 * produktiv eingetreten (`feedback`, 15 Ehrenamtliche aus einem Vereins-WLAN;
 * `src/app/m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus).
 * Es gibt hier deshalb KEINEN Erfolgsweg und keine Ruecksetzfunktion — nur diese eine
 * schreibende Funktion.
 *
 * DIE KETTE IST KURZSCHLIESSEND — und zwar an JEDER Stufe (Absender, Minute, Stunde)
 * gegen dieselbe FESTE Deadline, die auch `gateGesperrt` liest (`restMs`/`gesperrtBis`),
 * NIE gegen den Rueckgabewert von `RateLimiter.check()` allein (Spec:3022-3028). Der
 * Unterschied ist keine Kosmetik: `check()` ist ein GLEITENDES Fenster
 * (`src/core/ratelimit.ts:26-37`). Liegt der AELTESTE der Treffer, die zu einer Sperre
 * fuehrten, VOR dem Treffer, der sie AUSGELOEST hat (das ist der Normalfall bei mehr als
 * einem Treffer), oeffnet das gleitende Fenster FRUEHER als die feste Deadline ablaeuft.
 * Fragte der Kurzschluss in dieser Luecke erneut nur `check()`, bekaeme er „erlaubt"
 * zurueck — waehrend `gateGesperrt` fuer denselben Schluessel weiterhin „gesperrt"
 * meldet — und liesse den Fehlversuch bis zur naechsten Stufe durchfallen. Genau dort
 * wuerde ein laengst gesperrter Absender das naechste Budget mitverbrauchen: ein
 * einzelner, bereits gesperrter Klopfer legte die Ausgabe fuer alle lahm (bei der
 * Minutenbremse sogar fuer eine ganze STUNDE, nicht nur eine Minute). Deshalb fragt jede
 * Stufe ZUERST ihre eigene feste Deadline; nur wenn die frei ist, befragt sie ihren
 * `RateLimiter`.
 *
 * ⚠️ DERSELBE KURZSCHLUSS VERHINDERT DIE SELBSTVERLAENGERNDE SPERRE: ohne ihn schoebe
 * jeder weitere Klopfer die Deadline nach vorn, und die Sperre endete nie.
 *
 * Jedes `false` schreibt die FENSTERLAENGE als Sperrzeit fort — bewusst konservativ: es
 * laeuft dann die Sperre ab, nicht der gleitende Eimer.
 */
export function gateFehlversuchBuchen(absender: string): void {
  const jetzt = Date.now();

  if (restMs(absender, jetzt) > 0) return;
  if (!proAbsender.check(absender)) { gesperrtBis.set(absender, jetzt + 60_000); return; }

  if (restMs(MODULWEIT_MIN, jetzt) > 0) return;
  if (!gateMinute.check(MODULWEIT_MIN)) { gesperrtBis.set(MODULWEIT_MIN, jetzt + 60_000); return; }

  if (restMs(MODULWEIT_STD, jetzt) > 0) return;
  if (!gateStunde.check(MODULWEIT_STD)) { gesperrtBis.set(MODULWEIT_STD, jetzt + 3_600_000); }
}

/*
 * ⬜ EIN OFFENER POSTEN, UND ER STEHT HIER, DAMIT MAN IHN WIEDERFINDET (Fund K3 aus
 * `.superpowers/sdd/planteil3/REVIEW-A3.md`, in Fix-Runde 1 mit Begruendung verworfen).
 *
 * DIE SACHE: die drei Sperrdauern, die `gateFehlversuchBuchen` fortschreibt, wiederholen
 * die `windowMs` der drei Zaehler als LITERALE ZAHL — `:219` gegen `:85`, `:222` gegen
 * `:99`, `:225` gegen `:109`. Die Kopplung ist gewollt („jedes `false` schreibt die
 * FENSTERLAENGE als Sperrzeit fort", `:212-213`), aber sie ist NIRGENDS erzwungen: wer
 * eine Fensterlaenge aendert und die Sperrzeit stehen laesst, entkoppelt still die feste
 * Deadline vom gleitenden Fenster — und genau dieser Gleichlauf ist Eigenschaft 3 der
 * Spec (Spec:3022-3028, `docs/superpowers/specs/2026-08-17-radio-modul-design.md`). Kein
 * Tor faerbt sich davon; die Faelle dieser Datei pruefen beide Zahlen nur gemeinsam.
 *
 * WARUM SIE TROTZDEM SO STEHT: das Vorbild macht es zeichengleich
 * (`src/app/m/lagerbuch/_lib/gateSchranke.ts:151-157` gegen `:26`, `:42`, `:52`), und A3
 * bindet auf „Bauform 1:1" mit diesem Vorbild. Eine benannte Konstante NUR hier liesse
 * die beiden Dateien auseinanderdriften — genau das, wovor die Pruefung bei diesem Fund
 * selbst gewarnt hat.
 *
 * ⛔ DER POSTEN IST DESHALB EIN GEMEINSAMER: `radio`s und `lagerbuch`s `gateSchranke.ts`
 * zusammen ueberarbeiten, drei benannte Konstanten je Datei, oder die Sperrzeit aus dem
 * `RateLimiter` selbst lesen. Nicht einzeln.
 */
