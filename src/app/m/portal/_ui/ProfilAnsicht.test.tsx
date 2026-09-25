// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

/*
 * DIE ACTION WIRD GEMOCKT, NICHT ALS PROP INJIZIERT (DRK-398): die Insel
 * importiert `alleSitzungenAbmelden` direkt (Falle 9, `CLAUDE.md`). `vi.hoisted`,
 * weil `vi.mock` an den Dateikopf gehoben wird.
 */
const { signOutMock, abmeldenMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  abmeldenMock: vi.fn<() => Promise<void>>(),
}));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));
vi.mock("@/app/m/portal/profil/actions", () => ({ alleSitzungenAbmelden: abmeldenMock }));

import { mount, unmount, query, exists, click, clickPortal } from "@/app/m/qr/_lib/test-dom";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";

const BASIS = {
  name: "Ruben Vitt",
  email: "ruben@example.org",
  kennung: "sub-42",
  bild: null,
  gruppen: ["iuk"],
  fachgruppen: ["fuehrung"],
  angemeldetSeit: 1_755_000_000,
  version: "1.4.2",
  revision: "0123456789abcdef0123456789abcdef01234567",
};

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
  abmeldenMock.mockReset().mockResolvedValue(undefined);
});

describe("ProfilAnsicht", () => {
  it("zeigt Name, E-Mail, Kennung, Gruppen und Fachgruppen", async () => {
    await mount(<ProfilAnsicht {...BASIS} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ruben Vitt");
    expect(text).toContain("ruben@example.org");
    expect(text).toContain("sub-42");
    expect(text).toContain("iuk");
    expect(text).toContain("fuehrung");
  });

  it("zeigt das Profilbild aus Pocket ID, sonst die Initialen", async () => {
    await mount(
      <ProfilAnsicht {...BASIS} bild="https://id.example/api/users/u1/profile-picture.png" />,
    );
    const bild = query('[data-testid="profil-bild"] img');
    expect(bild.getAttribute("src")).toBe("https://id.example/api/users/u1/profile-picture.png");
    // Der Name steht direkt daneben — das Bild ist Zierde.
    expect(bild.getAttribute("alt")).toBe("");
    await unmount();

    await mount(<ProfilAnsicht {...BASIS} bild={null} />);
    expect(exists('[data-testid="profil-bild"] img')).toBe(false);
    expect(query('[data-testid="profil-bild"]').textContent).toBe("RV");
  });

  it("zeigt die laufende Version und den gekuerzten Stand", async () => {
    await mount(<ProfilAnsicht {...BASIS} />);
    expect(query('[data-testid="suite-version"]').textContent).toBe("1.4.2");
    // Zwoelf Zeichen: eindeutig genug fuer `git show`, kurz genug fuer eine Zeile
    // auf dem Telefon. Der volle Commit steht auf `/api/health/portal`.
    expect(query('[data-testid="suite-revision"]').textContent).toBe("0123456789ab");
  });

  it("schreibt `unbekannt` als Entwicklungsstand aus, statt das Wort zu zeigen", async () => {
    // Lokal (`next dev`, `docker build` ohne Build-Arg) liefern beide Funktionen
    // `unbekannt`. Das Wort allein laese sich wie ein Fehler; die Auskunft ist
    // „hier laeuft kein CI-Image".
    await mount(
      <ProfilAnsicht {...BASIS} version="unbekannt" revision="unbekannt" />,
    );
    expect(query('[data-testid="suite-version"]').textContent).toContain("Entwicklungsstand");
    expect(query('[data-testid="suite-revision"]').textContent).toBe("unbekannt");
  });

  it("schreibt leere Mengen aus, statt eine Luecke zu lassen", async () => {
    // Eine leere Zeile liest sich wie ein Ladefehler. „Keine" ist eine Aussage.
    await mount(<ProfilAnsicht {...BASIS} gruppen={[]} fachgruppen={[]} />);
    expect(query('[data-testid="profil-gruppen"]').textContent).toContain("Keine");
  });

  it("meldet nicht ab, solange nicht bestaetigt wurde", async () => {
    await mount(<ProfilAnsicht {...BASIS} />);
    await click('[data-testid="alle-abmelden"]');
    expect(abmeldenMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("ruft nach der Bestaetigung die Action und danach signOut", async () => {
    await mount(<ProfilAnsicht {...BASIS} />);
    await click('[data-testid="alle-abmelden"]');
    await clickPortal('[data-testid="alle-abmelden-ja"]');
    expect(abmeldenMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("nennt die Grenze des Knopfes beim Namen", async () => {
    // „Beendet alle Sitzungen dieser Suite" — nicht „meldet dich ueberall ab".
    // Die Sitzung beim Identitaetsanbieter bleibt auf fremden Geraeten bestehen.
    await mount(<ProfilAnsicht {...BASIS} />);
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
    await mount(<ProfilAnsicht {...BASIS} />);
    const knopf = query('[data-testid="alle-abmelden"]');
    expect(knopf.className).toContain("ant-btn-dangerous");
    expect(knopf.className).not.toContain("ant-btn-primary");
  });
});
