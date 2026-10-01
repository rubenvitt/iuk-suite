import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb, type KommplanDb } from "../_db/client";
import { loeseToken, zaehleAbruf, type TokenTreffer } from "./freigaben";

/**
 * DER RIEGEL DER TOKEN-ANSICHT (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 4–6) — nur Server.
 *
 * - KEINE FEHLVERSUCHS-SPERRE MEHR (Abnahme kommplan): ein Token hat 256 Bit, Raten ist aussichtslos — eine Sperre
 *   schützte nichts, kostete aber Verfügbarkeit. Sie sperrte auch gültige Links (sonst wäre sie ein Orakel), und ihr
 *   Schlüssel `cf-connecting-ip` ist auf Modul-Hosts nicht sicher die Client-Adresse (`core/ratelimit`, Selbst-Hop):
 *   dreißig falsche Aufrufe von irgendwem hätten jeden Link für alle auf 404 gesetzt. Ein Fehlversuch kostet eine
 *   Abfrage über den Index auf `token` und dasselbe 404 wie jeder andere.
 * - Abrufe: ein UPDATE je Abruf, dieselbe Adresse und derselbe Link zählen binnen 60 s nur einmal.
 * - Layout und Seite rendern parallel und fragen beide: `tokenAbruf` ist je Anfrage gecacht (React `cache`), also
 *   bucht genau der erste Aufruf. Er gibt `null` zurück; `notFound()` rufen die Aufrufer — keine gecachte Ausnahme.
 */
export const TOKEN_SCHRANKE = { abrufFensterMs: 60_000 } as const;
export interface Schranken { abrufe: RateLimiter }
export function neueSchranken(now?: () => number): Schranken {
  return { abrufe: new RateLimiter({ windowMs: TOKEN_SCHRANKE.abrufFensterMs, max: 1, now }) };
}
const SCHRANKEN = neueSchranken();

export function pruefeTokenAbruf(db: KommplanDb, token: string, absender: string, jetzt: number, s: Schranken): TokenTreffer | null {
  const treffer = loeseToken(db, token, jetzt);
  if (!treffer) return null;
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
