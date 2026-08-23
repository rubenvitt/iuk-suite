import { SignJWT, jwtVerify } from "jose";
import { grenzen, ausleihSitzungGeheimnis } from "./grenzen";

/**
 * DIE AUSLEIH-SITZUNG: ein signiertes JWT in einem HOST-ONLY-Cookie (Spec 1 §3.4,
 * Spec:2423-2629).
 *
 * KEIN "use client" in dieser Datei. Ihre Werte lesen Server Components, Server Actions
 * und Route Handler (A6, A7, A9, A10) — ein WERT aus einem Client-Modul kommt in einer
 * Server Component nicht an, sondern als Client-Referenz (Falle 6, `CLAUDE.md`), HTTP 500
 * fuer die ganze Seite. Durchgesetzt von `src/app/m/radio/riegel.test.ts:921-940`.
 *
 * ⛔ KEINE VERLAENGERUNG, weder gleitend noch bei Aktivitaet (§3.4.4, Spec:2548-2570).
 * Gleitend waere in einer Server Component technisch unmoeglich — `cookies()` ist dort
 * versiegelt, `set`/`delete`/`clear` werfen (Spec:2548-2556). Auch in Route Handler und
 * Server Action wird sie NICHT gebaut: der Preis eines Ablaufs ist ein Scan von zwei
 * Sekunden. Deshalb gibt es hier keine Funktion, die eine bestehende Sitzung erneuert.
 */

/**
 * ⛔ PRAEFIGIERT — anders als `lagerbuch`s unpraefigiertes `helfer_session`
 * (`src/app/m/lagerbuch/_lib/helferSitzung.ts:18`).
 *
 * Der Grund ist der Cutover und nicht der Geschmack (Spec:2453-2455): bei `lagerbuch` war
 * eine laufende Feld-Sitzung zu erhalten, der Name musste bleiben. Bei `radio` ist ueber
 * den Cutover NICHTS zu erhalten — das Alt-System legt seinen Zugang in
 * `localStorage` (`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:4-6`), nicht in
 * ein Cookie, und dieser Mechanismus wird ausdruecklich nicht portiert. Damit ist der
 * Hausstil frei waehlbar, und der Hausstil praefigiert (`files_s_<shareId>`,
 * `src/app/m/files/_lib/passwort.ts:24-28`).
 *
 * ⚠️ Nach dem ersten Rollout ist der Name so wenig frei aenderbar wie `/t/<code>`: er
 * steht im Cookie-Kopf jedes Aufrufs, und eine Aenderung beendet jede laufende Sitzung.
 */
export const AUSLEIH_COOKIE = "radio_ausleihe";

/**
 * ⛔ DIE NUTZLAST TRAEGT NUR `codeId` (Spec:2503-2506).
 *
 * `code` und `bezeichnung` kommen aus der Datenbankzeile, die A7 zu dieser `codeId`
 * liest — aktuell, nicht bis zu zwoelf Stunden eingefroren. DAS IST DIE VORAUSSETZUNG
 * DAFUER, DASS EINE SPERRE WIRKT: Pflicht 15 (`docs/radio-portierung-analyse.md:959-971`)
 * schreibt woertlich, `label` fuer die Anzeige komme aus DIESER Zeile und nicht aus der
 * Cookie-Nutzlast. Stuende die Bezeichnung im Cookie, waere eine Umbenennung oder eine
 * Sperre in der Verwaltung auf der Flaeche unsichtbar, bis das Cookie ablaeuft.
 */
export type AusleihPayload = { codeId: string };

/**
 * Was `verifyAusleihSitzung` zurueckgibt: die Nutzlast plus den Ablaufzeitpunkt.
 *
 * `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte Claim, den
 * `setExpirationTime` setzt und den `jose` beim Verifizieren ohnehin prueft. Ihn hier
 * herauszureichen kostet keinen zusaetzlichen Zugriff (Vorbild
 * `src/app/m/lagerbuch/_lib/helferSitzung.ts:37`).
 */
export type AusleihSitzung = AusleihPayload & { laeuftAb: Date };

/**
 * ⛔ DAS GEHEIMNIS WIRD IM THUNK GELESEN, NICHT AUF MODULEBENE (Spec:2042-2047,
 * Bauform-Zulaessigkeitstafel Zeile 13).
 *
 * Ein `const SCHLUESSEL = new TextEncoder().encode(ausleihSitzungGeheimnis())` am
 * Dateikopf braeche `pnpm build`: `next build` laeuft mit NODE_ENV=production und OHNE
 * Secrets und wertet Modulebene aus. Der Bestand macht es richtig und schreibt den Befund
 * ueber elf Zeilen aus: `src/app/m/lagerbuch/_lib/helferSitzung.ts:39-49`
 * (`const schluessel = () => ...`). Der Unterschied ist genau das `() =>`; der
 * Quelltext-Scan dagegen steht in `ausleihSitzung.test.ts`.
 *
 * ⛔ ES HEISST `RADIO_AUSLEIH_SITZUNG_SECRET`, nicht `…_GEHEIMNIS`. Der Kapiteltext
 * schreibt die deutsche Endung an ZWEI Stellen (Spec:2042 in §3.1 und Spec:2502 in
 * §3.4.2 — genau dem Abschnitt, der dieser Datei zugrunde liegt); B2 (Spec:91) sticht
 * ueber beide. Der Name wird hier nicht wiederholt, sondern aus `_lib/grenzen.ts:93-103`
 * gelesen — zwei Schreibweisen waeren zwei Wahrheiten.
 *
 * ⬜ A-L7 — ES GIBT FUER DIESES MODUL HEUTE KEINE BOOT-PRUEFUNG AUF
 * `RADIO_AUSLEIH_SITZUNG_SECRET`. `radioBootFehler()` gehoert Kapitel 7 und damit
 * Planteil 5 (B8, Spec:97). Fehlt die Variable, faellt das erst beim ersten Einloesen
 * auf — nicht beim Start des Containers. Abgelesen wird die Leerstelle von Planteil 5
 * beim Bau von `radioBootFehler()`; ueber die Gestalt der Meldung, die ein Mensch dann
 * saehe, steht hier ausdruecklich nichts.
 */
const schluessel = () => new TextEncoder().encode(ausleihSitzungGeheimnis());

/**
 * ⛔ DIE GUELTIGKEIT STEHT ZWEIMAL IN DERSELBEN SITZUNG — als JWT-`exp` und als
 * Cookie-`maxAge` (Spec:2523-2530). Zwei Umrechnungen waeren zwei Wahrheiten, und die
 * Sitzung liefe je nach Weg verschieden lange: das Cookie etwa zwoelf Stunden, das Token
 * zwoelf Minuten. Der Mensch saehe eine Sitzung, die es nicht mehr gibt, und bekaeme auf
 * jeder Seite eine Weiterleitung ohne erkennbaren Grund. Deshalb genau EINE Funktion,
 * und beide Wege rufen sie.
 *
 * ⬜ A-L1 — die Stundenzahl kommt aus `RADIO_AUSLEIH_SITZUNG_STUNDEN`
 * (`_lib/grenzen.ts:76`), deren Vorbelegung 12 der VORSCHLAG der Spec ist (§3.4.3,
 * Spec:2529-2531) und nicht die Antwort des Betreibers. Sie wird hier nicht verdrahtet.
 */
export function ausleihGueltigkeitSekunden(): number {
  return grenzen().ausleihSitzungStunden * 3600;
}

/**
 * Stellt die Sitzung aus. Der `exp`-Claim wird aus Unix-SEKUNDEN gerechnet, mit dem
 * Faktor 1000 sichtbar im Ausdruck (Hausregel: nie ueber die Einheitengrenze vergleichen
 * oder rechnen, ohne den Faktor zu zeigen — `src/app/m/lagerbuch/_db/schema.ts:11-16`).
 */
export async function createAusleihSitzung(p: AusleihPayload): Promise<string> {
  return new SignJWT({ codeId: p.codeId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ausleihGueltigkeitSekunden())
    .sign(schluessel());
}

/**
 * ⛔ SIE WIRFT NIE (Spec:2508-2513). Der Cookiewert ist Nutzereingabe; ein Wurf waere
 * HTTP 500 auf JEDER Ausleihseite — fuer jeden, dessen Cookie beschaedigt, abgelaufen
 * oder von einer alten Fassung ist. Das `catch` unten ist deshalb die tragende Zeile
 * dieser Funktion und kein Beiwerk (Bauform-Zulaessigkeitstafel Zeile 8).
 *
 * ⛔ SIE PRUEFT STRIKT, ANDERS ALS `lagerbuch` (Spec:2513-2517). `lagerbuch` laesst
 * bewusst ueberzaehlige Felder und alles durch, was `typeof tokenId === "string"` erfuellt
 * (`src/app/m/lagerbuch/_lib/helferSitzung.ts:68-80`) — dort haengt eine Cutover-Zusage
 * daran. Hier gibt es keine Alt-Cookies, und `codeId` geht in A7 unmittelbar in einen
 * Datenbank-Lookup: ein Wert vom falschen Typ waere dort entweder ein Wurf oder ein
 * stiller Treffer auf nichts.
 *
 * ⛔ `algorithms: ["HS256"]` STEHT AUSDRUECKLICH DA (Spec:2506-2508) — und was die Zeile
 * WIRKLICH abwehrt, ist gemessen (2026-08-23, `jose` 6.2.x, `package.json:31`):
 *   - `alg: none` lehnt `jose` AUCH OHNE die Angabe ab („JOSENotSupported: alg none is
 *     not supported either by JOSE or your javascript runtime").
 *   - Ein mit DEMSELBEN Geheimnis, aber HS512 signiertes Token wird OHNE die Angabe
 *     ANGENOMMEN und mit ihr abgelehnt („JOSEAlgNotAllowed").
 * Die Zeile wehrt also Algorithmenverwirrung ab, nicht das unsignierte Token; letzteres
 * wehrt `jwtVerify` selbst ab. Beide Faelle stehen in `ausleihSitzung.test.ts`, der
 * HS512-Fall ist der, der diese Zeile traegt.
 *
 * ⚠️ FEHLT `exp`, IST DIE SITZUNG UNGUELTIG (Spec:2508). Gemessen am selben Tag: `jose`
 * nimmt ein Token ohne `exp` von sich aus klaglos an — die Pruefung unten ist die
 * einzige, die den Zustand „ein Zugang, der fuer immer gilt" verhindert (Entscheidung 8).
 */
export async function verifyAusleihSitzung(value: string): Promise<AusleihSitzung | null> {
  try {
    const { payload } = await jwtVerify(value, schluessel(), { algorithms: ["HS256"] });
    const { codeId, exp } = payload as { codeId?: unknown; exp?: unknown };
    if (typeof codeId !== "string" || codeId === "") return null;
    if (typeof exp !== "number") return null;
    return { codeId, laeuftAb: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

/**
 * ⛔ KEIN `domain`. HOST-ONLY (Spec:2437-2447). Das ist die eine Zeile, an der in dieser
 * Datei am meisten haengt, und sie ist eine Zeile, die NICHT da steht.
 *
 * Die naheliegende Vorlage ist die falsche: `src/core/auth/cookies.ts:46-59` setzt
 * `domain` aus `AUTH_COOKIE_DOMAIN`. Die Datei heisst `auth/cookies.ts`, der Griff liegt
 * nahe, und fuer die SUITE-Sitzung ist sie richtig — ein Admin ist auf jedem Suite-Host
 * derselbe. Kopiert man sie hierher, wird aus einer host-gebundenen, ANONYMEN
 * Ausleihsitzung ein Cookie, das an JEDEN Modul-Host geschickt wird (`qr`, `feedback`,
 * `files`, `lagerbuch`, `aufgaben`, `portal`). Es entstuende keine Rechteausweitung — kein
 * anderes Modul liest diesen Namen —, aber Exposition in jedem Header und jedem Log, das
 * Cookies fuehrt. Und ohne die host-only-Haelfte bliebe die `requiresAuth: false`-Luecke
 * nach der Einloesung offen (§3.4.6).
 *
 * ⚠️ PLAYWRIGHT KANN DIESEN FEHLER STRUKTURELL NICHT SEHEN: es faehrt gegen EINEN Host,
 * und dort verhaelt sich ein domain-weites Cookie exakt wie ein host-only (Analyse-Falle
 * Nr. 19, `docs/radio-portierung-analyse.md:1498-1515`). DIE EINZIGE ABSICHERUNG IST DER
 * UNIT-TEST in `ausleihSitzung.test.ts`, und er prueft `not.toHaveProperty("domain")` —
 * nicht `toBeUndefined()`, das ein `domain: process.env.AUTH_COOKIE_DOMAIN` durchliesse,
 * solange die Variable im Test nicht gesetzt ist.
 *
 * `path: "/"` traegt eine zweite Zusage (Spec:2449-2451): KEINE Entscheidung unter
 * `/admin` liest `AUSLEIH_COOKIE`. Der Riegel `requireRadioAdmin` (`_lib/zugang.ts`)
 * kennt den Namen nicht und importiert diese Datei nicht; der Quelltext-Scan dazu steht
 * in A9 (`_lib/bauform.test.ts`).
 *
 * `secure` kommt aus NODE_ENV und nicht aus einer Basis-URL: `NODE_ENV=production` steht
 * fest im Image (`Dockerfile:36`). Bewacht vom Fall „secure folgt NODE_ENV" in
 * `ausleihSitzung.test.ts` — er setzt die Variable auf BEIDE Werte, weil ein Vergleich
 * gegen `process.env.NODE_ENV` eine Tautologie waere.
 *
 * ⛔ `gueltigkeitSekunden = 0` IST DAS LOESCHEN, und es steht hier statt in einem eigenen
 * `ausleihCookieLoeschen()` (Spec:2596-2604). Die Attribute muessen beim Loeschen
 * DIESELBEN sein wie beim Setzen, sonst bleibt das Loeschen WIRKUNGSLOS — und der Browser
 * meldet das nicht. Eine Funktion mit einem Parameter garantiert das; zwei Objekte
 * garantieren es nicht. Aus demselben Grund ist `cookies().delete(...)` in diesem Modul
 * ueberall verboten: es setzt kein `Path` und loescht am falschen Scope (Bestand
 * `src/app/m/lagerbuch/abmelden/route.ts:80-91`).
 *
 * ⛔ DER RUECKGABETYP STEHT AUSGESCHRIEBEN DA UND WIRD NICHT AUS `as const` ABGELEITET —
 * er ist der ZWEITE, FRUEHERE Waechter gegen genau den `domain`-Fehler oben, und er
 * schlaegt vor jedem Testlauf zu. Gemessen am 2026-08-23 mit ergaenztem
 * `domain: ".iuk-ue.de"`: `tsc` meldet dann
 *   error TS2353: Object literal may only specify known properties, and 'domain' does
 *   not exist in type '{ httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean;
 *   maxAge: number; }'
 * — ohne die Annotation bleibt `rtk pnpm typecheck` bei derselben Aenderung gruen.
 *
 * ⚠️ ER ERSETZT DEN TESTFALL NICHT. Die Ueberschussfeld-Pruefung greift nur, weil hier
 * ein Objekt-LITERAL zurueckgegeben wird; ein `domain`, das aus einer Variablen in das
 * Ergebnis kaeme, liesse TypeScript weiterhin durch. Der Test
 * `not.toHaveProperty("domain")` bleibt der tragende Waechter, die Annotation steht
 * daneben.
 */
export function ausleihCookieOptionen(gueltigkeitSekunden: number): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: gueltigkeitSekunden,
  };
}
