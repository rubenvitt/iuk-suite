"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb } from "../_db/client";
import { istLinkCode, neuerLinkCode } from "../_lib/kennung";
import { Abgelehnt, anfragenSeit, legeAnfrageAn, NichtGefunden, zieheZurueck } from "../_lib/vermietung";
import { pruefeAnfrage, type Ergebnis } from "../_lib/vermietungEingabe";
import { requireGemeinschaftHostAktion } from "../_lib/zugang";

/*
 * Die Actions ohne Anmeldung: Bar anfragen und Anfrage zurückziehen (IDA-315).
 *
 * SCHUTZ GEGEN MASSENABSENDEN, drei Schichten (Vorbild `feedback/actions.ts`, `core/ratelimit.ts`):
 * 1. Längen- und Wertgrenzen jedes Feldes in zod (`_lib/vermietungEingabe.ts`), Zeitraum höchstens drei Tage,
 *    höchstens 18 Monate im Voraus.
 * 2. Ein Zähler je Absender (`clientIpAus`, Prozessspeicher, Notbremse): 15 Anfragen je Stunde, also weniger
 *    als das Budget aus 3 — ein einzelner Absender kann die Bar so nicht für alle anderen sperren.
 * 3. Ein Mengenbudget in der Datenbank (überlebt Neustarts, gilt über alle Absender): höchstens
 *    `ANFRAGEN_JE_STUNDE` neue Anfragen je Stunde. Danach bittet die Seite, es später zu versuchen.
 * Dazu ein Honigtopf-Feld (`webseite`), das ein Mensch nie sieht: ist es gefüllt, antwortet die Action wie
 * bei Erfolg, speichert aber nichts.
 */

const jeAbsender = new RateLimiter({ windowMs: 60 * 60_000, max: 15 });
// Nicht exportiert: in einer `"use server"`-Datei darf jeder Export nur eine async-Funktion sein.
const ANFRAGEN_JE_STUNDE = 60;
const ZU_VIELE = "Gerade kommen sehr viele Anfragen an. Versuch es bitte in einer Stunde noch einmal.";

function neuLaden(): void {
  revalidatePath("/m/gemeinschaft", "layout");
}

/** Schickt eine Anfrage ab. Angemeldet (egal welche Gruppe) wird sie als Anfrage eines Mitglieds gespeichert. */
export async function anfrageSendenAction(eingabe: unknown): Promise<Ergebnis<{ code: string }>> {
  await requireGemeinschaftHostAktion();
  // Ein unlesbares Sitzungs-Cookie ist „nicht angemeldet“, kein Fehler (wie `app/login/page.tsx`).
  const viewer = await auth().then((s) => s?.user ?? null, () => null);
  const jetzt = Date.now();
  const p = pruefeAnfrage(eingabe, jetzt);
  if (!p.ok) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: p.feldFehler };
  if (p.wert.webseite.trim() !== "") return { ok: true, wert: { code: neuerLinkCode() } };
  if (!jeAbsender.check(clientIpAus(await headers()))) return { ok: false, fehler: ZU_VIELE };
  return withAuditContext({ actor: viewer ? auditActor(viewer) : { kind: "anonymous" } }, async () => {
    const db = getDb();
    if (anfragenSeit(db, jetzt - 3_600_000) >= ANFRAGEN_JE_STUNDE) return { ok: false, fehler: ZU_VIELE };
    try {
      const code = legeAnfrageAn(db, p.wert, viewer !== null, jetzt);
      neuLaden();
      return { ok: true, wert: { code } };
    } catch (e) {
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}

/** Die Person zieht ihre Anfrage zurück; erreichbar nur mit dem Code der Statusseite. */
export async function anfrageZurueckziehenAction(code: string): Promise<Ergebnis> {
  await requireGemeinschaftHostAktion();
  if (typeof code !== "string" || !istLinkCode(code)) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    try {
      zieheZurueck(getDb(), code, Date.now());
      neuLaden();
      return { ok: true };
    } catch (e) {
      if (e instanceof NichtGefunden) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}
