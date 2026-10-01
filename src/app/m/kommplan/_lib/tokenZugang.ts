import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb, type KommplanDb } from "../_db/client";
import { loeseToken, zaehleAbruf, type TokenTreffer } from "./freigaben";

/**
 * DER RIEGEL DER TOKEN-ANSICHT (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 4–6) — nur Server.
 *
 * - Fehlversuche (unbekannt, falsche Form, abgelaufen, widerrufen, archiviert) zählen je Absender; dreißig in einer
 *   Minute sperren die Adresse. Gesperrt heißt 404 OHNE Datenbankabfrage — auch für einen gültigen Token derselben
 *   Adresse, sonst wäre die Sperre ein Orakel. Gültige Abrufe buchen nichts. VORBEHALT (mitgehoben aus
 *   `core/ratelimit`): Prozessspeicher; ohne `cf-connecting-ip` teilen sich alle den Eimer "unknown".
 * - Abrufe: ein UPDATE je Abruf, dieselbe Adresse und derselbe Link zählen binnen 60 s nur einmal.
 * - Layout und Seite rendern parallel und fragen beide: `tokenAbruf` ist je Anfrage gecacht (React `cache`), also
 *   bucht genau der erste Aufruf. Er gibt `null` zurück; `notFound()` rufen die Aufrufer — keine gecachte Ausnahme.
 */
export const TOKEN_SCHRANKE = { fehlversucheJeMinute: 30, abrufFensterMs: 60_000 } as const;
export interface Schranken { fehlversuche: RateLimiter; abrufe: RateLimiter }
export function neueSchranken(now?: () => number): Schranken {
  return {
    fehlversuche: new RateLimiter({ windowMs: 60_000, max: TOKEN_SCHRANKE.fehlversucheJeMinute, now }),
    abrufe: new RateLimiter({ windowMs: TOKEN_SCHRANKE.abrufFensterMs, max: 1, now }),
  };
}
const SCHRANKEN = neueSchranken();

export function pruefeTokenAbruf(db: KommplanDb, token: string, absender: string, jetzt: number, s: Schranken): TokenTreffer | null {
  if (s.fehlversuche.istGesperrt(absender)) return null;
  const treffer = loeseToken(db, token, jetzt);
  if (!treffer) {
    s.fehlversuche.check(absender);
    return null;
  }
  if (s.abrufe.check(`${absender}|${treffer.freigabeId}`)) zaehleAbruf(db, treffer.freigabeId, jetzt);
  return treffer;
}

export const tokenAbruf = cache(async (token: string): Promise<TokenTreffer | null> =>
  pruefeTokenAbruf(getDb(), token, clientIpAus(await headers()), new Date().getTime(), SCHRANKEN));

/** Für `t/[token]/layout.tsx` und jede Seite darunter: derselbe Treffer, sonst ein echtes 404 (Falle 23). */
export async function tokenPlanOder404(token: string): Promise<TokenTreffer> {
  const t = await tokenAbruf(token);
  if (!t) notFound();
  return t;
}
