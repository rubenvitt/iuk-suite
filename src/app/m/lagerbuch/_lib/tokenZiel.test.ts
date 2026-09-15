import { describe, it, expect } from "vitest";
import { tokenZielPfad, fahrzeugBindungAus } from "./tokenZiel";
import { sanitizeReturnTo } from "./returnTo";

describe("tokenZielPfad — wohin ein eingeloester Code fuehrt", () => {
  it("fuehrt einen Artikel-Code aufs Artikel-Detail", () => {
    expect(tokenZielPfad("artikel", "art-1")).toBe("/a/art-1");
  });

  it("fuehrt einen Fahrzeug-Code in den Check, mit Vorauswahl", () => {
    expect(tokenZielPfad("fahrzeug", "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  it("faellt ohne Ziel auf die allgemeine Artikel-Liste", () => {
    expect(tokenZielPfad(null, null)).toBe("/helfer");
    expect(tokenZielPfad(undefined, undefined)).toBe("/helfer");
  });

  it("faellt bei UNVOLLSTAENDIGEM Ziel zurueck, statt einen kaputten Pfad zu bauen", () => {
    // Beide Halbformen kommen aus derselben Tabelle: `zielTyp` und `zielId` sind
    // je fuer sich nullbar, und `createToken` erzwingt die Vollstaendigkeit nur
    // im Formular. Ein `/a/undefined` waere ein 404 statt einer Landung.
    expect(tokenZielPfad("artikel", null)).toBe("/helfer");
    expect(tokenZielPfad(null, "art-1")).toBe("/helfer");
    expect(tokenZielPfad("fahrzeug", "")).toBe("/helfer");
  });

  it("weist einen unbekannten Zieltyp auf die Liste", () => {
    expect(tokenZielPfad("lagerort", "x")).toBe("/helfer");
  });

  it("liefert IMMER etwas, das sanitizeReturnTo durchlaesst", () => {
    // Die Zusage, die die beiden Dateien aneinander bindet: der Rueckgabewert
    // ist ein lokaler Pfad und damit kompatibel mit dem Open-Redirect-Schutz.
    // Ohne sie koennte der Handler ein Ziel bauen, das seine eigene Pruefung
    // spaeter verwirft — und die Helferin landete am Gate statt am Kaertchenziel.
    for (const [typ, id] of [["artikel", "a"], ["fahrzeug", "f"], [null, null]] as const) {
      expect(sanitizeReturnTo(tokenZielPfad(typ, id))).toBe(tokenZielPfad(typ, id));
    }
  });
});

describe("fahrzeugBindungAus — woran ein gescanntes Kaertchen haengt (DRK-302)", () => {
  it("gibt die Fahrzeug-Id eines Fahrzeug-Kaertchens zurueck", () => {
    expect(fahrzeugBindungAus("fahrzeug", "rtw-1")).toBe("rtw-1");
  });

  it("bindet ein Artikel-Kaertchen und ein zielloses an KEIN Fahrzeug", () => {
    // Beide sind gueltige Kaertchen — sie fuehren nur nicht in ein Fahrzeug.
    // Waeren sie gebunden, saehe die Helferin nach dem Regaletikett-Scan
    // ploetzlich gar kein Fahrzeug mehr zur Auswahl.
    expect(fahrzeugBindungAus("artikel", "art-1")).toBeNull();
    expect(fahrzeugBindungAus(null, null)).toBeNull();
    expect(fahrzeugBindungAus(undefined, undefined)).toBeNull();
    expect(fahrzeugBindungAus("lagerort", "x")).toBeNull();
  });

  it("verlangt BEIDE Halbformen — eine halbe Zeile bindet nicht", () => {
    // `zielTyp` und `zielId` sind je fuer sich nullbar (`_db/schema.ts`), und
    // ein Alt-Import kann eine halbe Zeile tragen. Ohne diese Pruefung waere die
    // Bindung die leere Zeichenkette: die Check-Seite faende dafuer kein
    // Fahrzeug und zeigte einem gueltigen Kaertchen gar nichts mehr.
    expect(fahrzeugBindungAus("fahrzeug", null)).toBeNull();
    expect(fahrzeugBindungAus("fahrzeug", "")).toBeNull();
    expect(fahrzeugBindungAus(null, "rtw-1")).toBeNull();
  });

  it("beantwortet DIESELBE Frage wie der Landepfad — fuer jede Halbform", () => {
    /*
     * DIE ZUSAGE, DIE DIE BEIDEN ANEINANDER BINDET (DRK-302). Landung nach dem
     * Scan und Begrenzung des Einstiegs muessen dasselbe Fahrzeug meinen.
     * Liefen sie auseinander, landete die Helferin per `?fz=` auf Fahrzeug A und
     * die Seite zeigte ihr B — ein Check, der im Journal am falschen Fahrzeug
     * haengt, und niemand sieht es der URL an.
     */
    const faelle = [
      ["fahrzeug", "rtw-1"], ["fahrzeug", null], ["fahrzeug", ""],
      ["artikel", "art-1"], [null, null], ["lagerort", "x"],
    ] as const;
    let geprueft = 0;
    for (const [typ, id] of faelle) {
      const bindung = fahrzeugBindungAus(typ, id);
      const pfad = tokenZielPfad(typ, id);
      expect(pfad.startsWith("/helfer/check?fz="), `${typ}/${id}`).toBe(bindung !== null);
      if (bindung !== null) expect(pfad).toBe(`/helfer/check?fz=${bindung}`);
      geprueft += 1;
    }
    // Regel 2: eine Schleife ohne Durchlauf fuehrt null Zusicherungen aus.
    expect(geprueft).toBe(faelle.length);
  });
});
