import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

/*
 * Dieselbe leichte Bauform wie `neuigkeiten/page.test.tsx`: die Seite liefert
 * einen Elementbaum, keinen DOM. `@/core/auth` ist gemockt (next-auth bricht im
 * `node`-Environment an seinem `next/server`-Import, siehe `layout.test.tsx`).
 * Das Thema ist ausgedacht — das echte gehoert nie ins Repo.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/core/auth";
import ServerwartungPage from "@/app/m/portal/serverwartung/page";
import { ServerwartungAnleitung } from "@/app/m/portal/_ui/ServerwartungAnleitung";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

const authMock = vi.mocked(auth);
const ADRESSE = "https://ntfy.sh/beispielthema";

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

function mitGruppen(groups: string[] | null) {
  authMock.mockResolvedValue((groups ? { user: { groups } } : null) as never);
}

describe("Serverwartung-Seite", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.stubEnv("SUITE_WARTUNG_NTFY_URL", ADRESSE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("zeigt dem Suite-Betrieb Seitenkopf mit Rueckweg und das Abo", async () => {
    mitGruppen(["admin"]);
    const baum = flatten(await ServerwartungPage());
    const kopf = baum.find((el) => el.type === Seitenkopf)!;
    expect((kopf.props as { titel: string }).titel).toBe("Serverwartung");
    expect((kopf.props as { zurueck?: { href: string } }).zurueck?.href).toBe("/");
    const insel = baum.find((el) => el.type === ServerwartungAnleitung)!;
    expect((insel.props as { abo: { url: string } }).abo.url).toBe(ADRESSE);
  });

  it.each([
    ["anonym", null],
    ["angemeldet ohne passende Gruppe", ["user", "portal-admin"]],
  ])("ist %s ein 404, und das Abo erreicht keine Insel", async (_fall, groups) => {
    mitGruppen(groups);
    await expect(ServerwartungPage()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("ist ohne eingerichtetes Abo auch fuer den Suite-Betrieb ein 404", async () => {
    vi.stubEnv("SUITE_WARTUNG_NTFY_URL", "");
    mitGruppen(["admin"]);
    await expect(ServerwartungPage()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
