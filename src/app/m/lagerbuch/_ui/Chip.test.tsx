// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { Chip, TON } from "./Chip";

afterEach(async () => { await unmount(); });

describe("Chip", () => {
  it("ist der Statuschip aus core, mit der Ampel auf dessen Toene abgebildet", async () => {
    await mount(<Chip ton="rot">unter Mindestbestand</Chip>);
    expect(query("span").dataset.statuschip).toBe("fehler");
    expect(TON).toEqual({ ok: "ok", gelb: "warnung", rot: "fehler", grau: "neutral" });
  });

  it.each(["rot", "gelb", "ok", "grau"] as const)("kennt den Ton %s", async (ton) => {
    await mount(<Chip ton={ton}>x</Chip>);
    // DIE NAMENSFALLE: `s["gruen"]` waere `undefined` und ergaebe
    // `className="chip undefined"` — Polster und Rundung, aber ohne Farbe.
    // Der Riegel ist der Typ; dieser Test faengt ein `as AmpelTon` an einer
    // Aufrufstelle.
    expect(query("span").className).not.toMatch(/undefined/);
  });

  it("rendert IMMER den Text — Bedeutung nie allein ueber Farbe", async () => {
    await mount(<Chip ton="gelb">läuft 03/27 ab</Chip>);
    expect(query("span").textContent).toContain("läuft 03/27 ab");
  });

  it("nimmt ein Zeichen entgegen und rendert es aria-hidden neben dem Text", async () => {
    await mount(<Chip ton="rot" zeichen="warnung">niedriger Druck</Chip>);
    const svg = query("span svg");
    expect(svg.closest("[aria-hidden=true]")).not.toBeNull();
    expect(query("span").textContent).toContain("niedriger Druck");
  });

  it("rendert ohne Zeichen kein <svg>", async () => {
    await mount(<Chip ton="ok">ok</Chip>);
    expect(queryAll("span svg")).toHaveLength(0);
  });

  it("setzt keine Inline-Farbe — die Farbe kommt aus den CSS-Variablen", async () => {
    // Kaeme sie als Prop, muesste der Server den Hell/Dunkel-Modus kennen. Er
    // kennt ihn nicht: der Moduswechsel ist reines CSS (`data-theme`).
    await mount(<Chip ton="rot">x</Chip>);
    expect(query("span").getAttribute("style")).toBeNull();
  });

  it("die Datei traegt kein \"use client\"", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Chip.tsx", "utf8");
    // Der Chip steht auf RSC-Seiten (Uebersicht, Check-Detail, Verfall) UND in
    // Client-Inseln. Ein "use client" machte ihn fuer die Seiten unbrauchbar.
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
