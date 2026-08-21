// scripts/import/radio-paritaet.test.ts
//
// Spec 2 §2.1.4: "Fehlt eine Spalte in einer Sicht, ist die Paritaet fuer sie blind,
// UND DAS SIEHT KEIN TEST." Dieser Test sieht es.
//
// Die Spaltenliste wird NICHT abgeschrieben, sondern aus dem Drizzle-Schema gelesen
// (getTableColumns). Eine abgeschriebene Liste haette denselben blinden Fleck wie die
// Sicht, die sie pruefen soll.
//
// Gemessen mit drizzle-orm 0.45.2 (package.json:30):
//   columnType === "SQLiteText"      -> text(...)
//   columnType === "SQLiteBoolean"   -> integer(..., { mode: "boolean" })
//   columnType === "SQLiteInteger"   -> integer(...) ohne Modus
//   columnType === "SQLiteTimestamp" -> mode:"timestamp" ODER mode:"timestamp_ms"
//        ^ deshalb pruefen wir die EINHEIT ueber mapToDriverValue, nicht ueber columnType:
//          mapToDriverValue(new Date(1_000_000_000_000)) === 1_000_000_000     bei "timestamp"
//                                                        === 1_000_000_000_000 bei "timestamp_ms"
import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@/app/m/radio/_db/schema";
import {
  paritaetsSichtGeraet,
  paritaetsSichtSoftwareVersion,
  paritaetsSichtBenutzer,
  paritaetsSichtGeraeteEreignis,
  paritaetsSichtLeihe,
} from "./radio";

type Spalte = {
  name: string;
  columnType: string;
  mapToDriverValue: (v: unknown) => unknown;
};
type SpaltenListe = Record<string, Spalte>;

function spalten(tabelle: unknown): SpaltenListe {
  return getTableColumns(
    tabelle as Parameters<typeof getTableColumns>[0],
  ) as unknown as SpaltenListe;
}

/**
 * Eine Zeile mit EINEM Wert je Spalte. Die Zeitstempel sind paarweise verschieden —
 * dieselbe Regel, die portal.ts:73-76 den Fixtures auferlegt: gleiche Werte bestehen
 * jede Vertauschung.
 */
function vollzeile(sp: SpaltenListe): Record<string, unknown> {
  const zeile: Record<string, unknown> = {};
  let n = 0;
  for (const [feld, spalte] of Object.entries(sp)) {
    switch (spalte.columnType) {
      case "SQLiteTimestamp":
        // 2025-01-01T00:00:00Z plus n Sekunden — je Spalte ein anderer Wert.
        zeile[feld] = new Date(1_735_689_600_000 + n * 1000);
        n += 1;
        break;
      case "SQLiteBoolean":
        zeile[feld] = true;
        break;
      case "SQLiteInteger":
        zeile[feld] = 7;
        break;
      default:
        zeile[feld] = `wert-${feld}`;
    }
  }
  return zeile;
}

const SICHTEN = [
  { name: "devices", tabelle: schema.devices, sicht: paritaetsSichtGeraet, spaltenzahl: 25 },
  { name: "software_versions", tabelle: schema.softwareVersions, sicht: paritaetsSichtSoftwareVersion, spaltenzahl: 6 },
  { name: "users", tabelle: schema.users, sicht: paritaetsSichtBenutzer, spaltenzahl: 3 },
  { name: "device_events", tabelle: schema.deviceEvents, sicht: paritaetsSichtGeraeteEreignis, spaltenzahl: 8 },
  { name: "loans", tabelle: schema.loans, sicht: paritaetsSichtLeihe, spaltenzahl: 12 },
] as const;

describe("Die fuenf Paritaetssichten decken das Zielschema vollstaendig ab (Spec 2 §2.1.4)", () => {
  for (const { name, tabelle, sicht, spaltenzahl } of SICHTEN) {
    it(`${name}: die Sicht fuehrt JEDE Spalte der Zieltabelle — keine mehr, keine weniger`, () => {
      const sp = spalten(tabelle);
      const aus = sicht(vollzeile(sp) as never) as Record<string, unknown>;
      expect(Object.keys(aus).sort()).toEqual(Object.keys(sp).sort());
    });

    it(`${name}: die Zieltabelle hat ${spaltenzahl} Spalten`, () => {
      expect(Object.keys(spalten(tabelle)).length).toBe(spaltenzahl);
    });

    it(`${name}: jede timestamp-Spalte verlaesst die Sicht als Unix-SEKUNDEN, nie als Date`, () => {
      const sp = spalten(tabelle);
      const roh = vollzeile(sp);
      const aus = sicht(roh as never) as Record<string, unknown>;
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        const erwartet = Math.floor((roh[feld] as Date).getTime() / 1000);
        expect(aus[feld], `${name}.${feld}`).toBe(erwartet);
      }
    });

    it(`${name}: null in einer timestamp-Spalte bleibt null — nicht 0 und nicht 1970`, () => {
      const sp = spalten(tabelle);
      const roh = vollzeile(sp);
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType === "SQLiteTimestamp") roh[feld] = null;
      }
      const aus = sicht(roh as never) as Record<string, unknown>;
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        expect(aus[feld], `${name}.${feld}`).toBeNull();
      }
    });
  }
});

describe("Das Zielschema haelt die Zeiteinheit der Suite ein", () => {
  it("KEINE radio-Zeitspalte ist mode:'timestamp_ms' — der Faktor-1000-Fehler waere paritaetsgruen", () => {
    // src/app/m/lagerbuch/_db/schema.ts:11-16 nennt den wahrscheinlichsten Weg dorthin:
    // ein Copy-Paste aus m/qr/_db/schema.ts:19-20.
    const probe = new Date(1_000_000_000_000); // 2001-09-09T01:46:40Z
    for (const { name, tabelle } of SICHTEN) {
      for (const [feld, spalte] of Object.entries(spalten(tabelle))) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        expect(spalte.mapToDriverValue(probe), `${name}.${feld}`).toBe(1_000_000_000);
      }
    }
  });

  it("devices.last_updated_at ist TEXT und laeuft UNUMGERECHNET durch die Sicht", () => {
    // Spec 1 §2.2.3: Kalendertag YYYY-MM-DD in Europe/Berlin, kein Zeitstempel.
    const sp = spalten(schema.devices);
    expect(sp.lastUpdatedAt.columnType).toBe("SQLiteText");
    const roh = vollzeile(sp);
    roh.lastUpdatedAt = "2025-03-02";
    const aus = paritaetsSichtGeraet(roh as never) as Record<string, unknown>;
    expect(aus.lastUpdatedAt).toBe("2025-03-02");
  });
});
