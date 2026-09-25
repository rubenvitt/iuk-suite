import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import { helferSitzungGeheimnis } from "./grenzen";
import { HELFER_COOKIE, helferCookieOptionen } from "./helferSitzung";

/**
 * DAS MERKMAL „BEKANNTES GERÄT" — DRK-291, Betreiberentscheidung Variante C.
 * KEIN "use client" (Falle 6): Aufrufer sind die drei Gate-Flächen und die
 * Gate-Seite, alle serverseitig.
 *
 * WOZU ES DA IST: der Coderaum dieses Moduls ist 10^6 (`tokenForm.ts`), und der
 * Absenderschlüssel ist fälschbar (Betreiberentscheidung D6). Gegen Raten trägt
 * allein die modulweite Sperre in `gateSchranke.ts` — und genau die konnte jeder
 * Unangemeldete mit 31 Fehlversuchen pro Minute für ALLE auslösen, auch für
 * richtige Codes. Ein Gerät, das schon einmal mit einem richtigen Code
 * hereinkam, trägt dieses Merkmal und zählt ab dann in EIGENE Eimer, die ein
 * Unbekannter nicht füllen kann.
 *
 * ⚠️ WAS ES NICHT IST: kein Zugang. Es öffnet keine Seite und ersetzt keinen
 * Code; es entscheidet allein, in welchen Fehlversuchs-Eimer eine Anfrage fällt.
 * Wer es trägt, muss trotzdem einen richtigen Code eingeben.
 *
 * ⚠️ DER BEWUSSTE REST: ein Gerät OHNE Merkmal — das neue Telefon, das genau
 * während eines Angriffs zum ersten Mal scannt — bleibt mit einem ALTEN Code
 * gesperrt, bis die Sperre abläuft (Rechnung in
 * `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md`, §3.5.3). Seit
 * DRK-442 gilt das nur noch für die 6-stellige Form; lange Codes sperrt nichts.
 *
 * ZWEI QUELLEN, EIN ERGEBNIS:
 *  1. das Gerätecookie `lagerbuch_geraet` — ein Jahr gültig, nach jeder
 *     erfolgreichen Einlösung gesetzt;
 *  2. die Helfer-Sitzung, auch ABGELAUFEN (bis `SITZUNG_NACHSICHT_SEKUNDEN`) —
 *     damit trägt jedes Gerät, das beim Einspielen dieser Änderung schon eine
 *     Sitzung hatte, das Merkmal sofort, und die Erneuerung greift auch dann,
 *     wenn die Uhr des Geräts die Sitzung knapp überholt hat.
 * Beide werden mit DEMSELBEN Geheimnis signiert, aber gegenseitig
 * ausgeschlossen: das Gerätecookie trägt eine eigene `aud` und kein `tokenId`
 * (`verifyHelferSitzung` weist es damit ab), die Sitzung trägt keine `aud`
 * (die Geräteprüfung unten weist sie ab).
 */

export const GERAET_COOKIE = "lagerbuch_geraet";

/** Ein Jahr. Das Merkmal soll die nächste Schicht überleben, nicht nur diese. */
export const GERAET_GUELTIGKEIT_SEKUNDEN = 365 * 24 * 3600;

/** Wie lange eine ABGELAUFENE Helfer-Sitzung noch als Merkmal zählt. */
const SITZUNG_NACHSICHT_SEKUNDEN = 30 * 24 * 3600;

const GERAET_AUD = "lagerbuch-geraet";

const schluessel = () => new TextEncoder().encode(helferSitzungGeheimnis());

async function geraetId(wert: string | undefined): Promise<string | null> {
  if (!wert) return null;
  try {
    const { payload } = await jwtVerify(wert, schluessel(), {
      algorithms: ["HS256"], audience: GERAET_AUD,
    });
    const { geraet, exp } = payload as { geraet?: unknown; exp?: unknown };
    if (typeof geraet !== "string" || geraet === "" || typeof exp !== "number") return null;
    return geraet;
  } catch {
    return null;
  }
}

async function sitzungEcht(wert: string | undefined): Promise<boolean> {
  if (!wert) return false;
  try {
    const { payload } = await jwtVerify(wert, schluessel(), {
      algorithms: ["HS256"], clockTolerance: SITZUNG_NACHSICHT_SEKUNDEN,
    });
    const { tokenId, exp, aud } = payload as { tokenId?: unknown; exp?: unknown; aud?: unknown };
    return aud === undefined && typeof tokenId === "string" && tokenId !== "" && typeof exp === "number";
  } catch {
    return false;
  }
}

/**
 * Der Eimer-Schlüssel des Merkmals, oder `null` für ein unbekanntes Gerät.
 * Liest nur Cookies — kein Datenbankzugriff, dieselbe Auflage wie
 * `gateGesperrt`. Ein gesperrter Code macht eine Sitzung dabei NICHT
 * merkmalslos; das hieße, vor der Sperre die Datenbank zu fragen. Der Preis ist
 * gedeckelt: wer ein Merkmal hat, rät höchstens im modulweiten Budget der
 * bekannten Geräte.
 *
 * Der Sitzungsschlüssel ist ein Hash des Cookie-Werts, nicht das `tokenId`:
 * alle Geräte mit derselben Karte teilten sich sonst einen Eimer.
 */
export async function gateMerkmal(
  lies: (name: string) => string | undefined,
): Promise<string | null> {
  const geraet = await geraetId(lies(GERAET_COOKIE));
  if (geraet) return `geraet:${geraet}`;
  const sitzung = lies(HELFER_COOKIE);
  if (sitzung && await sitzungEcht(sitzung)) {
    return `sitzung:${createHash("sha256").update(sitzung).digest("hex").slice(0, 32)}`;
  }
  return null;
}

/**
 * Der Wert des Gerätecookies nach einer ERFOLGREICHEN Einlösung. Ein schon
 * vorhandenes, gültiges Merkmal behält seine Kennung — sonst wechselte das Gerät
 * bei jeder Anmeldung den Eimer und begänne mit frischem Budget.
 */
export async function geraetCookieWert(bisher: string | undefined): Promise<string> {
  const geraet = (await geraetId(bisher)) ?? crypto.randomUUID();
  return new SignJWT({ geraet })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(GERAET_AUD)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + GERAET_GUELTIGKEIT_SEKUNDEN)
    .sign(schluessel());
}

/** Dieselben Attribute wie die Helfer-Sitzung (host-only, httpOnly), nur länger. */
export function geraetCookieOptionen() {
  return helferCookieOptionen(GERAET_GUELTIGKEIT_SEKUNDEN);
}
