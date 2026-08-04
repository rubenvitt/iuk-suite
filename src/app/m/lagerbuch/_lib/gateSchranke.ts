import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";

/**
 * DIE GATE-SCHRANKE — drei Zaehler, und sie zaehlen NUR Fehlversuche.
 * KEIN "use client" (Falle 6).
 *
 * ⚠️ `grenzen()` steht hier auf MODULEBENE, und das ist zulaessig: alle sechs
 * Zahlen haben eine Vorbelegung, `grenzen()` laeuft also auf einer leeren
 * Umgebung klaglos durch — genau das braucht `next build`, das mit
 * NODE_ENV=production und OHNE .env laeuft (§10.8, Eigenschaft 3). Ein
 * UNGUELTIGER Wert bricht dagegen schon den Import ab, und das ist gewollt: ein
 * Modul, das mit einer kaputten Zahl gar nicht erst startet, ist richtiger als
 * eines, das still eine andere Grenze faehrt als die, die in der .env steht.
 *
 * FOLGE, die man kennen muss: die drei Grenzen sind ab dem ersten Import
 * eingefroren. Eine geaenderte .env wirkt erst nach einem Neustart. Das ist
 * inhaerent — die Zaehler sind Singletons und muessen es sein, sonst zaehlte
 * jeder Aufruf in einen frischen Eimer.
 */
const g = grenzen();

/** 1:1 die heutige Zusage: 5 Fehlversuche je Absender und Minute
 *  (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`).
 *  Env: LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN (§10.3). */
const proAbsender = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });

/**
 * Modulweit ueber die Minute, gegen Rotation des Absenderschluessels — die
 * BURST-Kappe, nicht die eigentliche Abwehr (das ist `gateStunde`).
 * 30 = sechs Absender-Budgets.
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN, Vorgabe 30.
 *
 * WARUM EINE MODULWEITE MINUTENSPERRE VERTRETBAR IST, obwohl sie alle trifft:
 * sie kann nur Fehleingaben verzoegern. Der Budgetverbrauch liegt HINTER der
 * Codepruefung — ein RICHTIGER Code wird eingeloest, auch waehrend die Sperre
 * laeuft. Der Sprengradius ist damit genau: „wer sich vertippt, wartet bis zu
 * eine Minute". 30 statt 20 ist Kopffreiheit fuer den realen Fall, den `feedback`
 * schon einmal getroffen hat: mehrere Ehrenamtliche geben gleichzeitig von Hand
 * ein und vertippen sich.
 */
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });

/**
 * Modulweit ueber die Stunde — DER tragende Zaehler.
 * 300 = 5/min x 60. Die Zahl ist nicht gegriffen: sie stellt genau die Zusage
 * WIEDER HER, die das Per-IP-Limit nur unter der Annahme einer wahrhaftigen
 * Absenderadresse je hatte. Der schlimmste Fall nach dieser Spec (unbegrenzte
 * Rotation) ist damit nicht schlechter als der beste Fall heute (ein Absender).
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE, Vorgabe 300.
 */
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — der Speicher, ohne den `gateGesperrt` gar nicht geht.
 * Schluessel → Zeitpunkt in ms, bis zu dem dieser Eimer als erschoepft gilt.
 *
 * `RateLimiter.check()` prueft und BUCHT in einem Zug (`core/ratelimit.ts:26-37`);
 * ein reines Nachsehen gibt es dort nicht. Deshalb merkt sich diese Datei jedes
 * `false` selbst, und `gateGesperrt` liest nur noch diese Zahl — ohne zu buchen
 * und ohne Datenbankzugriff.
 *
 * ⚠️ Wuerde erst NACH der Codepruefung gebucht und dabei nur die MELDUNG
 * umgeschaltet, liefe die Codepruefung selbst unbegrenzt weiter — der Deckel
 * aenderte dann die Fehlermeldung und nicht den Angriff.
 */
const gesperrtBis = new Map<string, number>();

/** Die beiden modulweiten Schluessel sind Konstanten DIESER Datei und gehen
 *  keinen Aufrufer etwas an — deshalb nimmt keine der beiden Funktionen sie
 *  entgegen. */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";

function restMs(schluessel: string, jetzt: number): number {
  const bis = gesperrtBis.get(schluessel);
  if (bis === undefined) return 0;
  if (bis <= jetzt) { gesperrtBis.delete(schluessel); return 0; }   // laeuft von selbst ab
  return bis - jetzt;
}

/**
 * SCHRITT 2 der Reihenfolge. LIEST NUR — bucht nichts, oeffnet nichts, und
 * braucht keinen Datenbankzugriff.
 *
 * Rueckgabe: die verbleibenden SEKUNDEN, aufgerundet und MINDESTENS 1, wenn
 * einer der drei Eimer gesperrt ist; sonst `null`. NIE 0: ein
 * `if (gateGesperrt(…))` waere sonst in der letzten Sekunde still falsch. Die
 * Aufrufer pruefen trotzdem ausdruecklich gegen `null` (§7.2.3, §7.2.4) — die
 * Zusage steht im Typ, nicht in der Wahrheitswertumwandlung.
 *
 * Zurueck kommt die GROESSTE der drei Restzeiten: wer den Stundendeckel gerissen
 * hat, soll nicht „noch 12 Sekunden" lesen.
 *
 * Diese Zahl ist das *n* aus dem Text zu `grund=zuviele` (§3.9). Sie wird NICHT
 * ueber die URL getragen — die Gate-Seite fragt dieselbe Schranke mit denselben
 * Absender-Kopfzeilen selbst (§7.2.4). Ueber die URL wandert nur der Grund.
 *
 * ⚠️ UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT, nicht der
 * Absender-Eimer: wer den Absenderschluessel rotiert, startet jeden Versuch mit
 * LEEREM Absender-Eimer und bekaeme so oder so genau einen Lookup. Gedeckelt
 * wird das ausschliesslich durch `gateMinute` und `gateStunde` — und die lesen
 * ihre Sperrzeit hier, VOR jedem Datenbankzugriff.
 */
export function gateGesperrt(absender: string): number | null {
  const jetzt = Date.now();
  const ms = Math.max(restMs(absender, jetzt),
                      restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — NIE ein Erfolg. Genau das macht den
 * modulweiten Deckel vertretbar: wuerden Erfolge mitzaehlen, waere ein
 * modulweites Limit ein Ausfall der Ausgabe. So ist der Sprengradius scharf
 * umrissen — ein richtiger Code funktioniert immer, auch waehrend eines
 * Angriffs; wer sich vertippt, wird vertroestet.
 *
 * ⚠️ HEUTE LIEGT DER VERBRAUCH VOR DER CODEPRUEFUNG
 * (`lagerbuch/src/app/(gate)/actions.ts:19`, `t/[code]/route.ts:25`), und eine
 * Bereitschaft hinter einem gemeinsamen Uplink verbraucht ihre fuenf Versuche
 * mit ERFOLGREICHEN Scans. Genau dieser Fehler ist in dieser Suite bereits
 * produktiv eingetreten (feedback, 15 Ehrenamtliche aus einem Vereins-WLAN;
 * `m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus).
 *
 * DIE KETTE IST KURZSCHLIESSEND — und zwar an JEDER Stufe (Absender, Minute,
 * Stunde) gegen dieselbe FESTE Deadline, die auch `gateGesperrt` liest
 * (`restMs`/`gesperrtBis`), NIE gegen den Rueckgabewert von
 * `RateLimiter.check()` allein. Der Unterschied ist keine Kosmetik:
 * `check()` ist ein GLEITENDES Fenster. Liegt der AELTESTE der Treffer, die
 * zu einer Sperre fuehrten, VOR dem Treffer, der sie AUSGELOEST hat (das ist
 * der Normalfall bei mehr als einem Treffer), oeffnet das gleitende Fenster
 * FRUEHER als die feste Deadline ablaeuft. Fragte der Kurzschluss in dieser
 * Luecke erneut nur `check()`, bekaeme er "erlaubt" zurueck — waehrend
 * `gateGesperrt` fuer denselben Schluessel weiterhin "gesperrt" meldet — und
 * liesse den Fehlversuch bis zur naechsten Stufe durchfallen. Genau dort
 * wuerde ein laengst gesperrter Absender (oder eine laengst gesperrte
 * Minutenbremse) das naechste Budget mitverbrauchen: ein einzelner, bereits
 * gesperrter Klopfer legte die Ausgabe fuer alle lahm (bei der Minutenbremse
 * sogar fuer eine ganze STUNDE, nicht nur eine Minute). Deshalb fragt jede
 * Stufe ZUERST ihre eigene feste Deadline; nur wenn die frei ist, befragt sie
 * ihren `RateLimiter`.
 *
 * Jedes `false` schreibt die FENSTERLAENGE als Sperrzeit fort — bewusst
 * konservativ: es laeuft dann die Sperre ab, nicht der gleitende Eimer.
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
