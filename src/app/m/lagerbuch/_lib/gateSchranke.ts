import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";

/**
 * DIE GATE-SCHRANKE — zwei Gruppen zu drei Zaehlern, und sie zaehlen NUR Fehlversuche.
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

/*
 * ZWEI GRUPPEN VON EIMERN — DRK-291, Betreiberentscheidung Variante C.
 *
 * UNBEKANNTE (kein Merkmal): je Absender, modulweit je Minute, modulweit je
 * Stunde — die Schranke, wie sie vorher für alle galt.
 * BEKANNTE GERÄTE (Merkmal aus `gateSchrankeMerkmal.ts`): je Merkmal und zwei
 * EIGENE modulweite Eimer mit denselben Zahlen.
 *
 * WARUM ZWEI GRUPPEN UND NICHT „SPERRE HINTER DIE CODEPRÜFUNG": der Coderaum
 * ist 10^6, der Absenderschlüssel fälschbar (D6). Ohne modulweite Vorprüfung
 * vor der Datenbank rät ein Angreifer ungebremst — bei 30 aktiven Codes und 50
 * Anfragen je Sekunde liegt der erste Treffer bei rund elf Minuten. Die Sperre
 * MUSS also vor der Codesuche stehen. Früher traf sie dort aber JEDEN: 31
 * Fehlversuche aus sieben Absendern sperrten eine Minute lang auch richtige
 * Codes, 301 in der Stunde eine ganze Stunde. Jetzt füllt ein Unbekannter nur
 * die Eimer der Unbekannten; ein Gerät, das schon einmal mit richtigem Code
 * hereinkam, zählt in Eimer, die er nicht erreicht.
 *
 * ⚠️ DER BEWUSSTE REST: ein NEUES Gerät während eines Angriffs bleibt gesperrt,
 * bis die Sperre abläuft. Ohne längere Codes ist das nicht auflösbar — ein
 * richtiger Code, der während der Sperre für jeden durchginge, hieße unbegrenztes
 * Raten.
 * ⚠️ DER PREIS: wer ein Merkmal besitzt (also schon einmal einen richtigen Code
 * kannte), rät zusätzlich im Budget der Bekannten — die Obergrenze aller
 * Fehlversuche verdoppelt sich damit für genau diesen Personenkreis, und nur er
 * kann die Bekannten aussperren.
 *
 * 5 je Absender und Minute ist 1:1 die alte Zusage
 * (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`); Env
 * LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN (§10.3). Der Absender-Eimer ist
 * die Bequemlichkeitsgrenze, NICHT die Abwehr (`absender.ts`). Die Minute (30,
 * LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN) ist die Burst-Kappe gegen Rotation,
 * die Stunde (300 = 5/min × 60, LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE) der
 * tragende Zähler. Beide Gruppen lesen dieselben drei Zahlen.
 */
const proAbsender = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

const proMerkmal = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });
const bekanntMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });
const bekanntStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — der Speicher, ohne den `gateGesperrt` gar nicht geht.
 * Schluessel → Zeitpunkt in ms, bis zu dem dieser Eimer als erschoepft gilt.
 *
 * `RateLimiter.check()` prueft und BUCHT in einem Zug (`core/ratelimit.ts`,
 * `check`); ein reines Nachsehen gibt es dort nicht. Deshalb merkt sich diese
 * Datei jedes `false` selbst, und `gateGesperrt` liest nur noch diese Zahl —
 * ohne zu buchen und ohne Datenbankzugriff.
 */
const gesperrtBis = new Map<string, number>();

/** Die modulweiten Schlüssel sind Konstanten DIESER Datei — ein Schlüssel, den
 *  kein Aufrufer setzt, ist einer, den niemand rotieren kann. Merkmal-Schlüssel
 *  tragen ein eigenes Präfix, damit kein gefälschter Absender sie trifft. */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";
const BEKANNT_MIN = "bekannt:minute";
const BEKANNT_STD = "bekannt:stunde";
const merkmalSchluessel = (m: string) => `merkmal:${m}`;

/** Was eine Anfrage über sich mitbringt. `merkmal` aus `gateMerkmal()`. */
export type GateAnfrage = { merkmal?: string | null };

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
 * einer der drei Eimer DER GRUPPE dieser Anfrage gesperrt ist; sonst `null`.
 * NIE 0: ein `if (gateGesperrt(…))` waere sonst in der letzten Sekunde still
 * falsch. Zurueck kommt die GROESSTE der drei Restzeiten.
 *
 * Diese Zahl ist das *n* aus dem Text zu `grund=zuviele` (§3.9). Sie wird NICHT
 * ueber die URL getragen — die Gate-Seite fragt dieselbe Schranke mit denselben
 * Kopfzeilen und Cookies selbst (§7.2.4).
 *
 * ⚠️ UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT: sie steht VOR der
 * Codesuche. Ein richtiger Code von einem UNBEKANNTEN Gerät wartet deshalb
 * während einer modulweiten Sperre — ein Gerät MIT Merkmal nicht, solange nicht
 * die Eimer der Bekannten selbst voll sind (Kopf dieser Datei).
 */
export function gateGesperrt(absender: string, anfrage: GateAnfrage = {}): number | null {
  const jetzt = Date.now();
  const m = anfrage.merkmal;
  const ms = m
    ? Math.max(restMs(merkmalSchluessel(m), jetzt), restMs(BEKANNT_MIN, jetzt), restMs(BEKANNT_STD, jetzt))
    : Math.max(restMs(absender, jetzt), restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * Eine kurzschliessende Kette gegen feste Deadlines — für beide Gruppen dieselbe.
 * Jede Stufe fragt ZUERST ihre eigene feste Deadline (`restMs`/`gesperrtBis`) und
 * nur wenn die frei ist ihren `RateLimiter`. `check()` ist ein GLEITENDES Fenster
 * und öffnet früher, als die feste Deadline abläuft; fragte der Kurzschluss in
 * dieser Lücke nur `check()`, verbrauchte ein längst gesperrter Klopfer das
 * nächste Budget mit — bei der Minutenbremse sogar die ganze Stunde.
 *
 * ⚠️ DERSELBE KURZSCHLUSS HÄLT DIE SPERRE FEST: eine Anfrage, die während einer
 * laufenden Sperre abgewiesen oder gebucht wird, schiebt keine Deadline nach
 * vorn. Jedes `false` schreibt die FENSTERLAENGE als Sperrzeit fort.
 */
function bucheKette(jetzt: number, stufen: [string, RateLimiter, number][]): void {
  for (const [schluessel, zaehler, sperrMs] of stufen) {
    if (restMs(schluessel, jetzt) > 0) return;
    if (!zaehler.check(schluessel)) { gesperrtBis.set(schluessel, jetzt + sperrMs); return; }
  }
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — NIE ein Erfolg. Wuerden Erfolge
 * mitzaehlen, waere ein modulweites Limit ein Ausfall der Ausgabe; eine
 * Bereitschaft hinter einem gemeinsamen Uplink verbrauchte ihr Budget mit
 * ERFOLGREICHEN Scans. Genau dieser Fehler ist in dieser Suite bereits produktiv
 * eingetreten (feedback, 15 Ehrenamtliche aus einem Vereins-WLAN;
 * `m/files/api/u/[token]/upload/route.ts` schreibt den Vorfall aus).
 *
 * Gebucht wird in die Gruppe DERSELBEN Anfrage: mit Merkmal in die Eimer der
 * Bekannten, ohne in die der Unbekannten. Pruefung und Buchung muessen dieselbe
 * `anfrage` sehen — eine Buchung in die andere Gruppe liesse die geprüfte still
 * leer.
 */
export function gateFehlversuchBuchen(absender: string, anfrage: GateAnfrage = {}): void {
  const jetzt = Date.now();
  const m = anfrage.merkmal;
  if (m) {
    bucheKette(jetzt, [
      [merkmalSchluessel(m), proMerkmal, 60_000],
      [BEKANNT_MIN, bekanntMinute, 60_000],
      [BEKANNT_STD, bekanntStunde, 3_600_000],
    ]);
    return;
  }
  bucheKette(jetzt, [
    [absender, proAbsender, 60_000],
    [MODULWEIT_MIN, gateMinute, 60_000],
    [MODULWEIT_STD, gateStunde, 3_600_000],
  ]);
}
