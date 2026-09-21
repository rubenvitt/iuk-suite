import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";
import { istCodeForm, normalisiereCode } from "./code";

/**
 * DIE GATE-SCHRANKE DES MODULS `radio` — drei Zaehler, und sie zaehlen NUR
 * Fehlversuche (Spec 1 §3.7.2,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:2996-3035`).
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
 * ⛔ SEIT DRK-291 SETZT DIESE DATEI KEINE DER BEIDEN ANTWORTEN MEHR VORAUS, weil keine Sperre
 * mehr eine WOHLGEFORMTE Eingabe trifft (`gateGesperrt`): die Abwehr ist der Coderaum
 * (140 bit), die Zaehler sind die Notbremse fuer Eingaben, die nie ein Code sein koennen.
 * Kollabiert der Absenderschluessel (A-L12), sperrt ein Klopfer damit hoechstens Muell aus,
 * nie einen richtigen Code — vorher sperrte er nach fuenf Fehlversuchen den ganzen Funkraum.
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
 * Modulweit ueber die Minute (30 = sechs Absender-Budgets, Spec:3007) und ueber die
 * Stunde (300 = 5/min x 60, Spec:3008-3009).
 * Env: RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN, RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE.
 *
 * ⛔ SEIT DRK-291 SPERREN SIE KEINEN RICHTIGEN CODE MEHR. Vorher stand ihre Sperrzeit VOR
 * jeder Codesuche, und 31 Fehlversuche aus sieben Absendern sperrten eine Minute lang,
 * 301 in der Stunde eine ganze Stunde lang JEDEN Aufsteller-Scan — obwohl diese Datei und
 * die Spec zusagten, ein richtiger Code komme „auch waehrend laufender Sperre" herein.
 * Jetzt gatet `gateGesperrt` nur noch Eingaben, die gar kein Code sein koennen.
 *
 * WARUM DAS HIER SICHER IST UND IN `lagerbuch` NICHT: 28 Zeichen Crockford-Base32 sind
 * 140 bit (`_lib/code.ts`). Rechnung B der Spec (§3.7.1): selbst ungebremst, bei 10^6
 * Versuchen je Sekunde und 1.000 gueltigen Codes, 2,2 × 10^25 Jahre bis zum Treffer. Die
 * Codesuche selbst ist eine Gleichheitssuche auf dem `UNIQUE`-Index von
 * `zugangscodes.code` — billiger als die Anfrage, die sie ausloest.
 * ⚠️ BEWUSSTER REST: die ZAHL solcher Suchen ist damit nicht mehr gedeckelt. Eine Kappe fuer
 * wohlgeformte Eingaben haette einen Schluessel, den niemand rotieren kann — also wieder
 * genau den Hebel, mit dem jeder Unangemeldete die Ausleihe fuer alle sperrt. Last erzeugen
 * kann ein Angreifer auf jeder oeffentlichen Route; Volumenschutz gehoert vor den Prozess
 * (Cloudflare/Traefik), nicht in einen Zaehler, der richtige Codes abweist. `lagerbuch` hat 10^6
 * Codes und braucht die Sperre vor der Suche; dort traegt ein Geraetemerkmal die
 * Verfuegbarkeit (`lagerbuch/_lib/gateSchrankeMerkmal.ts`).
 */
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — Schluessel → Zeitpunkt in ms, bis zu dem dieser Eimer als
 * erschoepft gilt. `RateLimiter.check()` prueft und BUCHT in einem Zug
 * (`src/core/ratelimit.ts`, `check`); ein reines Nachsehen gibt es dort nicht. Deshalb
 * merkt sich diese Datei jedes `false` selbst, und `gateGesperrt` liest nur diese Zahl.
 */
const gesperrtBis = new Map<string, number>();

/** Konstanten DIESER Datei — ein Schluessel, den kein Aufrufer setzt, ist einer, den
 *  niemand rotieren kann. */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";

/** Was eine Anfrage ueber sich mitbringt: die ROHE Eingabe, so wie sie ankam. */
export type GateAnfrage = { eingabe?: string };

function restMs(schluessel: string, jetzt: number): number {
  const bis = gesperrtBis.get(schluessel);
  if (bis === undefined) return 0;
  if (bis <= jetzt) { gesperrtBis.delete(schluessel); return 0; }   // laeuft von selbst ab
  return bis - jetzt;
}

/**
 * SCHRITT 2 der Reihenfolge aus §3.3.1. LIEST NUR — bucht nichts, oeffnet nichts, kein
 * Datenbankzugriff (Quelltext-Scan in `gateSchranke.test.ts`).
 *
 * ⛔ EINE WOHLGEFORMTE EINGABE IST NIE GESPERRT (DRK-291). Sie koennte ein Code sein, und
 * ein richtiger Code kommt herein — auch hinter einem geteilten Uplink, auch waehrend
 * eines Angriffs. Deshalb normalisiert diese Funktion die rohe Eingabe SELBST: sie steht
 * vor `normalisiereCode` an der Aufrufstelle (Reihenfolge-Scan in `_lib/bauform.test.ts`),
 * und `normalisiereCode`/`istCodeForm` sind rein.
 * Fuer alles andere gilt die groesste der drei Restzeiten, nie 0 (Spec:3020-3021): die
 * Aufrufer pruefen gegen `null`. Ohne `eingabe` (die Gate-Seite, die nur die Sekundenzahl
 * fuer `grund=zuviele` braucht) antwortet sie wie fuer Muell — die vorsichtige Zahl.
 */
export function gateGesperrt(absender: string, anfrage: GateAnfrage = {}): number | null {
  if (anfrage.eingabe !== undefined && istCodeForm(normalisiereCode(anfrage.eingabe))) return null;
  const jetzt = Date.now();
  const ms = Math.max(restMs(absender, jetzt),
                      restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — NIE ein Erfolg (§3.7.3). Fuer `radio` ist das
 * der Regelfall: ein Funkraum voller Personen, die denselben Aufsteller scannen, teilt
 * sich einen Uplink; `feedback` hat genau diesen Fehler schon produktiv erlitten
 * (`src/app/m/files/api/u/[token]/upload/route.ts` schreibt den Vorfall aus).
 *
 * Gebucht wird weiterhin JEDER Fehlversuch, auch ein wohlgeformter: die Zaehler sind die
 * Notbremse fuer Muell-Eingaben und bleiben eine Messgroesse fuer Klopfen.
 *
 * DIE KETTE IST KURZSCHLIESSEND, an JEDER Stufe gegen dieselbe FESTE Deadline, die auch
 * `gateGesperrt` liest — nie gegen `RateLimiter.check()` allein (Spec:3022-3028):
 * `check()` ist ein gleitendes Fenster und oeffnet frueher, als die Deadline ablaeuft; ein
 * laengst gesperrter Klopfer verbrauchte sonst das naechste Budget mit.
 * ⚠️ DERSELBE KURZSCHLUSS VERHINDERT DIE SELBSTVERLAENGERNDE SPERRE: eine Anfrage waehrend
 * laufender Sperre schiebt keine Deadline nach vorn. Jedes `false` schreibt die
 * FENSTERLAENGE als Sperrzeit fort.
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
 * ⬜ EIN OFFENER POSTEN (Fund K3 aus `.superpowers/sdd/planteil3/REVIEW-A3.md`): die drei
 * Sperrdauern in `gateFehlversuchBuchen` wiederholen die `windowMs` der drei Zaehler als
 * LITERALE ZAHL. Die Kopplung ist gewollt, aber nirgends erzwungen. Ein gemeinsamer Posten
 * mit `lagerbuch/_lib/gateSchranke.ts` (dort seit DRK-291 in `bucheKette` gebuendelt, die
 * Zahlen stehen aber auch dort literal) — nicht einzeln loesen.
 */
