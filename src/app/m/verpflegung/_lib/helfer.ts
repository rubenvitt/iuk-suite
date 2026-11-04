/**
 * DER HELFER-LINK: Zugang am Telefon ohne Anmeldung (Entscheidung 2026-11-01 an IDA-311, „wie im Lagerbuch“).
 * Die Verwaltung erzeugt einen Link `/t/<code>` mit Namen und Ablauf; wer ihn öffnet, bekommt eine Sitzung im
 * Cookie dieses Hosts, und jede Buchung trägt den Namen des Links. Sperren wirkt sofort, weil Sperre, Ablauf und
 * Name bei jedem Zugriff aus der Datenbank kommen; das Cookie trägt nur die Kennung (`core/helferlink/sitzung.ts`).
 *
 * Kein `"use client"` (Falle 6).
 */
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { normalisiereZugangscode } from "@/core/helferlink/code";
import { pruefeHelferSitzung, stelleHelferSitzungAus } from "@/core/helferlink/sitzung";
import type { VerpflegungDb } from "../_db/client";
import { helferLink } from "../_db/schema";

/** Host-gebunden, nur dieses Modul liest ihn. */
export const HELFER_COOKIE = "verpflegung_helfer";

/** Höchstens so lange gilt eine Sitzung, auch wenn der Link länger gilt; danach den Link erneut öffnen. */
export const SITZUNG_HOECHSTENS_STUNDEN = 12;

type EnvLike = Record<string, string | undefined>;

/**
 * Das Geheimnis der Sitzung. Eigener Wert, wenn gesetzt; sonst aus `AUTH_SECRET` abgeleitet (HMAC mit eigenem
 * Zweck), damit der Live-Gang keine neue Pflichtvariable braucht. Im Thunk gelesen, nie auf Modulebene.
 */
export function helferGeheimnis(env: EnvLike = process.env): string {
  const eigen = env.VERPFLEGUNG_HELFER_SITZUNG_SECRET?.trim();
  if (eigen) return eigen;
  const basis = env.AUTH_SECRET?.trim() || (devLoginEnabled() ? "dev-only-insecure-secret-not-for-production" : "");
  if (!basis) throw new Error("Weder VERPFLEGUNG_HELFER_SITZUNG_SECRET noch AUTH_SECRET ist gesetzt.");
  return createHmac("sha256", basis).update("verpflegung:helfer-sitzung").digest("base64url");
}

export interface LinkZeile {
  id: string;
  name: string;
  gueltigBis: number;
  aktiv: boolean;
}

/** Gilt der Link jetzt? Aktiv und nicht abgelaufen. */
export const linkGilt = (l: Pick<LinkZeile, "aktiv" | "gueltigBis">, jetzt: number): boolean => l.aktiv && l.gueltigBis > jetzt;

/** Sekunden, die eine neue Sitzung gilt: bis zum Ablauf des Links, höchstens zwölf Stunden. */
export function sitzungSekunden(l: Pick<LinkZeile, "gueltigBis">, jetzt: number): number {
  return Math.max(0, Math.min(SITZUNG_HOECHSTENS_STUNDEN * 3600, Math.floor((l.gueltigBis - jetzt) / 1000)));
}

/**
 * Löst einen Code ein: `null`, wenn er unbekannt, gesperrt oder abgelaufen ist (von außen nicht unterscheidbar).
 * Schreibt `zuletzt_am` (reine Anzeige, nicht auditiert).
 */
export async function loeseEin(db: VerpflegungDb, roh: string, jetzt: number): Promise<{ wert: string; sekunden: number; link: LinkZeile } | null> {
  const code = normalisiereZugangscode(roh);
  if (!code) return null;
  const l = db.select({ id: helferLink.id, name: helferLink.name, gueltigBis: helferLink.gueltigBis, aktiv: helferLink.aktiv })
    .from(helferLink).where(eq(helferLink.code, code)).get();
  if (!l || !linkGilt(l, jetzt)) return null;
  const sekunden = sitzungSekunden(l, jetzt);
  if (sekunden <= 0) return null;
  db.update(helferLink).set({ zuletztAm: jetzt }).where(eq(helferLink.id, l.id)).run();
  return { wert: await stelleHelferSitzungAus(helferGeheimnis(), l.id, sekunden), sekunden, link: l };
}

/** Der Link hinter einem Cookie, wenn er jetzt gilt; sonst `null`. Wirft nie. */
export async function linkAusCookie(db: Pick<VerpflegungDb, "select">, wert: string | undefined, jetzt: number): Promise<(LinkZeile & { laeuftAb: Date }) | null> {
  if (!wert) return null;
  let geheimnis: string;
  try { geheimnis = helferGeheimnis(); } catch { return null; }
  const s = await pruefeHelferSitzung(geheimnis, wert);
  if (!s) return null;
  const l = db.select({ id: helferLink.id, name: helferLink.name, gueltigBis: helferLink.gueltigBis, aktiv: helferLink.aktiv })
    .from(helferLink).where(eq(helferLink.id, s.tokenId)).get();
  if (!l || !linkGilt(l, jetzt)) return null;
  return { ...l, laeuftAb: new Date(Math.min(s.laeuftAb.getTime(), l.gueltigBis)) };
}
