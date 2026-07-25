"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import {
  memberGroupIdsFor,
  getGroup,
  getEvening,
  getSurvey,
  getSurveyByEvening,
  insertGroup,
  updateGroup,
  setGroupSecret,
  deleteGroup,
  insertEvening,
  updateEvening,
  deleteEvening,
  insertSurvey,
  setSurveyStatus,
  activateSurvey,
  createAndStartSurvey,
  activeSurveyForGroup,
  insertResponse,
} from "./_db/queries";
import type { FormState } from "./_lib/formState";
import { assertGroupAccess } from "./_lib/access";
import { viewerFromSession } from "./_lib/viewer";
import { generateSecret } from "./_lib/token";
import { STANDARD_QUESTIONS, coerceAnswer, isRatingType, type Question } from "./_lib/questions";
import {
  computeClosesAt,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
  type SurveyStatus,
} from "./_lib/lifecycle";
import { RateLimiter } from "./_lib/ratelimit";
import { FEHLER_PARAMETER, JS_FELD } from "./_lib/absenden";

/**
 * Ergebnis einer öffentlichen Abgabe (Entwurf 3.8). Die Action GIBT ZURÜCK statt
 * zu werfen — nur so kann die Oberfläche den Fehler an der Stelle zeigen, an der
 * er entstanden ist, statt auf einer technischen Fehlerseite zu landen (und der
 * Teilnehmer verliert seine Eingaben nicht).
 */
export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid" | "none" | "closed" | "ratelimit" | "incomplete";
      missing?: string[];
    };

/**
 * DER WEG OHNE JAVASCRIPT braucht einen zweiten Ausgang (Entwurf 3.8).
 *
 * Der Rückgabewert oben ist nur für den Aufrufer im Browser lesbar. Ohne
 * JavaScript ist die Abgabe ein nativer POST: React ruft die Action selbst auf,
 * verwirft das Ergebnis und rendert die Seite unverändert neu — bei „Frist
 * abgelaufen" oder „Ratelimit" ändert sich dann kein Pixel, und die Person tippt
 * ein zweites Mal auf einen Knopf, der nichts sagt. Deshalb leitet die Action
 * auf diesem Weg auf `?fehler=…` um; `page.tsx` macht daraus einen sichtbaren
 * Satz.
 *
 * MIT JavaScript darf dieselbe Umleitung NICHT passieren: ein `redirect()` in
 * einer vom Client aufgerufenen Action navigiert (er lehnt nicht ab), und damit
 * wären alle Eingaben weg — genau das, was 3.8 für `ratelimit` ausschließt
 * („mit JS bleiben alle Eingaben im Formular stehen").
 *
 * Mit JavaScript als Rückgabewert, ohne JavaScript als Umleitung: `redirect()`
 * wirft, der `return` danach gilt nur für den ersten Weg.
 */
function abweisen(
  slugSecret: string,
  ohneJs: boolean,
  code: keyof typeof FEHLER_PARAMETER,
  missing?: string[],
): SubmitResult {
  if (ohneJs) redirect(`/f/${slugSecret}?fehler=${FEHLER_PARAMETER[code]}`);
  return missing ? { ok: false, code, missing } : { ok: false, code };
}

/**
 * ZWEI Limiter, absichtlich getrennt (Entwurf 3.8 „Ratelimit"). Ein einziger
 * IP-Limiter mit 10/min hat den Kernfall getötet: 15 Ehrenamtliche scannen um
 * 21:30 aus EINEM Vereins-WLAN, teilen also eine NAT-IP — ab der 11. Abgabe
 * kam „Zu viele Anfragen". Deshalb zählt der IP-Zähler jetzt nur noch
 * Fehlversuche, und echte Abgaben laufen über einen eigenen, weiten Zähler.
 */
// Brute-Force-Schutz UNVERÄNDERT: zählt nur ungültige Token/Secrets, Schlüssel = IP.
const tokenGuard = new RateLimiter({ windowMs: 60_000, max: 10 });
// Echte Abgaben: Schlüssel IP+Umfrage, deckt 15 Leute im Vereins-WLAN plus Weitergabe.
const submitLimiter = new RateLimiter({ windowMs: 600_000, max: 60 });

/**
 * EIN Aufruf mit `"layout"`, nicht zwei mit `"page"`.
 *
 * Vorher standen hier `/m/feedback` und `/m/feedback/admin`. Die zweite Route
 * existiert wegen der Klammer-Route-Group `(admin)` NIE — sie taucht in keinem
 * URL-Pfad auf. Und die Arbeitsseite `/m/feedback/groups/{id}` stand in keiner
 * der beiden Listen: nach dem Klick zeigte genau die Seite, von der der Klick
 * kam, weiter den alten Zustand. `"layout"` revalidiert das Segment MIT allen
 * Unterrouten und trifft damit Cockpit, Verlauf und Auswertung mit.
 */
function revalidate(): void {
  revalidatePath("/m/feedback", "layout");
}

/** Guard-Helfer: aktueller Viewer + seine Gruppen-IDs, wirft Forbidden ohne Zugang. */
async function guardGroup(groupId: number) {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  assertGroupAccess(viewer, groupId, memberIds);
  return { viewer, db };
}

async function groupIdOfEvening(eveningId: number): Promise<number> {
  const eve = getEvening(getDb(), eveningId);
  if (!eve) throw new Error("Not found");
  return eve.groupId;
}
async function groupIdOfSurvey(surveyId: number): Promise<number> {
  const s = getSurvey(getDb(), surveyId);
  if (!s) throw new Error("Not found");
  return groupIdOfEvening(s.eveningId);
}

// ---- Gruppen ----
export async function createGroupAction(formData: FormData) {
  const viewer = viewerFromSession(await auth());
  // Nur Voll-Admin darf Gruppen anlegen (groupleader verwaltet bestehende).
  if (!viewer || !(await import("./_lib/access")).isFeedbackAdmin(viewer)) {
    throw new Error("Forbidden");
  }
  const db = getDb();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!name || !slug) throw new Error("Name und Slug erforderlich");
  const closeAfterHours = parseHours(formData.get("closeAfterHours"));
  insertGroup(db, { name, slug, secret: generateSecret(), closeAfterHours, createdAt: new Date() });
  revalidate();
}
export async function updateGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  updateGroup(db, id, {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
  });
  revalidate();
}
export async function regenerateSecretAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  setGroupSecret(db, id, generateSecret());
  revalidate();
}
export async function deleteGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  deleteGroup(db, id);
  revalidate();
}

// ---- Dienstabende ----
export async function createEveningAction(formData: FormData) {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardGroup(groupId);
  insertEvening(db, {
    groupId,
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function updateEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  updateEvening(db, id, {
    date: parseDate(formData.get("date")),
    topic: strOrNull(formData.get("topic")),
    notes: strOrNull(formData.get("notes")),
    participantCount: parseCount(formData.get("participantCount")),
  });
  revalidate();
}
export async function deleteEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  deleteEvening(db, id);
  revalidate();
}

// ---- Umfragen ----
export async function createSurveyAction(formData: FormData) {
  const eveningId = num(formData.get("eveningId"));
  const { db } = await guardGroup(await groupIdOfEvening(eveningId));
  if (getSurveyByEvening(db, eveningId)) throw new Error("Umfrage existiert bereits");
  insertSurvey(db, {
    eveningId,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: parseHours(formData.get("closeAfterHours")),
    createdAt: new Date(),
  });
  revalidate();
}
export async function activateSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  const survey = getSurvey(db, id)!;
  const eve = getEvening(db, survey.eveningId)!;
  const group = getGroup(db, eve.groupId)!;
  const hours = survey.closeAfterHours ?? group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  const now = new Date();
  // `eve.date`, NICHT `now`: `computeClosesAt` rechnet vom Abend-Tag, nicht ab
  // jetzt. Mit `now` hing die Frist eines nachträglich gestarteten
  // Altbestands-Entwurfs am Klickzeitpunkt — ein Abend von Montag lief bis
  // Donnerstag, weil jemand am Mittwoch auf „Starten" geklickt hat.
  activateSurvey(db, id, computeClosesAt(eve.date, hours), now);
  revalidate();
}
export async function closeSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "closed", { closedAt: new Date() });
  revalidate();
}
export async function archiveSurveyAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfSurvey(id));
  setSurveyStatus(db, id, "archived");
  revalidate();
}

/**
 * Client-IP aus den Request-Headern (hinter Cloudflare zuverlässig via
 * cf-connecting-ip, sonst x-forwarded-for). Für Rate-Limiting statt Slug
 * oder Token: Keyen auf den Token würde jeden Secret-Guess in einen frischen
 * Bucket legen (kein Brute-Force-Schutz), Keyen auf den Slug würde alle
 * Teilnehmer eines Dienstabends — die denselben QR-Link scannen — gemeinsam
 * limitieren. Die IP bremst einen Brute-Forcer (eine IP), ohne echte
 * Teilnehmer mit verschiedenen Mobilfunk-IPs zu behindern.
 * Sie ist deshalb nur noch der Schlüssel des `tokenGuard`; echte Abgaben
 * zählt `submitLimiter` unter `${ip}|${surveyId}`.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const forwardedFor = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

/**
 * Ungültiges Token oder falsches Secret: erst das Fehlversuch-Budget der IP
 * belasten, dann ablehnen. Wer Secrets rät, wird nach 10 Versuchen pro Minute
 * gebremst — eine legitime Abgabe berührt diesen Zähler nie.
 */
function rejectInvalidToken(ip: string): SubmitResult {
  if (!tokenGuard.check(ip)) return { ok: false, code: "ratelimit" };
  return { ok: false, code: "invalid" };
}

// ---- Öffentliche Teilnahme ----
/**
 * KEIN try/catch um diesen Rumpf: `redirect()` wirft in Next intern, ein Catch
 * würde den Erfolgssprung verschlucken und ihn in einen Fehler verwandeln.
 */
export async function submitResponseAction(
  slugSecret: string,
  formData: FormData,
): Promise<SubmitResult> {
  const db = getDb();
  const { parseToken } = await import("./_lib/token");
  const { getGroupBySlug } = await import("./_db/queries");
  const ip = await clientIp();
  const parsed = parseToken(slugSecret);
  if (!parsed) return rejectInvalidToken(ip);
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) return rejectInvalidToken(ip);

  /*
   * `none` und `invalid` brauchen KEINE Umleitung, auch nicht ohne JavaScript:
   * der native POST rendert dieselbe Route neu, und `page.tsx` liefert dann von
   * selbst Zustand C bzw. F (Entwurf 3.8: „`none` / `invalid`: Zustand C bzw.
   * F"). Nur die drei Abweisungen unten hätten ohne Parameter kein Bild.
   */
  const ohneJs = formData.get(JS_FELD) !== "1";
  const active = activeSurveyForGroup(db, group.id);
  if (!active) return { ok: false, code: "none" };
  const survey = active.survey;
  if (!submitLimiter.check(`${ip}|${survey.id}`)) return abweisen(slugSecret, ohneJs, "ratelimit");
  // closes_at auch auf dem Submit-Pfad prüfen (nicht nur beim Anzeigen).
  const now = new Date();
  if (nextStatusOnAccess("active", survey.closesAt, now) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: now });
    return abweisen(slugSecret, ohneJs, "closed");
  }

  const questions: Question[] = JSON.parse(survey.questions);
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    const value = coerceAnswer(q, formData.get(q.id));
    if (value !== undefined) answers[q.id] = value;
  }

  /*
   * Pflichtprüfung als LETZTE Linie (Entwurf 3.6): die Oberfläche verhindert
   * Lücken doppelt (mit JS der Lückenspringer, ohne JS `required`) — trotzdem
   * prüft der Server unabhängig davon, damit eine vollständig leere Absendung
   * strukturell unmöglich ist. Sie hätte Rücklaufquote und Durchschnitte
   * verfälscht. Pflicht sind die Noten (auch der `stars`-Zweig importierter
   * Alt-Umfragen), Freitexte bleiben freiwillig. Eine Note außerhalb der Skala
   * hat `coerceAnswer` verworfen und fehlt damit hier.
   */
  const missing = questions
    .filter((q) => isRatingType(q.type) && answers[q.id] === undefined)
    .map((q) => q.id);
  if (missing.length > 0) return abweisen(slugSecret, ohneJs, "incomplete", missing);

  // Zeitstempel = Mitternacht UTC des Abenddatums, nicht `now`: der Siegeltext
  // sagt "keine Uhrzeit" (Entwurf 3.9). Die Sekunde wäre bei ~15 Abgaben ein
  // Deanonymisierungskanal.
  insertResponse(db, survey.id, answers, active.evening.date);

  // Mehrfach-Absende-Schutz per Cookie (24h) — 1:1 zur Alt-App (public.go:105-112).
  (await cookies()).set(`feedback-${survey.id}`, "submitted", {
    maxAge: 86400,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect(`/f/${slugSecret}/thanks`);
  return { ok: true };
}

/**
 * HANDY-WEITERGABE (Entwurf 3.8): das Gerät für die nächste Person freigeben.
 *
 * Handys werden in einer Gruppe herumgegeben. Der 24-Stunden-Cookie sperrte die
 * zweite Abgabe am geteilten Gerät aus — stumm, ohne ein Wort dazu. Dieser Weg
 * ist der Ausweg, und er ist ein natives `<form action={…}>`: er funktioniert
 * ohne JavaScript.
 *
 * `set` mit `maxAge: 0` statt `delete`, damit der Löschbefehl garantiert mit
 * `path: "/"` ausgeliefert wird — `delete` ohne Pfad räumt unter einem anderen
 * Pfad gesetzte Cookies nicht ab, und die Sperre bliebe unsichtbar stehen.
 *
 * Kein Zugriffsschutz nötig: der einzige Effekt ist, dass der Aufrufer sein
 * EIGENES Cookie verliert. Wer das ohne Grund tut, schadet nur seiner eigenen
 * Mehrfach-Absende-Sperre.
 */
export async function releaseDeviceAction(slugSecret: string, surveyId: number) {
  (await cookies()).set(`feedback-${surveyId}`, "", { maxAge: 0, path: "/" });
  redirect(`/f/${slugSecret}`);
}

// ---- Das Cockpit: ein Klick statt fünf ----

/**
 * FEEDBACK STARTEN (Entwurf §2.3, §4.15/1).
 *
 * Der Hauptablauf war fünf Klicks über drei Seiten: Gruppe öffnen → Abend-Formular
 * absenden → Abend öffnen → „Umfrage erstellen" → „Aktivieren". Diese Action macht
 * daraus einen, und zwar OHNE eine zweite Wahrheit: `createAndStartSurvey`
 * (`_db/queries.ts`) legt Abend und aktive Umfrage in EINER Transaktion an,
 * schließt aktive Geschwister derselben Gruppe darin mit und rechnet die Frist aus
 * `computeClosesAt(date, hours)`. Würde hier `insertEvening` → `insertSurvey` →
 * `activateSurvey` nachgebaut, läge die „genau eine aktive Umfrage"-Invariante an
 * zwei Stellen — und die zweite wäre die ungetestete.
 *
 * `(prev, formData)`-Signatur wegen `useActionState` (§4.4): Feldfehler werden
 * ZURÜCKGEGEBEN, nicht geworfen, sonst landet der Nutzer auf einer technischen
 * Fehlerseite und seine Eingaben sind weg. Die Zugriffsprüfung wirft weiterhin —
 * das ist kein Feldfehler.
 */
export async function startFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardGroup(groupId);

  // Eingaben zuerst einsammeln: sie müssen im Fehlerfall vollständig zurück.
  const values = {
    date: String(formData.get("date") ?? "").trim(),
    topic: String(formData.get("topic") ?? ""),
    participantCount: String(formData.get("participantCount") ?? ""),
  };
  const date = values.date === "" ? null : parseDateOrNull(values.date);
  if (!date) {
    return {
      ok: false,
      fieldErrors: {
        date: values.date === "" ? "Datum fehlt" : "Datum ungültig — bitte als Tag auswählen",
      },
      values,
    };
  }

  const group = getGroup(db, groupId)!;
  const hours = group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
  createAndStartSurvey(db, {
    groupId,
    date,
    topic: strOrNull(values.topic),
    // `notes` fällt in der neuen Oberfläche weg (§2.3): ein viertes Feld ohne
    // Leser. Nachtragbar über die Zeilenbearbeitung im Verlauf.
    notes: null,
    participants: parseCount(values.participantCount),
    closeAfterHours: hours,
    now: new Date(),
  });
  // Nur im Erfolgsfall (§4.4) — ein Feldfehler hat nichts revalidiert.
  revalidate();
  return { ok: true };
}

/**
 * FEEDBACK BEENDEN — der geplante Schluss-Schritt, kein Notausgang (§2.3).
 *
 * Deshalb im Knopf ohne `danger` und ohne eigenen Formularzustand: es gibt keine
 * Eingabe, die scheitern könnte. Die Bestätigung liegt im `Popconfirm` und nennt
 * die Folge wörtlich („Danach kann niemand mehr antworten. Die Auswertung bleibt
 * erhalten.").
 *
 * Schreibt explizit, weil das Falten in `_lib/cockpit.ts` bewusst nur liest: die
 * Umfrage soll auch für den öffentlichen Pfad geschlossen sein, nicht nur in der
 * Anzeige des Cockpits.
 */
export async function beendeFeedbackAction(formData: FormData): Promise<void> {
  const surveyId = num(formData.get("surveyId"));
  const { db } = await guardGroup(await groupIdOfSurvey(surveyId));
  setSurveyStatus(db, surveyId, "closed", { closedAt: new Date() });
  revalidate();
}

// ---- Parser-Helfer ----
function num(v: FormDataEntryValue | null): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Ungültige ID");
  return n;
}
function parseHours(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function parseCount(v: FormDataEntryValue | null): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function parseDate(v: FormDataEntryValue | null): Date {
  const s = String(v ?? "");
  const d = new Date(`${s}T00:00:00Z`); // YYYY-MM-DD → Mitternacht UTC
  if (Number.isNaN(d.getTime())) throw new Error("Ungültiges Datum");
  return d;
}
/**
 * Dieselbe Umrechnung, aber ohne zu werfen: die Formular-Actions brauchen den
 * Fehlschlag als WERT, um ihn am Feld zeigen zu können (§4.4). Das strenge Muster
 * ist Absicht — `new Date("22.07.2026T00:00:00Z")` ist in manchen Laufzeiten
 * gültig und ergäbe ein stilles Falschdatum.
 */
function parseDateOrNull(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
