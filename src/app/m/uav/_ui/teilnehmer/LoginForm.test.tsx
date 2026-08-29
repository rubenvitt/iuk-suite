// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LoginForm } from "./LoginForm";
import { api, ApiError } from "../offline/client";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Eigene Tests (Task 13 ist im Plan nur mit den Verhaltenssätzen umrissen,
 * kein Alt-Test — `uav-praxis/src/pages/LoginPage.test.tsx` hängt an
 * TanStack-Router/AuthContext, die es hier nicht gibt).
 */

vi.mock("../offline/client", async () => {
  const mod = await vi.importActual<typeof import("../offline/client")>("../offline/client");
  return { ...mod, api: { ...mod.api, participantLogin: vi.fn() } };
});

function stubReplace(): ReturnType<typeof vi.fn> {
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, replace },
    writable: true,
    configurable: true,
  });
  return replace;
}

beforeEach(() => {
  vi.mocked(api.participantLogin).mockReset();
});

afterEach(async () => {
  await unmount();
});

describe("LoginForm — Magic-Link (code-Prop)", () => {
  it("löst den Rohwert genau einmal ein", async () => {
    vi.mocked(api.participantLogin).mockResolvedValue(undefined);
    stubReplace();
    await mount(<LoginForm code="abcd-1234" />);

    await vi.waitFor(() => {
      expect(api.participantLogin).toHaveBeenCalledTimes(1);
    });
    expect(api.participantLogin).toHaveBeenCalledWith("abcd-1234");
  });

  it("leitet bei Erfolg per vollem Reload auf / weiter", async () => {
    vi.mocked(api.participantLogin).mockResolvedValue(undefined);
    const replace = stubReplace();
    await mount(<LoginForm code="ABCD-1234" />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("zeigt bei 401 die feste Meldung", async () => {
    vi.mocked(api.participantLogin).mockRejectedValue(
      new ApiError(401, "invalid_code", "Ungültiger oder inaktiver Code."),
    );
    stubReplace();
    await mount(<LoginForm code="XXXX" />);

    await vi.waitFor(() => {
      expect(query("#login-fehler").textContent).toBe("Ungültiger oder inaktiver Code.");
    });
  });

  it("zeigt bei 429 die Server-Meldung", async () => {
    vi.mocked(api.participantLogin).mockRejectedValue(
      new ApiError(429, "rate_limited", "Zu viele Versuche. Bitte später erneut versuchen."),
    );
    stubReplace();
    await mount(<LoginForm code="XXXX" />);

    await vi.waitFor(() => {
      expect(query("#login-fehler").textContent).toBe(
        "Zu viele Versuche. Bitte später erneut versuchen.",
      );
    });
  });
});

describe("LoginForm — manuelle Eingabe (ohne code)", () => {
  it("sendet den getippten Wert unverändert", async () => {
    vi.mocked(api.participantLogin).mockResolvedValue(undefined);
    stubReplace();
    await mount(<LoginForm />);

    await fill("#login-code", "mein-code");
    await submitForm();

    expect(api.participantLogin).toHaveBeenCalledTimes(1);
    expect(api.participantLogin).toHaveBeenCalledWith("mein-code");
  });
});
