// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { PRIORITAETEN, STATUS_WERTE } from "../_db/schema";
import { PRIORITAET_FORM, PRIORITAET_TEXT, STATUS_TEXT, STATUS_TON } from "../_lib/anzeige";
import { PrioritaetChip, StatusChip } from "./Chip";
import s from "./aufgaben.module.css";

afterEach(async () => {
  await unmount();
});

describe("StatusChip — erschoepfend ueber STATUS_WERTE", () => {
  it.each(STATUS_WERTE)("Status %s traegt Text UND Tonklasse", async (status) => {
    await mount(<StatusChip status={status} />);
    const el = query("span");
    expect(el.textContent).toBe(STATUS_TEXT[status]);
    const ton = STATUS_TON[status];
    const tonKlasse = { grau: s.tonGrau, stahl: s.tonStahl, ocker: s.tonOcker, ok: s.tonOk, achtung: s.tonAchtung }[ton];
    expect(el.className.split(" ")).toContain(s.chip);
    expect(el.className.split(" ")).toContain(tonKlasse);
    // DIE NAMENSFALLE: `s[ton]` waere bei einem Tippfehler `undefined` und
    // ergaebe `className="chip undefined"` — Polster und Rundung, aber ohne
    // Farbe. Der Riegel ist der `Record` ueber der Union, dieser Test die
    // Gegenprobe.
    expect(el.className).not.toMatch(/undefined/);
  });
});

describe("PrioritaetChip — erschoepfend ueber PRIORITAETEN", () => {
  it.each(PRIORITAETEN)("Prioritaet %s traegt Text UND Formklasse", async (prioritaet) => {
    await mount(<PrioritaetChip prioritaet={prioritaet} />);
    const el = query("span");
    expect(el.textContent).toBe(PRIORITAET_TEXT[prioritaet]);
    expect(el.className).not.toMatch(/undefined/);
  });

  it("„Hoch“ (gefuellt) traegt die Chip-Form", async () => {
    await mount(<PrioritaetChip prioritaet="hoch" />);
    const el = query("span");
    expect(el.className.split(" ")).toContain(s.chip);
    expect(el.className.split(" ")).toContain(s.prioGefuellt);
  });

  it("„Mittel“ (Kontur) traegt die Chip-Form", async () => {
    await mount(<PrioritaetChip prioritaet="mittel" />);
    const el = query("span");
    expect(el.className.split(" ")).toContain(s.chip);
    expect(el.className.split(" ")).toContain(s.prioKontur);
  });

  it("„Niedrig“ (nur Text) bekommt bewusst KEINE Chip-Form (Spec §9.1)", async () => {
    expect(PRIORITAET_FORM.niedrig).toBe("text");
    await mount(<PrioritaetChip prioritaet="niedrig" />);
    const el = query("span");
    expect(el.className.split(" ")).not.toContain(s.chip);
    expect(el.className.split(" ")).toContain(s.prioText);
  });
});

describe("Chip.tsx traegt kein „use client“ — beide Chips stehen auf RSC-Seiten", () => {
  it("die Datei traegt kein „use client“", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/Chip.tsx", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
