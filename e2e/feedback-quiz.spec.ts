import { randomBytes } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";
import { registerAuditFunctions } from "../src/core/audit/context";
import { E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";

/**
 * LIVE-QUIZ im Browser. Dieser Teil: der `postMessage`-Vertrag der Beamer-Ansicht im iframe
 * (Spec §5.5, `docs/slidev/LiveQuiz.vue`). Ein Elternfenster sendet `{ typ: "iuk-quiz", schritt }`,
 * der Beamer geht zu diesem Schritt und meldet `{ typ: "iuk-quiz-stand", schritt, schrittAnzahl }`
 * zurück. Task 11 ergänzt die Spiel- und Verwaltungsabläufe.
 */
const FEEDBACK = `http://feedback.localtest.me:${E2E_PORT}`;

/** Legt ein Quiz in der e2e-Datenbank an (Seed-Gruppe „demo") und gibt das Secret zurück. */
function legeQuizAn(): string {
  const secret = randomBytes(32).toString("base64url");
  const fragen = [1, 2].map((n) => ({
    text: `Welche Zahl ist ${n}?`,
    typ: "einfach",
    optionen: ["Eins", "Zwei", "Drei"],
    richtig: [n - 1],
  }));
  // Die Audit-Auslöser der Tabelle brauchen ihre SQL-Funktionen auch hier.
  const db = registerAuditFunctions(new Database(path.join(process.cwd(), ".data", "e2e", "feedback.db")));
  try {
    db.pragma("busy_timeout = 5000");
    const gruppe = db.prepare("SELECT id FROM groups WHERE slug = 'demo'").get() as { id: number } | undefined;
    expect(gruppe, "Seed-Gruppe demo fehlt").toBeTruthy();
    const jetzt = Math.floor(Date.now() / 1000);
    db.prepare(
      "INSERT INTO quizze (group_id, titel, modus, fragen, moderation_secret, created_at, updated_at) VALUES (?, ?, 'wettbewerb', ?, ?, ?, ?)",
    ).run(gruppe!.id, "e2e Slidev-Quiz", JSON.stringify(fragen), secret, jetzt, jetzt);
  } finally {
    db.close();
  }
  return secret;
}

test("der Beamer im iframe folgt postMessage vom Elternfenster und meldet seinen Stand", async ({ page, request }) => {
  // Falle 10: Routen vorab kompilieren, bevor der erste POST aus dem iframe kommt. Das erste GET legt
  // auch die Datenbank an (Migration beim ersten Zugriff), die `legeQuizAn` danach öffnet.
  await request.get(`${FEEDBACK}/k/gibt-es-nicht`);
  const secret = legeQuizAn();
  const beamer = `${FEEDBACK}/beamer/${secret}`;
  await request.get(beamer);
  await request.get(`${beamer}/schritt`);

  // Das Elternfenster: eine fremde Seite (about:blank) mit dem iframe, wie die Slidev-Folie.
  await page.setContent(`<iframe id="quiz" src="${beamer}" tabindex="-1" style="width:1280px;height:720px;border:0"></iframe>`);
  await page.evaluate(() => {
    const w = window as unknown as { staende: unknown[] };
    w.staende = [];
    window.addEventListener("message", (e) => {
      const d = e.data as { typ?: string } | null;
      if (d?.typ === "iuk-quiz-stand") w.staende.push(d);
    });
  });
  const rahmen = page.frameLocator("#quiz");
  const sende = (schritt: number) =>
    page.evaluate((n) => {
      (document.getElementById("quiz") as HTMLIFrameElement).contentWindow!.postMessage({ typ: "iuk-quiz", schritt: n }, "*");
    }, schritt);
  const letzterStand = () =>
    page.evaluate(() => {
      const l = (window as unknown as { staende: { schritt: number; schrittAnzahl: number }[] }).staende;
      return l[l.length - 1] ?? null;
    });

  // Vor dem Start: Titel statt Lobby, Stand mit Schritt 0 und der Schrittzahl des Quiz.
  await expect(rahmen.getByRole("heading", { name: "e2e Slidev-Quiz" })).toBeVisible();
  await expect.poll(letzterStand).toMatchObject({ schritt: 0 });
  const anzahl = (await letzterStand())!.schrittAnzahl;
  expect(anzahl).toBeGreaterThanOrEqual(5);

  // Schritt 0: die Lobby (legt die Runde an).
  const lobby = page.waitForResponse((r) => r.url().endsWith("/schritt") && r.request().method() === "POST");
  await sende(0);
  expect((await lobby).status()).toBe(200);
  await expect(rahmen.getByRole("heading", { name: "Mach mit" })).toBeVisible();

  // Schritt 1: Frage 1.
  const frage = page.waitForResponse((r) => r.url().endsWith("/schritt") && r.request().method() === "POST");
  await sende(1);
  expect((await frage).status()).toBe(200);
  await expect(rahmen.getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();
  await expect(rahmen.getByText("Frage 1 von 2")).toBeVisible();
  await expect.poll(letzterStand).toMatchObject({ schritt: 1, schrittAnzahl: anzahl });

  // Dieselbe Nachricht noch einmal ändert nichts (idempotent), eine fremde Nachricht auch nicht.
  await sende(1);
  await page.evaluate(() => {
    (document.getElementById("quiz") as HTMLIFrameElement).contentWindow!.postMessage({ typ: "anderes", schritt: 0 }, "*");
  });
  await expect(rahmen.getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();

  // Schritt 2: Auflösung, mit dem Beamer allein im iframe (keine Bedienknöpfe, Falle 22 beim Zählen).
  await warteAufGestreamteInhalte(page);
  await sende(2);
  await expect(rahmen.getByText("Auflösung")).toBeVisible();
  await expect(rahmen.getByRole("button", { name: "Weiter" })).toHaveCount(0);
  await expect.poll(letzterStand).toMatchObject({ schritt: 2 });
});
