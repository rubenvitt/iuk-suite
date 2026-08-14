import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, widerrufeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  widerrufeMock: vi.fn(),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/konto/widerruf", () => ({ widerrufeAlleSitzungen: widerrufeMock }));

import { alleSitzungenAbmelden } from "@/app/m/portal/profil/actions";

beforeEach(() => {
  authMock.mockReset();
  widerrufeMock.mockReset();
});

describe("alleSitzungenAbmelden", () => {
  it("widerruft fuer den sub aus der Sitzung", async () => {
    authMock.mockResolvedValue({ user: { id: "sub-42" } });
    await alleSitzungenAbmelden();
    expect(widerrufeMock).toHaveBeenCalledWith("sub-42");
  });

  it("schreibt ohne Sitzung nichts", async () => {
    /*
     * Der `sub` kommt aus `auth()` und NIE aus einem Parameter — sonst waere
     * der Knopf ein Werkzeug, mit dem man fremde Sitzungen abschieszt (IDOR).
     * Dass die Funktion gar keinen Parameter nimmt, ist der halbe Beweis;
     * dieser Test ist die andere Haelfte.
     */
    authMock.mockResolvedValue(null);
    await alleSitzungenAbmelden();
    expect(widerrufeMock).not.toHaveBeenCalled();
  });
});
