// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { TokenKopf } from "./TokenKopf";

afterEach(async () => { await unmount(); });
const PLAN = {
  titel: "Kommunikationsplan Einsatz 22.02.2026", typ: "kommunikationsplan" as const, anlass: "Hochwasser",
  datum: Date.UTC(2026, 1, 22), aktualisiertAm: Date.UTC(2026, 8, 30, 12, 5), aktualisiertVon: "Jana", vermerkVsNfD: true,
};

describe("TokenKopf (Entscheidung 8)", () => {
  it("Titel als h1, Art · Anlass · Datum, Stand und Bearbeitung, VS-NfD-Vermerk, Druckmenü auf den Token-Pfad", async () => {
    await mount(<TokenKopf plan={PLAN} kopf={{ organisation: "Musterorganisation", logo: null }} token={"T".repeat(43)} />);
    expect(query("h1").textContent).toBe(PLAN.titel);
    expect(query("[data-token-angaben]").textContent).toBe("Kommunikationsplan · Hochwasser · 22.02.2026");
    expect(query("[data-token-stand]").textContent).toBe("Stand 30.09.2026, 14:05 · Bearbeitung: Jana");
    expect(query("[data-vermerk]").textContent).toBe("VS – nur für den Dienstgebrauch");
    expect(query("[data-organisation]").textContent).toBe("Musterorganisation");
    expect(exists("[data-logo]")).toBe(false);
    expect(query("button").textContent).toBe("Drucken");
    expect(query("[data-token-stand]").closest(".kp-token-links")).not.toBeNull();
  });
  it("ohne Vermerk, ohne Briefkopf: nichts davon steht da; das Logo kommt als <image> mit data:-URI, nie als <img>", async () => {
    await mount(<TokenKopf plan={{ ...PLAN, vermerkVsNfD: false }} kopf={{ organisation: null, logo: { href: "data:image/png;base64,QUJD" } }} token={"T".repeat(43)} />);
    expect(exists("[data-vermerk]")).toBe(false);
    expect(exists("[data-organisation]")).toBe(false);
    expect(query("[data-logo] image").getAttribute("href")).toBe("data:image/png;base64,QUJD");
    expect(exists("img")).toBe(false);
  });
});
