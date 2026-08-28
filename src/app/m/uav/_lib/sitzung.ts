import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { UavDb } from "../_db/client";
import { participants, sessions } from "../_db/schema";

export const SID_COOKIE = "sid";                        // Alt: sessions.ts:10
export const TEILNEHMER_TTL_MS = 180 * 24 * 60 * 60 * 1000; // Alt: sessions.ts:13

export type Identity =
  | { kind: "anon" }
  | { kind: "participant"; id: string; name: string }
  | { kind: "admin"; id: string; name: string | null; email: string | null };

export function tokenHash(roh: string): string {
  return createHash("sha256").update(roh).digest("hex");
}

export function sessionErzeugen(db: UavDb, participantId: string): string {
  const roh = randomBytes(32).toString("base64url");
  const jetzt = Date.now();
  db.insert(sessions).values({
    token: tokenHash(roh), kind: "participant", subjectId: participantId,
    createdAt: new Date(jetzt).toISOString(), expiresAt: new Date(jetzt + TEILNEHMER_TTL_MS).toISOString(),
  }).run();
  return roh;
}

export function sessionValidieren(db: UavDb, roh: string): Identity | null {
  if (!roh) return null;
  const hash = tokenHash(roh);
  const zeile = db.select().from(sessions).where(eq(sessions.token, hash)).get();
  if (!zeile) return null;
  // Der Token ist 256 Bit Zufall und wird über seinen Hash per Primärschlüssel
  // (`sessions.token`) nachgeschlagen — genau das Muster der Alt-Anwendung
  // (`uav-praxis/server/auth/sessions.ts`). Ein Index-Lookup kann nicht anders
  // ausfallen als "Treffer" oder "kein Treffer"; ein zeitkonstanter Vergleich
  // obendrauf hätte nichts mehr zu vergleichen, das nicht schon feststeht.
  if (new Date(zeile.expiresAt).getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.token, hash)).run();
    return null;
  }
  if (zeile.kind !== "participant") return null;      // Alt-Admin-Sessions verfallen bewusst (Spec §2)
  const p = db.select({ id: participants.id, name: participants.name }).from(participants)
    .where(and(eq(participants.id, zeile.subjectId), eq(participants.aktiv, 1))).get();
  return p ? { kind: "participant", id: p.id, name: p.name } : null;
}

export function sessionLoeschen(db: UavDb, roh: string): void {
  if (roh) db.delete(sessions).where(eq(sessions.token, tokenHash(roh))).run();
}

export function sidCookieOptionen(): { httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; maxAge: number } {
  return { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: TEILNEHMER_TTL_MS / 1000 };
}
