import { randomBytes } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { registerAuditFunctions } from "../../src/core/audit/context";

/**
 * EINE KOPPLUNGSSTELLE FÜR LIVE-QUIZ-E2E: legt ein Quiz direkt in der e2e-Datenbank an
 * (`.data/e2e/feedback.db`, Seed-Gruppe „demo") und gibt das Moderations-Secret zurück. Spaltennamen
 * stehen nur hier. Vorher einmal eine Seite des feedback-Hosts abrufen, damit die Datenbank migriert ist.
 */
export function legeTestQuizAn(
  v: { titel?: string; modus?: "lagebild" | "wettbewerb"; anzahlFragen?: number } = {},
): string {
  const secret = randomBytes(32).toString("base64url");
  const fragen = Array.from({ length: v.anzahlFragen ?? 2 }, (_, i) => ({
    text: `Welche Zahl ist ${i + 1}?`,
    typ: "einfach",
    optionen: ["Eins", "Zwei", "Drei"],
    richtig: [i % 3],
  }));
  // Die Audit-Auslöser der Tabelle brauchen ihre SQL-Funktionen auch hier.
  const db = registerAuditFunctions(new Database(path.join(process.cwd(), ".data", "e2e", "feedback.db")));
  try {
    db.pragma("busy_timeout = 5000");
    const gruppe = db.prepare("SELECT id FROM groups WHERE slug = 'demo'").get() as { id: number } | undefined;
    if (!gruppe) throw new Error("Seed-Gruppe demo fehlt");
    const jetzt = Math.floor(Date.now() / 1000);
    db.prepare(
      "INSERT INTO quizze (group_id, titel, modus, fragen, moderation_secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(gruppe.id, v.titel ?? "e2e Slidev-Quiz", v.modus ?? "wettbewerb", JSON.stringify(fragen), secret, jetzt, jetzt);
  } finally {
    db.close();
  }
  return secret;
}
