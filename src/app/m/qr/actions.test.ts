import { describe, it, expect, vi, beforeEach } from "vitest";

// Negativ-Test der Schreibgrenze: der Beweis ist „wurde der Schreiber
// aufgerufen?" — auth() ist gemockt, damit es ohne echten Request laeuft, und
// der DB-nahe Query-Layer ebenso, damit eine Ablehnung unabhaengig von SQLite
// nachweisbar ist. Ohne den Mock koennte ein durchgerutschter Aufruf an einem
// DB-Fehler scheitern und faelschlich wie eine Ablehnung aussehen.
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/qr/_lib/presets", () => ({
  createPreset: vi.fn().mockResolvedValue({ id: "p1" }),
  updatePreset: vi.fn().mockResolvedValue({ id: "p1" }),
  deletePreset: vi.fn().mockResolvedValue(true),
  reorderPresets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import {
  createPreset,
  updatePreset,
  deletePreset,
  reorderPresets,
} from "@/app/m/qr/_lib/presets";
import {
  createPresetAction,
  updatePresetAction,
  deletePresetAction,
  reorderPresetsAction,
} from "@/app/m/qr/actions";

const authMock = vi.mocked(auth);

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

function asAdmin(): void {
  authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"], id: "u1" } } as never);
}

/** Die vier Rollen, aus denen heraus keine Mutation durchgehen darf. */
const denied: [string, unknown][] = [
  ["anonym", null],
  ["eingeloggt ohne Gruppe", { user: { groups: [] } }],
  ["nur drk-qr-user", { user: { groups: ["drk-qr-user"] } }],
];

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(createPreset).mockClear();
  vi.mocked(updatePreset).mockClear();
  vi.mocked(deletePreset).mockClear();
  vi.mocked(reorderPresets).mockClear();
  vi.mocked(revalidatePath).mockClear();
});

describe("qr admin actions: Autorisierungsgrenze", () => {
  it("anonym darf nicht anlegen", async () => {
    authMock.mockResolvedValue(null as never);
    await expect(
      createPresetAction(fd({ label: "L", kind: "url", value: "https://x" })),
    ).rejects.toThrow("Forbidden");
    expect(createPreset).not.toHaveBeenCalled();
  });

  it("eingeloggt ohne Gruppe darf nicht löschen", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("drk-qr-user allein genügt nicht", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-user"] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  // Der Guard von updatePresetAction liegt im gemeinsamen adminUserId(). Ohne
  // eigene Faelle faengt nur der Anlegepfad eine Mutation darin ab und taeuscht
  // Schutz auf einem Pfad vor, der nie ausgefuehrt wird.
  it.each(denied)("%s darf nicht ändern", async (_rolle, session) => {
    authMock.mockResolvedValue(session as never);
    await expect(
      updatePresetAction(fd({ id: "p1", label: "L", kind: "url", value: "https://x" })),
    ).rejects.toThrow("Forbidden");
    expect(updatePreset).not.toHaveBeenCalled();
  });

  // reorderPresetsAction hat einen eigenen Guard — ohne diese Faelle liesse er
  // sich streichen, ohne dass ein Test rot wird, und jeder eingeloggte Nutzer
  // sortierte die Kacheln fuer alle um.
  it.each(denied)("%s darf nicht umsortieren", async (_rolle, session) => {
    authMock.mockResolvedValue(session as never);
    await expect(reorderPresetsAction(["p1", "p2"])).rejects.toThrow("Forbidden");
    expect(reorderPresets).not.toHaveBeenCalled();
  });

  it("drk-qr-admin darf anlegen", async () => {
    asAdmin();
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    // Nicht nur DASS geschrieben wurde, sondern WAS: ein falsch verdrahteter
    // userId schriebe eine falsche Urheberschaft in createdBy.
    expect(createPreset).toHaveBeenCalledWith(
      expect.objectContaining({ label: "L", kind: "url", value: "https://x" }),
      "u1",
    );
  });

  it("Suite-Admin darf auch ohne QR-Gruppe", async () => {
    authMock.mockResolvedValue({ user: { groups: ["dashboard-admins"], id: "u1" } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledWith(
      expect.objectContaining({ label: "L", kind: "url", value: "https://x" }),
      "u1",
    );
  });

  // Eine Session ohne user.id darf nicht am Schreiber scheitern; der Fallback
  // haelt die Spalte createdBy gefuellt.
  it("trägt 'unbekannt' ein, wenn die Session keine user.id hat", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"] } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledWith(expect.anything(), "unbekannt");
  });

  it("ungültige Eingabe wird abgelehnt, ohne zu schreiben", async () => {
    asAdmin();
    await expect(createPresetAction(fd({ label: "", kind: "url", value: "x" }))).rejects.toThrow();
    expect(createPreset).not.toHaveBeenCalled();
  });

  // Ein Preset, das die Kapazitaet sprengt, waere dauerhaft gespeichert und an
  // der Kachel nur noch als Fehlermeldung sichtbar.
  it("zu langer Text wird abgelehnt, ohne zu schreiben", async () => {
    asAdmin();
    await expect(
      createPresetAction(fd({ label: "L", kind: "text", value: "a".repeat(1274) })),
    ).rejects.toThrow(/überschreitet/);
    expect(createPreset).not.toHaveBeenCalled();
  });
});

describe("qr admin actions: Adressierung und Nutzlast", () => {
  it("löscht genau die Zeile aus dem Formularfeld id", async () => {
    asAdmin();
    await deletePresetAction(fd({ id: "p1" }));
    expect(deletePreset).toHaveBeenCalledWith("p1");
  });

  it("sortiert in der übergebenen Reihenfolge um", async () => {
    asAdmin();
    await reorderPresetsAction(["p1", "p2"]);
    expect(reorderPresets).toHaveBeenCalledWith(["p1", "p2"]);
  });

  // Adressiert wird ueber das Formularfeld; die mitvalidierte id aus der
  // Nutzlast muss verworfen werden, sonst verschoebe ein Aktualisieren die
  // Identitaet der Zeile.
  it("ändert über das Formularfeld id und verwirft die id aus der Nutzlast", async () => {
    asAdmin();
    await updatePresetAction(
      fd({ id: "p1", label: "Neu", kind: "url", value: "https://neu" }),
    );
    expect(updatePreset).toHaveBeenCalledWith(
      "p1",
      expect.not.objectContaining({ id: expect.anything() }),
      "u1",
    );
    expect(updatePreset).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ label: "Neu", kind: "url", value: "https://neu" }),
      "u1",
    );
  });
});

// Das Formular schickt fuer wifi/vcard ein einzelnes Feld `value` mit JSON.
// Faellt der Zweig aus, landet der rohe String im Validator: entweder eine
// irrefuehrende Meldung oder ein unbrauchbares Preset.
describe("qr admin actions: JSON-Nutzlast aus dem Formular", () => {
  it("liest wifi als Objekt aus dem JSON-Feld", async () => {
    asAdmin();
    await createPresetAction(
      fd({
        label: "WLAN",
        kind: "wifi",
        value: JSON.stringify({
          ssid: "DRK Einsatz",
          password: "geheim",
          encryption: "WPA",
          hidden: false,
        }),
      }),
    );
    expect(createPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "wifi",
        value: { ssid: "DRK Einsatz", password: "geheim", encryption: "WPA", hidden: false },
      }),
      "u1",
    );
  });

  it("liest vcard als Objekt aus dem JSON-Feld", async () => {
    asAdmin();
    await createPresetAction(
      fd({
        label: "Kontakt",
        kind: "vcard",
        value: JSON.stringify({ name: "Max Mustermann", tel: "+4930123" }),
      }),
    );
    expect(createPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "vcard",
        value: { name: "Max Mustermann", tel: "+4930123" },
      }),
      "u1",
    );
  });

  // Ohne den eigenen Zweig traegt der Abbruch eine englische SyntaxError-Meldung
  // aus der Laufzeit nach aussen — sichtbar fuer den Admin im Formular.
  it("meldet kaputtes JSON auf Deutsch, ohne zu schreiben", async () => {
    asAdmin();
    await expect(
      createPresetAction(fd({ label: "WLAN", kind: "wifi", value: "{kaputt" })),
    ).rejects.toThrow(/kein gültiges JSON/);
    expect(createPreset).not.toHaveBeenCalled();
  });
});

// Der Plan warnt ausdruecklich vor dem externen statt dem internen Pfad — ein
// realer Stolperstein aus dem Portal. Ohne Assertion bliebe revalidateQr
// entkernbar, und der Admin saehe nach dem Loeschen weiter den alten Stand.
describe("qr admin actions: Cache-Invalidierung", () => {
  it.each([
    ["Anlegen", () => createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }))],
    ["Löschen", () => deletePresetAction(fd({ id: "p1" }))],
    ["Umsortieren", () => reorderPresetsAction(["p1", "p2"])],
    [
      "Ändern",
      () => updatePresetAction(fd({ id: "p1", label: "L", kind: "url", value: "https://x" })),
    ],
  ])("frischt nach %s beide Seiten auf", async (_name, run) => {
    asAdmin();
    await run();
    expect(revalidatePath).toHaveBeenCalledWith("/m/qr");
    expect(revalidatePath).toHaveBeenCalledWith("/m/qr/admin");
  });
});
