// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";

// next/link greift auf den App-Router-Kontext zu, den es hier nicht gibt.
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import type { TaskDTO } from "../../_lib/typen";
import type { AufgabenFortschritt } from "../offline/progress";
import { TaskDetail } from "./TaskDetail";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

const AUFGABE: TaskDTO = {
  id: "1-1",
  teil: 1,
  nummer: "1.1",
  titel: "Vorflugkontrolle",
  lernziel: "Die Teilnehmerin prüft das Fluggerät vor dem Start vollständig und selbstständig.",
  schritte: ["Akkuzustand prüfen"],
  durchfuehrungshinweise: [],
  sicherheitshinweise: [],
  zielanzahlDefault: 3,
  sortOrder: 0,
  aktiv: true,
  bildUrl: "/m/uav/illustrations/1-1.webp",
};

const MIT_EINTRAG: AufgabenFortschritt = {
  zielanzahl: 3,
  nichtAnwendbar: false,
  durchfuehrungen: [
    { id: "e1", datum: "2026-01-13", drohnensteuerer: "Erika", luftraumbeobachter: "Klaus" },
  ],
};

const LEER: AufgabenFortschritt = { zielanzahl: 3, nichtAnwendbar: false, durchfuehrungen: [] };

function rendern(aufgabe: TaskDTO, fortschritt: AufgabenFortschritt, nurLesen = false) {
  return mount(
    <TaskDetail
      aufgabe={aufgabe}
      fortschritt={fortschritt}
      heute="2026-08-29"
      nurLesen={nurLesen}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
      onZielanzahl={vi.fn()}
      onNichtAnwendbar={vi.fn()}
    />,
  );
}

afterEach(async () => {
  await unmount();
});

describe("TaskDetail", () => {
  it("zeigt das Datum einer Durchführung deutsch, nicht als ISO-Wert", async () => {
    await rendern(AUFGABE, MIT_EINTRAG);
    expect(document.body.textContent).toContain("13.01.2026");
    expect(document.body.textContent).not.toContain("2026-01-13");
  });

  it("sagt es, wenn noch keine Durchführung erfasst ist", async () => {
    await rendern(AUFGABE, LEER);
    expect(document.body.textContent).toContain("Noch keine Durchführung erfasst");
  });

  /*
   * DER RÜCKFALL DER ABBILDUNG. Ohne ihn stand der Alternativtext als
   * Fließtext mitten in der Aufgabe — und „das Bild kommt nicht" ist auf einer
   * Offline-PWA der Normalfall, nicht die Ausnahme. jsdom lädt keine Bilder;
   * das `error`-Ereignis wird deshalb von Hand ausgelöst, genau wie der Browser
   * es täte.
   */
  it("ersetzt eine nicht ladende Abbildung durch eine ruhige Fläche", async () => {
    await rendern(AUFGABE, LEER);
    const bild = query<HTMLImageElement>("img");
    expect(bild.getAttribute("src")).toBe("/m/uav/illustrations/1-1.webp");
    // Der Alternativtext nennt Aufgabe und Motiv — und NICHT mehr das
    // Lernziel, das als eigener Absatz ohnehin auf derselben Seite steht.
    expect(bild.getAttribute("alt")).toBe("Illustration zu „Vorflugkontrolle“");
    expect(bild.getAttribute("alt")).not.toContain("Die Teilnehmerin prüft");

    await act(async () => {
      bild.dispatchEvent(new Event("error", { bubbles: false }));
    });

    expect(exists("img")).toBe(false);
    expect(document.body.textContent).toContain("Abbildung nicht verfügbar");
  });

  it("rendert ohne `bildUrl` weder Bild noch Ersatzfläche", async () => {
    await rendern({ ...AUFGABE, bildUrl: null }, LEER);
    expect(exists("img")).toBe(false);
    expect(document.body.textContent).not.toContain("Abbildung nicht verfügbar");
  });

  /*
   * OHNE CODE bleibt die Aufgabe vollständig lesbar — Schritte, Lernziel,
   * Hinweise —, und alles Erfassende verschwindet. Auch hier mit einem
   * GEFÜLLTEN Fortschritt geprüft: der stammt auf einem geteilten Tablet von
   * der zuletzt angemeldeten Person.
   */
  it("zeigt ohne Code den Inhalt, aber keine Erfassung", async () => {
    await rendern({ ...AUFGABE, teil: 2 }, MIT_EINTRAG, true);
    expect(document.body.textContent).toContain("Akkuzustand prüfen");
    expect(document.body.textContent).toContain("Die Teilnehmerin prüft das Fluggerät");

    expect(document.body.textContent).not.toContain("Zielanzahl");
    expect(document.body.textContent).not.toContain("Nicht anwendbar");
    expect(document.body.textContent).not.toContain("13.01.2026");
    expect(document.body.textContent).not.toContain("Neue Durchführung");
    expect(exists("form")).toBe(false);
    expect(exists("input")).toBe(false);

    expect(document.body.textContent).toContain("Zum Eintragen einer Durchführung");
  });

  it("kündigt das Erfassungsformular an, statt es unbeschriftet an die Liste zu hängen", async () => {
    await rendern(AUFGABE, MIT_EINTRAG);
    expect(document.body.textContent).toContain("Neue Durchführung");
  });
});
