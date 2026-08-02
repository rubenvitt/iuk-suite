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

/**
 * Das Layout gibt das `Shell`-Element zurueck, ohne es zu rendern — die
 * Navigation steht also direkt in den Props. Kein DOM-Harness noetig.
 */
async function navSchluessel(): Promise<string[]> {
  const element = (await renderLayout()) as {
    props: { nav?: { key: string; href: string }[] };
  };
  return (element.props.nav ?? []).map((e) => e.key);
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

/**
 * DIE NAVIGATION DARF NICHTS ANBIETEN, WAS DIE SEITE VERWEIGERT.
 *
 * `vergleich/page.tsx` wirft fuer alle ausser Voll-Admins `notFound()` — 404
 * statt 403, damit die Existenz der Seite nicht verraten wird. Der Eintrag in
 * der Kopfzeile stand trotzdem fuer jeden da: die Gruppenleitung sah ihn, klickte
 * und landete im 404. Das verraet die Seite doch und ist obendrein eine
 * Sackgasse.
 *
 * Gepruefte Zusage ist deshalb nicht "der Eintrag ist weg", sondern "Navigation
 * und Riegel entscheiden nach demselben Praedikat" — darum stehen hier genau die
 * beiden Faelle, die auseinanderlaufen koennten.
 */
describe("Feedback-Verwaltung: der Vergleich steht nur da, wo er auch begehbar ist", () => {
  beforeEach(() => {
    authMock.mockReset();
    getDbMock.mockReset();
    upsertKnownUserMock.mockReset();
    vi.mocked(redirect).mockClear();
    vi.mocked(notFound).mockClear();
    getDbMock.mockReturnValue(FAKE_DB);
  });

  it("Voll-Admin sieht den Eintrag", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "admin-1", groups: ["da-feedback-admin"] }));

    expect(await navSchluessel()).toEqual(["start", "vergleich"]);
  });

  it("Gruppenleitung sieht nur die Uebersicht — kein Weg in den 404", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "gl-1", groups: ["da-feedback-gl"] }));

    expect(await navSchluessel()).toEqual(["start"]);
  });

  it("Suite-Admin ohne Feedback-Gruppe kommt gar nicht erst so weit (isFeedbackAdmin != isModuleAdmin)", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "betreiber", groups: ["dashboard-admins"] }));

    await expect(renderLayout()).rejects.toThrow();

    // Auf `notFound` festgenagelt und nicht nur auf "wirft": `redirect` wirft
    // ebenfalls. Ohne diese Zeile wuerde der Test auch dann gruen bleiben, wenn
    // aus dem 404 eine Weiterleitung zur Anmeldung wird — und die verraet einem
    // Betreiber ohne Feedback-Gruppe, dass es hier etwas zu sehen gibt.
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });
});
