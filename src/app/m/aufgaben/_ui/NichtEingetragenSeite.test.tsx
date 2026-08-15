// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { NichtEingetragenSeite } from "./NichtEingetragenSeite";

afterEach(async () => {
  await unmount();
});

describe("NichtEingetragenSeite — die Erklaerseite bei Modulzugang ohne personen-Zeile", () => {
  it("traegt den vorgeschriebenen Wortlaut aus dem Spec-Nachtrag", async () => {
    await mount(<NichtEingetragenSeite />);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
    expect(document.body.textContent).toContain("Wende dich an die Koordination.");
  });

  it("traegt eine Kopfzeile wie jede andere Seite (Spec §9.4)", async () => {
    await mount(<NichtEingetragenSeite />);
    expect(query("h1").textContent).toBe("Aufgaben");
  });

  /*
   * DER AUSGANG (Aufgabe 14) — ohne `sub` bleibt die Seite unveraendert (die drei bestehenden
   * Tests oben rufen sie ohne den neuen Parameter auf und bleiben gruen).
   */
  it("zeigt den sub NICHT, wenn er fehlt", async () => {
    await mount(<NichtEingetragenSeite />);
    expect(document.body.textContent).not.toContain("Kennung");
  });

  it("zeigt den sub, wenn er uebergeben wird — der Ausgang aus der Erklaerseite", async () => {
    await mount(<NichtEingetragenSeite sub="dev:neu@localtest.me" />);
    expect(document.body.textContent).toContain("dev:neu@localtest.me");
    expect(query("code").textContent).toBe("dev:neu@localtest.me");
  });
});
