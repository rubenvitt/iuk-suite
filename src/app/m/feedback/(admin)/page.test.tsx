// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import {
  insertEvening,
  insertGroup,
  insertResponse,
  insertSurvey,
  insertUserGroup,
  setSurveyStatus,
} from "@/app/m/feedback/_db/queries";
import { computeClosesAt } from "@/app/m/feedback/_lib/lifecycle";
import type { Question } from "@/app/m/feedback/_lib/questions";

/**
 * DER EINSTIEG (Entwurf §3.1, §4.2, §4.3).
 *
 * Vier Zusagen, die hier gepruEft werden:
 *
 * 1. GENAU EINE GRUPPE UND KEIN VOLL-ADMIN → sofort ins Cockpit. Der Ehrenamtliche
 *    mit einer Gruppe hat auf dieser Seite nichts zu entscheiden, und jede Liste
 *    mit einem Eintrag ist ein Klick, der nichts bewirkt. Die Admin-Ausnahme ist
 *    noetig, sonst kaeme ein Admin mit einer Gruppe nie an „Gruppenvergleich" und
 *    „Neue Gruppe".
 * 2. DER ZUSTAND STEHT AUF DER KARTE. „laeuft · 12 von 20" bzw. „nichts aktiv ·
 *    letzter Abend 12.03." — vorher war die Liste eine Reihe nackter Links, und
 *    man musste jede Gruppe anklicken, um zu erfahren, ob dort etwas laeuft.
 * 3. EIN GRUPPENLEITER SIEHT NUR SEINE GRUPPEN. Das ist die einzige echte
 *    Verbesserung des Ports gegenueber der Alt-Anwendung und darf nicht verloren
 *    gehen (Negativtest).
 * 4. DIE TEST-HOOKS BLEIBEN: `data-testid="group-row"` und
 *    `href="/m/feedback/groups/{id}"` sitzen am SELBEN Knoten (dem `<Link>`, in
 *    den die Karte gewickelt ist) — der IDOR-E2E liest die ID per Regex aus dem
 *    `href` des Knotens, den er per Hook findet (§4.16). Der Test unten prüft
 *    deshalb `karte.getAttribute("href")` und NICHT `karte.closest("a")`: „ein
 *    Vorfahre trägt irgendwo ein href" wäre die umgekehrte Beziehung und ginge
 *    auch dann grün durch, wenn der Hook auf einem Knoten ohne `href` läge.
 */
const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((ziel: string) => {
    throw new Error(`redirect(${ziel})`);
  }),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("../_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import FeedbackEinstieg from "./page";

const ADMIN = { user: { id: "admin-1", groups: ["da-feedback-admin"], fachgruppen: [] } };
const LEITER = { user: { id: "gl-1", groups: ["da-feedback-gl"], fachgruppen: [] } };

const NUR_SCHULNOTE: Question[] = [{ id: "q1", type: "schulnote", text: "Insgesamt?" }];

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

function gruppe(name: string, slug: string) {
  return insertGroup(db, {
    name,
    slug,
    secret: `${slug.slice(0, 5)}1`,
    closeAfterHours: null,
    createdAt: new Date(0),
  });
}

/** Ein Abend mit Umfrage und Antworten. `status` entscheidet ueber „laeuft". */
function abend(
  groupId: number,
  datum: string,
  status: "active" | "closed",
  noten: number[],
  teilnehmer: number | null = 20,
) {
  const date = new Date(`${datum}T00:00:00Z`);
  const evening = insertEvening(db, {
    groupId,
    date,
    topic: "Funk",
    notes: null,
    participantCount: teilnehmer,
    createdAt: date,
  });
  const survey = insertSurvey(db, {
    eveningId: evening.id,
    questions: JSON.stringify(NUR_SCHULNOTE),
    closeAfterHours: 48,
    createdAt: date,
  });
  setSurveyStatus(db, survey.id, status, {
    activatedAt: date,
    // Die Frist kommt AUSSCHLIESSLICH aus `computeClosesAt(evening.date, h)` —
    // nie aus „jetzt + Stunden".
    closesAt: status === "active" ? computeClosesAt(date, 48 * 400) : computeClosesAt(date, 48),
  });
  noten.forEach((n) => insertResponse(db, survey.id, { q1: n }, date));
  return evening;
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  authMock.mockReset();
  redirectMock.mockClear();
});
afterEach(() => sqlite.close());

async function zeichne(): Promise<HTMLElement> {
  const element = await FeedbackEinstieg();
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const karten = (wirt: HTMLElement): HTMLElement[] => [
  ...wirt.querySelectorAll<HTMLElement>('[data-testid="group-row"]'),
];

const karteMit = (wirt: HTMLElement, name: string): HTMLElement => {
  const treffer = karten(wirt).find((k) => (k.textContent ?? "").includes(name));
  expect(treffer).toBeDefined();
  return treffer!;
};

describe("Einstieg — genau eine Gruppe fuehrt direkt ins Cockpit (§3.1)", () => {
  it("leitet einen Gruppenleiter mit genau einer Gruppe weiter (0 Klicks)", async () => {
    const g = gruppe("Bereitschaft", "bereitschaft");
    insertUserGroup(db, "gl-1", g.id);
    authMock.mockResolvedValue(LEITER);
    await expect(zeichne()).rejects.toThrow(`redirect(/m/feedback/groups/${g.id})`);
  });

  it("leitet einen Voll-Admin mit genau einer Gruppe NICHT weiter", async () => {
    // Sonst kaeme er nie an „Gruppenvergleich" und „Neue Gruppe" (§3.1).
    gruppe("Bereitschaft", "bereitschaft");
    authMock.mockResolvedValue(ADMIN);
    const wirt = await zeichne();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(karten(wirt)).toHaveLength(1);
  });

  it("leitet bei zwei Gruppen nicht weiter", async () => {
    const a = gruppe("Bereitschaft", "bereitschaft");
    const b = gruppe("Jugend", "jugend");
    insertUserGroup(db, "gl-1", a.id);
    insertUserGroup(db, "gl-1", b.id);
    authMock.mockResolvedValue(LEITER);
    const wirt = await zeichne();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(karten(wirt)).toHaveLength(2);
  });
});

describe("Einstieg — der Zustand steht auf der Karte (§3.1)", () => {
  it("nennt bei laufender Umfrage den Rueckstand und die gerechnete Frist", async () => {
    const a = gruppe("Bereitschaft", "bereitschaft");
    abend(a.id, "2026-07-22", "active", [1, 2, 3]);
    gruppe("Jugend", "jugend");
    authMock.mockResolvedValue(ADMIN);
    const karte = karteMit(await zeichne(), "Bereitschaft");
    expect(karte.textContent).toContain("läuft");
    expect(karte.textContent).toContain("3 von 20");
    expect(karte.textContent).toContain("schließt");
  });

  it("nennt bei ruhender Gruppe den letzten Abend statt eines leeren Feldes", async () => {
    const a = gruppe("Bereitschaft", "bereitschaft");
    abend(a.id, "2026-03-12", "closed", [2, 2]);
    gruppe("Jugend", "jugend");
    authMock.mockResolvedValue(ADMIN);
    const karte = karteMit(await zeichne(), "Bereitschaft");
    expect(karte.textContent).toContain("nichts aktiv");
    expect(karte.textContent).toContain("letzter Abend 12.03.");
  });

  it("traegt die Note des letzten ausgewerteten Abends als Pille MIT Wort", async () => {
    // Ohne Legende auf dieser Seite muss die Ziffer plus Wort allein tragen (§3.1).
    const a = gruppe("Bereitschaft", "bereitschaft");
    abend(a.id, "2026-03-12", "closed", [2, 2]);
    gruppe("Jugend", "jugend");
    authMock.mockResolvedValue(ADMIN);
    const karte = karteMit(await zeichne(), "Bereitschaft");
    expect(karte.textContent).toContain("2,0");
    expect(karte.textContent).toContain("gut");
    expect(karte.innerHTML).toContain("var(--note-2)");
  });

  it("zeigt fuer eine Gruppe ohne Abend keine Pille (eine leere Pille sieht aus wie eine Note)", async () => {
    gruppe("Bereitschaft", "bereitschaft");
    gruppe("Jugend", "jugend");
    authMock.mockResolvedValue(ADMIN);
    const wirt = await zeichne();
    expect(wirt.innerHTML).not.toContain("var(--note-");
    expect(karteMit(wirt, "Bereitschaft").textContent).toContain("—");
  });

  it("sortiert laufende Gruppen zuerst, dann nach letztem Abend absteigend", async () => {
    const alt = gruppe("Alt", "alt");
    abend(alt.id, "2026-01-05", "closed", [2]);
    const neu = gruppe("Neu", "neu");
    abend(neu.id, "2026-06-05", "closed", [2]);
    const laufend = gruppe("Laeuft", "laeuft");
    abend(laufend.id, "2026-02-02", "active", [1]);
    authMock.mockResolvedValue(ADMIN);
    const namen = karten(await zeichne()).map((k) => k.querySelector("h2")?.textContent);
    expect(namen).toEqual(["Laeuft", "Neu", "Alt"]);
  });

  it("traegt `data-testid=\"group-row\"` und den `href` aufs Cockpit am SELBEN Knoten (§4.16)", async () => {
    const a = gruppe("Bereitschaft", "bereitschaft");
    gruppe("Jugend", "jugend");
    authMock.mockResolvedValue(ADMIN);
    const karte = karteMit(await zeichne(), "Bereitschaft");
    // Direkt am Hook-Knoten, nicht per `closest("a")`: der E2E ruft
    // `getByTestId("group-row").getAttribute("href")` — sitzt der Hook auf einem
    // Kind ohne `href`, liest er `null` und der IDOR-Test bricht.
    expect(karte.getAttribute("href")).toBe(`/m/feedback/groups/${a.id}`);
    expect(karte.tagName).toBe("A");
  });
});

describe("Einstieg — wer was sieht (§3.1)", () => {
  it("zeigt einem Gruppenleiter NUR seine Gruppen", async () => {
    const meine = gruppe("Meine", "meine");
    gruppe("Fremde", "fremde");
    const zweite = gruppe("Zweite", "zweite");
    insertUserGroup(db, "gl-1", meine.id);
    insertUserGroup(db, "gl-1", zweite.id);
    authMock.mockResolvedValue(LEITER);
    const wirt = await zeichne();
    expect(wirt.textContent).toContain("Meine");
    expect(wirt.textContent).toContain("Zweite");
    expect(wirt.textContent).not.toContain("Fremde");
  });

  it("verlinkt den Gruppenvergleich nur fuer Admins", async () => {
    const a = gruppe("Meine", "meine");
    const b = gruppe("Zweite", "zweite");
    insertUserGroup(db, "gl-1", a.id);
    insertUserGroup(db, "gl-1", b.id);

    authMock.mockResolvedValue(ADMIN);
    const alsAdmin = [...(await zeichne()).querySelectorAll<HTMLElement>("a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(alsAdmin).toContain("/m/feedback/vergleich");

    authMock.mockResolvedValue(LEITER);
    const alsLeiter = await zeichne();
    expect(
      [...alsLeiter.querySelectorAll<HTMLElement>("a")].map((el) => el.getAttribute("href")),
    ).not.toContain("/m/feedback/vergleich");
    expect(alsLeiter.textContent).not.toContain("Gruppenvergleich");
  });

  it("bietet nur Admins „+ Neue Gruppe“", async () => {
    const a = gruppe("Meine", "meine");
    const b = gruppe("Zweite", "zweite");
    insertUserGroup(db, "gl-1", a.id);
    insertUserGroup(db, "gl-1", b.id);

    authMock.mockResolvedValue(ADMIN);
    expect((await zeichne()).textContent).toContain("Neue Gruppe");
    authMock.mockResolvedValue(LEITER);
    expect((await zeichne()).textContent).not.toContain("Neue Gruppe");
  });

  it("sagt einem Zugang ohne Gruppe, dass ihm keine zugeordnet ist (§4.3)", async () => {
    gruppe("Fremde", "fremde");
    authMock.mockResolvedValue(LEITER);
    const wirt = await zeichne();
    expect(wirt.textContent).toContain("Dir ist noch keine Gruppe zugeordnet.");
    expect(wirt.querySelector(".ant-result")).not.toBeNull();
    expect(karten(wirt)).toHaveLength(0);
  });

  it("traegt Kopfzone und Halbsatz aus §3.1", async () => {
    gruppe("Meine", "meine");
    gruppe("Zweite", "zweite");
    authMock.mockResolvedValue(ADMIN);
    const wirt = await zeichne();
    expect(wirt.querySelector("h1")?.textContent).toBe("Deine Gruppen");
    expect(wirt.textContent).toContain("Je Gruppe ein dauerhafter QR-Code.");
    // Der Einstieg ist die Wurzel — keine Breadcrumb, die auf sich selbst zeigt.
    expect(wirt.querySelector(".ant-breadcrumb")).toBeNull();
  });

  it("bietet ab acht Gruppen ein Suchfeld, darunter nicht", async () => {
    for (let i = 1; i <= 7; i++) gruppe(`Gruppe ${i}`, `gruppe-${i}`);
    authMock.mockResolvedValue(ADMIN);
    expect((await zeichne()).querySelector("input")).toBeNull();

    gruppe("Gruppe 8", "gruppe-8");
    expect((await zeichne()).querySelector('input[type="search"]')).not.toBeNull();
  });
});
