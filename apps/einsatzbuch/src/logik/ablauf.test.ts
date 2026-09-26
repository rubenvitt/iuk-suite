import { describe, expect, it } from "vitest";

import type { Ausstehend, Status, Versiegelung } from "../typen";
import { phaseAus, restSekunden, restText } from "./ablauf";

function stat(teil: Partial<Status> = {}): Status {
  return {
    betrieb: "echt",
    eingerichtet: true,
    entwicklung: false,
    startfehler: null,
    bereitschaft: "Tagesdienst",
    zeitzone: "Europe/Berlin",
    fristMinuten: 15,
    besatzung: true,
    jetzt: "2026-09-24T10:00:00+02:00",
    jetztMs: 1_758_700_800_000,
    entwurf: null,
    ausstehend: null,
    kette: { anzahl: 0, letzter: null },
    versiegelung: null,
    suiteUrl: null,
    suiteVorgabe: "https://einsatzbuch.iuk-ue.de",
    rechnerName: null,
    eingerichtetAm: null,
    eingerichtetVon: null,
    schluesselId: null,
    stammdatenVom: null,
    ankerBestaetigtBis: 0,
    ankerAbweichung: null,
    anker: null,
    sicherung: null,
    widerrufen: false,
    sitzung: null,
    anmeldungLaeuft: false,
    ...teil,
  };
}

const AUSSTEHEND: Ausstehend = {
  entwurf: {
    stichwort: "RD 1",
    beginnDatum: "2026-09-24",
    beginnZeit: "10:00",
    endeDatum: "",
    endeZeit: "",
    strasse: "",
    ort: "Uelzen",
    objekt: "",
    fahrzeuge: [],
    personal: [],
    vorOrt: 0,
    transport: 0,
    notizen: "",
  },
  abgesendetAm: "2026-09-24T10:00:00+02:00",
  fristBis: "2026-09-24T10:15:00+02:00",
  fristBisMs: 1_758_701_700_000,
};

const VERSIEGELUNG: Versiegelung = {
  block: 1,
  hash: "h",
  prev: "0".repeat(64),
  versiegelt: "2026-09-24T10:15:00+02:00",
  nummer: "2026-001",
  verfallen: false,
};

describe("phaseAus", () => {
  it("Startfehler geht vor allem anderen", () => {
    expect(phaseAus(stat({ startfehler: "Die Datenbank ließ sich nicht öffnen.", eingerichtet: false, versiegelung: VERSIEGELUNG }), {
      phase: "form",
      bearbeiten: true,
    })).toEqual({ phase: "startfehler", bearbeiten: false });
  });

  it("nicht eingerichtet", () => {
    expect(phaseAus(stat({ eingerichtet: false }), { phase: "start", bearbeiten: false })).toEqual({ phase: "einrichtung", bearbeiten: false });
  });

  it("nicht eingerichtet geht vor einer Versiegelung", () => {
    expect(phaseAus(stat({ eingerichtet: false, versiegelung: VERSIEGELUNG }), { phase: "start", bearbeiten: false })).toEqual({
      phase: "einrichtung",
      bearbeiten: false,
    });
  });

  it("Versiegelung geht vor Ausstehendem und lokalem Zustand", () => {
    expect(phaseAus(stat({ versiegelung: VERSIEGELUNG, ausstehend: AUSSTEHEND }), { phase: "form", bearbeiten: true })).toEqual({
      phase: "versiegelt",
      bearbeiten: false,
    });
  });

  // Solange die Oberfläche eine gezeigte Versiegelung nicht per `befehle.versiegelungQuittieren()`
  // quittiert (beim Klick auf „Neuen Einsatz erfassen“ — nach „Jetzt versiegeln“ ebenso wie nach
  // der Frist-Uhr), liefern `status` und `frist_pruefen` dieselbe Versiegelung erneut. `phaseAus`
  // kennt kein „schon gesehen“: Es zeigt "versiegelt", solange `status.versiegelung` gesetzt ist —
  // unabhängig davon, was der lokale Zustand vom vorigen Aufruf noch weiß. Ohne das Quittieren
  // käme die Oberfläche also nie aus dieser Phase heraus.
  it("bleibt versiegelt, bis der Status quittiert ist — unabhängig vom lokalen Zustand", () => {
    expect(phaseAus(stat({ versiegelung: VERSIEGELUNG }), { phase: "start", bearbeiten: false })).toEqual({ phase: "versiegelt", bearbeiten: false });
    expect(phaseAus(stat({ versiegelung: VERSIEGELUNG }), { phase: "versiegelt", bearbeiten: false })).toEqual({ phase: "versiegelt", bearbeiten: false });
  });

  it("Ausstehend beim Bearbeiten bleibt im Formular", () => {
    expect(phaseAus(stat({ ausstehend: AUSSTEHEND }), { phase: "form", bearbeiten: true })).toEqual({ phase: "form", bearbeiten: true });
  });

  it("Ausstehend ohne Bearbeiten ergibt die Frist-Phase", () => {
    expect(phaseAus(stat({ ausstehend: AUSSTEHEND }), { phase: "form", bearbeiten: false })).toEqual({ phase: "frist", bearbeiten: false });
    expect(phaseAus(stat({ ausstehend: AUSSTEHEND }), { phase: "start", bearbeiten: false })).toEqual({ phase: "frist", bearbeiten: false });
  });

  it("lokal form bleibt form, ohne Ausstehendes oder Versiegelung", () => {
    expect(phaseAus(stat(), { phase: "form", bearbeiten: false })).toEqual({ phase: "form", bearbeiten: false });
  });

  it("lokal anmelden bzw. verwaltung bleibt so, ohne Ausstehendes oder Versiegelung", () => {
    expect(phaseAus(stat(), { phase: "anmelden", bearbeiten: false })).toEqual({ phase: "anmelden", bearbeiten: false });
    expect(phaseAus(stat(), { phase: "verwaltung", bearbeiten: false })).toEqual({ phase: "verwaltung", bearbeiten: false });
  });

  it("Ausstehend geht vor anmelden bzw. verwaltung", () => {
    expect(phaseAus(stat({ ausstehend: AUSSTEHEND }), { phase: "anmelden", bearbeiten: false })).toEqual({ phase: "frist", bearbeiten: false });
    expect(phaseAus(stat({ ausstehend: AUSSTEHEND }), { phase: "verwaltung", bearbeiten: false })).toEqual({ phase: "frist", bearbeiten: false });
  });

  it("sonst start", () => {
    expect(phaseAus(stat(), { phase: "frist", bearbeiten: false })).toEqual({ phase: "start", bearbeiten: false });
    expect(phaseAus(stat(), { phase: "versiegelt", bearbeiten: false })).toEqual({ phase: "start", bearbeiten: false });
  });
});

describe("restSekunden", () => {
  it("rundet auf, wird nie negativ", () => {
    expect(restSekunden(10_500, 0)).toBe(11);
    expect(restSekunden(10_000, 0)).toBe(10);
    expect(restSekunden(0, 10_000)).toBe(0);
    expect(restSekunden(-5_000, 0)).toBe(0);
  });
});

describe("restText", () => {
  it("845 Sekunden sind 14:05", () => {
    expect(restText(845)).toBe("14:05");
  });

  it("unter einer Minute füllt die Sekunden auf zwei Stellen", () => {
    expect(restText(5)).toBe("0:05");
  });
});
