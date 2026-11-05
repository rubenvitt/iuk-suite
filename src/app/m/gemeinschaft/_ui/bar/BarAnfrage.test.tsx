// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import { zeitpunkt } from "../../_lib/zeit";
import { BarAnfrage } from "./BarAnfrage";
import { Statusansicht } from "./Statusansicht";

const aktion = vi.hoisted(() => ({ senden: vi.fn(), zurueck: vi.fn(), refresh: vi.fn(), unterschreiben: vi.fn() }));
vi.mock("../../_actions/anfrage", () => ({
  anfrageSendenAction: aktion.senden, anfrageZurueckziehenAction: aktion.zurueck, vertragUnterschreibenAction: aktion.unterschreiben,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: aktion.refresh }) }));

const BELEGT = [{ von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-08", "01:00") }];
const knopf = (text: string) => queryAll<HTMLButtonElement>("button, a").find((b) => b.textContent === text)!;
const tag = (t: string) => query<HTMLButtonElement>(`[data-tag="${t}"]`);

// IDA-358: die Anfrage liegt im Entwurf auf dem Gerät — jeder Fall beginnt leer.
beforeEach(() => { localStorage.clear(); vergissFluechtig(); });
afterEach(async () => { await unmount(); aktion.senden.mockReset(); aktion.zurueck.mockReset(); aktion.refresh.mockReset(); });

describe("Bar anfragen", () => {
  it("Kalender zeigt belegte Tage als „belegt“, vergangene Tage sind aus", async () => {
    await mount(<BarAnfrage belegt={BELEGT} heute="2026-11-03" vorbelegung={null} anmeldeHref="/login" />);
    // Vergangenes wird nicht als belegt gezeigt; der 7. und 8. ab heute schon.
    expect(tag("2026-11-02").disabled).toBe(true);
    expect(tag("2026-11-07").getAttribute("aria-label")).toMatch(/belegt$/);
    expect(tag("2026-11-08").textContent).toContain("belegt");
    expect(tag("2026-11-09").getAttribute("aria-label")).toMatch(/frei$/);
    expect(query<HTMLButtonElement>('[aria-label="Vorheriger Monat"]').disabled).toBe(true);
  });

  it("Tag antippen zeigt belegte Zeiten, „An diesem Tag anfragen“ öffnet das Formular mit dem Tag", async () => {
    await mount(<BarAnfrage belegt={BELEGT} heute="2026-11-03" vorbelegung={null} anmeldeHref="/login" />);
    await clickElement(tag("2026-11-08"));
    expect(query('[data-testid="tag-info"]').textContent).toContain("belegt ab Vortag–01:00 Uhr");
    await clickElement(tag("2026-11-09"));
    expect(query('[data-testid="tag-info"]').textContent).toContain("Den ganzen Tag frei.");
    await clickElement(knopf("An diesem Tag anfragen"));
    const datum = queryAll<HTMLInputElement>('input[type="date"]');
    expect(datum.map((d) => d.value)).toEqual(["2026-11-09", "2026-11-09"]);
  });

  it("ohne Anmeldung leer und mit Hinweis zum Anmelden; angemeldet vorausgefüllt", async () => {
    await mount(<BarAnfrage belegt={[]} heute="2026-11-03" vorbelegung={null} anmeldeHref="/login?callbackUrl=%2Fbar" />);
    expect(knopf("Anmelden").getAttribute("href")).toBe("/login?callbackUrl=%2Fbar");
    await unmount();
    await mount(<BarAnfrage belegt={[]} heute="2026-11-03" vorbelegung={{ name: "Mira Hofmann", kontakt: "mira@example.org" }} anmeldeHref="/login" />);
    expect(exists('a[href^="/login"]')).toBe(false);
    await clickElement(knopf("Bar anfragen"));
    expect(query<HTMLInputElement>('input[autocomplete="name"]').value).toBe("Mira Hofmann");
    expect(query<HTMLInputElement>('input[autocomplete="email"]').value).toBe("mira@example.org");
  });

  it("schickt die Felder, zeigt Serverfehler am Feld und danach die Danke-Seite mit Statuslink", async () => {
    await mount(<BarAnfrage belegt={[]} heute="2026-11-03" vorbelegung={null} anmeldeHref="/login" />);
    await clickElement(knopf("Bar anfragen"));
    await fill('input[autocomplete="name"]', "Erika Sommer");
    aktion.senden.mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { bisTag: "Das Ende liegt vor dem Beginn. Prüf bitte Datum und Uhrzeit." } });
    await submitForm();
    expect(aktion.senden).toHaveBeenCalledWith(expect.objectContaining({ person: "Erika Sommer", vonUhr: "18:00", bisUhr: "23:00", webseite: "" }));
    expect(query("#fehler-bisTag").textContent).toContain("Das Ende liegt vor dem Beginn");
    expect(query('input[type="date"][aria-describedby="fehler-bisTag"]')).toBeTruthy();

    aktion.senden.mockResolvedValueOnce({ ok: true, wert: { code: "abcdefghijklmnopqrstuv" } });
    await act(async () => { window.scrollTo = () => {}; });
    await submitForm();
    expect(document.body.textContent).toContain("Danke.");
    expect(query('[data-testid="statuslink"]').textContent).toMatch(/\/status\/abcdefghijklmnopqrstuv$/);
    expect(knopf("Zum Stand deiner Anfrage").getAttribute("href")).toBe("/status/abcdefghijklmnopqrstuv");
  });
});

describe("Bar anfragen — Entwurf auf dem Gerät (IDA-358)", () => {
  const ansicht = () => mount(<BarAnfrage belegt={[]} heute="2026-11-03" vorbelegung={null} anmeldeHref="/login" />);

  it("das offene Formular samt Eingaben übersteht ein Neuladen", async () => {
    await ansicht();
    await clickElement(knopf("Bar anfragen"));
    await fill('input[autocomplete="name"]', "Erika Sommer");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>('input[autocomplete="name"]').value).toBe("Erika Sommer");
  });

  it("ein Wurf hält die Anfrage fest; nach dem Neuladen geht sie mit derselben Sendung raus", async () => {
    aktion.senden.mockRejectedValue(new Error("offline"));
    await ansicht();
    await clickElement(knopf("Bar anfragen"));
    await fill('input[autocomplete="name"]', "Erika Sommer");
    await submitForm();
    expect(query('[data-rolle="entwurf-hinweis"]').textContent).toMatch(/^Nicht gesendet\./);
    expect(exists('[role="alert"]')).toBe(false);
    const erste = (aktion.senden.mock.calls[0][0] as { sendung: string }).sendung;
    await unmount();

    aktion.senden.mockReset();
    aktion.senden.mockResolvedValue({ ok: true, wert: { code: "abcdefghijklmnopqrstuv" } });
    await act(async () => { window.scrollTo = () => {}; });
    await ansicht();
    expect(aktion.senden).toHaveBeenCalledWith(expect.objectContaining({ person: "Erika Sommer", sendung: erste }));
    expect(document.body.textContent).toContain("Danke.");
    expect(ladeEntwurf("gemeinschaft:bar-anfrage:neu")).toBeNull();
  });
});

describe("Statusseite", () => {
  const A = { von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-07", "23:00"), anlass: "Geburtstag", personen: 20, person: "Erika Sommer", kontakt: "05141 12345", begruendung: "", vertrag: null };

  it("Absage mit Begründung, ohne Zurückziehen", async () => {
    await mount(<Statusansicht code="abcdefghijklmnopqrstuv" a={{ ...A, status: "abgelehnt", begruendung: "Dienstabend." }} />);
    expect(query('[data-testid="status-stand"]').textContent).toBe("Abgelehnt");
    expect(query('[data-testid="status-begruendung"]').textContent).toBe("Dienstabend.");
    expect(knopf("Anfrage zurückziehen")).toBeUndefined();
  });

  it("Zurückziehen erst nach Rückfrage", async () => {
    aktion.zurueck.mockResolvedValue({ ok: true });
    await mount(<Statusansicht code="abcdefghijklmnopqrstuv" a={{ ...A, status: "zugesagt" }} />);
    await clickElement(knopf("Anfrage zurückziehen"));
    expect(aktion.zurueck).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Wirklich zurückziehen?");
    await clickElement(knopf("Nein"));
    expect(knopf("Ja, zurückziehen")).toBeUndefined();
    await clickElement(knopf("Anfrage zurückziehen"));
    await clickElement(knopf("Ja, zurückziehen"));
    expect(aktion.zurueck).toHaveBeenCalledWith("abcdefghijklmnopqrstuv");
    expect(aktion.refresh).toHaveBeenCalled();
  });
});

describe("Dokumente auf der Statusseite (IDA-343, IDA-354)", () => {
  const A = { von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-07", "23:00"), anlass: "Geburtstag", personen: 20, person: "Erika Sommer", kontakt: "05141 12345", begruendung: "" };
  const CODE = "abcdefghijklmnopqrstuv";

  it("nichts freigegeben: keine Karte", async () => {
    await mount(<Statusansicht code={CODE} a={{ ...A, status: "zugesagt", vertrag: { stand: "offen", dokumente: [] } }} />);
    expect(exists('[data-testid^="dokument-"]')).toBe(false);
  });

  it("freigegeben: ansehen, Name vorbelegt, Unterschreiben erst nach Zeichnen und Haken, mit Version", async () => {
    await mount(<Statusansicht code={CODE} a={{ ...A, status: "zugesagt", vertrag: { stand: "verschickt", dokumente: [{ art: "mietvertrag", stand: "offen", version: 4, zeichnen: true }] } }} />);
    expect(knopf("Mietvertrag ansehen (PDF)").getAttribute("href")).toBe(`/status/${CODE}/vertrag?art=mietvertrag`);
    expect(query<HTMLInputElement>('input[autocomplete="name"]').value).toBe("Erika Sommer");
    expect(knopf("Unterschreiben").disabled).toBe(true);
    expect(exists('[data-testid="unterschrift-flaeche"]')).toBe(true);
    expect(query<HTMLInputElement>('[data-testid="dokument-mietvertrag-hochladen"]').accept).toBe("application/pdf,image/jpeg,image/png");
  });

  it("Zeichnen aus: nur ansehen und hochladen", async () => {
    await mount(<Statusansicht code={CODE} a={{ ...A, status: "zugesagt", vertrag: { stand: "verschickt", dokumente: [{ art: "uebergabe", stand: "offen", version: 1, zeichnen: false }] } }} />);
    expect(knopf("Übergabeprotokoll ansehen (PDF)").getAttribute("href")).toBe(`/status/${CODE}/vertrag?art=uebergabe`);
    expect(exists('[data-testid="unterschrift-flaeche"]')).toBe(false);
    expect(exists('input[autocomplete="name"]')).toBe(false);
    expect(knopf("Unterschrieben hochladen").className).not.toContain("go-knopf-leise");
  });

  it("je Dokument eine Karte; unterschrieben nur noch herunterladen", async () => {
    await mount(<Statusansicht code={CODE} a={{ ...A, status: "zugesagt", vertrag: { stand: "unterschrieben", dokumente: [
      { art: "mietvertrag", stand: "unterschrieben", datei: { am: A.von, herkunft: "gezeichnet" } },
      { art: "rueckgabe", stand: "offen", version: 2, zeichnen: true },
    ] } }} />);
    expect(query('[data-testid="dokument-mietvertrag"]').textContent).toContain("Unterschrieben");
    expect(knopf("Mietvertrag herunterladen").getAttribute("href")).toBe(`/status/${CODE}/vertrag?art=mietvertrag`);
    expect(query('[data-testid="dokument-rueckgabe"]').getAttribute("data-stand")).toBe("offen");
  });

  it("bei einer Absage keine Dokumente", async () => {
    await mount(<Statusansicht code={CODE} a={{ ...A, status: "abgelehnt", vertrag: null }} />);
    expect(exists('[data-testid^="dokument-"]')).toBe(false);
  });
});
