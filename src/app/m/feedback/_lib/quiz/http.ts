// Bausteine der öffentlichen Quiz-Route-Handler. Nur Server, kein "use client" (Falle 6, `CLAUDE.md`).
// Die Handler bekommen ein schlichtes `Request` (auch in den Tests), deshalb liest diese Datei
// Cookies aus dem Kopf und nicht über `next/headers`.
import { cookiesSicher } from "@/core/lokalHttp";

/** Die Quiz-Bodies sind winzig (`{ frageIndex, gewaehlt }`); mehr wird nie gelesen. */
export const QUIZ_MAX_BODY_BYTES = 1024;
/** Längere Pfadteile sind nie ein Code bzw. Secret und gehen nicht erst in die Datenbank. */
export const CODE_MAX = 16;
export const SECRET_MAX = 128;
/** Ein Abend dauert keine 12 h; danach ist die Runde ohnehin beendet (Auto-Ende). */
export const BEITRITT_COOKIE_MAX_AGE_S = 12 * 60 * 60;

/** Jede Antwort der Quizwege ist ein Augenblicksstand: nie zwischenspeichern. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const fehler = (status: number, code: string) =>
  json({ fehler: code }, status);

/**
 * Den Body als JSON lesen, nie mehr als `maxBytes` — `content-length` kann fehlen oder lügen,
 * gezählt wird deshalb beim Lesen. Ein leerer Body ist `undefined` (der Aufrufer entscheidet).
 */
export async function leseJson(
  req: Request,
  maxBytes = QUIZ_MAX_BODY_BYTES,
): Promise<{ ok: true; wert: unknown } | { ok: false }> {
  const angegeben = req.headers.get("content-length");
  if (
    angegeben !== null &&
    (!/^\d+$/.test(angegeben) || Number(angegeben) > maxBytes)
  )
    return { ok: false };
  const leser = req.body?.getReader();
  if (!leser) return { ok: true, wert: undefined };
  const teile: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await leser.cancel();
        return { ok: false };
      }
      teile.push(value);
    }
    const text = Buffer.concat(teile).toString("utf8");
    return text.trim() === ""
      ? { ok: true, wert: undefined }
      : { ok: true, wert: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export const istObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Nur diese Schlüssel, keine weiteren. */
export const nurSchluessel = (
  o: Record<string, unknown>,
  erlaubt: string[],
): boolean => Object.keys(o).every((k) => erlaubt.includes(k));

export function cookieWert(req: Request, name: string): string | null {
  const kopf = req.headers.get("cookie");
  if (!kopf) return null;
  for (const teil of kopf.split(";")) {
    const i = teil.indexOf("=");
    if (i === -1) continue;
    if (teil.slice(0, i).trim() === name)
      return teil.slice(i + 1).trim() || null;
  }
  return null;
}

/** Ein Cookie je Runde: eine neue Runde ist ein neuer Beitritt. */
export function quizCookie(rundeId: number): string {
  return `iuk-quiz-${rundeId}`;
}

export function quizCookieOptionen(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookiesSicher(),
    maxAge: BEITRITT_COOKIE_MAX_AGE_S,
  };
}
