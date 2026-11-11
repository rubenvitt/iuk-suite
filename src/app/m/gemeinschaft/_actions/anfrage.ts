"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { TURNSTILE_ABGELEHNT, TURNSTILE_AKTIONEN } from "@/core/turnstile/aktionen";
import { pruefeTurnstile } from "@/core/turnstile/server";
import { getDb } from "../_db/client";
import { istLinkCode, neuerLinkCode } from "../_lib/kennung";
import { fassungMitMieter } from "../_lib/dokumentErzeugen";
import {
  Abgelehnt, anfragenSeit, codeDerSendung, dokumentGrundlage, legeAnfrageAn, legeUnterschriebenAb, NichtGefunden, pruefeUnterschreibbar, zeichnenErlaubt, zieheZurueck,
} from "../_lib/vermietung";
import { istDokumentart } from "../_lib/vermietungTypen";
import { unterschriftAusDataUrl } from "../_lib/vertragUnterschrift";
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
 * bei Erfolg, speichert aber nichts. Und Cloudflare Turnstile (IDA-341, `core/turnstile`), wenn konfiguriert: VOR
 * dem Zähler je Absender, denn der ist auf dem Modulhost faktisch ein Sammel-Eimer (`clientIpAus`) — ein Bot ohne
 * Token soll ihn nicht für alle anderen leeren. Eine Wiederholung einer schon angelegten Sendung kommt ohne neue
 * Prüfung durch (ihr Token ist bei Cloudflare verbraucht) und bekommt den Statuslink von damals.
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

/** Das Turnstile-Token des Formulars (IDA-341); fehlt es, prüft `pruefeTurnstile` ein leeres. */
function tokenAus(eingabe: unknown): string {
  const t = (eingabe as { turnstile?: unknown } | null)?.turnstile;
  return typeof t === "string" ? t : "";
}

export async function anfrageSendenAction(eingabe: unknown): Promise<Ergebnis<{ code: string }>> {
  await requireGemeinschaftHostAktion();
  // Ein unlesbares Sitzungs-Cookie ist „nicht angemeldet“, kein Fehler (wie `app/login/page.tsx`).
  const viewer = await auth().then((s) => s?.user ?? null, () => null);
  const jetzt = Date.now();
  const p = pruefeAnfrage(eingabe, jetzt);
  if (!p.ok) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: p.feldFehler };
  if (p.wert.webseite.trim() !== "") return { ok: true, wert: { code: neuerLinkCode() } };
  const sendung = sendungAus(eingabe);
  const frueher = sendung ? codeDerSendung(getDb(), sendung) : null;
  if (frueher) return { ok: true, wert: { code: frueher } };
  if (!(await pruefeTurnstile(tokenAus(eingabe), TURNSTILE_AKTIONEN.bar))) return { ok: false, fehler: TURNSTILE_ABGELEHNT };
  if (!jeAbsender.check(clientIpAus(await headers()))) return { ok: false, fehler: ZU_VIELE };
  return withAuditContext({ actor: viewer ? auditActor(viewer) : { kind: "anonymous" } }, async () => {
    const db = getDb();
    if (anfragenSeit(db, jetzt - 3_600_000) >= ANFRAGEN_JE_STUNDE) return { ok: false, fehler: ZU_VIELE };
    try {
      const code = legeAnfrageAn(db, p.wert, viewer !== null, jetzt, sendung);
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
 * Die Person unterschreibt ein freigegebenes Dokument auf der Statusseite (IDA-343, IDA-354): getippter Name,
 * gezeichnete Unterschrift (PNG als Data-URL, höchstens 400 KB — passt unter die 1 MB der Server Actions) und die
 * Version des Dokuments, die sie gesehen hat. Der Server setzt die Unterschrift in alle ihre Felder und legt die
 * fertige PDF beim Eintrag ab.
 */
export async function vertragUnterschreibenAction(code: string, art: unknown, eingabe: { name?: unknown; bild?: unknown; version?: unknown }): Promise<Ergebnis> {
  await requireGemeinschaftHostAktion();
  if (typeof code !== "string" || !istLinkCode(code) || !istDokumentart(art)) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
  const name = typeof eingabe?.name === "string" ? eingabe.name.trim() : "";
  if (name.length < 2 || name.length > NAME_MAX) return { ok: false, fehler: "Bitte deinen Namen eingeben.", feldFehler: { name: "Bitte deinen Namen eingeben." } };
  const bild = unterschriftAusDataUrl(eingabe?.bild);
  if (!bild) return { ok: false, fehler: "Bitte unterschreib im Feld." };
  const version = typeof eingabe?.version === "number" && Number.isInteger(eingabe.version) && eingabe.version > 0 ? eingabe.version : null;
  if (!version) return { ok: false, fehler: "Bitte die Seite neu laden." };
  if (!jeAbsenderUnterschrift.check(clientIpAus(await headers()))) return { ok: false, fehler: "Zu viele Versuche. Bitte in einer Stunde noch einmal." };

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    try {
      const a = pruefeUnterschreibbar(db, { code }, art);
      if (a.version !== version) throw new Abgelehnt("Das Dokument wurde gerade geändert. Bitte die Seite neu laden und noch einmal ansehen.");
      const g = dokumentGrundlage(db, a.id, art);
      if (!g) throw new NichtGefunden();
      if (!zeichnenErlaubt(db, art)) throw new Abgelehnt("Bitte das unterschriebene Dokument hochladen.");
      const am = Date.now();
      let fassung: Awaited<ReturnType<typeof fassungMitMieter>>;
      try {
        fassung = await fassungMitMieter(g, art, { name, bild, am });
      } catch {
        return { ok: false, fehler: "Die Unterschrift ließ sich nicht übernehmen. Bitte noch einmal zeichnen." };
      }
      legeUnterschriebenAb(db, { code }, art, { inhalt: fassung.inhalt, herkunft: "gezeichnet", unterschrift: { name, bild, am, feldIds: fassung.feldIds }, version }, am);
      neuLaden();
      return { ok: true };
    } catch (e) {
      if (e instanceof NichtGefunden) return { ok: false, fehler: "Diese Anfrage gibt es nicht." };
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
  });
}
