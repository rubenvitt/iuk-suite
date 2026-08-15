// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

import { mount, unmount, query, exists, click, clickPortal } from "@/app/m/qr/_lib/test-dom";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";

const BASIS = {
  name: "Ruben Vitt",
  email: "ruben@example.org",
  kennung: "sub-42",
  gruppen: ["iuk"],
  fachgruppen: ["fuehrung"],
  angemeldetSeit: 1_755_000_000,
};

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
});

describe("ProfilAnsicht", () => {
  it("zeigt Name, E-Mail, Kennung, Gruppen und Fachgruppen", async () => {
    await mount(<ProfilAnsicht {...BASIS} abmelden={vi.fn()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ruben Vitt");
    expect(text).toContain("ruben@example.org");
    expect(text).toContain("sub-42");
    expect(text).toContain("iuk");
    expect(text).toContain("fuehrung");
  });

  it("schreibt leere Mengen aus, statt eine Luecke zu lassen", async () => {
    // Eine leere Zeile liest sich wie ein Ladefehler. „Keine" ist eine Aussage.
    await mount(<ProfilAnsicht {...BASIS} gruppen={[]} fachgruppen={[]} abmelden={vi.fn()} />);
    expect(query('[data-testid="profil-gruppen"]').textContent).toContain("Keine");
  });

  it("meldet nicht ab, solange nicht bestaetigt wurde", async () => {
    const abmelden = vi.fn().mockResolvedValue(undefined);
    await mount(<ProfilAnsicht {...BASIS} abmelden={abmelden} />);
    await click('[data-testid="alle-abmelden"]');
    expect(abmelden).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("ruft nach der Bestaetigung die Action und danach signOut", async () => {
    const abmelden = vi.fn().mockResolvedValue(undefined);
    await mount(<ProfilAnsicht {...BASIS} abmelden={abmelden} />);
    await click('[data-testid="alle-abmelden"]');
    await clickPortal('[data-testid="alle-abmelden-ja"]');
    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("nennt die Grenze des Knopfes beim Namen", async () => {
    // „Beendet alle Sitzungen dieser Suite" — nicht „meldet dich ueberall ab".
    // Die Sitzung beim Identitaetsanbieter bleibt auf fremden Geraeten bestehen.
    await mount(<ProfilAnsicht {...BASIS} abmelden={vi.fn()} />);
    expect(query('[data-testid="alle-abmelden-hinweis"]').textContent).toContain(
      "Sitzungen dieser Suite",
    );
    expect(exists('[data-testid="alle-abmelden"]')).toBe(true);
  });

  it("faerbt den Knopf nicht als Primaeraktion ein", async () => {
    /*
     * `colorError === colorPrimary === #c8000f` (Falle 3 in
     * docs/design/README.md): eine rote FLAECHE laese sich hier als die
     * empfohlene Handlung. Deshalb `danger` ohne `type="primary"` — antd
     * vergibt `ant-btn-primary` dann nicht.
     */
    await mount(<ProfilAnsicht {...BASIS} abmelden={vi.fn()} />);
    const knopf = query('[data-testid="alle-abmelden"]');
    expect(knopf.className).toContain("ant-btn-dangerous");
    expect(knopf.className).not.toContain("ant-btn-primary");
  });
});
