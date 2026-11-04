/**
 * DIE HELFER-SITZUNG OHNE ANMELDUNG — ein signiertes JWT (HS256) in einem host-gebundenen Cookie, das nur
 * die Kennung des eingelösten Zugangs trägt. Sperrung und Name kommen bei jedem Zugriff aus der Datenbank
 * des Moduls, der Ablauf aus dem `exp` des Tokens.
 *
 * Warum in `core`: das Lagerbuch (Zugangs-Kärtchen, `lagerbuch/_lib/helferSitzung.ts`) und das
 * Verpflegungslager (Helfer-Link, IDA-316) stellen dieselbe Sitzung aus; das Funkmodul trägt die Form als
 * Vorbild (`radio/_lib/ausleihSitzung.ts`). Jedes Modul behält seinen Cookie-Namen und sein Geheimnis.
 *
 * Kein `"use client"` (Falle 6). Das Geheimnis kommt als Thunk: `next build` wertet Modulebene ohne
 * Secrets aus.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookiesSicher } from "@/core/lokalHttp";

export interface HelferSitzung {
  tokenId: string;
  laeuftAb: Date;
}

const schluessel = (geheimnis: string) => new TextEncoder().encode(geheimnis);

export async function stelleHelferSitzungAus(geheimnis: string, tokenId: string, gueltigSekunden: number): Promise<string> {
  return new SignJWT({ tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + gueltigSekunden)
    .sign(schluessel(geheimnis));
}

/**
 * Prüft Signatur und Ablauf. Verlangt nur `tokenId` (Zeichenkette) und `exp`; überzählige Felder werden
 * ignoriert — so verifizieren ältere Cookies mit mehr Feldern weiter. Wirft nie: der Wert ist Nutzereingabe.
 * `algorithms` steht ausdrücklich da, sonst nähmen manche Bibliotheken `alg: none`.
 */
export async function pruefeHelferSitzung(geheimnis: string, wert: string): Promise<HelferSitzung | null> {
  try {
    const { payload } = await jwtVerify(wert, schluessel(geheimnis), { algorithms: ["HS256"] });
    const { tokenId, exp } = payload as { tokenId?: unknown; exp?: unknown };
    if (typeof tokenId !== "string" || tokenId === "") return null;
    if (typeof exp !== "number") return null;
    return { tokenId, laeuftAb: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

/**
 * Cookie-Attribute — beim Setzen wie beim Löschen dieselben (`gueltigSekunden = 0` löscht).
 * KEIN `domain`: die Helfer-Sitzung gilt nur auf dem Host des Moduls, nie auf den anderen Suite-Hosts.
 */
export function helferCookieAttribute(gueltigSekunden: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: cookiesSicher(),
    maxAge: gueltigSekunden,
  };
}
