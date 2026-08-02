/**
 * Der EINE Ort, an dem das Modul `files` ein Share-Passwort prüft und eine
 * Entsperrung beglaubigt (Spec §7.4). Vier Aufrufer hängen daran: der Setzweg
 * `POST /api/s/<id>/verify` und die drei Byte-Wege (Download, ZIP, Vorschau).
 *
 * **Es gibt genau einen Annahmeweg — das Cookie.** Kein Bestandslink-Sonderweg,
 * keine Karenz, kein zweites Prädikat. In der Alt-App war der Schutz Dekoration:
 * `POST /api/download/[id]/verify` prüfte korrekt gegen bcrypt und antwortete
 * dann `{ ok: true }` (`verify/route.ts:29`) — kein Cookie, kein Token —, der
 * Client merkte sich das in React-State, und die drei Endpunkte, die Bytes
 * ausliefern, lasen `passwordHash` nirgends. Wer die Share-ID kannte (sie steht
 * in seiner eigenen URL), lud ohne Passwort.
 *
 * Server-only: `node:crypto` und `process.env` stehen am Modulkopf. Die Datei
 * trägt bewusst keine Client-Direktive und darf aus keinem Client-Modul
 * importiert werden — sie wird von Route Handlern und Server Components gelesen,
 * und ein Wert aus einem Client-Modul käme dort als Client-Referenz statt als
 * Wert an (Falle 6 in `docs/design/README.md`).
 */
import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ein Cookie JE Share. Ein einziges Cookie würde beim zweiten geschützten Share
 * den ersten überschreiben (§7.4) — wer zwei Shares entsperrt hat, verlöre den
 * ersten wieder.
 */
const NAMENS_PRAEFIX = "files_s_";

/**
 * Domänentrennung im Nachrichtenkopf des HMAC. `AUTH_SECRET` signiert in der
 * Suite auch anderes; ohne diesen Präfix könnte ein Wert aus einem fremden
 * Zusammenhang hier als Entsperrung gelten. **Kein neues Geheimnis in der
 * `.env`** — `AUTH_SECRET` ist bereits Pflicht (`compose.yaml:23`).
 */
const DOMAENE = "files-share-v1:";

/** Obergrenze der Entsperrung, unabhängig von der Restlaufzeit des Shares. */
const MAX_ENTSPERRUNG_SEKUNDEN = 4 * 60 * 60;

/** bcryptjs, cost 12, Präfix `$2b$12$` — auch für NEUE Passwörter (§4.2). */
const KOSTEN = 12;

/**
 * `nanoid(10)` über das 64-Zeichen-`urlAlphabet`: enthält `-` und `_`, ist
 * case-sensitive. Das sind genau die Zeichen eines RFC-6265-`token`, deshalb
 * braucht die ID im Cookie-Namen keine Kodierung. Die Obergrenze 64 ist Vorsicht
 * gegen einen unbegrenzt langen Pfadabschnitt, keine Aussage über die ID-Länge.
 */
const SHARE_ID_FORM = /^[A-Za-z0-9_-]{1,64}$/;

/** Kanonische Dezimalzahl ohne Vorzeichen, ohne Exponent, ohne führendes `+`. */
const SEKUNDEN_FORM = /^(0|[1-9][0-9]{0,14})$/;

/**
 * Die Vorlage für `cookies().set(...)`. Die Feldnamen sind die von Next
 * (`ResponseCookie`), damit der Setzweg sie unverändert durchreichen kann.
 */
export type ShareCookieVorlage = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

/**
 * Der Name des Entsperr-Cookies dieses Shares.
 *
 * Wirft bei einer ID, die kein Cookie-Name wäre: der Name landet in einem
 * `Set-Cookie`-Header, und die ID kommt aus einem Pfadabschnitt, also aus
 * fremder Hand. Aufrufer lösen den Share vorher aus der Datenbank auf (§7.4:
 * Existenz zuerst) — der Wurf ist der Riegel dahinter, nicht die Prüfung davor.
 */
export function cookieName(shareId: string): string {
  if (!SHARE_ID_FORM.test(shareId)) {
    throw new Error(
      `Unbrauchbare Share-ID für einen Cookie-Namen: ${JSON.stringify(shareId)}`,
    );
  }
  return NAMENS_PRAEFIX + shareId;
}

/**
 * Prüft ein Passwort gegen einen gespeicherten Hash.
 *
 * `hash` darf `null` sein, weil `shares.password_hash` nullable ist und die
 * Aufrufer die Spalte bekommen, wie sie ist. `bcrypt.compareSync("x", null)`
 * **wirft** („Illegal arguments: string, object"); auf einer öffentlichen
 * Byte-Route wäre das HTTP 500 statt der spezifizierten 401. Ein Share ohne
 * Passwort ist hier kein Freibrief, sondern eine Ablehnung: „hat kein Passwort"
 * beantwortet nicht die Frage „ist dieses Passwort richtig".
 */
export function bcryptVerify(passwort: string, hash: string | null | undefined): boolean {
  if (!hash || !passwort) return false;
  try {
    return bcrypt.compareSync(passwort, hash);
  } catch {
    // Unrat in der Spalte (abgeschnitten, fremdes Format) ist eine Ablehnung,
    // kein Absturz — sonst entscheidet eine kaputte Zeile über den Statuscode.
    return false;
  }
}

/** Hash für ein NEUES Passwort — dieselbe Familie und derselbe cost wie im Bestand. */
export function bcryptHash(passwort: string): string {
  return bcrypt.hashSync(passwort, KOSTEN);
}

/**
 * Die Cookie-Vorlage für einen entsperrten Share, oder `null`, wenn der Share
 * bereits abgelaufen ist (dann gibt es keine Entsperrung zu beglaubigen — ein
 * negatives `maxAge` wäre ein Lösch-Cookie).
 *
 * `maxAge = min(4 h, Restlaufzeit)`: ohne die zweite Hälfte überlebt die
 * Entsperrung den Share. `gueltigBis` im Wert bezeichnet **denselben** Zeitpunkt
 * wie `maxAge` — die eine Zahl prüft der Browser, die andere prüfen wir.
 *
 * `Path=/` ist nötig, weil `/api/download/…` und `/api/preview/…` dasselbe
 * Cookie lesen; `Secure` nur in Produktion, weil das Cookie über `http` im
 * Entwicklungsaufbau sonst nie ankäme.
 */
export function erzeugeShareCookie(
  shareId: string,
  shareAblauf: Date,
  jetzt: Date = new Date(),
): ShareCookieVorlage | null {
  const name = cookieName(shareId);
  const restSekunden = Math.floor((shareAblauf.getTime() - jetzt.getTime()) / 1000);
  if (restSekunden <= 0) return null;

  const maxAge = Math.min(MAX_ENTSPERRUNG_SEKUNDEN, restSekunden);
  const gueltigBisSekunden = String(Math.floor(jetzt.getTime() / 1000) + maxAge);
  return {
    name,
    value: cookieWert(shareId, gueltigBisSekunden),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/**
 * Gilt dieses Cookie für **diesen** Share, jetzt?
 *
 * Die Share-Bindung ist kryptografisch: signiert wird über die **erwartete** ID,
 * und verglichen wird der **ganze** Wert. Damit gibt es keinen löschbaren
 * `if`-Riegel, dessen Wegfall aus „gilt für diesen Share" still „gilt für jeden
 * Share" machen würde — Cookie-Namen wählt der Client, ein Wert von Share A
 * erreicht uns also jederzeit unter dem Namen von Share B.
 */
export function istCookieGueltig(
  shareId: string,
  wert: string | null | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (!wert) return false;

  const teile = wert.split(".");
  if (teile.length !== 3) return false;
  const gueltigBisRoh = teile[1];
  if (!SEKUNDEN_FORM.test(gueltigBisRoh)) return false;

  // Hier steht bewusst KEINE Formprüfung der `shareId` — anders als in
  // `cookieName`, wo sie einen Header schützt. Für eine ID beliebiger Gestalt
  // kann ohne `AUTH_SECRET` niemand einen Wert signieren, die Prüfung wäre also
  // ohne Wirkung: eine Zeile, die kein Mutationstest rot bekommt, und damit
  // Ballast, den die nächste Runde für einen Riegel hält.
  //
  // Erst die Beglaubigung, dann die Frist: `gueltigBisRoh` ist bis hierhin ein
  // Wunsch des Clients. Verglichen wird der vollständige Wert, nicht nur der
  // HMAC-Abschnitt — die ID im ersten Feld ist damit mitgeprüft.
  if (!zeitgleichGleich(wert, cookieWert(shareId, gueltigBisRoh))) return false;

  return Number(gueltigBisRoh) * 1000 > jetzt.getTime();
}

function cookieWert(shareId: string, gueltigBisSekunden: string): string {
  const nachricht = `${DOMAENE}${shareId}.${gueltigBisSekunden}`;
  const hmac = createHmac("sha256", geheimnis()).update(nachricht, "utf8").digest("base64url");
  return `${shareId}.${gueltigBisSekunden}.${hmac}`;
}

/**
 * Beim Aufruf gelesen, nicht beim Laden des Moduls: sonst hinge die Signatur an
 * der Umgebung des ersten Imports (und kein Test könnte belegen, dass das
 * Geheimnis überhaupt eingeht).
 *
 * Der Wurf ist Absicht. `false` wäre sicher, aber die Fehlkonfiguration sähe für
 * jeden Empfänger wie „Passwort falsch" aus — bei einer Pflichtvariable, ohne
 * die Auth.js ohnehin laut ausfällt, ist das die schlechtere Diagnose.
 */
function geheimnis(): string {
  const wert = process.env.AUTH_SECRET;
  if (!wert) {
    throw new Error(
      "AUTH_SECRET fehlt — ohne dieses Geheimnis ist keine Share-Entsperrung signierbar (§7.4).",
    );
  }
  return wert;
}

/** `timingSafeEqual` wirft bei ungleich langen Puffern; der Wert kommt vom Client. */
function zeitgleichGleich(a: string, b: string): boolean {
  const links = Buffer.from(a, "utf8");
  const rechts = Buffer.from(b, "utf8");
  if (links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}
