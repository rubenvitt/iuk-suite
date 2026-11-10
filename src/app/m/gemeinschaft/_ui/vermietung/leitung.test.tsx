// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { clickElement, fillElement, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AnfrageDTO, SperrzeitDTO } from "../../_lib/vermietungTypen";
import { zeitpunkt } from "../../_lib/zeit";
import { Anfragenliste } from "./Anfragenliste";
import { Belegungsansicht } from "./Belegungsansicht";
import { Sperrzeitenliste } from "./Sperrzeitenliste";

const aktion = vi.hoisted(() => ({ zusagen: vi.fn(), rueckgaengig: vi.fn(), ablehnen: vi.fn(), zuruecknehmen: vi.fn(), refresh: vi.fn(), sperreAnlegen: vi.fn() }));
vi.mock("../../_actions/vermietung", () => ({
  anfrageZusagenAction: aktion.zusagen, zusageRueckgaengigAction: aktion.rueckgaengig, anfrageAblehnenAction: aktion.ablehnen, zusageZuruecknehmenAction: aktion.zuruecknehmen,
  vertragStandAction: vi.fn(), vertragEntfernenAction: vi.fn(), dokumentErstellenAction: vi.fn(), sperrzeitAnlegenAction: aktion.sperreAnlegen, sperrzeitLoeschenAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: aktion.refresh }) }));

beforeAll(() => {
  // antd fragt Media Queries ab (Kartentabelle, Segmented); jsdom kennt matchMedia nicht.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(async () => { await unmount(); Object.values(aktion).forEach((f) => f.mockReset()); });

const um = zeitpunkt;
function anfrage(id: string, status: AnfrageDTO["status"], vonTag: string, von: string, bisTag: string, bis: string, anlass: string): AnfrageDTO {
  return { id, status, code: `${id}`.padEnd(22, "x"), von: um(vonTag, von), bis: um(bisTag, bis), anlass, personen: 20, person: "Lena Kraus", kontakt: "lena@example.org",
    hinweis: "", mitglied: false, begruendung: "", vertrag: "offen", eingegangenAm: um("2026-11-01", "10:00"), entschiedenAm: null,
    dokumente: [{ art: "mietvertrag", vorlage: true, stand: null, datei: null, leitungOffen: false }, { art: "uebergabe", vorlage: false, stand: "entwurf", datei: null, leitungOffen: false }, { art: "rueckgabe", vorlage: false, stand: null, datei: null, leitungOffen: false }] };
}
const ANFRAGEN = [
  anfrage("a1", "zugesagt", "2026-11-07", "18:00", "2026-11-08", "01:00", "40. Geburtstag"),
  anfrage("a2", "angefragt", "2026-11-07", "20:00", "2026-11-07", "23:00", "Vereinstreffen"),
  anfrage("a3", "angefragt", "2026-11-15", "14:00", "2026-11-15", "18:00", "Kaffeetrinken"),
  anfrage("a4", "abgelehnt", "2026-11-10", "18:00", "2026-11-10", "23:00", "Junggesellenabschied"),
];
const SPERREN: SperrzeitDTO[] = [{ id: "ev-v1", von: um("2026-11-13", "18:00"), bis: um("2026-11-13", "23:00"), grund: "Event: Glühweinabend", eventId: "v1" }];

const BAR = "https://gemeinschaft.example/bar";
const knopfIn = (wurzel: ParentNode, text: string) => Array.from(wurzel.querySelectorAll<HTMLButtonElement>("button, a")).find((b) => b.textContent === text);
const tabellenText = () => queryAll("table").map((t) => t.textContent).join(" ");

describe("Anfragenliste", () => {
  it("filtert offen/zugesagt/abgelehnt/alle und zeigt Überschneidungen", async () => {
    await mount(<App><Anfragenliste anfragen={ANFRAGEN} sperren={SPERREN} startId={null} /></App>);
    expect(query('[role=radio][aria-checked=true]').textContent).toBe("Offen 2");
    expect(tabellenText()).toContain("Vereinstreffen");
    expect(tabellenText()).not.toContain("40. Geburtstag");
    expect(tabellenText()).toContain("Überschneidung");
    await clickElement(query('[role=radio][data-wert="abgelehnt"]'));
    expect(tabellenText()).toContain("Junggesellenabschied");
    expect(tabellenText()).not.toContain("Vereinstreffen");
  });

  it("`?id=` öffnet den Eintrag im Flyin und stellt den passenden Filter ein", async () => {
    await mount(<App><Anfragenliste anfragen={ANFRAGEN} sperren={SPERREN} startId="a1" /></App>);
    expect(tabellenText()).toContain("40. Geburtstag");
    const details = queryPortal('[data-testid="eintrag-details"]');
    expect(details.textContent).toContain("Lena Kraus");
    expect(details.textContent).toContain("Überschneidet sich mit:");
    expect(details.querySelector('[data-testid="vertrag"]')).toBeTruthy();
    // Mit Vorlage erstellen, ein Entwurf öffnet die Ausfüllseite, ohne beides nur das Ablegen.
    expect(knopfIn(details.querySelector('[data-testid="dokument-mietvertrag"]')!, "Erstellen")).toBeTruthy();
    expect(knopfIn(details.querySelector('[data-testid="dokument-uebergabe"]')!, "Ausfüllen")?.getAttribute("href")).toBe("/vermietung/dokument/a1/uebergabe");
    expect(knopfIn(details.querySelector('[data-testid="dokument-rueckgabe"]')!, "Erstellen")).toBeUndefined();
  });

  it("Zusagen bei harter Überschneidung: der Satz des Servers kommt als Hinweis", async () => {
    aktion.zusagen.mockResolvedValue({ ok: false, fehler: "Zusagen geht nicht: der Zeitraum ist schon belegt (40. Geburtstag)." });
    await mount(<App><Anfragenliste anfragen={ANFRAGEN} sperren={SPERREN} startId={null} /></App>);
    const zeile = queryAll("tr").find((r) => r.textContent?.includes("Vereinstreffen"))!;
    await clickElement(knopfIn(zeile, "Zusagen")!);
    // IDA-387: bei einer Überschneidung erst die Rückfrage mit Zeitraum und dem, was sich überschneidet.
    expect(aktion.zusagen).not.toHaveBeenCalled();
    const frage = queryPortal('[data-testid="zusage-rueckfrage"]');
    expect(frage.textContent).toContain("Vereinstreffen");
    expect(frage.textContent).toContain("Zusage „40. Geburtstag“");
    const ja = Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-modal button")).find((b) => b.textContent === "Zusagen")!;
    await clickElement(ja);
    await act(async () => {});
    expect(aktion.zusagen).toHaveBeenCalledWith("a2");
    expect(document.body.textContent).toContain("Zusagen geht nicht");
    expect(aktion.refresh).not.toHaveBeenCalled();
  });

  it("IDA-387: ohne Überschneidung sofort zugesagt; „Rückgängig“ im Toast stellt still zurück", async () => {
    aktion.zusagen.mockResolvedValue({ ok: true, wert: { weitereOffene: 0 } });
    aktion.rueckgaengig.mockResolvedValue({ ok: true });
    await mount(<App><Anfragenliste anfragen={ANFRAGEN} sperren={SPERREN} startId={null} /></App>);
    const zeile = queryAll("tr").find((r) => r.textContent?.includes("Kaffeetrinken"))!;
    await clickElement(knopfIn(zeile, "Zusagen")!);
    await act(async () => {});
    expect(aktion.zusagen).toHaveBeenCalledWith("a3");
    const rueck = Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-message button")).find((b) => b.textContent === "Rückgängig")!;
    expect(rueck).toBeTruthy();
    await clickElement(rueck);
    await act(async () => {});
    expect(aktion.rueckgaengig).toHaveBeenCalledWith("a3");
    expect(aktion.ablehnen).not.toHaveBeenCalled();
    expect(aktion.zuruecknehmen).not.toHaveBeenCalled();
  });

  it("Ablehnen braucht eine Begründung von mindestens 5 Zeichen", async () => {
    aktion.ablehnen.mockResolvedValue({ ok: true });
    await mount(<App><Anfragenliste anfragen={ANFRAGEN} sperren={SPERREN} startId={null} /></App>);
    const zeile = queryAll("tr").find((r) => r.textContent?.includes("Kaffeetrinken"))!;
    await clickElement(knopfIn(zeile, "Ablehnen")!);
    const ok = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-modal button")).find((b) => b.textContent === "Ablehnen")!;
    expect(ok().disabled).toBe(true);
    await fillElement(queryPortal<HTMLTextAreaElement>("#begruendung"), "Dienstabend.");
    expect(ok().disabled).toBe(false);
    await clickElement(ok());
    await act(async () => {});
    expect(aktion.ablehnen).toHaveBeenCalledWith("a3", "Dienstabend.");
    expect(aktion.refresh).toHaveBeenCalled();
  });
});

describe("Sperrzeitenliste", () => {
  it("abgeleitete Event-Sperre verlinkt aufs Event und ist nicht löschbar", async () => {
    await mount(<App><Sperrzeitenliste anfragen={ANFRAGEN} sperren={SPERREN} heute="2026-11-01" /></App>);
    const zeile = queryAll("tr").find((r) => r.textContent?.includes("Event: Glühweinabend"))!;
    expect(knopfIn(zeile, "Zum Event")?.getAttribute("href")).toBe("/v/v1");
    expect(knopfIn(zeile, "Löschen")).toBeUndefined();
  });

  it("zeigt beim Anlegen getroffene Anfragen; über einer Zusage geht Eintragen nicht", async () => {
    await mount(<App><Sperrzeitenliste anfragen={ANFRAGEN} sperren={SPERREN} heute="2026-11-07" /></App>);
    await clickElement(knopfIn(document, "Sperrzeit eintragen")!);
    await fillElement(queryPortal<HTMLInputElement>('.ant-modal input[placeholder^="Zum Beispiel"]'), "Wartung");
    const konflikt = queryPortal('[data-testid="sperre-konflikt"]');
    expect(konflikt.textContent).toContain("Hier liegt schon eine Zusage.");
    expect(konflikt.textContent).toContain("40. Geburtstag");
    const ok = Array.from(document.querySelectorAll<HTMLButtonElement>(".ant-modal button")).find((b) => b.textContent === "Eintragen")!;
    expect(ok.disabled).toBe(true);
  });
});

describe("Belegungsansicht", () => {
  it("zeigt angefragt, zugesagt und gesperrt im Monat, Absagen nicht; ein Eintrag öffnet das Flyin", async () => {
    await mount(<App><Belegungsansicht anfragen={ANFRAGEN} sperren={SPERREN} heute="2026-11-07" barLink={BAR} /></App>);
    const zelle = (t: string) => document.querySelector<HTMLElement>(`[data-tag="${t}"]`)!;
    expect(zelle("2026-11-07").textContent).toContain("18:00 40. Geburtstag");
    expect(zelle("2026-11-07").textContent).toContain("20:00 Vereinstreffen");
    expect(zelle("2026-11-08").textContent).toContain("… 40. Geburtstag");
    expect(zelle("2026-11-13").textContent).toContain("Event: Glühweinabend");
    expect(zelle("2026-11-10").textContent).not.toContain("Junggesellenabschied");
    expect(document.querySelector('[data-testid="tagesliste"]')?.textContent).toContain("Vereinstreffen · Angefragt");
    await clickElement(knopfIn(zelle("2026-11-13"), "18:00 Event: Glühweinabend")!);
    const details = queryPortal('[data-testid="eintrag-details"]');
    expect(details.textContent).toContain("Kommt aus einem Event der Gemeinschaft.");
    expect(knopfIn(details, "Zum Event")?.getAttribute("href")).toBe("/v/v1");
    expect(knopfIn(details, "Sperrzeit löschen")).toBeUndefined();
  });
});

describe("Bar-Link in der Belegung", () => {
  it("öffnet die Anfrageseite, kopiert ihren Link und führt zum QR-Plakat", async () => {
    const schreiben = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schreiben }, configurable: true });
    await mount(<App><Belegungsansicht anfragen={[]} sperren={[]} heute="2026-11-07" barLink={BAR} /></App>);
    const kopf = document.querySelector<HTMLElement>('[data-testid="seitenkopf-aktionen"]')!;
    const seite = knopfIn(kopf, "Anfrageseite")!;
    expect(seite.getAttribute("href")).toBe(BAR);
    expect(seite.getAttribute("target")).toBe("_blank");
    expect(knopfIn(kopf, "QR-Plakat")?.getAttribute("href")).toBe("/vermietung/plakat");
    await clickElement(knopfIn(kopf, "Link kopieren")!);
    expect(schreiben).toHaveBeenCalledWith(BAR);
  });
});
