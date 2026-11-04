"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb } from "../_db/client";
import { istLinkCode, neuerLinkCode } from "../_lib/kennung";
import {
  Abgelehnt, anfragenSeit, ladeVorlage, legeAnfrageAn, legeUnterschriebenAb, NichtGefunden, pruefeUnterschreibbar, zieheZurueck,
} from "../_lib/vermietung";
import { zeitraumText } from "../_lib/vermietungText";
import { vertragDateiname, vertragTitel } from "../_lib/vertragName";
import { unterschriebenePdf, unterschriftAusDataUrl } from "../_lib/vertragUnterschrift";
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
/**
 * IDA-358: die Sendungs-ID des Formulars (`core/entwurf`) — sie wird die ID der Anfrage, eine Wiederholung derselben
 * Sendung bekommt den Statuslink von damals. Nur eine UUID zählt; ohne (offene alte Seite) wie bisher.
 */
function sendungAus(eingabe: unknown): string | undefined {
  const s = (eingabe as { sendung?: unknown } | null)?.sendung;
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : undefined;
}

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
      const code = legeAnfrageAn(db, p.wert, viewer !== null, jetzt, sendungAus(eingabe));
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

const jeAbsenderUnterschrift = new RateLimiter({ windowMs: 60 * 60_000, max: 20 });
const NAME_MAX = 120;

/**
 * Die Person unterschreibt den Mietvertrag auf der Statusseite (IDA-343): getippter Name, gezeichnete Unterschrift
 * (PNG als Data-URL, höchstens 400 KB — passt unter die 1 MB der Server Actions) und der Stand der Vorlage, die sie
 * gesehen hat. Der Server setzt die Unterschrift in das Feld der Vorlage und legt die PDF beim Eintrag ab.
 */
export async function vertragUnterschreibenAction(code: string, eingabe: { name?: unknown; bild?: unknown; stand?: unknown }): Promise<Ergebnis> {
  await requireGemeinschaftHostAktion();
  if (typeof code !== "string" || !istLinkCode(code)) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
  const name = typeof eingabe?.name === "string" ? eingabe.name.trim() : "";
  if (name.length < 2 || name.length > NAME_MAX) return { ok: false, fehler: "Bitte deinen Namen eingeben.", feldFehler: { name: "Bitte deinen Namen eingeben." } };
  const png = unterschriftAusDataUrl(eingabe?.bild);
  if (!png) return { ok: false, fehler: "Bitte unterschreib im Feld." };
  const stand = typeof eingabe?.stand === "string" && /^[0-9a-f]{64}$/.test(eingabe.stand) ? eingabe.stand : null;
  if (!stand) return { ok: false, fehler: "Bitte die Seite neu laden." };
  if (!jeAbsenderUnterschrift.check(clientIpAus(await headers()))) return { ok: false, fehler: "Zu viele Versuche. Bitte in einer Stunde noch einmal." };

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    try {
      const a = pruefeUnterschreibbar(db, code);
      const v = ladeVorlage(db);
      if (!v || v.sha256 !== stand) throw new Abgelehnt("Der Vertrag wurde gerade geändert. Bitte die Seite neu laden und noch einmal ansehen.");
      if (!v.zeichnen) throw new Abgelehnt("Bitte den unterschriebenen Vertrag hochladen.");
      const jetzt = Date.now();
      let pdf: Uint8Array;
      try {
        pdf = await unterschriebenePdf(v.inhalt, v.feld, png, { name, am: jetzt, zeitraum: zeitraumText(a.von, a.bis), anlass: a.anlass, titel: vertragTitel(a.von, true) });
      } catch {
        return { ok: false, fehler: "Die Unterschrift ließ sich nicht übernehmen. Bitte noch einmal zeichnen." };
      }
      const datei = Buffer.from(pdf);
      legeUnterschriebenAb(db, code, {
        name: vertragDateiname(a.von, true), inhalt: datei, herkunft: "gezeichnet", unterschriebenVon: name, vorlageStand: stand,
      }, jetzt);
      neuLaden();
      return { ok: true };
    } catch (e) {
      if (e instanceof NichtGefunden) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}
