"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../_db/client";
import type { EhrlichAntwortweg, EhrlichStatus } from "../../_db/schema";
import { viewerFromSession } from "../viewer";
import { normiereAbholcode } from "./abholcode";
import {
  erneuereKastenSecret, gibAntwortFrei, holeAbholung, istKastenSecret, legeMitteilungAn, legeNotizAn,
  loescheMitteilung, schreibeZurueck, setzeRueckfrage, setzeStatus, tagVon, type Abholung,
} from "./daten";
import { EHRLICH_THEMEN, HONIGTOPF_FELD, KONTAKT_MAX, NAME_MAX, TEXT_MAX } from "./themen";
import { istEhrlichEinstieg } from "./adresse";
import { TURNSTILE_AKTIONEN, TURNSTILE_FELD } from "@/core/turnstile/aktionen";
import { pruefeTurnstile } from "@/core/turnstile/server";
import { istEhrlichLeser } from "./zugang";

/*
 * DIE AKTIONEN VON „EHRLICH GESAGT" (IDA-314).
 *
 * Öffentlich (ohne Sitzung): einwerfen, abholen, zurückschreiben. Sie laufen unter dem anonymen Akteur und
 * reichen der Datenschicht nie eine IP, ein Konto oder einen Zeitpunkt — die IP ist nur Schlüssel der
 * Ratenbegrenzung, flüchtig im Prozessspeicher (`core/ratelimit`), wie beim Dienstabend-Feedback
 * (`README.md`, „Die IP: nur Ratenbegrenzung").
 *
 * Verwaltung: jede Aktion prüft die Lesegruppe selbst (`leserOderAbweisen`) — eine Server Action läuft
 * ohne Layout, der Riegel der Seite schützt sie nicht.
 */

/** Falsches Secret oder falscher Code: 10 Fehlversuche je Minute und IP. */
const fehlversuche = new RateLimiter({ windowMs: 60_000, max: 10 });
/** Echte Einwürfe: 20 je Stunde und IP — genug für ein Vereins-WLAN hinter einer NAT-Adresse. */
const einwuerfe = new RateLimiter({ windowMs: 3_600_000, max: 20 });

const PFAD = "/m/feedback/ehrlich-gesagt";

function feld(fd: FormData, name: string, max: number): string {
  const roh = fd.get(name);
  return typeof roh === "string" ? roh.trim().slice(0, max) : "";
}

// ---- Öffentlich ----

export type EinwurfErgebnis =
  | { ok: true; antwortweg: EhrlichAntwortweg; code: string | null }
  | { ok: false; fehler: "leer" | "name" | "ratelimit" | "ungueltig" | "pruefung" };

/** Über den Link auf dem Aushang (Secret im Pfad). */
export async function einwerfenAktion(secret: string, _vorher: EinwurfErgebnis | null, fd: FormData): Promise<EinwurfErgebnis> {
  return withAuditContext({ actor: { kind: "anonymous" } }, async (): Promise<EinwurfErgebnis> => {
    const db = getDb();
    const ip = clientIpAus(await headers());
    if (!istKastenSecret(db, secret)) return fehlversuche.check(ip) ? { ok: false, fehler: "ungueltig" } : { ok: false, fehler: "ratelimit" };
    return einwerfen(fd, ip);
  });
}

/** Öffentlich über den Einstiegshost (IDA-340), ohne Secret — nur dort, sonst wie ein ungültiger Link. */
export async function einwerfenOeffentlichAktion(_vorher: EinwurfErgebnis | null, fd: FormData): Promise<EinwurfErgebnis> {
  return withAuditContext({ actor: { kind: "anonymous" } }, async (): Promise<EinwurfErgebnis> => {
    const kopf = await headers();
    const ip = clientIpAus(kopf);
    if (!istEhrlichEinstieg(kopf)) return fehlversuche.check(ip) ? { ok: false, fehler: "ungueltig" } : { ok: false, fehler: "ratelimit" };
    return einwerfen(fd, ip);
  });
}

async function einwerfen(fd: FormData, ip: string): Promise<EinwurfErgebnis> {
  const text = feld(fd, "text", TEXT_MAX);
  const wegRoh = fd.get("antwortweg");
  const antwortweg: EhrlichAntwortweg = wegRoh === "code" || wegRoh === "name" ? wegRoh : "keine";
  const name = feld(fd, "name", NAME_MAX);
  const kontakt = feld(fd, "kontakt", KONTAKT_MAX);
  const themaRoh = fd.get("thema");
  const thema = (EHRLICH_THEMEN as readonly string[]).includes(String(themaRoh)) ? String(themaRoh) : null;
  if (text === "") return { ok: false, fehler: "leer" };
  if (antwortweg === "name" && name === "") return { ok: false, fehler: "name" };
  if (!einwuerfe.check(ip)) return { ok: false, fehler: "ratelimit" };
  // Ein gefüllter Honigtopf bekommt ein „Danke" und landet nirgends — ein Bot soll nicht lernen, woran es lag.
  if (feld(fd, HONIGTOPF_FELD, 200) !== "") return { ok: true, antwortweg: "keine", code: null };
  if (!(await pruefeTurnstile(feld(fd, TURNSTILE_FELD, 4096), TURNSTILE_AKTIONEN.ehrlich))) return { ok: false, fehler: "pruefung" };

  const db = getDb();
  const { code } = legeMitteilungAn(db, { thema, text, antwortweg, name: name || null, kontakt: kontakt || null }, tagVon(Date.now()));
  revalidatePath(PFAD);
  return { ok: true, antwortweg, code };
}

export type AbholErgebnis =
  | { ok: true; code: string; abholung: Abholung; gesendet?: boolean }
  | { ok: false; fehler: "leer" | "unbekannt" | "ratelimit"; code: string };

export async function abholenAktion(_vorher: AbholErgebnis | null, fd: FormData): Promise<AbholErgebnis> {
  const code = normiereAbholcode(feld(fd, "code", 64));
  if (code === "") return { ok: false, fehler: "leer", code };
  const ip = clientIpAus(await headers());
  if (fehlversuche.istGesperrt(ip)) return { ok: false, fehler: "ratelimit", code };
  const abholung = holeAbholung(getDb(), code);
  if (!abholung) return fehlversuche.check(ip) ? { ok: false, fehler: "unbekannt", code } : { ok: false, fehler: "ratelimit", code };
  return { ok: true, code, abholung };
}

export async function zurueckschreibenAktion(_vorher: AbholErgebnis | null, fd: FormData): Promise<AbholErgebnis> {
  return withAuditContext({ actor: { kind: "anonymous" } }, async (): Promise<AbholErgebnis> => {
    const db = getDb();
    const code = normiereAbholcode(feld(fd, "code", 64));
    const ip = clientIpAus(await headers());
    if (fehlversuche.istGesperrt(ip)) return { ok: false, fehler: "ratelimit", code };
    const text = feld(fd, "text", TEXT_MAX);
    const vorher = holeAbholung(db, code);
    if (!vorher) return fehlversuche.check(ip) ? { ok: false, fehler: "unbekannt", code } : { ok: false, fehler: "ratelimit", code };
    if (text === "" || !einwuerfe.check(ip)) return { ok: true, code, abholung: vorher };
    const gesendet = schreibeZurueck(db, code, text, tagVon(Date.now()));
    revalidatePath(PFAD);
    return { ok: true, code, abholung: holeAbholung(db, code) ?? vorher, gesendet };
  });
}

// ---- Verwaltung ----

async function leserOderAbweisen(): Promise<{ sub: string; name: string }> {
  const session = await auth();
  const viewer = viewerFromSession(session);
  if (!viewer || !istEhrlichLeser(viewer.groups)) {
    if (viewer) auditDenied("feedback", auditActor(viewer));
    throw new Error("Forbidden");
  }
  return { sub: viewer.sub, name: session?.user?.name?.trim() || session?.user?.email?.trim() || "Vertrauensperson" };
}

async function alsLeser<T>(tun: (leser: { sub: string; name: string }, heute: string) => T): Promise<T> {
  const leser = await leserOderAbweisen();
  return withAuditContext({ actor: auditActor(leser) }, async () => {
    const ergebnis = tun(leser, tagVon(Date.now()));
    revalidatePath(PFAD, "layout");
    return ergebnis;
  });
}

function id(roh: unknown): number {
  const n = Number(roh);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("Ungültige Kennung");
  return n;
}

export async function statusAktion(mitteilung: number, status: EhrlichStatus): Promise<boolean> {
  if (status !== "neu" && status !== "bearbeitung" && status !== "erledigt") throw new Error("Ungültiger Status");
  return alsLeser((_, heute) => setzeStatus(getDb(), id(mitteilung), status, heute));
}

export async function notizAktion(mitteilung: number, text: string): Promise<boolean> {
  const t = String(text ?? "").trim().slice(0, TEXT_MAX);
  if (t === "") return false;
  return alsLeser((l, heute) => legeNotizAn(getDb(), id(mitteilung), l.name, t, heute));
}

export async function kontaktiertAktion(mitteilung: number): Promise<boolean> {
  return alsLeser((l, heute) => legeNotizAn(getDb(), id(mitteilung), l.name, "Kontaktiert.", heute, true));
}

export async function antwortAktion(mitteilung: number, text: string): Promise<boolean> {
  const t = String(text ?? "").trim().slice(0, TEXT_MAX);
  if (t === "") return false;
  return alsLeser((l, heute) => gibAntwortFrei(getDb(), id(mitteilung), l.name, t, heute));
}

export async function rueckfrageAktion(mitteilung: number, erlaubt: boolean): Promise<boolean> {
  return alsLeser(() => setzeRueckfrage(getDb(), id(mitteilung), erlaubt === true));
}

export async function loeschenAktion(mitteilung: number): Promise<boolean> {
  return alsLeser(() => loescheMitteilung(getDb(), id(mitteilung)));
}

export async function linkNeuAktion(): Promise<void> {
  await alsLeser(() => {
    erneuereKastenSecret(getDb());
  });
}
