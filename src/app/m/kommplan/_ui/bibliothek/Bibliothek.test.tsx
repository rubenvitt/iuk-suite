// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, fill, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Bibliothek as BibliothekDaten } from "../../_lib/bibliothek/typen";

const aktion = vi.hoisted(() => ({ stelle: vi.fn(), einheit: vi.fn(), verbindung: vi.fn(), loesche: vi.fn(), importiere: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/bibliothek", () => ({
  speichereBibStelleAction: aktion.stelle, speichereBibEinheitAction: aktion.einheit, speichereBibVerbindungAction: aktion.verbindung,
  loescheBibEintragAction: aktion.loesche, importiereBibEinheitenAction: aktion.importiere,
}));
vi.mock("../../_actions/zeichen", () => ({ ladeZeichenAction: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { Bibliothek } from "./Bibliothek";

const BIB: BibliothekDaten = {
  stellen: [{ id: "s1", titel: "Leitstelle Uelzen", zeichen: null, leiter: null, kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null },
    { id: "s2", titel: "EAL Nord", zeichen: null, leiter: "Jana", kontakte: [], notiz: null }],
  einheiten: [{ id: "e1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null, notiz: null }],
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_1", notiz: null }],
};
const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem'], [role='tab']")].find((b) => b.textContent?.trim() === text)!;
const zeige = () => mount(<Bibliothek bibliothek={BIB} zeichenIndex={[]} symbole={{}} />);
/**
 * `fill`/`submitForm` des Harness suchen nur im Mount-Wirt — das Flyin (antd `Drawer`) hängt per Portal am
 * `body`. Dieselbe Mechanik wie `fill` (Prototyp-Setter, sonst bliebe onChange aus), nur über `queryPortal`.
 */
async function fillPortal(selektor: string, wert: string) {
  const feld = queryPortal<HTMLInputElement | HTMLTextAreaElement>(selektor);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter an ${feld.tagName}`);
  await act(async () => { setter.call(feld, wert); feld.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submitPortal(selektor: string) {
  const form = queryPortal<HTMLFormElement>(selektor);
  await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
beforeEach(() => { Object.values(aktion).forEach((f) => f.mockReset()); router.refresh.mockReset(); });
afterEach(async () => { await unmount(); });

describe("Bibliothek", () => {
  it("drei Reiter mit Anzahl; Suche filtert und sagt „nichts passt“ statt „nichts angelegt“", async () => {
    await zeige();
    expect(queryAll('[role="tab"]').map((t) => t.textContent)).toEqual(["Stellen (2)", "Einheiten (1)", "Verbindungen (1)"]);
    await fill('input[aria-label="Stellen suchen"]', "nord");
    expect(queryAll('section[aria-label="Stellen der Bibliothek"] tr[data-row-key]').map((r) => r.getAttribute("data-row-key"))).toEqual(["s2"]);
    await fill('input[aria-label="Stellen suchen"]', "gibtsnicht");
    expect(query('section[aria-label="Stellen der Bibliothek"]').textContent).toContain("Keine Stelle passt zur Suche.");
  });
  it("Neue Stelle: Flyin, Speichern ruft die Action mit id null; Feldfehler stehen am Feld", async () => {
    aktion.stelle.mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "„Leitstelle Uelzen“ steht schon in der Bibliothek." } })
      .mockResolvedValueOnce({ ok: true, eintrag: { id: "s3", titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null } });
    await zeige();
    await clickElement(knopf("Neue Stelle"));
    await fillPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"] input[name="titel"]', "Leitstelle Uelzen");
    await submitPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"]');
    await abwarten();
    expect(aktion.stelle).toHaveBeenCalledWith(expect.objectContaining({ id: null, titel: "Leitstelle Uelzen" }));
    const titel = queryPortal<HTMLInputElement>('.kp-flyin input[name="titel"]');
    expect(titel.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("„Leitstelle Uelzen“ steht schon in der Bibliothek.");
    await fillPortal('.kp-flyin input[name="titel"]', "EAL Süd");
    await submitPortal('.kp-flyin form[aria-label="Stelle der Bibliothek"]');
    await abwarten();
    expect(query('section[aria-label="Stellen der Bibliothek"] [role="status"]').textContent).toBe("„EAL Süd“ gespeichert.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("Neue Stelle: Fokus im Titel; „Speichern und nächste“ lässt das Flyin leer offen, Fokus wieder im Titel", async () => {
    aktion.stelle.mockResolvedValue({ ok: true, eintrag: { id: "s3", titel: "EAL Süd", zeichen: null, leiter: null, kontakte: [], notiz: null } });
    await zeige();
    await clickElement(knopf("Neue Stelle"));
    await abwarten();
    expect(document.activeElement).toBe(queryPortal('.kp-flyin input[name="titel"]'));
    await fillPortal('.kp-flyin input[name="titel"]', "EAL Süd");
    await clickElement(knopf("Speichern und nächste"));
    await abwarten();
    expect(query('section[aria-label="Stellen der Bibliothek"] [role="status"]').textContent).toBe("„EAL Süd“ gespeichert.");
    const leer = queryPortal<HTMLInputElement>('.kp-flyin input[name="titel"]');
    expect(leer.value).toBe("");
    expect(document.activeElement).toBe(leer);
  });
  it("eine lange Notiz steht in einer Zelle mit Lesebreite (Zellentext), nicht als nackter Text", async () => {
    await mount(<Bibliothek bibliothek={{ ...BIB, stellen: [{ ...BIB.stellen[0], notiz: "Wort ".repeat(100) }] }} zeichenIndex={[]} symbole={{}} />);
    const zelle = query('section[aria-label="Stellen der Bibliothek"] tr[data-row-key="s1"]');
    // der Testgriff von core/tabelle/Zellentext; die Zeile hat zwei Freitextspalten (Kontakte, Notiz)
    expect([...zelle.querySelectorAll("[data-zellentext]")].map((z) => z.textContent)).toContain("Wort ".repeat(100));
  });
  it("Bearbeiten und Löschen mit Nachfrage", async () => {
    aktion.loesche.mockResolvedValue({ ok: true });
    await zeige();
    await clickElement(knopf("EAL Nord"));
    expect(queryPortal<HTMLInputElement>('.kp-flyin input[name="leiter"]').value).toBe("Jana");
    await clickElement(knopf("Löschen"));
    await clickElement([...document.querySelectorAll<HTMLElement>(".ant-popconfirm button, .ant-popover button")].find((b) => b.textContent?.trim() === "Löschen")!);
    await abwarten();
    expect(aktion.loesche).toHaveBeenCalledWith({ art: "stelle", id: "s2" });
  });
  it("CSV aus Excel (Windows-1252): Vorschau mit Umlauten und Status, übernommen wird nur Neues", async () => {
    aktion.importiere.mockResolvedValue({ ok: true, angelegt: 1, uebersprungen: 0 });
    await zeige();
    await clickElement(knopf("Einheiten (1)"));
    const bytes = new Uint8Array([..."Typ;Rufname\nRTW;rk ue 40-83-5\nKTW;RK Großenkneten 1\n"].map((c) => c.charCodeAt(0)));
    const feld = query<HTMLInputElement>('input[type="file"][name="csv"]');
    await act(async () => {
      Object.defineProperty(feld, "files", { value: [new File([bytes], "einheiten.csv")], configurable: true });
      feld.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await abwarten();
    const vorschau = queryPortal('[aria-label="Vorschau"]').closest(".kp-flyin")!;
    expect(vorschau.textContent).toContain("RK Großenkneten 1");
    expect(vorschau.textContent).toContain("schon in der Bibliothek");
    await clickElement(knopf("1 übernehmen"));
    await abwarten();
    expect(aktion.importiere).toHaveBeenCalledWith([{ typ: "KTW", rufname: "RK Großenkneten 1", notiz: null }]);
    expect(query('section[aria-label="Einheiten der Bibliothek"] [role="status"]').textContent).toBe("1 angelegt, 0 übersprungen.");
  });
  it("Liste einfügen mit Fehler: keine Übernahme möglich, Fehler mit Zeile", async () => {
    await zeige();
    await clickElement(knopf("Einheiten (1)"));
    await clickElement(knopf("Liste einfügen"));
    await fillPortal('.kp-flyin textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK 2\nNEF");
    await clickElement(knopf("Vorschau"));
    expect(document.body.textContent).toContain("Zeile 2: Der Rufname fehlt.");
    expect(knopf("1 übernehmen").hasAttribute("disabled")).toBe(true);
  });
});
