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
  setSurveyStatus,
  activateSurvey,
  createAndStartSurvey,
  activeSurveyForGroup,
  insertResponse,
  listGroupMembers,
  setGroupMembers,
  listKnownUsers,
} from "./_db/queries";
import type { FormState } from "./_lib/formState";
import { assertGroupAccess, isFeedbackAdmin } from "./_lib/access";
import { viewerFromSession } from "./_lib/viewer";
import { generateSecret } from "./_lib/token";
import { coerceAnswer, isRatingType, type Question } from "./_lib/questions";
import {
  computeClosesAt,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
  type SurveyStatus,
} from "./_lib/lifecycle";
import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { FEHLER_PARAMETER, JS_FELD } from "./_lib/absenden";
import { getDirectory, type DirectoryResult } from "@/core/directory";
import {
  passtAufSuche,
  vereinigePersonen,
  FEHLER_EMAIL_MEHRDEUTIG,
  FEHLER_EMAIL_UNBEKANNT,
  FEHLER_EMAIL_UNBEKANNT_OHNE_VERZEICHNIS,
  SUCHE_MAX_TREFFER,
  SUCHE_MIN_ZEICHEN,
  type PersonVorschlag,
} from "./_lib/personen";

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
 *
 * WARUM DIE IP UND NICHT SLUG ODER TOKEN: Keyen auf den Token würde jeden
 * Secret-Guess in einen frischen Bucket legen (kein Brute-Force-Schutz), Keyen
 * auf den Slug würde alle Teilnehmer eines Dienstabends — die denselben QR-Link
 * scannen — gemeinsam limitieren. Die IP bremst einen Brute-Forcer (eine IP),
 * ohne echte Teilnehmer mit verschiedenen Mobilfunk-IPs zu behindern. Sie ist
 * deshalb nur noch der Schlüssel des `tokenGuard`; echte Abgaben zählt
 * `submitLimiter` unter `${ip}|${surveyId}`. Aufgelöst wird sie von
 * `clientIpAus` (`core/ratelimit`) — seit der CWE-348-Umstellung liest sie
 * ausschließlich `cf-connecting-ip`, `x-forwarded-for` wird nicht mehr
 * gelesen (`core/ratelimit.ts`).
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
/**
 * GRUPPE BEARBEITEN (Entwurf §2.6 Punkt 1, §4.4).
 *
 * `(prev, formData)` wegen `useActionState`: Feldfehler werden ZURÜCKGEGEBEN.
 * Vorher schrieb die Action, was ankam — ein leerer Name genauso still wie eine
 * unlesbare Frist, die `parseHours` zu `null` verschluckte und damit die Gruppe
 * heimlich auf die Vorgabe zurückstellte.
 *
 * `slug` WIRD NICHT GESCHRIEBEN, auch wenn das Feld im POST steht: er steckt in
 * jedem gedruckten QR-Code (§2.6). Ein Slug-Wechsel ist funktional dasselbe wie
 * „Neues Secret erzeugen" und gehört deshalb nicht in ein Speichern-Formular.
 * Die Zeile fehlt hier nicht aus Versehen — sie darf nicht existieren.
 */
export async function updateGroupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);

  const values = {
    name: String(formData.get("name") ?? ""),
    closeAfterHours: String(formData.get("closeAfterHours") ?? ""),
  };
  const name = values.name.trim();
  const fieldErrors: Record<string, string> = {};
  if (name === "") fieldErrors.name = "Name fehlt";

  // Leer heißt „Vorgabe benutzen" und ist kein Fehler; alles andere muss eine
  // ganze Zahl über 0 sein. `parseHours` allein würde „x" zu `null` machen —
  // ein stilles Zurücksetzen der Frist auf 48 Stunden.
  const rohStunden = values.closeAfterHours.trim();
  let closeAfterHours: number | null = null;
  if (rohStunden !== "") {
    const n = Number(rohStunden);
    if (!Number.isInteger(n) || n <= 0) {
      fieldErrors.closeAfterHours = "Frist ungültig — ganze Stunden über 0";
    } else {
      closeAfterHours = n;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  updateGroup(db, id, { name, closeAfterHours });
  revalidate();
  return { ok: true };
}
export async function regenerateSecretAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(id);
  setGroupSecret(db, id, generateSecret());
  revalidate();
}
/**
 * GRUPPE LÖSCHEN (Entwurf §2.6 Punkt 3, §4.6) — `guardAdmin`, NICHT `guardGroup`.
 *
 * Die IA weist diese Aktion dem Voll-Admin zu, und das ist keine Kosmetik: mit
 * `guardGroup` genügte die Gruppenzugehörigkeit, also hätte jede Gruppenleitung
 * ihre eigene Bereitschaft samt allen Dienstabenden, Umfragen und Rückmeldungen
 * unwiderruflich löschen können (ON DELETE cascade, Migration 0000) — ohne dass
 * jemand mit Admin-Rolle beteiligt war, und der gedruckte Aushang an der Wand
 * zeigte danach auf eine Gruppe, die es nicht mehr gibt. Derselbe Grund, aus dem
 * die Zuordnung der Leitung an `guardAdmin` hängt.
 *
 * Die Existenzprüfung ist nicht Zierde: `deleteGroup` ist für eine unbekannte id
 * ein stiller No-op, und ein Aufrufer, der „gelöscht" gemeldet bekommt, ohne dass
 * etwas gelöscht wurde, springt auf die Übersicht und hält den Tippfehler in der
 * id für einen Erfolg.
 */
export async function deleteGroupAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardAdmin();
  if (!getGroup(db, id)) throw new Error("Not found");
  deleteGroup(db, id);
  revalidate();
}

/**
 * DIE ZUORDNUNG DER LEITUNG (Entwurf §2.6 Punkt 2) — ohne sie sieht in Produktion
 * kein Gruppenleiter seine Gruppe, und eine Fehlzuordnung ist nur per
 * Datenbankeingriff korrigierbar.
 *
 * SIE IST ADMIN-SACHE, und das ist keine Kosmetik: mit `guardGroup` statt
 * `guardAdmin` dürfte eine Gruppenleitung sich beliebige Personen in die EIGENE
 * Gruppe holen — und damit, sobald sie eine einzige Gruppe geschenkt bekommt, die
 * Zuordnung selbst in die Hand nehmen. Der Guard prüft deshalb NICHT die
 * Gruppenzugehörigkeit, sondern die Admin-Rolle; für eine Gruppenleitung wirft er
 * auch bei der eigenen Gruppe.
 */
async function guardAdmin() {
  const viewer = viewerFromSession(await auth());
  if (!isFeedbackAdmin(viewer)) throw new Error("Forbidden");
  return { viewer, db: getDb() };
}

/**
 * DER ZWEITE GÜRTEL UM DAS VERZEICHNIS.
 *
 * `core/directory` wirft nie — es gibt jeden Ausfall als `status: "error"`
 * zurück. Diese Klammer hält die Zusage trotzdem hier fest, weil sie an DIESER
 * Stelle sicherheitsrelevant ist: eine Ausnahme aus der Zuordnungssuche nähme
 * die Cockpit-Seite mit, und dann wären auch die BESTEHENDEN Zuordnungen
 * unlesbar. Sie kostet drei Zeilen und überlebt einen späteren Austausch des
 * Clients gegen einen, der doch wirft.
 */
async function ohneAusfall(
  abruf: () => Promise<DirectoryResult>,
): Promise<DirectoryResult> {
  try {
    return await abruf();
  } catch {
    return { status: "error", people: [] };
  }
}

/**
 * DIE PERSONENSUCHE HINTER DEM AUTOFILL.
 *
 * Sie beantwortet die Frage, an der das Modul bisher scheiterte: „wie ordne ich
 * jemanden zu, der noch nie hier war?" Quelle ist das
 * Personenverzeichnis aus Pocket ID (`core/directory`), ergänzt um `known_users`
 * — Vereinigung, entdoppelt.
 *
 * DREI EIGENSCHAFTEN, DIE HIER UND NUR HIER DURCHGESETZT WERDEN:
 *
 * 1. ADMIN-SACHE. `guardAdmin()` steht in der ERSTEN Zeile, VOR jedem Netz- und
 *    Datenbankzugriff. Eine Gruppenleitung darf die Personenliste nicht abrufen:
 *    sie ist eine Mitgliederliste der Organisation, und sie ist zugleich der
 *    Rohstoff, um sich selbst irgendwo zuzuordnen. Ein Guard NACH dem Abruf
 *    wäre ein Datenabfluss mit anschließender Fehlermeldung.
 * 2. DATENSPARSAMKEIT. Über die RSC-Grenze gehen höchstens `SUCHE_MAX_TREFFER`
 *    Personen pro Anschlag — nie der Abzug. Gefiltert wird SERVERSEITIG, im
 *    Prozess, auf dem gecachten Abzug: Pocket IDs eigener `search`-Parameter ist
 *    ein `LIKE %t%`, dessen Groß-/Kleinschreibung vom Datenbank-Backend abhängt
 *    (SQLite ASCII-insensitiv, Postgres nicht), man müsste also ohnehin in JS
 *    nachvergleichen — und ein Abruf pro Anschlag wäre zusätzlich eine Last auf
 *    dem Identitätsanbieter, den die ganze Suite zum Anmelden braucht.
 * 3. AUSFALL BRICHT NICHTS. Fällt das Verzeichnis aus, bleibt die Suche über
 *    `known_users` — genau der Zustand von vorher, nur ohne Ausnahme.
 *
 * Sie gibt keinen `FormState` zurück: sie ist kein Formular, sondern eine
 * Abfrage. Fehlerfälle sind hier die leere Trefferliste.
 */
export async function suchePersonenAction(eingabe: string): Promise<PersonVorschlag[]> {
  const { db } = await guardAdmin();
  const q = String(eingabe ?? "").trim();
  if (q.length < SUCHE_MIN_ZEICHEN) return [];
  const ausVerzeichnis = await ohneAusfall(() => getDirectory().search(q, SUCHE_MAX_TREFFER));
  const ausBekannten = listKnownUsers(db).filter((p) => passtAufSuche(p, q));
  // `q` mit hinein: das Verzeichnis liefert seine besten Treffer nach Relevanz,
  // und ein rein alphabetisches Nachsortieren würde beim zweiten Schnitt genau
  // die vordersten davon wegwerfen.
  return vereinigePersonen(ausVerzeichnis.people, ausBekannten, SUCHE_MAX_TREFFER, q);
}

/**
 * Kennung ODER E-Mail (§2.6): getippt wird meist die Mailadresse, gespeichert
 * werden muss der `sub` aus Pocket ID — nur der steht später in `user_groups` und
 * im ID-Token. Eine E-Mail, die im Nutzerverzeichnis nicht auftaucht, wird
 * ABGEWIESEN statt als Kennung gespeichert: sonst läge in der Zuordnung eine
 * Adresse, die zu keinem `sub` passt, und die Person käme trotz Eintrag nie in
 * ihre Gruppe. `useActionState`-Signatur, weil das die dritte Stelle mit einem
 * Eingabefeld ist (§4.4).
 */
export async function addGroupLeaderAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardAdmin();

  const values = { kennung: String(formData.get("kennung") ?? "") };
  const eingabe = values.kennung.trim();
  if (eingabe === "") {
    return { ok: false, fieldErrors: { kennung: "Kennung oder E-Mail fehlt" }, values };
  }

  let userId = eingabe;
  if (eingabe.includes("@")) {
    const klein = eingabe.toLowerCase();
    // LOKAL ZUERST, VERZEICHNIS DANACH. Zwei Gründe, beide tragend: der häufige
    // Fall (die Person war schon da) kostet keinen Netzaufruf, und der Pfad kann
    // nicht schlechter werden als vorher, wenn die API ausfällt.
    //
    // `filter` und nicht `find`: eine Adresse kann zu mehreren Konten gehören
    // (sie ist im Verzeichnis weder Pflichtfeld noch eindeutig). `find` nahm das
    // erste — eine stille Wahl zwischen Konten, von denen nur eines das richtige
    // ist. Siehe FEHLER_EMAIL_MEHRDEUTIG.
    const lokal = listKnownUsers(db).filter((u) => (u.email ?? "").toLowerCase() === klein);
    if (lokal.length > 1) {
      return { ok: false, fieldErrors: { kennung: FEHLER_EMAIL_MEHRDEUTIG }, values };
    }
    if (lokal.length === 1) {
      userId = lokal[0].userId;
    } else {
      const ausVerzeichnis = await ohneAusfall(() => getDirectory().findByEmail(klein));
      if (ausVerzeichnis.people.length > 1) {
        return { ok: false, fieldErrors: { kennung: FEHLER_EMAIL_MEHRDEUTIG }, values };
      }
      const treffer = ausVerzeichnis.people[0];
      if (!treffer) {
        return {
          ok: false,
          fieldErrors: {
            // Die Meldung hängt davon ab, OB das Verzeichnis geantwortet hat.
            // „Muss sich einmal anmelden" ist bei laufendem Verzeichnis schlicht
            // falsch — dann gibt es kein Konto mit dieser Adresse, und der Satz
            // schickt den Admin auf eine Suche, die nie endet.
            kennung:
              ausVerzeichnis.status === "ok"
                ? FEHLER_EMAIL_UNBEKANNT
                : FEHLER_EMAIL_UNBEKANNT_OHNE_VERZEICHNIS,
          },
          values,
        };
      }
      userId = treffer.userId;
    }
  }

  // Ist-Stand SERVERSEITIG gelesen und ergänzt. Die gewünschte Liste vom Client
  // zu übernehmen wäre Mass-Assignment: ein manipulierter Formularwert würde die
  // ganze Leitung der Gruppe austauschen. `setGroupMembers` entdoppelt selbst.
  setGroupMembers(db, groupId, [...listGroupMembers(db, groupId), userId]);
  revalidate();
  return { ok: true };
}

/** Entfernen muss genauso funktionieren wie Hinzufügen (§2.6) — sonst bleibt eine
 *  Fehlzuordnung stehen. Kein Formularzustand: es gibt keine Eingabe. */
export async function removeGroupLeaderAction(formData: FormData): Promise<void> {
  const groupId = num(formData.get("groupId"));
  const { db } = await guardAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (userId === "") throw new Error("Kennung fehlt");
  setGroupMembers(
    db,
    groupId,
    listGroupMembers(db, groupId).filter((u) => u !== userId),
  );
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
/**
 * ABEND BEARBEITEN — zwei Zusagen, die vorher still brachen.
 *
 * 1. **Es wird nur gepatcht, was mitgeschickt wurde.** Die alte Fassung schrieb
 *    alle vier Felder aus dem POST; ein Dialog, der nur die Teilnehmerzahl zeigt
 *    (§2.4 „Teilnehmerzahl nachtragen"), hätte damit Thema und Notizen genullt.
 *    Die Teilnehmerzahl ist der Nenner jeder Rücklaufquote und wird typischerweise
 *    erst am Abend selbst bekannt — sie MUSS einzeln nachtragbar sein.
 * 2. **Ändert sich das Datum, wird die Frist neu geankert.** `evenings.date` ist
 *    der Anker von `computeClosesAt` (nie „jetzt + Stunden"). Ohne Neurechnung
 *    zeigte `closesAt` weiter auf den alten Anker, und die laufende Umfrage
 *    schloss zu einem Zeitpunkt, der zu keinem Datum auf der Seite passt.
 *    Neu gerechnet wird NUR für eine LAUFENDE Umfrage, und „laufend" ist der
 *    EFFEKTIVE Status (`nextStatusOnAccess`), nicht der rohe Datenbankwert.
 *    Es gibt keinen Cron (§1.4/J-A-2): eine abgelaufene Umfrage steht im
 *    Normalbetrieb weiter als `status: 'active'` mit `closesAt` in der
 *    Vergangenheit in der Datenbank und faltet erst beim Zugriff in RUHEND.
 *    Am rohen Status hätte eine bloße Datumskorrektur im Verlauf (Zone d, „…"
 *    → „Bearbeiten") diese tote Umfrage mit einer ZUKÜNFTIGEN Frist wieder
 *    geöffnet — der öffentliche Pfad hätte erneut Antworten angenommen, und
 *    neben einer schon laufenden Umfrage derselben Gruppe stünden zwei auf
 *    `active`, genau die Invariante, die `activateSurvey` transaktional hütet.
 *    Eine geschlossene oder abgelaufene Umfrage läuft nicht mehr, ihre Frist
 *    ist Vergangenheit und Teil der Historie.
 */
export async function updateEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  const vorher = getEvening(db, id)!;

  const patch: Partial<{
    date: Date;
    topic: string | null;
    notes: string | null;
    participantCount: number | null;
  }> = {};
  if (formData.has("date")) patch.date = parseDate(formData.get("date"));
  if (formData.has("topic")) patch.topic = strOrNull(formData.get("topic"));
  if (formData.has("notes")) patch.notes = strOrNull(formData.get("notes"));
  if (formData.has("participantCount")) {
    patch.participantCount = parseCount(formData.get("participantCount"));
  }
  updateEvening(db, id, patch);

  const datumNeu = patch.date;
  if (datumNeu && datumNeu.getTime() !== new Date(vorher.date).getTime()) {
    const survey = getSurveyByEvening(db, id);
    const effektiv = survey
      ? nextStatusOnAccess(survey.status as SurveyStatus, survey.closesAt, new Date())
      : null;
    if (survey && effektiv === "active") {
      const group = getGroup(db, vorher.groupId)!;
      // Dieselbe Vorrangregel wie `activateSurveyAction`: Umfrage → Gruppe → Vorgabe.
      const hours = survey.closeAfterHours ?? group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS;
      setSurveyStatus(db, survey.id, "active", { closesAt: computeClosesAt(datumNeu, hours) });
    }
  }
  revalidate();
}
export async function deleteEveningAction(formData: FormData) {
  const id = num(formData.get("id"));
  const { db } = await guardGroup(await groupIdOfEvening(id));
  deleteEvening(db, id);
  revalidate();
}

// ---- Umfragen ----
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
/*
 * `archiveSurveyAction`, `createSurveyAction` UND `closeSurveyAction` SIND
 * ENTFALLEN. `archiveSurveyAction` zuerst (Spec: „`archived` verliert die
 * Oberflächen-Aktion", „Ausdrücklich nicht gebaut: `archived` als
 * Bedienschritt") — ihr einziger Aufrufer war `(admin)/SurveyControls.tsx`, das
 * mit der Abend-Detailseite gelöscht wurde (§4.16). `createSurveyAction`
 * („Umfrage erstellen") und `closeSurveyAction` („Schließen") waren dieselben
 * Geschwister-Actions jenes entfernten Dreischritts „Umfrage erstellen"/
 * „Aktivieren"/„Schließen"/„Archivieren" — beim damaligen Aufräumen übersehen
 * und in Aufgabe 11 (Navigation/Dichte) desselben Plans nachgetragen entfernt.
 * `activateSurveyAction` — der vierte Schritt jenes Dreischritts — blieb
 * unverwaist: `StartenKnopf` in `_ui/Verlauf.tsx` ruft sie weiterhin für
 * Altbestands-Entwürfe auf.
 *
 * Geschrieben werden seither nur noch `active` und `closed`; `draft` und
 * `archived` bleiben tolerant LESBAR (Altbestand, Import) — `nextStatusOnAccess`
 * kennt sie weiter, und der Verlauf weist einen Entwurf als Altbestand aus.
 *
 * Die Wirkung der beiden entfernten Actions tragen vollständig ihre
 * Nachfolger: `startFeedbackAction` legt Abend UND Umfrage in einer
 * Transaktion an (`createAndStartSurvey`), `beendeFeedbackAction` schließt eine
 * laufende Umfrage — beide mit Aufrufer (`_ui/StartFormular.tsx`,
 * `_ui/BeendenKnopf.tsx`). Geprüft vor der Entfernung: `"use server"` steht im
 * Modul nur in dieser Datei, kein UI-Weg rief eine der beiden, und keine
 * Testzusicherung ging dabei verloren, die eine Aussage über bleibenden Code
 * trifft — die einzige Revalidierungs-Zusicherung für „Beenden" existierte
 * bereits unabhängig für `beendeFeedbackAction` (`actions.test.ts`, „schließt
 * genau die genannte Umfrage und revalidiert das Cockpit"); der Aufruf, der
 * `closeSurveyAction` als reine Testvorbereitung (geschlossene Umfrage
 * herstellen) benutzte, ist auf einen direkten `setSurveyStatus`-Aufruf
 * umgestellt.
 */

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
  const ip = clientIpAus(await headers());
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
