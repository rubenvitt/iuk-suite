import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DAS DRUCK-LAYOUT (Entwurf §3.5).
 *
 * Es hat eine eigene Route-Group, weil es die Suite-Shell NICHT tragen darf:
 * `FullShell` druckt Header und AppSwitcher mit, und ein Aushang mit
 * Navigationsleiste ist kein Aushang. Der Preis dieser Entscheidung ist die
 * Gefahr, um die es hier geht: mit dem `Shell` fällt auch der Auth-Backstop aus
 * `(admin)/layout.tsx` weg — und die Druckansicht zeigt das SECRET der Gruppe,
 * also den dauerhaften Zugang zu jeder künftigen Umfrage.
 *
 * Deshalb liegt der Backstop in `_lib/requireFeedbackAccess.ts` und wird von
 * BEIDEN Layouts gerufen. Die Seite selbst prüft zusätzlich `guardPage(groupId)`
 * — zwei Linien, weil `feedback` `requiresAuth: false` ist (Pflicht für die
 * anonyme Teilnahme unter `/f/`) und die Middleware hier deshalb NICHT gatet.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("../_db/client", () => ({ getDb: vi.fn() }));
vi.mock("../_db/queries", () => ({ upsertKnownUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { redirect, notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "../_db/client";
import { upsertKnownUser } from "../_db/queries";
import FeedbackPrintLayout from "./layout";

const authMock = vi.mocked(auth);
const getDbMock = vi.mocked(getDb);

const FAKE_DB = { marker: "fake-db" } as unknown as ReturnType<typeof getDb>;

function sessionFor(overrides: { id: string; groups?: string[] }) {
  return {
    user: {
      id: overrides.id,
      groups: overrides.groups ?? [],
      fachgruppen: [],
      name: null,
      email: null,
      isAdmin: false,
    },
  } as never;
}

const rendere = () => FeedbackPrintLayout({ children: null }) as unknown as Promise<unknown>;

beforeEach(() => {
  authMock.mockReset();
  getDbMock.mockReset();
  vi.mocked(upsertKnownUser).mockReset();
  vi.mocked(redirect).mockClear();
  vi.mocked(notFound).mockClear();
  getDbMock.mockReturnValue(FAKE_DB);
});

describe("Druckansicht: ohne Anmeldung nicht erreichbar", () => {
  it("nicht angemeldet: Weiterleitung zum Login, kein Aushang", async () => {
    authMock.mockResolvedValue(null as never);

    await expect(rendere()).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/login?callbackUrl="));
  });

  it("angemeldet ohne Berechtigung: 404 — die Route verrät nicht, dass sie existiert", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "user-2", groups: ["irgendeine-andere-gruppe"] }));

    await expect(rendere()).rejects.toThrow();

    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("mit Berechtigung: rendert und trägt ins Verzeichnis ein wie die Verwaltung", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "user-1", groups: ["da-feedback-gl"] }));

    await expect(rendere()).resolves.toBeTruthy();

    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("Druckansicht: kein Suite-Chrome, aber die eigenen Variablen", () => {
  const quelle = readFileSync(
    join(process.cwd(), "src/app/m/feedback/(print)/layout.tsx"),
    "utf8",
  );
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("bindet KEINE Shell ein — sonst druckt FullShell Header und AppSwitcher mit", () => {
    expect(ohneKommentare).not.toContain("Shell");
    expect(ohneKommentare).not.toContain("AppSwitcher");
  });

  it("importiert `_ui/feedback.css` — ohne die sind `--fb-*` im Druck undefiniert (§4.10)", () => {
    expect(ohneKommentare).toContain("_ui/feedback.css");
  });

  it("ruft denselben Backstop wie die Verwaltung, nicht eine zweite Prüfung", () => {
    expect(ohneKommentare).toContain("requireFeedbackAccess");
    const admin = readFileSync(
      join(process.cwd(), "src/app/m/feedback/(admin)/layout.tsx"),
      "utf8",
    );
    expect(admin).toContain("requireFeedbackAccess");
  });
});
