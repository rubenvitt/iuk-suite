// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { TITEL_MAX_LAENGE } from "@/core/titel";
import type { TaskDTO } from "../../_lib/typen";

/*
 * DIE TITELGRENZE AM KATALOGFORMULAR (DRK-402, Begründung in `core/titel.ts`).
 *
 * ⚠️ DER FALL, DEN `maxLength` NICHT FÄNGT: ein Bestandstitel über der Grenze.
 * Das Feld schneidet einen vorbelegten Wert nicht ab, also ginge er beim
 * nächsten Speichern unverändert mit, der Server lehnte ihn per Zod ab, und das
 * Formular zeigte nur „konnte nicht gespeichert werden". Der zweite Fall hier
 * verlangt, dass stattdessen die Grenze genannt wird und nichts abgeht.
 *
 * Der Modulersatz für die Actions ist Pflicht: `_actions/katalog.ts` zieht sonst
 * `better-sqlite3`, `drizzle-orm` und `next/cache` in den jsdom-Lauf.
 */
const { aendernMock } = vi.hoisted(() => ({ aendernMock: vi.fn() }));
vi.mock("../../_actions/katalog", () => ({
  aufgabeAendernAction: aendernMock,
  aufgabeAnlegenAction: vi.fn(),
  aufgabeLoeschenAction: vi.fn(),
}));

const { AufgabeFormular } = await import("./AufgabeFormular");

function aufgabe(titel: string): TaskDTO {
  return {
    id: "a1",
    teil: 1,
    nummer: "1.1",
    titel,
    lernziel: "",
    schritte: [],
    durchfuehrungshinweise: [],
    sicherheitshinweise: [],
    zielanzahlDefault: 1,
    sortOrder: 0,
    aktiv: true,
    bildUrl: null,
  };
}

beforeEach(() => {
  aendernMock.mockReset();
  aendernMock.mockImplementation(async (_id: string, eingabe: { titel: string }) => aufgabe(eingabe.titel));
});

afterEach(async () => {
  await unmount();
});

describe("AufgabeFormular — Titelgrenze", () => {
  it("das Titelfeld lässt keinen Titel über der Grenze entstehen", async () => {
    await mount(<AufgabeFormular onGespeichert={() => {}} onAbbrechen={() => {}} />);
    expect(query<HTMLInputElement>("#af-titel").maxLength).toBe(TITEL_MAX_LAENGE);
  });

  it("ein Bestandstitel über der Grenze nennt die Grenze und wird nicht abgeschickt", async () => {
    const lang = "x".repeat(TITEL_MAX_LAENGE + 5);
    await mount(<AufgabeFormular aufgabe={aufgabe(lang)} onGespeichert={() => {}} onAbbrechen={() => {}} />);
    // Die Vorbelegung steht ungekürzt im Feld — gekürzt wird von Hand, nie still.
    expect(query<HTMLInputElement>("#af-titel").value).toBe(lang);

    await submitForm();

    expect(aendernMock).not.toHaveBeenCalled();
    expect(query("form").textContent).toContain(`höchstens ${TITEL_MAX_LAENGE} Zeichen`);
  });

  it("ein Bestandstitel genau an der Grenze wird abgeschickt", async () => {
    const onGespeichert = vi.fn();
    await mount(
      <AufgabeFormular
        aufgabe={aufgabe("x".repeat(TITEL_MAX_LAENGE))}
        onGespeichert={onGespeichert}
        onAbbrechen={() => {}}
      />,
    );

    await submitForm();

    expect(aendernMock).toHaveBeenCalledTimes(1);
  });
});
