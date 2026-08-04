import { SignJWT, jwtVerify } from "jose";
import { grenzen, helferSitzungGeheimnis } from "./grenzen";

/**
 * Die Helfer-Sitzung: ein signiertes JWT in einem HOST-ONLY-Cookie.
 * KEIN "use client" (Falle 6) — die Werte lesen Server Components und Route
 * Handler.
 *
 * DER NAME BLEIBT `helfer_session`, unbedingt, in beiden Cutover-Zweigen. Das
 * weicht vom Hausstil ab, der praefigiert (`files_s_<shareId>`,
 * `m/files/_lib/passwort.ts:24-28`; `feedback-<surveyId>`,
 * `m/feedback/actions.ts:610`). Die Begruendung: das Cookie ist host-only,
 * lagerbuch ist das einzige Modul auf `lagerbuch.iuk-ue.de`, und KEIN anderes
 * Suite-Modul liest diesen Namen — eine Namenskollision ist konstruktiv
 * unmoeglich. Ein Praefix kostete im guenstigen Zweig genau das, wofuer das
 * Geheimnis uebernommen wird: jede laufende Feld-Sitzung.
 */
export const HELFER_COOKIE = "helfer_session";

/**
 * `code` und `label` sind WEGGEFALLEN. Sie kommen ab jetzt aus der Token-Zeile
 * (§3.4.4) — das ist der Grund, warum das Klartext-Secret aus dem Cookie
 * verschwinden konnte.
 */
export type HelferPayload = { tokenId: string };

/**
 * Was `verifyHelferSitzung` ZURUECKGIBT: die Nutzlast plus den Ablaufzeitpunkt.
 *
 * `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte Claim,
 * den `setExpirationTime` setzt (`lagerbuch/src/lib/auth/helferSession.ts:14` —
 * unbedingt, auch im Bestand) und den `jose` beim Verifizieren ohnehin schon
 * prueft. Ihn hier herauszureichen kostet keinen zusaetzlichen Zugriff und ist
 * der EINZIGE Datenpfad der Restzeit-Anzeige (§3.4.3, Punkt 1; §7.8.2); ohne ihn
 * ist die dort festgeschriebene Zusage nicht baubar.
 */
export type HelferSitzung = HelferPayload & { laeuftAb: Date };

/**
 * DAS GEHEIMNIS WIRD IM THUNK GELESEN, NICHT AUF MODULEBENE.
 *
 * Ein `const SCHLUESSEL = new TextEncoder().encode(helferSitzungGeheimnis())` am
 * Dateikopf braeche `pnpm build`: `next build` laeuft mit NODE_ENV=production und
 * OHNE Secrets und wertet Modulebene aus (§10.8, Eigenschaft 3;
 * `lagerbuch/src/lib/config.ts:91-99` schreibt denselben Befund ueber vierzehn
 * Zeilen aus). Der Bestand macht es bereits richtig (`helferSession.ts:8`:
 * `const secret = () => ...`) — die Form wandert mit.
 */
const schluessel = () => new TextEncoder().encode(helferSitzungGeheimnis());

/**
 * Die Gueltigkeit steht ZWEIMAL in derselben Sitzung: als JWT-`exp` und als
 * Cookie-`maxAge` (§3.4.3). Zwei Umrechnungen waeren zwei Wahrheiten, und die
 * Sitzung liefe je nach Weg verschieden lange — deshalb genau eine Funktion.
 */
export function helferGueltigkeitSekunden(): number {
  return grenzen().helferSitzungStunden * 3600;
}

export async function createHelferSitzung(p: HelferPayload): Promise<string> {
  return new SignJWT({ tokenId: p.tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + helferGueltigkeitSekunden())
    .sign(schluessel());
}

/**
 * RUECKWAERTSKOMPATIBEL, UND DAS IST DER PUNKT.
 *
 * Verlangt wird NUR `typeof tokenId === "string"`; ueberzaehlige Felder werden
 * IGNORIERT. Ein Alt-Cookie mit `{tokenId, code, label}` verifiziert damit
 * unveraendert weiter — dasselbe Geheimnis, derselbe Name, dieselbe Signatur.
 * OHNE DIESE EIGENSCHAFT WAERE DIE UEBERNAHME DES GEHEIMNISSES
 * (Betreiber-Entscheidung 4) WIRKUNGSLOS.
 *
 * ⚠️ Die Gegenmutation ist teuer und unsichtbar: eine strikte Feldpruefung auf
 * genau `{tokenId}` beendet JEDE laufende Feld-Sitzung beim Cutover, und KEIN
 * ANDERER TEST SIEHT DAS. Der Fall steht deshalb ausgeschrieben in
 * `helferSitzung.test.ts`.
 *
 * ⚠️ FEHLT `exp`, ist die Sitzung ungueltig. Das ist eine VERSCHAERFUNG
 * gegenueber der Feldpruefung eine Zeile hoeher und deshalb ausdruecklich
 * gegengeprueft: der Aussteller setzt den Claim seit jeher unbedingt
 * (`helferSession.ts:14`), ein Alt-Cookie traegt ihn also.
 *
 * WIRFT NIE. Der Wert kommt aus einem Cookie und ist Nutzereingabe; ein Wurf
 * machte aus einem manipulierten Cookie einen 500 auf jeder Helfer-Seite.
 *
 * `algorithms: ["HS256"]` steht ausdruecklich da — ohne die Zeile akzeptierten
 * manche Bibliotheken ein Token mit `alg: none`.
 */
export async function verifyHelferSitzung(value: string): Promise<HelferSitzung | null> {
  try {
    const { payload } = await jwtVerify(value, schluessel(), { algorithms: ["HS256"] });
    const { tokenId, exp } = payload as { tokenId?: unknown; exp?: unknown };
    if (typeof tokenId !== "string" || tokenId === "") return null;
    if (typeof exp !== "number") return null;
    return { tokenId, laeuftAb: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

/**
 * KEIN `domain`. Das ist die eine Zeile, an der beim Port am meisten haengt.
 *
 * Die naheliegende Vorlage ist die falsche: `core/auth/cookies.ts:46-59` setzt
 * `domain` aus `AUTH_COOKIE_DOMAIN` — die Datei heisst `auth/cookies.ts`, der
 * Griff liegt nahe, und sie ist fuer die SUITE-Sitzung richtig. Kopiert man das
 * hierher, wird aus einer host-gebundenen Helfer-Sitzung ein Cookie, das an
 * JEDEN Modul-Host geschickt wird — an `files.`, an `feedback.`, an jeden
 * weiteren. Es entstuende keine Rechteausweitung (kein anderes Modul liest den
 * Namen), aber Exposition in jedem Header und in jedem Log, das Cookies fuehrt.
 *
 * Dass host-only-Cookies ueber Modul-Hosts hinweg produktiv zuschlagen, ist in
 * dieser Suite BELEGT, nicht vermutet: `core/auth/cookies.ts:5-31` schreibt den
 * Vorfall aus (`InvalidCheck: state value could not be parsed` nach dem ersten
 * Modul-Cutover). lagerbuch bringt die zweite Cookie-Familie in genau diese
 * Topologie — mit gegenlaeufiger Reichweite. Ein Admin ist auf jedem Suite-Host
 * derselbe, eine Helferin ist es je Host neu. Das ist Absicht.
 *
 * ⚠️ PLAYWRIGHT KANN DAS NICHT SEHEN: es faehrt gegen EINEN Host, und dort
 * verhaelt sich ein domain-weites Cookie exakt wie ein host-only (Falle 19). Die
 * einzige Absicherung ist die Quelltext-Zusicherung in `helferSitzung.test.ts`.
 *
 * `secure` kommt aus NODE_ENV, nicht aus `config.appBaseUrl.startsWith("https://")`
 * (`helferSession.ts:32`): `NODE_ENV=production` steht fest im Image
 * (`iuk-suite/Dockerfile:25`), waehrend `APP_BASE_URL` in der Suite gar nicht
 * existiert (§8.2).
 *
 * `gueltigkeitSekunden = 0` ist das LOESCHEN. Es steht hier und nicht in einem
 * eigenen `helferCookieLoeschen()`, weil die Attribute beim Loeschen DIESELBEN
 * sein muessen wie beim Setzen — und die eine Funktion, die das garantiert, ist
 * diese. Dieselbe Form benutzt `feedback` (`m/feedback/actions.ts:638`).
 */
export function helferCookieOptionen(gueltigkeitSekunden: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: gueltigkeitSekunden,
  };
}
