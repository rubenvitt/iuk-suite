import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/core/auth";
import ProfilPage from "@/app/m/portal/profil/page";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

const authMock = vi.mocked(auth);

/**
 * Dieselbe leichte Bauform wie `portal/page.test.tsx`: `ProfilPage()` liefert
 * einen Elementbaum, keinen DOM — `Seitenkopf` und `ProfilAnsicht` werden nur
 * als UNAUSGEFUEHRTE Elemente verglichen. Was die Insel daraus macht, besitzt
 * `ProfilAnsicht.test.tsx`.
 */
function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

beforeEach(() => {
  authMock.mockReset();
});

describe("Profilseite", () => {
  it("reicht die Angaben der Sitzung an die Insel durch", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "sub-42",
        name: "Ruben Vitt",
        email: "ruben@example.org",
        groups: ["iuk"],
        fachgruppen: ["fuehrung"],
        isAdmin: false,
      },
      angemeldetSeit: 1_755_000_000,
      expires: "",
    } as never);

    const baum = flatten(await ProfilPage());
    expect(baum.some((el) => el.type === Seitenkopf)).toBe(true);
    const insel = baum.find((el) => el.type === ProfilAnsicht);
    expect(insel).toBeDefined();
    expect(insel!.props).toMatchObject({
      name: "Ruben Vitt",
      email: "ruben@example.org",
      kennung: "sub-42",
      gruppen: ["iuk"],
      fachgruppen: ["fuehrung"],
      angemeldetSeit: 1_755_000_000,
    });
  });

  it("leitet ohne Sitzung auf den Login", async () => {
    // Die Seite haengt zwar hinter `decideRoute`, aber eine Seite, die sich auf
    // eine Sitzung verlaesst, muss ihr Fehlen selbst beantworten — sonst ist
    // der Ausfall ein Renderfehler statt einer Umleitung. `redirect()` wirft;
    // genau das wird hier bezeugt.
    authMock.mockResolvedValue(null);
    await expect(ProfilPage()).rejects.toThrow();
  });
});
