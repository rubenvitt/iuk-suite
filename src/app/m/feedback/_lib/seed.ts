import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  getGroupBySlug,
  insertGroup,
  insertEvening,
  insertSurvey,
  activateSurvey,
  insertResponse,
} from "@/app/m/feedback/_db/queries";
import { STANDARD_QUESTIONS } from "@/app/m/feedback/_lib/questions";
import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "@/app/m/feedback/_lib/lifecycle";

const DEMO_SLUG = "demo";
// Fest statt zufällig, damit der Dev-QR-Link (`/f/demo-demo1`) stabil bleibt.
const DEMO_SECRET = "demo1";

export async function seedFeedback(
  db: BetterSQLite3Database<typeof schema>,
): Promise<void> {
  // Idempotenz-Gate: existiert die Demo-Gruppe bereits, ist das Dev-Seed schon
  // gelaufen (z. B. vorheriger Boot) — nichts erneut anlegen.
  if (getGroupBySlug(db, DEMO_SLUG)) return;

  const now = new Date();

  const group = insertGroup(db, {
    name: "Demo",
    slug: DEMO_SLUG,
    secret: DEMO_SECRET,
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
    topic: "Erste Hilfe Auffrischung",
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

  activateSurvey(db, survey.id, computeClosesAt(now, DEFAULT_CLOSE_AFTER_HOURS), now);

  insertResponse(
    db,
    survey.id,
    {
      q1: 2,
      q2: 1,
      q3: 2,
      q4: 3,
      q5: 2,
      q6: 2,
      q7: 1,
      q8: 2,
      q9: "Die praktischen Übungen waren super.",
      q10: "Mehr Zeit für Rückfragen.",
      q11: "Etwas kürzere Theorie-Blöcke.",
      q12: "Gerne öfter solche Abende.",
      q13: "Erste Hilfe bei Kindern",
      q14: "",
    },
    now,
  );
  insertResponse(
    db,
    survey.id,
    {
      q1: 3,
      q2: 2,
      q3: 3,
      q4: 2,
      q5: 3,
      q6: 3,
      q7: 2,
      q8: 3,
      q9: "Gute Stimmung in der Gruppe.",
      q10: "Mehr Materialien zum Mitnehmen.",
      q11: "Pünktlicherer Start.",
      q12: "",
      q13: "Umgang mit Notfallausrüstung",
      q14: "Danke für den Abend!",
    },
    now,
  );
  insertResponse(
    db,
    survey.id,
    {
      q1: 1,
      q2: 2,
      q3: 1,
      q4: 2,
      q5: 1,
      q6: 2,
      q7: 1,
      q8: 1,
      q9: "Sehr anschaulich erklärt.",
      q10: "",
      q11: "Alles gut.",
      q12: "Weiter so.",
      q13: "Reanimation auffrischen",
      q14: "",
    },
    now,
  );
}
