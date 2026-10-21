// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

// Die Insel importiert die Action direkt (Falle 9); ihr Verhalten besitzt `actions.test.ts`.
vi.mock("./actions", () => ({ setzeRechtAction: vi.fn() }));

import { setzeRechtAction } from "./actions";
import { RechteVerwaltung, type RechteAbschnitt, type RechtePerson } from "./RechteVerwaltung";
import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

afterEach(unmount);

const PERSONEN: RechtePerson[] = [
  { id: "ich", name: "Ruben", email: "r@example.org", gruppenIds: ["betrieb"], gesperrt: false },
  { id: "u2", name: "Anna", email: null, gruppenIds: [], gesperrt: false },
];
const ABSCHNITTE: RechteAbschnitt[] = [
  { schluessel: "suite", titel: "Suite", rollen: [{ gruppeId: "betrieb", anzeige: "Suite: Betrieb", name: "admin", beschreibung: "Betrieb", ldap: false }] },
  { schluessel: "kommplan", titel: "Kommunikationspläne", rollen: [{ gruppeId: "kp", anzeige: "Kommunikationspläne: Lesen", name: "kommplan-nutzer", beschreibung: "Nutzer", ldap: false }] },
];

async function zeige(startPersonId: string | null) {
  await mount(
    <RechteVerwaltung personen={PERSONEN} abschnitte={ABSCHNITTE} betriebGruppeId="betrieb" selbstId="ich" startPersonId={startPersonId} />,
  );
}

it("listet jede Person mit ihren Rechten", async () => {
  await zeige(null);
  expect(exists('[data-testid="rechte-bearbeitung"]')).toBe(false);
  const text = query('[data-testid="rechte-tabelle"]').textContent ?? "";
  expect(text).toContain("Ruben");
  expect(text).toContain("Suite: Betrieb");
  expect(text).toContain("Anna");
  expect(text).toContain("keine");
});

it("„Rechte ändern“ öffnet die Schalter der Person", async () => {
  await zeige(null);
  const knopf = queryAll<HTMLButtonElement>('[data-testid="rechte-tabelle"] button').find((b) => b.textContent === "Rechte ändern");
  await clickElement(knopf!);
  expect(query('[data-testid="rechte-bearbeitung"]').textContent).toContain("Rechte von");
});

it("ein Schalter ruft die Action und übernimmt ihr Ergebnis", async () => {
  vi.mocked(setzeRechtAction).mockResolvedValue({ ok: true, geaendert: true });
  await zeige("u2");
  const schalter = query<HTMLButtonElement>('#recht-kommplan-kp');
  expect(schalter.getAttribute("aria-checked")).toBe("false");
  await clickElement(schalter);
  await vi.waitFor(() => expect(query('#recht-kommplan-kp').getAttribute("aria-checked")).toBe("true"));
  expect(setzeRechtAction).toHaveBeenCalledWith({ personId: "u2", gruppeId: "kp", mitglied: true });
});

it("eine Ablehnung steht am Schalter, der Zustand bleibt", async () => {
  vi.mocked(setzeRechtAction).mockResolvedValue({ ok: false, fehler: "Pocket ID hat abgelehnt." });
  await zeige("u2");
  await clickElement(query('#recht-kommplan-kp'));
  await vi.waitFor(() => expect(query('[role="alert"]').textContent).toContain("Pocket ID hat abgelehnt."));
  expect(query('#recht-kommplan-kp').getAttribute("aria-checked")).toBe("false");
});

it("die eigene Betriebsgruppe ist gesperrt", async () => {
  await zeige("ich");
  expect(query<HTMLButtonElement>('#recht-suite-betrieb').disabled).toBe(true);
});
