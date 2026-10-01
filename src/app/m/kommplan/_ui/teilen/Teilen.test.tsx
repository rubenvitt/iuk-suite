// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { clickElement, exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { FreigabeZeile } from "../../_lib/freigabe/regeln";
import { Teilen } from "./Teilen";

const aktion = vi.hoisted(() => ({ aus: vi.fn(), weg: vi.fn() }));
vi.mock("../../_actions/freigabe", () => ({ stelleFreigabeAusAction: aktion.aus, widerrufeFreigabeAction: aktion.weg }));
const ablage = vi.hoisted(() => ({ kopiere: vi.fn() }));
vi.mock("./zwischenablage", () => ({ kopiere: ablage.kopiere }));

const BASIS = "http://kommplan.localtest.me:3000";
const T = (c: string) => c.repeat(43);
const Z = (o: Partial<FreigabeZeile>): FreigabeZeile => ({
  id: "f1", token: T("A"), notiz: "Leitstelle", ablauf: Date.UTC(2026, 9, 8, 16, 0), widerrufenAm: null, erstelltAm: Date.UTC(2026, 9, 1, 16, 0),
  erstelltVon: "Jana", zuletztAbgerufen: null, abrufe: 0, status: "gueltig", ...o,
});
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
const imEintrag = (id: string, text: string) => [...query(`[data-freigabe="${id}"]`).querySelectorAll("button")].find((b) => b.textContent === text)!;
const neue = vi.fn();
/** Hält die Liste wie der Editor im Zustand — für Fälle, in denen die Liste nach einer Action wechselt. */
function Wirt({ start }: { start: FreigabeZeile[] }) {
  const [f, setF] = useState(start);
  return <Teilen planId="p1" basis={BASIS} freigaben={f} onFreigaben={(n) => { neue(n); setF(n); }} />;
}
afterEach(async () => { await unmount(); aktion.aus.mockReset(); aktion.weg.mockReset(); ablage.kopiere.mockReset(); neue.mockReset(); });

describe("Teilen (Spec §8.2; Entscheidung 17)", () => {
  it("beim Öffnen steht der Fokus in der Notiz (Tastaturweg: Notiz, Enter, Enter)", async () => {
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[]} onFreigaben={neue} />);
    expect(document.activeElement?.id).toBe("kp-teilen-notiz");
  });
  it("Vorgabe 7 Tage; Ausstellen schickt Dauer und Notiz, übernimmt die Liste, fokussiert „Link kopieren“ am neuen Link", async () => {
    aktion.aus.mockResolvedValue({ ok: true, neu: "f2", freigaben: [Z({ id: "f2", token: T("B"), notiz: "Presse" }), Z({})] });
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    expect(query<HTMLInputElement>('input[type="radio"][value="7d"]').checked).toBe(true);
    await clickElement(query('input[type="radio"][value="24h"]'));
    await fill("#kp-teilen-notiz", "Presse");
    await clickElement(knopf("Link ausstellen"));
    await act(async () => {});
    expect(aktion.aus).toHaveBeenCalledWith({ planId: "p1", dauer: "24h", notiz: "Presse" });
    expect(neue).toHaveBeenCalledWith([expect.objectContaining({ id: "f2" }), expect.objectContaining({ id: "f1" })]);
  });
  it("ein Eintrag zeigt Notiz, Ablauf, Abrufe und die URL; Kopieren meldet sich im Status", async () => {
    ablage.kopiere.mockResolvedValue("kopiert");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({ abrufe: 3, zuletztAbgerufen: Date.UTC(2026, 9, 1, 17, 30) })]} onFreigaben={neue} />);
    const e = query('[data-freigabe="f1"]');
    expect(e.textContent).toContain("Leitstelle");
    expect(e.textContent).toContain("gültig bis 08.10.2026, 18:00");
    expect(e.textContent).toContain("3 Abrufe, zuletzt 01.10.2026, 19:30");
    expect(query('[data-freigabe="f1"] [data-link]').textContent).toBe(`${BASIS}/t/${T("A")}`);
    await clickElement(knopf("Link kopieren"));
    await act(async () => {});
    expect(ablage.kopiere).toHaveBeenCalledWith(`${BASIS}/t/${T("A")}`);
    expect(query('[role="status"]').textContent).toBe("Link kopiert.");
    expect(imEintrag("f1", "Kopiert")).toBeTruthy(); // sichtbar am Eintrag, nicht nur oben
  });
  it("zwei Links: Kopieren am zweiten antwortet am zweiten — „Kopiert“ und das Lesefeld stehen dort", async () => {
    ablage.kopiere.mockResolvedValueOnce("kopiert").mockResolvedValueOnce("manuell");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({}), Z({ id: "f2", token: T("B"), notiz: "Presse" })]} onFreigaben={neue} />);
    await clickElement(imEintrag("f2", "Link kopieren"));
    await act(async () => {});
    expect(imEintrag("f2", "Kopiert")).toBeTruthy();
    expect(imEintrag("f1", "Link kopieren")).toBeTruthy();
    await clickElement(imEintrag("f2", "Kopiert"));
    await act(async () => {});
    expect(query('[data-freigabe="f2"] input[data-manuell]').getAttribute("value")).toBe(`${BASIS}/t/${T("B")}`);
    expect(exists('[data-freigabe="f1"] input[data-manuell]')).toBe(false);
    expect(document.activeElement?.closest("[data-freigabe]")?.getAttribute("data-freigabe")).toBe("f2");
  });
  it("nach dem Widerrufen steht der Fokus am nächsten gültigen Link, beim letzten an „Gültige Links (0)“", async () => {
    aktion.weg.mockResolvedValueOnce({ ok: true, neu: null, freigaben: [Z({ id: "f2", token: T("B") }), Z({ status: "widerrufen", widerrufenAm: 1 })] });
    await mount(<Wirt start={[Z({}), Z({ id: "f2", token: T("B") })]} />);
    const bestaetige = async () => {
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await clickElement([...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Widerrufen" && !b.closest("[data-freigabe]"))!);
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    };
    await clickElement(imEintrag("f1", "Widerrufen"));
    await bestaetige();
    expect(document.activeElement?.closest("[data-freigabe]")?.getAttribute("data-freigabe")).toBe("f2");
    aktion.weg.mockResolvedValueOnce({ ok: true, neu: null, freigaben: [Z({ id: "f2", token: T("B"), status: "widerrufen", widerrufenAm: 2 }), Z({ status: "widerrufen", widerrufenAm: 1 })] });
    await clickElement(imEintrag("f2", "Widerrufen"));
    await bestaetige();
    expect(document.activeElement?.textContent).toBe("Gültige Links (0)");
  });
  it("Kopieren geht nicht von selbst: der Link steht markiert in einem Lesefeld mit Anleitung — im Eintrag", async () => {
    ablage.kopiere.mockResolvedValue("manuell");
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    await clickElement(knopf("Link kopieren"));
    await act(async () => {});
    const feld = query<HTMLInputElement>('[data-freigabe="f1"] input[data-manuell]');
    expect(feld.readOnly).toBe(true);
    expect(feld.value).toBe(`${BASIS}/t/${T("A")}`);
    expect(document.activeElement).toBe(feld);
    expect(query('[role="status"]').textContent).toContain("Kopiere ihn mit Strg+C");
  });
  it("Dauer als einfache Radios im eigenen Raster (kein Rot auf der gewählten Dauer, kein Zerreißen am Telefon)", async () => {
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[]} onFreigaben={neue} />);
    expect(queryAll(".kp-dauer .kp-dauer-wahl input[type=\"radio\"]").map((i) => i.getAttribute("value"))).toEqual(["24h", "7d", "30d", "unbegrenzt"]);
    expect(exists(".ant-radio-button-wrapper")).toBe(false);
  });
  it("widerruft man den eben ausgestellten Link, verliert er die Hervorhebung", async () => {
    aktion.aus.mockResolvedValue({ ok: true, neu: "f2", freigaben: [Z({ id: "f2", token: T("B") })] });
    aktion.weg.mockResolvedValue({ ok: true, neu: null, freigaben: [Z({ id: "f2", token: T("B"), status: "widerrufen", widerrufenAm: 1 })] });
    await mount(<Wirt start={[]} />);
    await clickElement(knopf("Link ausstellen"));
    await act(async () => {});
    expect(exists('[data-freigabe="f2"][data-neu]')).toBe(true);
    await clickElement(imEintrag("f2", "Widerrufen"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await clickElement([...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Widerrufen" && !b.closest("[data-freigabe]"))!);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(exists('details [data-freigabe="f2"]')).toBe(true);
    expect(exists("[data-neu]")).toBe(false);
  });
  it("abgelaufene und widerrufene stehen eingeklappt darunter, ohne „Link kopieren“", async () => {
    await mount(<Teilen planId="p1" basis={BASIS} onFreigaben={neue} freigaben={[
      Z({}), Z({ id: "f3", token: T("C"), status: "abgelaufen" }), Z({ id: "f4", token: T("D"), status: "widerrufen", widerrufenAm: Date.UTC(2026, 9, 1, 17, 0) }),
    ]} />);
    expect(query("details summary").textContent).toBe("Abgelaufen und widerrufen (2)");
    expect(queryAll("details [data-freigabe]")).toHaveLength(2);
    expect(queryAll("details button").map((b) => b.textContent)).not.toContain("Link kopieren");
    expect(query('[data-freigabe="f4"]').textContent).toContain("widerrufen am 01.10.2026, 19:00");
  });
  it("ohne eingerichtete Adresse: Ausstellen gesperrt, mit Grund", async () => {
    await mount(<Teilen planId="p1" basis={null} freigaben={[]} onFreigaben={neue} />);
    expect(knopf("Link ausstellen").disabled).toBe(true);
    expect(query("[data-keine-adresse]").textContent).toContain("keine Adresse eingerichtet");
  });
  it("Fehler der Action steht im Status, die Liste bleibt", async () => {
    aktion.aus.mockResolvedValue({ ok: false, fehler: "Höchstens 20 gültige Links je Plan.", feldFehler: {} });
    await mount(<Teilen planId="p1" basis={BASIS} freigaben={[Z({})]} onFreigaben={neue} />);
    await clickElement(knopf("Link ausstellen"));
    await act(async () => {});
    expect(query('[role="status"]').textContent).toBe("Höchstens 20 gültige Links je Plan.");
    expect(neue).not.toHaveBeenCalled();
    expect(exists('[data-freigabe="f1"]')).toBe(true);
  });
  it("QR-Schalter im Teilen-Flyin: dieselbe Option; an mit Link → der Satz zum besten Link", async () => {
    const aendern = vi.fn();
    await mount(<Teilen planId="p1" basis={BASIS} onFreigaben={neue} qr={{ an: true, onAendern: aendern }}
      freigaben={[Z({ notiz: "kurz" }), Z({ id: "f2", token: T("B"), notiz: "Aushang", ablauf: null })]} />);
    expect(query("[data-qr-ziel-satz]").textContent).toBe("Der QR-Code führt auf „Aushang“ – unbegrenzt gültig.");
    await clickElement(query('[data-option="qrAufDruck"]'));
    expect(aendern).toHaveBeenCalledWith(false);
  });
});
