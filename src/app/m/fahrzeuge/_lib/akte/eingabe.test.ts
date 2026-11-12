import { describe, expect, it } from "vitest";
import { erledigtEingabe, istDot, istTag, kilometerEingabe, pruefungEingabe, reifensatzEingabe, reifenwechselEingabe, technikEingabe } from "./eingabe";

const technik = {
  modell: "VW T6.1 Kombi", baujahr: 2020, laengeCm: 530, breiteCm: 190, hoeheCm: 199, zggKg: 3200, leerKg: 2510,
  staerke: [1, 1, 2], sitze: 5, tragen: 0, fuehrerschein: "B", besonderheiten: ["Sondersignal"],
};
const pruefung = { art: "Weitere", name: "Feuerlöscher", monate: 24, kmAbstand: null, zuletzt: null, vonHand: null };
const erledigt = { am: "2026-11-03", km: null, vonHand: null, bemerkung: "" };

/** Die Meldungen als „feld: Satz“, wie sie `zodFehler` an die Felder hängt. */
function meldungen(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): string[] {
  expect(r.success).toBe(false);
  return r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("Tag und DOT", () => {
  it("ein Tag ist JJJJ-MM-TT und muss im Kalender stehen", () => {
    expect(istTag("2026-11-03")).toBe(true);
    expect(istTag("2028-02-29")).toBe(true);
    expect(istTag("2026-02-29")).toBe(false);
    expect(istTag("2026-13-01")).toBe(false);
    expect(istTag("03.11.2026")).toBe(false);
    expect(istTag("2026-11-03T10:00:00Z")).toBe(false);
  });

  it("DOT ist WWJJ mit Woche 01 bis 53", () => {
    expect(istDot("3822")).toBe(true);
    expect(istDot("0119")).toBe(true);
    expect(istDot("5320")).toBe(true);
    expect(istDot("0022")).toBe(false);
    expect(istDot("5422")).toBe(false);
    expect(istDot("382")).toBe(false);
    expect(istDot("38/22")).toBe(false);
  });
});

describe("Technik", () => {
  it("nimmt eine volle und eine ganz leere Akte", () => {
    expect(technikEingabe.parse(technik)).toEqual(technik);
    const leer = { modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null, staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten: [] };
    expect(technikEingabe.parse(leer)).toEqual(leer);
  });

  it("ein leeres Modell wird null", () => {
    expect(technikEingabe.parse({ ...technik, modell: "   " }).modell).toBeNull();
  });

  it("das Leergewicht muss unter dem zulässigen Gesamtgewicht liegen — nur wenn beide gesetzt sind", () => {
    expect(meldungen(technikEingabe.safeParse({ ...technik, leerKg: 3200 }))).toEqual(["leerKg: Das Leergewicht muss unter dem zulässigen Gesamtgewicht liegen."]);
    expect(technikEingabe.safeParse({ ...technik, zggKg: null, leerKg: 9000 }).success).toBe(true);
    expect(technikEingabe.safeParse({ ...technik, leerKg: null }).success).toBe(true);
  });

  it("die Stärke geht bis 9/9/20", () => {
    expect(technikEingabe.safeParse({ ...technik, staerke: [9, 9, 20] }).success).toBe(true);
    expect(meldungen(technikEingabe.safeParse({ ...technik, staerke: [10, 0, 21] }))).toEqual([
      "staerke.0: Gib für Führer eine Zahl von 0 bis 9 an.", "staerke.2: Gib für die Mannschaft eine Zahl von 0 bis 20 an.",
    ]);
    expect(technikEingabe.safeParse({ ...technik, staerke: [1, 1] }).success).toBe(false);
  });

  it("Besonderheiten: getrimmt, ohne Leeres, ohne Dubletten", () => {
    expect(technikEingabe.parse({ ...technik, besonderheiten: [" Allrad ", "allrad", "", "Tempo 100", "Allrad"] }).besonderheiten).toEqual(["Allrad", "Tempo 100"]);
  });

  it("Besonderheiten: je höchstens 40 Zeichen, höchstens 20 Stück", () => {
    expect(meldungen(technikEingabe.safeParse({ ...technik, besonderheiten: ["x".repeat(41)] }))).toEqual(["besonderheiten.0: Kürz die Besonderheit auf höchstens 40 Zeichen."]);
    const viele = Array.from({ length: 21 }, (_, i) => `Merkmal ${i}`);
    expect(meldungen(technikEingabe.safeParse({ ...technik, besonderheiten: viele }))).toEqual(["besonderheiten: Trag höchstens 20 Besonderheiten ein."]);
    expect(technikEingabe.safeParse({ ...technik, besonderheiten: [...viele.slice(0, 20), "Merkmal 0"] }).success).toBe(true);
  });

  it("Maße und Gewichte sind ganze Zahlen, der Führerschein kommt aus der Liste", () => {
    expect(technikEingabe.safeParse({ ...technik, laengeCm: 5.3 }).success).toBe(false);
    expect(technikEingabe.safeParse({ ...technik, zggKg: "3200" }).success).toBe(false);
    expect(meldungen(technikEingabe.safeParse({ ...technik, fuehrerschein: "D" }))).toEqual(["fuehrerschein: Wähl eine Führerscheinklasse aus der Liste."]);
  });
});

describe("Kilometer", () => {
  it("der Ablesetag ist freiwillig, aber wenn, dann ein Tag", () => {
    expect(kilometerEingabe.parse({ km: 84210 })).toEqual({ km: 84210 });
    expect(kilometerEingabe.parse({ km: 84210, am: "2026-11-01" })).toEqual({ km: 84210, am: "2026-11-01" });
    expect(kilometerEingabe.safeParse({ km: 84210, am: "2026-11-31" }).success).toBe(false);
  });

  it("ohne Zahl kommt der Satz zum Feld", () => {
    expect(meldungen(kilometerEingabe.safeParse({ km: null }))).toEqual(["km: Gib den Kilometerstand an."]);
    expect(meldungen(kilometerEingabe.safeParse({ km: -1 }))).toEqual(["km: Der Kilometerstand kann nicht negativ sein."]);
    expect(kilometerEingabe.safeParse({ km: 10.5 }).success).toBe(false);
  });
});

describe("Prüfung", () => {
  it("Name 1 bis 60 Zeichen, getrimmt", () => {
    expect(pruefungEingabe.parse({ ...pruefung, name: "  Feuerlöscher " }).name).toBe("Feuerlöscher");
    expect(meldungen(pruefungEingabe.safeParse({ ...pruefung, name: "   " }))).toEqual(["name: Gib der Prüfung einen Namen."]);
    expect(pruefungEingabe.safeParse({ ...pruefung, name: "x".repeat(60) }).success).toBe(true);
    expect(pruefungEingabe.safeParse({ ...pruefung, name: "x".repeat(61) }).success).toBe(false);
  });

  it("Monate 1 bis 120, Kilometerabstand ab 1000 oder leer", () => {
    for (const monate of [0, 121, 1.5]) expect(pruefungEingabe.safeParse({ ...pruefung, monate }).success).toBe(false);
    for (const monate of [1, 120]) expect(pruefungEingabe.safeParse({ ...pruefung, monate }).success).toBe(true);
    expect(pruefungEingabe.safeParse({ ...pruefung, kmAbstand: 999 }).success).toBe(false);
    expect(pruefungEingabe.safeParse({ ...pruefung, kmAbstand: 1000 }).success).toBe(true);
  });

  it("die Art kommt aus der Liste, die Tage sind Tage oder leer", () => {
    expect(pruefungEingabe.safeParse({ ...pruefung, art: "AU" }).success).toBe(false);
    expect(pruefungEingabe.parse({ ...pruefung, zuletzt: "", vonHand: "2027-03-01" })).toMatchObject({ zuletzt: null, vonHand: "2027-03-01" });
    expect(pruefungEingabe.safeParse({ ...pruefung, zuletzt: "gestern" }).success).toBe(false);
  });
});

describe("Erledigt", () => {
  it("ohne Datum kommt der Satz aus dem Entwurf", () => {
    expect(meldungen(erledigtEingabe.safeParse({ ...erledigt, am: "" }))).toContain("am: Gib das Datum der Prüfung an.");
    expect(meldungen(erledigtEingabe.safeParse({ ...erledigt, am: null }))).toEqual(["am: Gib das Datum der Prüfung an."]);
  });

  it("die Bemerkung wird getrimmt und endet bei 500 Zeichen", () => {
    expect(erledigtEingabe.parse({ ...erledigt, bemerkung: " Bremsflüssigkeit gewechselt " }).bemerkung).toBe("Bremsflüssigkeit gewechselt");
    expect(erledigtEingabe.safeParse({ ...erledigt, bemerkung: "x".repeat(501) }).success).toBe(false);
  });
});

describe("Reifen", () => {
  it("DOT mit vier Ziffern, Art aus der Liste", () => {
    expect(reifensatzEingabe.parse({ art: "Winter", dot: " 3822 ", lager: " Regal 2 " })).toEqual({ art: "Winter", dot: "3822", lager: "Regal 2" });
    expect(meldungen(reifensatzEingabe.safeParse({ art: "Winter", dot: "5422", lager: "" }))).toEqual(["dot: Gib die DOT-Nummer mit vier Ziffern an: Woche und Jahr, zum Beispiel 3822."]);
    expect(reifensatzEingabe.safeParse({ art: "Spikes", dot: "3822", lager: "" }).success).toBe(false);
  });

  it("der Wechsel nennt eine Art", () => {
    expect(reifenwechselEingabe.parse({ aufgezogen: "Sommer" })).toEqual({ aufgezogen: "Sommer" });
    expect(reifenwechselEingabe.safeParse({ aufgezogen: "" }).success).toBe(false);
  });
});
