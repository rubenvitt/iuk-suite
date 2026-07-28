import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import type { GroupRow } from "@/app/m/feedback/_db/schema";
import {
  getGroupBySlug,
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  insertResponse,
  insertUserGroup,
} from "@/app/m/feedback/_db/queries";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";
import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "@/app/m/feedback/_lib/lifecycle";

/**
 * Lokaler Dev-Seed — deckt beide Rollen ab, damit sich der Auth-Backstop
 * ((admin)/layout.tsx) und die Gruppen-Sichtbarkeit ohne echtes OIDC/SSO
 * durchspielen lassen:
 *
 * - Admin-Test: Dev-Login mit `groups=da-feedback-admin` → sieht BEIDE Gruppen
 *   ("Demo" und "Demo Jugend") und darf neue Gruppen anlegen. `dashboard-admins`
 *   allein reicht dafür NICHT (mehr): der Suite-Admin ist in diesem Modul kein
 *   Admin, siehe `_lib/access.ts`. Wer beides durchspielen will, hängt die
 *   Modulgruppe dazu (`groups=dashboard-admins,da-feedback-admin`).
 * - Gruppenleiter-Test: Dev-Login mit `email=gl@localtest.me` +
 *   `groups=da-feedback-gl` → sieht NUR "Demo Jugend" (über die
 *   `user_groups`-Zuordnung unten), kein "Neue Gruppe anlegen"-Formular.
 */

const DEMO_SLUG = "demo";
// Fest statt zufällig, damit der Dev-QR-Link (`/f/demo-demo1`) stabil bleibt.
const DEMO_SECRET = "demo1";

const JUGEND_SLUG = "jugend";
const JUGEND_SECRET = "jgnd1";
// sub, den der Dev-Login (Credentials-Provider, core/auth/index.ts) für
// email=gl@localtest.me erzeugt — authorize() liefert `id: \`dev:${email}\``,
// NextAuth übernimmt das unverändert als token.sub und session.user.id
// (empirisch verifiziert über /api/auth/session gegen einen Dev-Server).
const GL_DEV_USER_ID = "dev:gl@localtest.me";

function seedGroup(
  db: BetterSQLite3Database<typeof schema>,
  opts: {
    name: string;
    slug: string;
    secret: string;
    topic: string;
    responses: Record<string, unknown>[];
  },
): GroupRow {
  const now = new Date();

  const group = insertGroup(db, {
    name: opts.name,
    slug: opts.slug,
    secret: opts.secret,
    closeAfterHours: DEFAULT_CLOSE_AFTER_HOURS,
    createdAt: now,
  });

  // Reines Kalenderdatum (Mitternacht UTC), siehe Kommentar an evenings.date
  // im Schema — kein Zeitanteil relevant, analog parseDate in actions.ts.
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const evening = insertEvening(db, {
    groupId: group.id,
    date: today,
    topic: opts.topic,
    notes: null,
    participantCount: null,
    createdAt: now,
  });

  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(STANDARD_QUESTIONS),
    closeAfterHours: DEFAULT_CLOSE_AFTER_HOURS,
    createdAt: now,
  });

  // `today`, nicht `now`: `computeClosesAt` rechnet vom Abend-TAG. Mit `now` lag
  // die Frist bei einem Boot nach 22:00 UTC (= Folgetag in Europe/Berlin) einen
  // Tag zu spät — derselbe Defekt wie in `activateSurveyAction`.
  activateSurvey(db, survey.id, computeClosesAt(today, DEFAULT_CLOSE_AFTER_HOURS), now);

  // Abenddatum statt `now` — wie der öffentliche Abgabepfad (Entwurf 3.9).
  for (const r of opts.responses) insertResponse(db, survey.id, r, today);

  return group;
}

export async function seedFeedback(
  db: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  // Idempotenz-Gate PRO Gruppe (nicht ein gemeinsames Gate für beide) — ein
  // früherer, unvollständiger Boot (z. B. Abbruch nach "demo", vor "jugend")
  // ergänzt sich beim nächsten Start selbst, statt dauerhaft unvollständig zu
  // bleiben; ein bereits vollständiger Seed legt nichts doppelt an.
  if (!getGroupBySlug(db, DEMO_SLUG)) {
    seedGroup(db, {
      name: "Demo",
      slug: DEMO_SLUG,
      secret: DEMO_SECRET,
      topic: "Erste Hilfe Auffrischung",
      responses: [
        {
          q1: 2, q2: 1, q3: 2, q4: 3, q5: 2, q6: 2, q7: 1, q8: 2,
          q9: "Die praktischen Übungen waren super.",
          q10: "Mehr Zeit für Rückfragen.",
          q11: "Etwas kürzere Theorie-Blöcke.",
          q12: "Gerne öfter solche Abende.",
          q13: "Erste Hilfe bei Kindern",
          q14: "",
        },
        {
          q1: 3, q2: 2, q3: 3, q4: 2, q5: 3, q6: 3, q7: 2, q8: 3,
          q9: "Gute Stimmung in der Gruppe.",
          q10: "Mehr Materialien zum Mitnehmen.",
          q11: "Pünktlicherer Start.",
          q12: "",
          q13: "Umgang mit Notfallausrüstung",
          q14: "Danke für den Abend!",
        },
        {
          q1: 1, q2: 2, q3: 1, q4: 2, q5: 1, q6: 2, q7: 1, q8: 1,
          q9: "Sehr anschaulich erklärt.",
          q10: "",
          q11: "Alles gut.",
          q12: "Weiter so.",
          q13: "Reanimation auffrischen",
          q14: "",
        },
      ],
    });
  }

  if (!getGroupBySlug(db, JUGEND_SLUG)) {
    const jugend = seedGroup(db, {
      name: "Demo Jugend",
      slug: JUGEND_SLUG,
      secret: JUGEND_SECRET,
      topic: "Erlebnispädagogischer Abend",
      responses: [
        {
          q1: 2, q2: 1, q3: 2, q4: 2, q5: 2, q6: 1, q7: 2, q8: 1,
          q9: "Die Gruppenspiele haben allen Spaß gemacht.",
          q10: "Öfter draußen üben.",
          q11: "",
          q12: "Weiter so!",
          q13: "Knotenkunde",
          q14: "",
        },
        {
          q1: 1, q2: 2, q3: 1, q4: 1, q5: 2, q6: 1, q7: 1, q8: 2,
          q9: "War richtig cool.",
          q10: "",
          q11: "Etwas mehr Pausen.",
          q12: "",
          q13: "Orientierung im Gelände",
          q14: "Bitte bald wiederholen.",
        },
      ],
    });

    // Zuordnung Gruppenleiter → "Demo Jugend": macht requiredGroups/den Auth-
    // Backstop UND accessibleGroupFilter lokal für die "eingeschränkte Sicht"
    // testbar (Admin sieht beide Gruppen, dieser Nutzer nur diese eine).
    insertUserGroup(db, GL_DEV_USER_ID, jugend.id);
  }
}
