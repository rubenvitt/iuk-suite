import { describe, it, expect } from "vitest";
import {
  XLSX_MIME,
  dateinameSlug,
  datierterDateiname,
  exportTag,
} from "./dateiname";

describe("exportTag", () => {
  /**
   * DIE FRAGE, DIE DAS TICKET DEM BAUSTEIN VERERBT HAT (DRK-186). `lagerbuch`
   * bildete den Tag bisher aus `new Date().getFullYear()/getMonth()/getDate()`,
   * also aus der Zone des ARBEITSPLATZES; auf dem Server wäre es die des
   * Containers. Dieser Test stellt `process.env.TZ` absichtlich um und beweist,
   * dass beides keine Rolle mehr spielt — derselbe Griff wie
   * `lagerbuch/_lib/zeit.test.ts`.
   */
  it("rechnet in Europe/Berlin, unabhängig von der Prozesszone", () => {
    const alt = process.env.TZ;
    try {
      // 22:30 UTC am 15.09. ist in Berlin bereits der 16.09. (MESZ, UTC+2).
      const zeitpunkt = new Date("2026-09-15T22:30:00Z");
      for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
        process.env.TZ = tz;
        expect(exportTag(zeitpunkt)).toBe("2026-09-16");
      }
    } finally {
      process.env.TZ = alt;
    }
  });

  /** Der Tag wechselt an der Berliner Mitternacht, nicht an der von UTC. */
  it("legt den Tageswechsel auf die Berliner Mitternacht", () => {
    expect(exportTag(new Date("2026-09-15T21:59:59Z"))).toBe("2026-09-15");
    expect(exportTag(new Date("2026-09-15T22:00:00Z"))).toBe("2026-09-16");
  });

  /** Winterzeit: der Versatz ist eine Stunde, nicht zwei. Eine fest verdrahtete
   *  Verschiebung wäre ein halbes Jahr lang richtig. */
  it("folgt der Sommerzeitumstellung", () => {
    expect(exportTag(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(exportTag(new Date("2026-01-15T22:30:00Z"))).toBe("2026-01-15");
  });

  it("liefert `YYYY-MM-DD`, also sortierbar", () => {
    expect(exportTag(new Date("2026-03-07T10:00:00Z"))).toBe("2026-03-07");
  });
});

describe("datierterDateiname", () => {
  it("hängt Tag und Endung an", () => {
    expect(datierterDateiname("bestand", new Date("2026-09-16T08:00:00Z")))
      .toBe("bestand-2026-09-16.xlsx");
  });
});

describe("dateinameSlug", () => {
  it("ersetzt alles außer Buchstabe, Ziffer und Bindestrich", () => {
    expect(dateinameSlug("Ada Müller")).toBe("Ada_M_ller");
    expect(dateinameSlug("Bereitschaft 1/2")).toBe("Bereitschaft_1_2");
  });

  /** Der Wert geht in einen `Content-Disposition`-Header. Ein
   *  Anführungszeichen oder ein Zeilenumbruch darin zerlegte ihn. */
  it("entfernt, was einen Header zerlegen würde", () => {
    expect(dateinameSlug('a"b')).toBe("a_b");
    expect(dateinameSlug("a\r\nContent-Length: 0")).toBe("a_Content-Length_0");
  });

  it("lässt keinen führenden oder abschließenden Unterstrich stehen", () => {
    expect(dateinameSlug(" Ada ")).toBe("Ada");
  });

  it("fällt auf einen Namen zurück, statt einen leeren zu liefern", () => {
    expect(dateinameSlug("...")).toBe("export");
  });
});

describe("XLSX_MIME", () => {
  /** Der Typ steht an jedem Ausgabeweg. Eine zweite Abschrift wäre die Stelle,
   *  an der sich ein Tippfehler versteckt — Browser laden die Datei dann
   *  kommentarlos als `.zip` herunter. */
  it("ist der Typ, den Excel erwartet", () => {
    expect(XLSX_MIME).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
