// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount, exists } from "@/app/m/qr/_lib/test-dom";

/**
 * DIE PROVIDER — seit DRK-444 ohne eigenen Logout.
 *
 * Der Mock liefert `signIn`/`signOut` mit, obwohl `providers.tsx` sie nicht mehr
 * importiert: so faellt es auf, falls jemand den alten Browser-Zweig zurueckholt.
 */
const { useSessionMock, signInMock, signOutMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signInMock: vi.fn().mockResolvedValue(undefined),
  signOutMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: useSessionMock,
  signIn: signInMock,
  signOut: signOutMock,
}));

import { Providers } from "@/components/providers";

beforeEach(() => {
  vi.clearAllMocks();
  useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
});

afterEach(async () => {
  await unmount();
});

describe("Providers", () => {
  it("laesst die Kinder durch", async () => {
    await mount(
      <Providers>
        <p data-testid="inhalt">da</p>
      </Providers>,
    );
    // `exists()` aus dem Harness, nicht `document.querySelector`: gesucht wird im
    // Mount-Wirt, nicht im ganzen Dokument. Sonst faende die Zusicherung auch
    // einen Ueberrest aus einem vorherigen Test und waere gruen, obwohl
    // `Providers` seine Kinder verschluckt haette.
    expect(exists('[data-testid="inhalt"]')).toBe(true);
  });

  /**
   * Das Ende einer Sitzung entscheidet der Server (DRK-284). Der Browser meldet
   * weder an noch ab, auch nicht, wenn eine Sitzung einen Fehlervermerk traegt —
   * ein Neu-Login an dieser Stelle hiesse, eine widerrufene Person wieder
   * anzumelden.
   */
  it("meldet von sich aus weder an noch ab", async () => {
    useSessionMock.mockReturnValue({ data: { error: "RefreshTokenError" }, status: "authenticated" });
    await mount(<Providers>inhalt</Providers>);
    expect(signInMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
