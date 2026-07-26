import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Schliesst den Kreis zu Task 5: wer das Modul betritt, wird im Verzeichnis
 * zuordenbar (Entscheidung G: Upsert modul-lokal im Layout, nicht am Login,
 * nicht in `core`). Der Auth-Riegel (Finding 3, Regressionstest weiter unten)
 * wurde nachtraeglich eingebaut und darf durch den Upsert nicht verdraengt
 * werden: Upsert erst NACH erfolgreicher Pruefung, niemals davor.
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
import FeedbackAdminLayout from "./layout";

const authMock = vi.mocked(auth);
const getDbMock = vi.mocked(getDb);
const upsertKnownUserMock = vi.mocked(upsertKnownUser);

const FAKE_DB = { marker: "fake-db" } as unknown as ReturnType<typeof getDb>;

function sessionFor(overrides: {
  id: string;
  groups?: string[];
  fachgruppen?: string[];
  name?: string | null;
  email?: string | null;
}) {
  return {
    user: {
      id: overrides.id,
      groups: overrides.groups ?? [],
      fachgruppen: overrides.fachgruppen ?? [],
      name: overrides.name ?? null,
      email: overrides.email ?? null,
      isAdmin: false,
    },
  } as never;
}

async function renderLayout() {
  return FeedbackAdminLayout({ children: null }) as unknown as Promise<unknown>;
}

describe("Feedback-Verwaltung: Layout traegt ins Nutzerverzeichnis ein", () => {
  beforeEach(() => {
    authMock.mockReset();
    getDbMock.mockReset();
    upsertKnownUserMock.mockReset();
    vi.mocked(redirect).mockClear();
    vi.mocked(notFound).mockClear();
    getDbMock.mockReturnValue(FAKE_DB);
  });

  it("angemeldeter Nutzer mit Zugang landet mit sub, Name, E-Mail im Verzeichnis", async () => {
    authMock.mockResolvedValue(
      sessionFor({
        id: "user-1",
        groups: ["da-feedback-gl"],
        name: "Erika Musterfrau",
        email: "erika@example.org",
      }),
    );

    await renderLayout();

    expect(upsertKnownUserMock).toHaveBeenCalledTimes(1);
    expect(upsertKnownUserMock).toHaveBeenCalledWith(
      FAKE_DB,
      expect.objectContaining({
        userId: "user-1",
        name: "Erika Musterfrau",
        email: "erika@example.org",
      }),
    );
  });

  it("zweiter Aufruf bleibt idempotent: weiterhin nur ein Upsert pro Aufruf, keine Verdopplung", async () => {
    authMock.mockResolvedValue(
      sessionFor({ id: "user-1", groups: ["da-feedback-gl"], name: "Erika", email: "e@x.org" }),
    );

    await renderLayout();
    await renderLayout();

    expect(upsertKnownUserMock).toHaveBeenCalledTimes(2);
    expect(upsertKnownUserMock.mock.calls[0][1].userId).toBe("user-1");
    expect(upsertKnownUserMock.mock.calls[1][1].userId).toBe("user-1");
  });

  it("nicht angemeldet: kein Schreibvorgang, Weiterleitung zum Login bleibt wie bisher", async () => {
    authMock.mockResolvedValue(null as never);

    await expect(renderLayout()).rejects.toThrow();

    expect(upsertKnownUserMock).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/login?callbackUrl="));
  });

  it("Regression (Auth-Riegel, Finding 3): angemeldet, aber ohne Berechtigung -> 404, kein Upsert", async () => {
    authMock.mockResolvedValue(
      sessionFor({ id: "user-2", groups: ["irgendeine-andere-gruppe"] }),
    );

    await expect(renderLayout()).rejects.toThrow();

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(upsertKnownUserMock).not.toHaveBeenCalled();
  });
});
