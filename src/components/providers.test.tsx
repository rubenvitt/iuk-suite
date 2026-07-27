// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, useEffect, useState } from "react";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DER SESSIONGUARD — die einzige Stelle, an der die Suite von sich aus
 * abmeldet.
 *
 * Erster DOM-Test unter `src/components/`, deshalb der Mock hier vollstaendig:
 * `SuiteNav.test.tsx` mockt aus `next-auth/react` nur `signOut`, hier braucht
 * es zusaetzlich `useSession` und `SessionProvider`.
 */
const { useSessionMock, signInMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: useSessionMock,
  signIn: signInMock,
  signOut: signOutMock,
}));

import {
  Providers,
  sanfterVersuchErlaubt,
  REAUTH_MARKE,
  REAUTH_SPERRE_MS,
} from "@/components/providers";

function sitzung(fehler?: string) {
  useSessionMock.mockReturnValue({ data: fehler ? { error: fehler } : {}, status: "authenticated" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sitzung();
});

afterEach(async () => {
  await unmount();
  // Stellt die Storage-Spione aus den Fail-closed-Tests wieder her.
  vi.restoreAllMocks();
});

describe("SessionGuard — der Normalfall", () => {
  it("meldet niemanden ab, solange kein Fehler ansteht", async () => {
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("laesst die Kinder durch", async () => {
    await mount(
      <Providers reauthProvider="pocket-id">
        <p data-testid="inhalt">da</p>
      </Providers>,
    );
    expect(document.querySelector('[data-testid="inhalt"]')).not.toBeNull();
  });
});

describe("SessionGuard — sanfte Re-Authentifizierung", () => {
  it("versucht beim ersten RefreshTokenError einen stillen Re-Login", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledTimes(1);
    // `redirectTo`, NICHT `callbackUrl`: letzteres ist in v5 veraltet
    // (next-auth/lib/client.d.ts:38) und `login-form.tsx` faehrt schon so.
    expect(signInMock).toHaveBeenCalledWith("pocket-id", { redirectTo: window.location.href });
  });

  it("merkt sich den Versuch als Zeitstempel", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    const marke = Number(sessionStorage.getItem(REAUTH_MARKE));
    expect(Number.isFinite(marke)).toBe(true);
    expect(Math.abs(Date.now() - marke)).toBeLessThan(5_000);
  });

  /**
   * DER RIEGEL. Kommt der Nutzer aus dem Re-Login mit demselben Fehler zurueck,
   * darf er nicht wieder weggeschickt werden — das saehe im Browser aus wie ein
   * Absturz. Der zweite Mount ist genau dieser Rueckweg: eine volle
   * Seitennavigation, neuer React-Baum, aber derselbe Tab und damit dasselbe
   * sessionStorage.
   */
  it("faellt beim zweiten Fehler im selben Tab auf den harten Logout zurueck", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    await unmount();
    signInMock.mockClear();

    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("laesst nach Ablauf der Sperre wieder einen sanften Versuch zu", async () => {
    sessionStorage.setItem(REAUTH_MARKE, String(Date.now() - REAUTH_SPERRE_MS - 1_000));
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("ignoriert eine unlesbare Marke und versucht es sanft", async () => {
    sessionStorage.setItem(REAUTH_MARKE, "kaputt");
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Springt die Uhr zurueck (Zeitumstellung, NTP-Korrektur), liegt die Marke in
   * der Zukunft. Die Differenz ist dann negativ und damit kleiner als die
   * Sperre — der Riegel haelt. Das ist die richtige Richtung: im Zweifel
   * blocken, nicht durchlassen.
   */
  it("blockt auch, wenn die Marke in der Zukunft liegt", () => {
    sessionStorage.setItem(REAUTH_MARKE, String(Date.now() + 60_000));
    expect(sanfterVersuchErlaubt()).toBe(false);
  });
});

describe("SessionGuard — wo der sanfte Weg nicht traegt", () => {
  it("meldet ohne Pocket-ID-Provider hart ab", async () => {
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider={null}>inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  /**
   * Faellt der Speicher aus (Safari im privaten Modus), gibt es keinen Riegel.
   * Dann wird NICHT sanft versucht: eine Schleife im Browser ist schlimmer als
   * ein Logout. Fail closed.
   */
  it("meldet hart ab, wenn sessionStorage wirft", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Speicher gesperrt");
    });
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("meldet hart ab, wenn der Speicher beim Schreiben wirft", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Speicher voll");
    });
    sitzung("RefreshTokenError");
    await mount(<Providers reauthProvider="pocket-id">inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});

describe("SessionGuard — doppelt ausgefuehrte Effekte", () => {
  /**
   * React ruft Effekte in der Entwicklungsfassung ZWEIMAL auf. Ohne den
   * Mount-Riegel verbrauchte der erste Lauf den einen erlaubten Versuch und der
   * zweite feuerte `signOut` — waehrend `signIn` noch seine drei HTTP-Umlaeufe
   * macht (next-auth/react.js:130,152,153-168). Ergebnis: Ab- und Anmeldung
   * gleichzeitig.
   *
   * Die Sonde daneben ist der Teil, der diesen Test ehrlich haelt: sie belegt,
   * dass die Umgebung WIRKLICH doppelt ausfuehrt. Faellt das eines Tages weg,
   * schlaegt die Sonde fehl und sagt es — statt dass die Zusage still ihre
   * Aussagekraft verliert.
   */
  it("handelt trotz doppelt laufender Effekte genau einmal", async () => {
    const laeufe: number[] = [];
    function Sonde() {
      const [, setzen] = useState(0);
      useEffect(() => {
        laeufe.push(1);
        setzen((n) => n + 1);
      }, []);
      return null;
    }

    sitzung("RefreshTokenError");
    await mount(
      <StrictMode>
        <Providers reauthProvider="pocket-id">
          <Sonde />
        </Providers>
      </StrictMode>,
    );

    expect(laeufe.length, "Die Umgebung fuehrt Effekte nicht doppelt aus — dieser Test misst nichts mehr").toBe(2);
    expect(signInMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
