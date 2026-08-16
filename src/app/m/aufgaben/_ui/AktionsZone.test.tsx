// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  clickElement,
  existsPortal,
  mount,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import type { AufgabeRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * ZWEI MOCKS, DIESELBE FORM WIE `FreigabeZone.test.tsx`: `useActionState` gemockt (fuer
 * `FertigMeldenFormular` UND — indirekt ueber die wiederverwendete `FreigabeAktionen` — den
 * Zurueckweisen-Dialog), UND `../actions` auf Sentinels/`vi.fn()` statt der echten Datei (sonst
 * zoege der jsdom-Lauf `better-sqlite3`/`next/cache` herein). `starten`/`zuruecksetzen`/
 * `wiederaufnehmen`/`zurueckziehen` sind ECHTE `vi.fn()` (nicht nur Symbole): diese vier Aktionen
 * tragen KEIN `useActionState` (natives `<form action={fn}>`, Vorbild `_ui/PersonenTabelle.tsx`s
 * „Beenden"), und die Zurueckziehen-Gegenprobe unten loest tatsaechlich `requestSubmit()` aus —
 * das ruft die Aktion direkt, ein Symbol wuerde dort einen Laufzeitfehler werfen.
 *
 * DRITTER MOCK, SEIT FIX-RUNDE 1: `next/navigation`s `useRouter` — `NachweisFormular` (gerendert,
 * sobald `optionen.nachweisHochladen` gilt) ruft ihn seit dem Wechsel auf einen Route Handler bei
 * JEDEM Rendern auf (`router.refresh()` nach einem Upload). Ohne den Mock wirft `mount()` schon
 * beim Aufbau — kein `AppRouterContext` in jsdom, dieselbe Form wie `TagesWaehler.test.tsx`. Diese
 * Datei loest `NachweisFormular` selbst nie aus (das ist `NachweisFormular.test.tsx`s Aufgabe),
 * `refresh` bleibt deshalb ein `vi.fn()` ohne Erwartung.
 */
const {
  useActionStateMock,
  startenMock,
  zuruecksetzenMock,
  wiederaufnehmenMock,
  zurueckziehenMock,
  FERTIG_MARKER,
  FREIGEBEN_MARKER,
  ZURUECKWEISEN_MARKER,
  VERTEILEN_MARKER,
  UMVERTEILEN_MARKER,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  startenMock: vi.fn(),
  zuruecksetzenMock: vi.fn(),
  wiederaufnehmenMock: vi.fn(),
  zurueckziehenMock: vi.fn(),
  FERTIG_MARKER: Symbol("fertigMeldenAction"),
  FREIGEBEN_MARKER: Symbol("freigebenAction"),
  ZURUECKWEISEN_MARKER: Symbol("zurueckweisenAction"),
  VERTEILEN_MARKER: Symbol("verteilenAction"),
  UMVERTEILEN_MARKER: Symbol("umverteilenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  startenAction: startenMock,
  zuruecksetzenAction: zuruecksetzenMock,
  wiederaufnehmenAction: wiederaufnehmenMock,
  zurueckziehenAction: zurueckziehenMock,
  fertigMeldenAction: FERTIG_MARKER,
  freigebenAction: FREIGEBEN_MARKER,
  zurueckweisenAction: ZURUECKWEISEN_MARKER,
  // `UmverteilenKnopf` (Schritt 6) kommt aus `VerteilenDialog`, und dessen `ZUWEISUNG`-Tabelle
  // liest BEIDE Actions beim Import — auch die, die diese Zone selbst nie rendert.
  verteilenAction: VERTEILEN_MARKER,
  umverteilenAction: UMVERTEILEN_MARKER,
}));

import { AktionsZone } from "./AktionsZone";

function aufgabe(over: Partial<AufgabeRow> & Pick<AufgabeRow, "id">): AufgabeRow {
  return {
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "e1",
    zugewiesenAn: "z1",
    status: "in_arbeit",
    faelligAm: "2026-08-20",
    faelligUhrzeit: null,
    dauerMinuten: 60,
    nachweisPflicht: false,
    nachweisArt: "text",
    prueferId: "p1",
    istSelbst: false,
    planDatum: null,
    planUhrzeit: null,
    planRang: 0,
    vorschlagDatum: null,
    vorschlagUhrzeit: null,
    erstelltAm: new Date(0),
    aktualisiertAm: new Date(0),
    ...over,
  };
}

const ALLE_AUS: AktionsOptionen = {
  starten: false,
  zuruecksetzen: false,
  fertig: false,
  freigeben: false,
  zurueckweisen: false,
  wiederaufnehmen: false,
  zurueckziehen: false,
  umverteilen: false,
  nachweisHochladen: false,
};

/** Beliebiger, aber realistischer Wert — `AktionsZone` verlangt `nachweisMaxBytes` als Pflicht-Prop. */
const MAX_BYTES = 8 * 1024 * 1024;

let absendenMock: ReturnType<typeof vi.fn>;
function stelleZustandEin(zustand: FormState, laeuft = false): void {
  absendenMock = vi.fn();
  useActionStateMock.mockReturnValue([zustand, absendenMock, laeuft]);
}

beforeEach(() => {
  useActionStateMock.mockReset();
  stelleZustandEin(FORM_START);
  startenMock.mockReset();
  zuruecksetzenMock.mockReset();
  wiederaufnehmenMock.mockReset();
  zurueckziehenMock.mockReset();
});
afterEach(async () => {
  await unmount();
});

describe("AktionsZone — keine Aktion moeglich", () => {
  it("zeigt einen ausgeschriebenen Satz, wenn keine einzige Aktion erlaubt ist (z. B. Endzustand)", async () => {
    await mount(<AktionsZone nachweisMaxBytes={MAX_BYTES} aufgabe={aufgabe({ id: "a1", status: "abgeschlossen" })} optionen={ALLE_AUS} />);
    expect(document.body.textContent).toContain("Für diese Aufgabe ist derzeit keine Aktion möglich.");
    expect(queryAll("button")).toHaveLength(0);
  });
});

describe("AktionsZone — einfache Statuswechsel (starten, zuruecksetzen, wiederaufnehmen)", () => {
  it("„Bearbeitung starten“ traegt die aufgabeId und ruft startenAction beim Absenden", async () => {
    await mount(
      <AktionsZone nachweisMaxBytes={MAX_BYTES} aufgabe={aufgabe({ id: "a1", status: "verteilt" })} optionen={{ ...ALLE_AUS, starten: true }} />,
    );
    await click("button");
    expect(startenMock).toHaveBeenCalledTimes(1);
    expect((startenMock.mock.calls[0]![0] as FormData).get("aufgabeId")).toBe("a1");
  });

  it("zeigt zuruecksetzen UND fertig GLEICHZEITIG, wenn beide erlaubt sind (in_arbeit, Fremdaufgabe)", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit" })}
        optionen={{ ...ALLE_AUS, zuruecksetzen: true, fertig: true }}
      />,
    );
    expect(document.body.textContent).toContain("Bearbeitung zurücksetzen");
    expect(document.body.textContent).toContain("Fertig melden");
  });

  it("„Bearbeitung zurücksetzen“ ruft zuruecksetzenAction mit der eigenen aufgabeId", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a2", status: "in_arbeit" })}
        optionen={{ ...ALLE_AUS, zuruecksetzen: true }}
      />,
    );
    await click("button");
    expect(zuruecksetzenMock).toHaveBeenCalledTimes(1);
    expect((zuruecksetzenMock.mock.calls[0]![0] as FormData).get("aufgabeId")).toBe("a2");
  });

  it("„Bearbeitung wieder aufnehmen“ ruft wiederaufnehmenAction mit der eigenen aufgabeId", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a3", status: "zurueckgewiesen" })}
        optionen={{ ...ALLE_AUS, wiederaufnehmen: true }}
      />,
    );
    await click("button");
    expect(wiederaufnehmenMock).toHaveBeenCalledTimes(1);
    expect((wiederaufnehmenMock.mock.calls[0]![0] as FormData).get("aufgabeId")).toBe("a3");
  });
});

describe("AktionsZone — Fertig melden, Nachweispflicht als Untergrenze", () => {
  it("zeigt den Nachweispflicht-Hinweis fuer Bildnachweis, mit dem Hinweis auf die Sicherheitspruefung", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true }}
      />,
    );
    expect(document.body.textContent).toContain("Nachweispflicht: Bild");
    expect(document.body.textContent).toContain("Sicherheitsprüfung");
  });

  it("zeigt den Feldfehler zum Textfeld (`nachweisText`)", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { nachweisText: "Für diese Aufgabe ist ein Textnachweis erforderlich." },
      values: { aufgabeId: "a1", nachweisText: "" },
    });
    await mount(
      <AktionsZone nachweisMaxBytes={MAX_BYTES} aufgabe={aufgabe({ id: "a1", nachweisPflicht: true })} optionen={{ ...ALLE_AUS, fertig: true }} />,
    );
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Textnachweis erforderlich.");
  });

  /**
   * DIE ZWEITE FEHLERQUELLE (Brief-Bedingung fuer diese Aufgabe, Advisor-Fund): `fertigMeldenAction`
   * liefert den Bild-Pflicht-Fehler unter dem SCHLUESSEL `nachweis`, NICHT `nachweisText`. Wuerde die
   * Zone nur `nachweisText` rendern, verschwaende dieser Fehler nach dem Absenden spurlos — ein
   * Formular, das scheinbar erfolgreich absendet, aber nichts speichert.
   */
  it("zeigt den Feldfehler zum fehlenden Bildnachweis (`nachweis`) — eine ANDERE Fehlerquelle als `nachweisText`", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { nachweis: "Für diese Aufgabe ist ein Bildnachweis erforderlich." },
      values: { aufgabeId: "a1" },
    });
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true }}
      />,
    );
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Bildnachweis erforderlich.");
  });
});

/**
 * NACHWEIS HOCHLADEN (Aufgabe 19) — DIE WIRING-ZUSAGE: `NachweisFormular` rendert genau dann, wenn
 * `optionen.nachweisHochladen` gilt, und bekommt `aufgabeId`/`nachweisArt`/`maxBytes` durchgereicht.
 * Das FORMULAR SELBST (Feldfehler, Untergrenzen-Hinweise) ist in `NachweisFormular.test.tsx`
 * bewacht — hier zaehlt nur, DASS und WANN `AktionsZone` es einhaengt.
 */
describe("AktionsZone — Nachweis hochladen (Aufgabe 19)", () => {
  it("rendert NachweisFormular NICHT, wenn optionen.nachweisHochladen false ist — auch bei fertig: true", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true }}
      />,
    );
    expect(document.body.textContent).not.toContain("Nachweis speichern");
  });

  it("rendert NachweisFormular, wenn optionen.nachweisHochladen true ist, NEBEN Fertig melden", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true, nachweisHochladen: true }}
      />,
    );
    expect(document.body.textContent).toContain("Nachweis speichern");
    expect(document.body.textContent).toContain("Fertig melden");
    const dateiFeld = document.querySelector<HTMLInputElement>("input[type='file']");
    expect(dateiFeld).not.toBeNull();
  });
});

describe("AktionsZone — Freigeben/Zurückweisen kommen aus FreigabeZone.tsx, keine zweite Fassung", () => {
  it("rendert die Testids von `FreigabeAktionen` (freigeben-<id>, zurueckweisen-<id>)", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "freigabe_offen" })}
        optionen={{ ...ALLE_AUS, freigeben: true }}
      />,
    );
    expect(queryAll("[data-testid='freigeben-a1']")).toHaveLength(1);
    expect(queryAll("[data-testid='zurueckweisen-a1']")).toHaveLength(1);
  });
});

describe("AktionsZone — Zurückziehen ist bestätigungspflichtig (Spec §9.9)", () => {
  it("oeffnet erst nach dem Klick eine Bestaetigung; sendet erst NACH der Bestaetigung ab, mit der eigenen aufgabeId", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "eingegangen" })}
        optionen={{ ...ALLE_AUS, zurueckziehen: true }}
      />,
    );
    expect(existsPortal(".ant-popconfirm")).toBe(false);

    await click("[data-testid='zurueckziehen']");
    expect(existsPortal(".ant-popconfirm")).toBe(true);
    expect(queryPortal(".ant-popconfirm").textContent).toContain("Aufgabe zurückziehen?");
    expect(zurueckziehenMock).not.toHaveBeenCalled();

    const bestaetigen = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(".ant-popconfirm .ant-btn"),
    ).find((b) => b.textContent === "Zurückziehen");
    if (!bestaetigen) throw new Error("Kein Bestaetigungsknopf gefunden");
    await clickElement(bestaetigen);

    expect(zurueckziehenMock).toHaveBeenCalledTimes(1);
    expect((zurueckziehenMock.mock.calls[0]![0] as FormData).get("aufgabeId")).toBe("a1");
  });

  it("„Abbrechen“ schliesst die Bestaetigung, ohne abzusenden", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "eingegangen" })}
        optionen={{ ...ALLE_AUS, zurueckziehen: true }}
      />,
    );
    await click("[data-testid='zurueckziehen']");
    expect(existsPortal(".ant-popconfirm")).toBe(true);

    const abbrechen = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(".ant-popconfirm .ant-btn"),
    ).find((b) => b.textContent === "Abbrechen");
    if (!abbrechen) throw new Error("Kein Abbrechen-Knopf gefunden");
    await clickElement(abbrechen);

    expect(zurueckziehenMock).not.toHaveBeenCalled();
  });
});

/*
 * DIE FESTE VORRANGLISTE (Oberflaechen-Spec 2026-08-16 §7 Nr. 2, §11.1) — HOECHSTENS EIN
 * `type="primary"`, UND ZWAR DER ERSTE ERLAUBTE EINTRAG.
 *
 * DER ZAEHLRIEGEL AUS §11.2 MISST `data-testid="aufgaben-flaeche"` UND ERREICHT `/a/<id>` DAMIT
 * NIE — diese Datei ist der einzige Ort, an dem die Zusage fuer die Detailseite rot werden kann.
 * Gezaehlt wird `.ant-btn-primary`, dieselbe Klasse wie dort: antd setzt sie fuer `type="primary"`,
 * und ein `undefined` erzeugt sie nicht.
 */
describe("AktionsZone — genau ein Primaerknopf (§7 Nr. 2)", () => {
  function primaere(): HTMLElement[] {
    return queryAll(".ant-btn-primary");
  }

  it("zeigt bei drei gleichzeitig erlaubten Aktionen genau EINEN Primaerknopf", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true, zuruecksetzen: true, nachweisHochladen: true }}
      />,
    );
    expect(primaere()).toHaveLength(1);
  });

  /**
   * `nachweisHochladen` VOR `fertig` — DIE UMSORTIERUNG MIT NACHGELESENEM GRUND (§7 Nr. 2):
   * `uebergang()` erlaubt `in_arbeit`x`fertig` UNABHAENGIG von der Nachweispflicht, die Ablehnung
   * entsteht erst in `fertigMeldenAction` als Feldfehler. Ohne diese Reihenfolge waere „Fertig
   * melden" der Primaerknopf, waehrend der tatsaechlich noetige erste Schritt daneben stuende.
   */
  it("macht bei nachweispflichtiger in_arbeit-Aufgabe „Nachweis speichern“ primaer, nicht „Fertig melden“", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "in_arbeit", nachweisPflicht: true, nachweisArt: "bild" })}
        optionen={{ ...ALLE_AUS, fertig: true, nachweisHochladen: true }}
      />,
    );
    expect(primaere()).toHaveLength(1);
    expect(primaere()[0]!.textContent).toContain("Nachweis speichern");
  });

  it("macht bei `freigabe_offen` „Freigeben“ primaer und laesst „Zurückweisen“ Standard", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "freigabe_offen" })}
        optionen={{ ...ALLE_AUS, freigeben: true }}
      />,
    );
    expect(primaere()).toHaveLength(1);
    expect(primaere()[0]!.textContent).toContain("Freigeben");
  });

  /**
   * EINE `eingegangen`-AUFGABE TRAEGT KEINEN PRIMAERKNOPF, UND DAS IST DIE POINTE DER LISTE (§7
   * Nr. 2): `zurueckziehen` steht ABSICHTLICH NICHT in `VORRANG`. Stuende es darin, waere es fuer
   * diesen Zustand der EINZIGE erlaubte Eintrag — keine andere Aktion hat in `TABELLE` eine Zeile
   * aus `eingegangen` — und damit ausgerechnet die LOESCHENDE Aktion der Primaerknopf.
   */
  it("zeigt bei `eingegangen` KEINEN Primaerknopf; „Zurückziehen“ bleibt sekundaer mit Popconfirm", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "eingegangen" })}
        optionen={{ ...ALLE_AUS, zurueckziehen: true }}
      />,
    );
    expect(primaere()).toHaveLength(0);
    expect(queryAll("[data-testid='zurueckziehen']")).toHaveLength(1);
  });

  /**
   * „ANDERS ZUWEISEN" (§7 Nr. 3) — DER BIS SCHRITT 6 FEHLENDE AUFRUFER VON `umverteilenAction`.
   *
   * DER KNOPF NENNT DIE FOLGE NICHT MEHR SELBST, UND DAS IST ABSICHT: die Beschriftung hiess bis
   * zur Bildstrecken-Runde „Anders zuweisen (der Zeitplan wird dabei geleert)" und brach in der
   * Zone „Überfällig" ueber vier Zeilen unterschiedlich um. Die Folge (`planLoeschen: true` aus
   * `_lib/lebenszyklus.ts`) steht jetzt im Bestaetigungsdialog, der auf jedem Weg davorsteht;
   * bewacht wird sie in `VerteilenDialog.test.tsx`. Hier bleibt die Zusage „der Knopf erscheint bei
   * `optionen.umverteilen` und ist der Primaerknopf".
   */
  it("zeigt „Anders zuweisen“, sobald optionen.umverteilen gilt", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "verteilt" })}
        optionen={{ ...ALLE_AUS, umverteilen: true }}
        verteilen={{ bufdis: [], auslastung: [], tage: ["2026-08-17"] }}
      />,
    );
    expect(primaere()).toHaveLength(1);
    expect(primaere()[0]!.textContent).toContain("Anders zuweisen");
  });

  /**
   * OHNE ZIELLISTE KEIN KNOPF — und der Fall ist nicht konstruiert: `a/[id]/page.tsx` laedt
   * `verteilDaten` NUR, wenn `optionen.umverteilen` gilt, reicht also fuer jede andere Person
   * `null` durch. Ein Modal ohne eine einzige waehlbare Zielperson waere eine Sackgasse.
   */
  it("laesst „Anders zuweisen“ weg, wenn keine Zielliste durchgereicht wurde", async () => {
    await mount(
      <AktionsZone
        nachweisMaxBytes={MAX_BYTES}
        aufgabe={aufgabe({ id: "a1", status: "verteilt" })}
        optionen={{ ...ALLE_AUS, umverteilen: true }}
      />,
    );
    expect(document.body.textContent).not.toContain("Anders zuweisen");
  });
});
