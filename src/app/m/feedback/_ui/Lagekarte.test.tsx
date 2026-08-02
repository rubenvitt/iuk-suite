// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DIE LAGEKARTE (Entwurf §2.3, §2.7, §4.4, §4.5). Der einzige Platz der Seite,
 * der seinen Inhalt wechselt: entweder Startformular oder laufende Umfrage — nie
 * beides, nie keins. Was hier bewacht wird, sind fuenf Zusagen, die still
 * brechen:
 *
 * 1. Die Karte hat in JEDER Belegung Inhalt. Ein leerer Zweig auf der einzigen
 *    Arbeitsseite waere ein Ehrenamtlicher, der einmal pro Woche zwei Minuten
 *    hat und nicht weiss, was er tun soll.
 * 2. „Feedback jetzt beenden" ist KEINE Gefahr (§2.3): es ist der geplante
 *    Schluss-Schritt. `danger` faerbt in diesem Projekt mit `colorError ===
 *    colorPrimary === #c8000f` — Rot auf einer Datenflaeche (Farb-Klausel §4.9).
 * 3. Der Ruecklaufbalken ist NIE rot: antds Vorgabe ist `colorPrimary`, also
 *    Suite-Rot, und ein roter Balken liest sich als Alarm.
 * 4. Es wird nie ein Nenner erfunden: ohne `participantCount` gibt es „12
 *    Rueckmeldungen", keinen Prozentwert und keinen Balken.
 * 5. Ein Altbestands-Entwurf kapert die Karte nicht (Belegung E).
 *
 * Der Pruefstand: `renderToStaticMarkup` unter jsdom (dieselbe Wahl wie
 * `Noten.test.tsx`) plus Quelltext-Assertionen fuer das, was im Markup nicht
 * sichtbar ist. `useActionState` ist ersetzt, weil sonst ausschliesslich der
 * Startzustand pruefbar waere — der Feldfehler aus §4.4 kommt aber erst im
 * zweiten Zustand.
 */

const {
  useActionStateMock,
  startFeedbackActionMock,
  beendeFeedbackActionMock,
  updateEveningActionMock,
  refreshMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  startFeedbackActionMock: vi.fn(),
  beendeFeedbackActionMock: vi.fn(),
  updateEveningActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});
// Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
// nach — hier interessiert nur, DASS die richtige uebergeben wird.
vi.mock("../actions", () => ({
  startFeedbackAction: startFeedbackActionMock,
  beendeFeedbackAction: beendeFeedbackActionMock,
  // Der Textknopf "Teilnehmerzahl nachtragen" (2.4) traegt die
  // Zeilenbearbeitung des LAUFENDEN Abends.
  updateEveningAction: updateEveningActionMock,
}));
/**
 * `useRouter` WIRFT ausserhalb des `AppRouterContext` ("invariant expected app
 * router to be mounted") — ohne diesen Mock scheitert jeder Test der laufenden
 * Karte, seit `Aktualisierer` darin haengt. Derselbe Zuschnitt wie in den
 * `qr`-Tests, nur mit festem Rueckgabewert: geprueft wird, DASS `refresh`
 * gerufen wird, nicht was Next daraus macht.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { computeClosesAt, DEFAULT_CLOSE_AFTER_HOURS } from "../_lib/lifecycle";
import type { AbendLage, CockpitZustand, LaufendeLage } from "../_lib/cockpit";
import type { FrageVerteilung } from "../_lib/aggregation";
import { Lagekarte } from "./Lagekarte";
import { StartFormular } from "./StartFormular";
import { BeendenKnopf } from "./BeendenKnopf";
import { Aktualisierer, AKTUALISIERUNGS_TAKT_MS } from "./Aktualisierer";
// Kein zweites Mount-Harness erfinden (CLAUDE.md): `mount`/`queryAll`/`click`
// liegen in `qr/_lib/test-dom.tsx` und fahren schon `Zettel.test.tsx`.
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { formatDatumKurz, formatUhrzeit, formatZeitpunkt, heuteInZone } from "./datum";
import type { FormState } from "../_lib/formState";

const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const quelle = (datei: string) => readFileSync(join(UI, datei), "utf8");
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const JETZT = new Date("2026-07-22T19:47:00Z");
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

function zeichne(element: ReactElement): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}
const text = (element: ReactElement): string => zeichne(element).textContent ?? "";

/** Ein Abend samt (optionaler) Umfrage — nur die Felder, die die Karte liest. */
function lage(over: {
  id?: number;
  datum?: string;
  topic?: string | null;
  teilnehmer?: number | null;
  antworten?: number;
  status?: "draft" | "active" | "closed" | "archived";
  activatedAt?: Date;
  stunden?: number;
}): AbendLage {
  const datum = tag(over.datum ?? "2026-07-22");
  const stunden = over.stunden ?? 48;
  const status = over.status ?? "active";
  return {
    evening: {
      id: over.id ?? 1,
      groupId: 7,
      date: datum,
      topic: over.topic === undefined ? "Erste Hilfe Auffrischung" : over.topic,
      notes: null,
      participantCount: over.teilnehmer === undefined ? 20 : over.teilnehmer,
      createdAt: JETZT,
    },
    survey: {
      id: 10 + (over.id ?? 1),
      eveningId: over.id ?? 1,
      status,
      questions: "[]",
      closeAfterHours: stunden,
      activatedAt: over.activatedAt ?? new Date("2026-07-22T17:32:00Z"),
      closesAt: computeClosesAt(datum, stunden),
      closedAt: null,
      createdAt: JETZT,
    },
    effektiv: status,
    responseCount: over.antworten ?? 0,
  };
}

const laufendeLage = (over: Parameters<typeof lage>[0]) => lage(over) as LaufendeLage;

function zustand(over: Partial<CockpitZustand> = {}): CockpitZustand {
  const laufend = over.laufend ?? null;
  const belegung =
    over.belegung ??
    (laufend
      ? laufend.responseCount === 0
        ? "C"
        : "D"
      : (over.verlauf ?? []).length === 0
        ? "A"
        : "B");
  return {
    belegung,
    modus: over.modus ?? (belegung === "A" ? "einrichtung" : "betrieb"),
    laufend,
    weitereAktive: over.weitereAktive ?? [],
    verlauf: over.verlauf ?? [],
    letzterAbend: over.letzterAbend ?? null,
    altbestand: over.altbestand ?? [],
    letzteTeilnehmerzahl: over.letzteTeilnehmerzahl ?? null,
  };
}

const TEILNAHME_URL = "https://feedback.iuk-ue.de/f/bereitschaft-abc12";

/**
 * Acht Verteilungen wie der Standardbogen (§3.2, §2.3) — die Notenspuren des
 * Zwischenstands. Frage 1 ist ABSICHTLICH gespalten (6×Note 1 + 6×Note 5): eine
 * Karte, die nur den Mittelwert 3,0 zeigte, verschwiege genau das.
 */
const ACHT_VERTEILUNGEN: FrageVerteilung[] = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Frage ${i + 1}`,
  verteilung: i === 0 ? [6, 0, 0, 0, 6, 0] : [0, 6, 6, 0, 0, 0],
  count: 12,
}));

const karte = (z: CockpitZustand, freitexte = 0, verteilungen: FrageVerteilung[] = []) => (
  <Lagekarte
    groupId={7}
    zustand={z}
    jetzt={JETZT}
    stunden={DEFAULT_CLOSE_AFTER_HOURS}
    heute="2026-07-22"
    freitexte={freitexte}
    verteilungen={verteilungen}
    teilnahmeUrl={TEILNAHME_URL}
    gruppenname="Bereitschaft Übach-Palenberg"
  />
);

/** Alle antd-Knöpfe der Karte in DOM-Reihenfolge — die Reihenfolge IST die Aussage. */
const knoepfe = (z: CockpitZustand): HTMLElement[] =>
  [...zeichne(karte(z)).querySelectorAll<HTMLElement>("button")];

const knopfMit = (z: CockpitZustand, beschriftung: string): HTMLElement => {
  const treffer = knoepfe(z).find((b) => (b.textContent ?? "").includes(beschriftung));
  if (!treffer) throw new Error(`Kein Knopf mit „${beschriftung}"`);
  return treffer;
};

const stelle = (z: CockpitZustand, beschriftung: string): number =>
  knoepfe(z).findIndex((b) => (b.textContent ?? "").includes(beschriftung));

const QR_KNOPF = "QR-Code groß zeigen";

beforeEach(() => {
  useActionStateMock.mockReset();
  // Vorgabe: der Startzustand, wie ihn `useActionState` beim ersten Rendern gibt.
  useActionStateMock.mockImplementation((_action: unknown, init: FormState) => [
    init,
    () => {},
    false,
  ]);
});

describe("Lagekarte — Belegung A (Erststart)", () => {
  const z = zustand({ belegung: "A", modus: "einrichtung" });

  it("nennt den ersten Schritt und die zwei Schritte des Einrichtens", () => {
    const t = text(karte(z));
    expect(t).toContain("ERSTER SCHRITT");
    expect(t).toContain("Ersten Dienstabend anlegen und Feedback starten");
    expect(t).toContain("Schritt 1");
    expect(t).toContain("Schritt 2");
    expect(t).toContain("der Code gilt dauerhaft");
    expect(t).toContain("Gerade läuft kein Feedback.");
  });

  it("traegt das Startformular mit drei Feldern und dem Primaerknopf", () => {
    const wirt = zeichne(karte(z));
    expect(wirt.querySelector('input[name="date"]')).not.toBeNull();
    expect(wirt.querySelector('input[name="topic"]')).not.toBeNull();
    expect(wirt.querySelector('input[name="participantCount"]')).not.toBeNull();
    expect(wirt.querySelector('input[name="groupId"]')?.getAttribute("value")).toBe("7");
    expect(wirt.textContent).toContain("Feedback starten");
    // `notes` ist weg (§2.3): viertes Feld ohne Leser.
    expect(wirt.querySelector('[name="notes"]')).toBeNull();
  });

  it("zeigt keinen Zaehler und keinen Beenden-Knopf", () => {
    const t = text(karte(z));
    expect(t).not.toContain("Feedback jetzt beenden");
    expect(zeichne(karte(z)).querySelector(".ant-progress")).toBeNull();
  });
});

describe("Lagekarte — Belegung B (ruhend)", () => {
  const z = zustand({
    belegung: "B",
    modus: "betrieb",
    verlauf: [lage({ id: 2, status: "closed", antworten: 4 })],
    letzteTeilnehmerzahl: 17,
  });

  it("nennt den naechsten Schritt statt des ersten", () => {
    const t = text(karte(z));
    expect(t).toContain("NÄCHSTER SCHRITT");
    expect(t).toContain("Feedback für heute starten");
    expect(t).not.toContain("Schritt 1");
    expect(t).toContain("Gerade läuft kein Feedback.");
  });

  it("belegt die Teilnehmerzahl mit der des letzten Abends vor", () => {
    const wirt = zeichne(karte(z));
    expect(wirt.querySelector('input[name="participantCount"]')?.getAttribute("value")).toBe("17");
  });
});

describe("Lagekarte — Belegung C (laeuft, 0 Antworten)", () => {
  const laufend = laufendeLage({ antworten: 0 });
  const z = zustand({ belegung: "C", modus: "betrieb", laufend });

  it("sagt „laeuft seit“ mit Wochentag und Uhrzeit — vier Kanaele, keiner Farbe allein", () => {
    const t = text(karte(z));
    expect(t).toContain("LÄUFT SEIT");
    expect(t).toContain(formatUhrzeit(laufend.survey.activatedAt!));
    expect(t).toContain("Erste Hilfe Auffrischung");
    expect(t).toContain(formatDatumKurz(laufend.evening.date));
  });

  it("bittet um den QR-Code statt leere Notenspuren zu zeigen", () => {
    const t = text(karte(z));
    expect(t).toContain("Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends.");
    expect(zeichne(karte(z)).querySelector(".ant-progress")).toBeNull();
  });

  it("nennt den Schliesszeitpunkt aus closesAt und den Stand der Anzeige", () => {
    const t = text(karte(z));
    expect(t).toContain(formatZeitpunkt(laufend.survey.closesAt!));
    // Ohne diese Zeile sieht eine gecachte Zahl aus wie eine live gemessene (§4.5).
    expect(t).toContain(`Stand: ${formatUhrzeit(JETZT)}`);
  });

  it("zeigt „Feedback jetzt beenden“ — und NICHT als Gefahr", () => {
    const wirt = zeichne(karte(z));
    expect(wirt.textContent).toContain("Feedback jetzt beenden");
    const knopf = [...wirt.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Feedback jetzt beenden"),
    );
    expect(knopf).toBeDefined();
    // antd 6 kennzeichnet `danger` mit `ant-btn-dangerous`/`ant-btn-color-dangerous`.
    expect(knopf!.className).not.toContain("dangerous");
    expect(knopf!.className).not.toContain("ant-btn-primary");
    expect(knopf!.className).toContain("ant-btn-default");
  });

  it("bietet das Startformular nur noch als eingeklappten Slot an", () => {
    const t = text(karte(z));
    expect(t).toContain("Nächsten Dienstabend starten");
    expect(t).toContain("beendet die laufende Umfrage");
    // Zu — der Slot darf die laufende Umfrage nicht ueberdecken.
    expect(zeichne(karte(z)).querySelector(".ant-collapse-item-active")).toBeNull();
  });
});

describe("Lagekarte — Belegung D (laeuft, Antworten da)", () => {
  it("zeigt Zahl, Nenner, Balken und Quote", () => {
    const laufend = laufendeLage({ antworten: 12, teilnehmer: 20 });
    const wirt = zeichne(karte(zustand({ belegung: "D", modus: "betrieb", laufend })));

    expect(wirt.textContent).toContain("12");
    expect(wirt.textContent).toContain("von 20");
    expect(wirt.textContent).toContain("60 % Rücklauf");
    const balken = wirt.querySelector(".ant-progress");
    expect(balken).not.toBeNull();
    expect(balken!.getAttribute("aria-valuenow")).toBe("60");
    // Der Balken traegt die eigene Tinte, NICHT antds colorPrimary (= Suite-Rot).
    expect(balken!.innerHTML).toContain("var(--fb-ink)");
    expect(balken!.innerHTML).toContain("var(--fb-fill)");
  });

  it("erfindet ohne Teilnehmerzahl keinen Nenner", () => {
    const laufend = laufendeLage({ antworten: 12, teilnehmer: null });
    const wirt = zeichne(karte(zustand({ belegung: "D", modus: "betrieb", laufend })));

    expect(wirt.textContent).toContain("12");
    expect(wirt.textContent).toContain("Rückmeldungen");
    expect(wirt.textContent).not.toContain("von ");
    expect(wirt.textContent).not.toContain("%");
    expect(wirt.querySelector(".ant-progress")).toBeNull();
  });

  it("behandelt die Teilnehmerzahl 0 wie „keine Angabe“ — nie „12 von 0“", () => {
    // Ueber das Formular erreichbar (`min={0}`): eine 0 ist kein Nenner, sondern
    // eine Null. „12 von 0" waere ein erfundener Nenner und eine Division, die
    // nur zufaellig keinen Prozentwert produziert.
    const laufend = laufendeLage({ antworten: 12, teilnehmer: 0 });
    const wirt = zeichne(karte(zustand({ belegung: "D", modus: "betrieb", laufend })));

    expect(wirt.textContent).toContain("Rückmeldungen");
    expect(wirt.textContent).not.toContain("von 0");
    expect(wirt.textContent).not.toContain("%");
    expect(wirt.querySelector(".ant-progress")).toBeNull();
  });

  it("kappt bei mehr Rueckmeldungen als Teilnehmern neutral bei 100 %", () => {
    const laufend = laufendeLage({ antworten: 24, teilnehmer: 20 });
    const wirt = zeichne(karte(zustand({ belegung: "D", modus: "betrieb", laufend })));

    expect(wirt.querySelector(".ant-progress")!.getAttribute("aria-valuenow")).toBe("100");
    expect(wirt.textContent).toContain("mehr Rückmeldungen als erfasste Teilnehmer");
    // Neutral, kein Fehler: keine Warn-/Fehlerform von antd.
    expect(wirt.querySelector(".ant-alert-error")).toBeNull();
  });
});

/**
 * DER ZWISCHENSTAND (§2.3). Die laufende Karte hängt im Gruppenraum, während die
 * Leute noch tippen — deshalb sind hier drei Zusagen fällig, die still brechen:
 *
 * 1. Bei 1–2 Rückmeldungen steht dabei, dass die Zahlen noch schwanken. Ohne den
 *    Satz liest eine Gruppe zwei Meinungen als Urteil über den Abend.
 * 2. Freitexte werden GEZÄHLT, nie gezeigt: sichtbarer Freitext im Gruppenraum
 *    ist ein gebrochenes Versprechen gegenüber dem, der ihn gerade tippt.
 * 3. Die Überschrift erscheint nur mit Inhalt darunter — ein beschriftetes leeres
 *    Fach ist schlimmer als kein Fach (§4.3).
 *
 * 4. Notenlegende EINMAL und darunter die acht kompakten Notenspuren — dieselbe
 *    Datenlage, die die Auswertung gross zeigt (`verteilungJeFrage`, §3.2).
 */
describe("Lagekarte — Zwischenstand (§2.3)", () => {
  const laufende = (antworten: number, freitexte = 0, verteilungen: FrageVerteilung[] = []) =>
    karte(
      zustand({ modus: "betrieb", laufend: laufendeLage({ antworten }) }),
      freitexte,
      verteilungen,
    );

  it("sagt bei zwei Rueckmeldungen, dass die Zahlen noch stark schwanken", () => {
    const t = text(laufende(2));
    expect(t).toContain("ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG");
    expect(t).toContain("Erst 2 Rückmeldungen — die Zahlen schwanken noch stark.");
  });

  it("beugt den Hinweis bei genau einer Rueckmeldung", () => {
    const t = text(laufende(1));
    expect(t).toContain("Erst 1 Rückmeldung — die Zahlen schwanken noch stark.");
    expect(t).not.toContain("Rückmeldungen — die Zahlen");
  });

  it("laesst den Hinweis ab drei Rueckmeldungen weg", () => {
    const t = text(laufende(3, 4));
    expect(t).toContain("ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG");
    expect(t).not.toContain("schwanken");
  });

  it("zaehlt die Freitexte und zeigt sie nicht", () => {
    expect(text(laufende(12, 5))).toContain("5 Freitexte — in der Auswertung nachlesen");
    const t = text(laufende(12, 1));
    expect(t).toContain("1 Freitext — in der Auswertung nachlesen");
    expect(t).not.toContain("Freitexte");
  });

  it("laesst die Ueberschrift weg, wenn nichts darunter stuende", () => {
    // Sieben Rueckmeldungen, keine Freitexte, KEINE Bewertungsfrage im Bogen
    // (ein reiner Freitext- oder Altbestandsbogen liefert keine Verteilung) —
    // eine beschriftete leere Schublade waere schlimmer als keine (§4.3).
    const t = text(laufende(7, 0, []));
    expect(t).not.toContain("ZWISCHENSTAND");
    expect(t).not.toContain("Freitext");
  });

  it("bleibt in Belegung C ganz weg — auch mit gezaehlten Freitexten und Verteilungen", () => {
    // 0 Rueckmeldungen: der Satz statt leerer Spuren (§4.3). Die Verteilungen
    // sind hier sechs Nullen je Frage — eine Spur ohne Saeule ist eine Fehlform,
    // nicht eine leere Anzeige.
    const leer: FrageVerteilung[] = ACHT_VERTEILUNGEN.map((v) => ({
      ...v,
      verteilung: [0, 0, 0, 0, 0, 0],
      count: 0,
    }));
    const t = text(laufende(0, 3, leer));
    expect(t).toContain("Noch keine Rückmeldung");
    expect(t).not.toContain("ZWISCHENSTAND");
    expect(t).not.toContain("Freitext");
  });

  it("traegt die Notenlegende EINMAL und darunter acht kompakte Spuren", () => {
    const wirt = zeichne(laufende(12, 0, ACHT_VERTEILUNGEN));
    expect(wirt.textContent).toContain("ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG");

    // Die Legende genau einmal: ihre Ankerzeile („1 sehr gut"/„6 ungenügend")
    // steht in jeder Legende genau einmal, also ist sie der Zaehler.
    const anker = [...wirt.querySelectorAll(".fb-legende-anker")];
    expect(anker).toHaveLength(1);

    // Acht Spuren, jede mit ihrer vollstaendigen Beschriftung (§4.14: EIN
    // `aria-label` je Spur, nicht sechs an den Zellen).
    const spuren = [...wirt.querySelectorAll('[role="img"]')].filter((el) =>
      (el.getAttribute("aria-label") ?? "").startsWith("Notenverteilung"),
    );
    expect(spuren).toHaveLength(8);
    // Die gespaltene Frage 1: zwei Saeulen, die Mitte leer — genau die Aussage,
    // die ein Mittelwert von 3,0 verschweigt.
    expect(spuren[0].getAttribute("aria-label")).toContain("sechsmal Note 1");
    expect(spuren[0].getAttribute("aria-label")).toContain("sechsmal Note 5");
    expect(wirt.textContent).toContain("Frage 1");
    expect(wirt.textContent).toContain("Frage 8");
  });

  it("zeigt die Spuren kompakt (24px Zellhoehe), nicht in der Auswertungsgroesse", () => {
    const wirt = zeichne(laufende(12, 0, ACHT_VERTEILUNGEN));
    const html = wirt.innerHTML.replace(/\s/g, "");
    expect(html).toContain("height:24px");
    expect(html).not.toContain("height:44px");
  });

  it("zeigt die Spuren auch ohne Schwankungshinweis und ohne Freitexte", () => {
    // Der Fall, der bis hierher gar keinen Zwischenstand hatte: sieben
    // Rueckmeldungen, keine Freitexte — vorher blieb die Karte hier stumm.
    const t = text(laufende(7, 0, ACHT_VERTEILUNGEN));
    expect(t).toContain("ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG");
    expect(t).not.toContain("schwanken");
  });
});

describe("Lagekarte — Belegung E und Nebenlagen", () => {
  it("laesst einen Altbestands-Entwurf die Karte NICHT kapern", () => {
    const alt = lage({ id: 9, datum: "2026-05-06", status: "draft", topic: "Alter Abend" });
    const z = zustand({
      belegung: "B",
      modus: "betrieb",
      verlauf: [alt],
      altbestand: [alt],
    });
    const t = text(karte(z));

    expect(t).toContain("NÄCHSTER SCHRITT");
    expect(t).not.toContain("Entwurf");
    expect(t).not.toContain("Alter Abend");
  });

  it("nennt eine zweite aktive Umfrage neutral mit Ausweg", () => {
    const laufend = laufendeLage({ id: 1, antworten: 3 });
    const zweite = laufendeLage({ id: 5, datum: "2026-03-12", topic: "Funk" });
    const t = text(
      karte(zustand({ belegung: "D", modus: "betrieb", laufend, weitereAktive: [zweite] })),
    );

    expect(t).toContain("Eine weitere Umfrage ist aktiv");
    expect(t).toContain(formatDatumKurz(zweite.evening.date));
    expect(t).toContain("beenden");
  });

  it("hat in jeder Belegung Inhalt — nie eine leere Karte", () => {
    const belegungen: CockpitZustand[] = [
      zustand({ belegung: "A", modus: "einrichtung" }),
      zustand({ belegung: "B", modus: "betrieb", verlauf: [lage({ status: "closed" })] }),
      zustand({ belegung: "C", modus: "betrieb", laufend: laufendeLage({ antworten: 0 }) }),
      zustand({ belegung: "D", modus: "betrieb", laufend: laufendeLage({ antworten: 7 }) }),
    ];
    for (const z of belegungen) {
      const t = text(karte(z));
      expect(t.trim().length).toBeGreaterThan(40);
      expect(zeichne(karte(z)).querySelector(".ant-card")).not.toBeNull();
    }
  });
});

/**
 * SELBSTAKTUALISIERUNG (§4.5) — der Grund, warum „Stand: 21:47" ueberhaupt
 * tragbar ist. Ohne den Takt behauptet die Zeile Aktualitaet fuer eine Zahl, die
 * seit dem Server-Rendern feststeht, und das `aria-live="polite"` an derselben
 * Zeile (§4.14, genau einmal) hat nie etwas zu melden.
 *
 * Diese Tests laufen ueber den ECHTEN Mountweg (`react-dom/client`), nicht ueber
 * `renderToStaticMarkup`: `useEffect` laeuft serverseitig nicht, der Takt waere
 * dort unsichtbar. Gefaked sind nur `setInterval`/`clearInterval` — antds
 * Innenleben haengt an weiteren Timern und `Date`, und ein pauschales
 * `useFakeTimers()` friert die auch ein.
 *
 * Die Bedingung „nur bei laufender Umfrage" wird am VERHALTEN der `Lagekarte`
 * geprueft, nicht an einem Flag: `Aktualisierer` traegt bewusst kein
 * `laeuft`-Prop, weil `LaufendeKarte` nur im Zweig `laufend !== null` entsteht
 * (§2.2 — eine Stelle entscheidet). Faellt diese Verdrahtung, faellt dieser Test.
 */
describe("Selbstaktualisierung der laufenden Karte (§4.5)", () => {
  const sichtbarkeit = (wert: "visible" | "hidden") =>
    Object.defineProperty(document, "visibilityState", { value: wert, configurable: true });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    refreshMock.mockClear();
    sichtbarkeit("visible");
  });

  afterEach(async () => {
    await unmount();
    vi.useRealTimers();
  });

  const weiter = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  it("fragt bei laufender Umfrage alle 30 s beim Server nach", async () => {
    await mount(karte(zustand({ belegung: "D", laufend: laufendeLage({ antworten: 7 }) })));
    expect(refreshMock).not.toHaveBeenCalled();

    await weiter(AKTUALISIERUNGS_TAKT_MS - 1);
    expect(refreshMock).not.toHaveBeenCalled();

    await weiter(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await weiter(AKTUALISIERUNGS_TAKT_MS);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("montiert die Insel nicht, wenn keine Umfrage laeuft", async () => {
    await mount(karte(zustand({ belegung: "B", verlauf: [lage({ status: "closed" })] })));
    await weiter(AKTUALISIERUNGS_TAKT_MS * 4);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("laesst ein unsichtbares Dokument in Ruhe — kein Refresh im Hintergrundtab", async () => {
    await mount(karte(zustand({ belegung: "D", laufend: laufendeLage({ antworten: 7 }) })));
    sichtbarkeit("hidden");

    await weiter(AKTUALISIERUNGS_TAKT_MS * 3);
    expect(refreshMock).not.toHaveBeenCalled();

    // Und nimmt den Takt wieder auf, sobald die Karte wieder angesehen wird —
    // der Tab muss nicht neu geladen werden.
    sichtbarkeit("visible");
    await weiter(AKTUALISIERUNGS_TAKT_MS);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("stellt den Takt beim Verlassen der Seite ab", async () => {
    await mount(karte(zustand({ belegung: "C", laufend: laufendeLage({ antworten: 0 }) })));
    await unmount();
    await weiter(AKTUALISIERUNGS_TAKT_MS * 3);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("aktualisiert auf Knopfdruck sofort, ohne bis zu 30 s zu warten", async () => {
    await mount(karte(zustand({ belegung: "D", laufend: laufendeLage({ antworten: 7 }) })));
    const knopf = queryAll("button").find((b) => (b.textContent ?? "").trim() === "Aktualisieren");
    expect(knopf).toBeDefined();

    await clickElement(knopf!);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("Fusszeile der laufenden Karte (§2.3, §4.14)", () => {
  const z = zustand({ belegung: "D", laufend: laufendeLage({ antworten: 7 }) });

  it("traegt „Stand“ UND den Textknopf „Aktualisieren“", () => {
    const wirt = zeichne(karte(z));
    expect(wirt.textContent).toContain(`Stand: ${formatUhrzeit(JETZT)}`);
    const knopf = [...wirt.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Aktualisieren",
    );
    expect(knopf).toBeDefined();
    // Textknopf, kein zweiter Primaerknopf: pro Seite gibt es genau einen (§2.6).
    expect(knopf!.className).toContain("ant-btn-text");
    expect(knopf!.className).not.toContain("ant-btn-primary");
  });

  it("haelt die Knopfbeschriftung AUSSERHALB der Live-Region", () => {
    const wirt = zeichne(karte(z));
    const lebend = wirt.querySelectorAll('[aria-live="polite"]');
    // §4.14: genau einmal im ganzen Modul, und zwar an der Stand-Zeile.
    expect(lebend.length).toBe(1);
    expect(lebend[0].textContent).toBe(`Stand: ${formatUhrzeit(JETZT)}`);
    expect(lebend[0].querySelector("button")).toBeNull();
  });

  it("rendert die Insel selbst nichts — sie ist nur ein Takt", () => {
    const markup = renderToStaticMarkup(<Aktualisierer />);
    expect(markup).toBe("");
    // Kein zweites `aria-live`, keine Ersatzflaeche (§2.3: „rendert nichts“).
    expect(ohneKommentare(quelle("Aktualisierer.tsx"))).toContain("return null");
  });
});

describe("StartFormular — Fehler am Feld statt technischer Fehlerseite (§4.4)", () => {
  const formular = (
    <StartFormular groupId={7} heute="2026-07-22" teilnehmerVorbelegung={20} stunden={48} />
  );

  it("uebergibt startFeedbackAction an useActionState", () => {
    zeichne(formular);
    expect(useActionStateMock).toHaveBeenCalledWith(startFeedbackActionMock, { ok: true });
  });

  it("zeigt den Feldfehler am Feld und behaelt die Eingaben", () => {
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { date: "Datum fehlt" },
        values: { date: "", topic: "Funkübung", participantCount: "18" },
      } satisfies FormState,
      () => {},
      false,
    ]);
    const wirt = zeichne(formular);

    const feld = wirt.querySelector('input[name="date"]')!;
    expect(feld.getAttribute("aria-invalid")).toBe("true");
    const meldungsId = feld.getAttribute("aria-describedby")!;
    expect(wirt.querySelector(`#${meldungsId}`)?.textContent).toContain("Datum fehlt");
    // 1px-Rahmen von antd ist der vierte, farbige Kanal — erlaubt (§4.4).
    expect(feld.className).toContain("ant-input-status-error");
    // Eingaben gehen nie verloren.
    expect(wirt.querySelector('input[name="topic"]')?.getAttribute("value")).toBe("Funkübung");
    expect(wirt.querySelector('input[name="participantCount"]')?.getAttribute("value")).toBe("18");
  });

  it("sperrt den Primaerknopf waehrend des Absendens, ohne die Beschriftung zu wechseln (§4.5)", () => {
    useActionStateMock.mockImplementation(() => [{ ok: true } satisfies FormState, () => {}, true]);
    const wirt = zeichne(formular);
    const knopf = [...wirt.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Feedback starten"),
    )!;

    expect(knopf.hasAttribute("disabled")).toBe(true);
    expect(knopf.className).toContain("ant-btn-loading");
    expect(knopf.textContent).toContain("Feedback starten");
  });

  it("rechnet die Frist aus dem gewaehlten Datum, nicht aus „jetzt + Stunden“", () => {
    const t = text(formular);
    expect(t).toContain(formatZeitpunkt(computeClosesAt(tag("2026-07-22"), 48)));
    expect(t).not.toContain("48 Stunden");
  });

  it("belegt das Datum mit heute in Europe/Berlin vor", () => {
    const wirt = zeichne(formular);
    expect(wirt.querySelector('input[name="date"]')?.getAttribute("value")).toBe("2026-07-22");
    // Nie `toISOString()`: zwischen 00:00 und 02:00 Ortszeit kippt es auf den Vortag.
    expect(ohneKommentare(quelle("datum.ts"))).not.toContain("toISOString");
  });
});

describe("BeendenKnopf", () => {
  it("ist ein geplanter Schritt, keine Gefahr, und nennt die Folge", () => {
    const wirt = zeichne(<BeendenKnopf surveyId={11} />);
    const knopf = wirt.querySelector("button")!;

    expect(knopf.textContent).toContain("Feedback jetzt beenden");
    expect(knopf.className).not.toContain("dangerous");
    const code = ohneKommentare(quelle("BeendenKnopf.tsx"));
    expect(code).not.toMatch(/\bdanger\b/);
    expect(code).toContain("Danach kann niemand mehr antworten. Die Auswertung bleibt erhalten.");
    expect(code).toContain("beendeFeedbackAction");
  });
});

describe("Zeitangaben in Europe/Berlin", () => {
  it("formatiert Mitternacht UTC als denselben Kalendertag", () => {
    // `evenings.date` ist Mitternacht UTC — in Berlin 01:00/02:00 desselben Tages.
    expect(formatDatumKurz(tag("2026-07-22"))).toBe("Mi., 22.07.");
    expect(formatDatumKurz(tag("2026-01-01"))).toBe("Do., 01.01.");
  });

  it("nennt Uhrzeit und Zeitpunkt in Ortszeit", () => {
    expect(formatUhrzeit(new Date("2026-07-22T17:32:00Z"))).toBe("19:32");
    // Ende des Abendtags in Ortszeit (25.07., 00:00) plus 48 Stunden — die Frist
    // haengt am Abend, nicht am Klick, und wird hier nur formatiert.
    expect(formatZeitpunkt(computeClosesAt(tag("2026-07-24"), 48))).toBe("Mo., 27.07., 00:00");
  });

  it("liefert heute als ISO-Tag der Zone", () => {
    expect(heuteInZone(new Date("2026-07-24T23:30:00Z"))).toBe("2026-07-25");
    expect(heuteInZone(new Date("2026-07-24T00:30:00Z"))).toBe("2026-07-24");
  });
});

/**
 * „QR-CODE GROSS ZEIGEN" IN JEDER BELEGUNG (§2.3-Tabelle, §2.4 J-B-2).
 *
 * Der Knopf ist der zeitkritische Handgriff im Gruppenraum: am Ende des Abends
 * muss der Code in zwei Metern Entfernung lesbar sein. Zone a leistet das nicht
 * — auf 390px steht sie an DOM-Position 3 und ist im Zustand RUHEND nicht
 * immer sichtbar. Deshalb hängt der Knopf an der Lagekarte, und deshalb wird
 * jede der vier Belegungen einzeln geprüft: ein Knopf, der in einem Zustand
 * fehlt, fehlt genau an dem Abend, an dem ihn jemand braucht.
 *
 * Die ROLLE wird mitgeprüft, nicht nur die Anwesenheit: es gibt genau EINEN
 * Primärknopf pro Seite (§2.6). In C/D ist das dieser Knopf, in A/B ist es
 * „Feedback starten" — dort darf er es nicht auch sein.
 */
describe("Lagekarte — „QR-Code groß zeigen“ ist in jeder Belegung erreichbar", () => {
  it("Belegung A: Sekundäraktion nach „Feedback starten“, nicht der Primärknopf", () => {
    const z = zustand({ belegung: "A", modus: "einrichtung" });

    const qr = knopfMit(z, QR_KNOPF);
    expect(qr.className).not.toContain("ant-btn-primary");
    expect(knopfMit(z, "Feedback starten").className).toContain("ant-btn-primary");
    expect(stelle(z, QR_KNOPF)).toBeGreaterThan(stelle(z, "Feedback starten"));
    /*
     * Der Knopf steht IM `<form>` des Startformulars (dort gehoert die
     * Sekundaeraktion neben den Primaerknopf). Waere er `type="submit"`, wuerde
     * „QR-Code gross zeigen" eine UMFRAGE STARTEN — antds Vorgabe ist `button`,
     * und genau das wird hier festgehalten, weil `QrGross.test.tsx` die
     * Komponente allein mountet und den Nebeneffekt nie sehen koennte.
     */
    expect(qr.getAttribute("type")).toBe("button");
    expect(qr.closest("form")).not.toBeNull();
  });

  it("Belegung B: Sekundäraktion nach „Feedback starten“, nicht der Primärknopf", () => {
    const z = zustand({
      belegung: "B",
      modus: "betrieb",
      verlauf: [lage({ id: 2, status: "closed", antworten: 4 })],
    });

    expect(knopfMit(z, QR_KNOPF).className).not.toContain("ant-btn-primary");
    expect(stelle(z, QR_KNOPF)).toBeGreaterThan(stelle(z, "Feedback starten"));
  });

  it("Belegung C: Primäraktion VOR „Feedback jetzt beenden“", () => {
    const z = zustand({ belegung: "C", modus: "betrieb", laufend: laufendeLage({ antworten: 0 }) });

    expect(knopfMit(z, QR_KNOPF).className).toContain("ant-btn-primary");
    expect(knopfMit(z, "Feedback jetzt beenden").className).not.toContain("ant-btn-primary");
    expect(stelle(z, QR_KNOPF)).toBeLessThan(stelle(z, "Feedback jetzt beenden"));
  });

  it("Belegung D: Primäraktion VOR „Feedback jetzt beenden“", () => {
    const z = zustand({
      belegung: "D",
      modus: "betrieb",
      laufend: laufendeLage({ antworten: 12, teilnehmer: 20 }),
    });

    expect(knopfMit(z, QR_KNOPF).className).toContain("ant-btn-primary");
    expect(stelle(z, QR_KNOPF)).toBeLessThan(stelle(z, "Feedback jetzt beenden"));
  });

  it("gibt dem Modal die vollständige Adresse — nicht den Rohtoken", () => {
    const z = zustand({ belegung: "C", modus: "betrieb", laufend: laufendeLage({ antworten: 0 }) });
    // Der Knopf traegt die Adresse als Prop; sichtbar wird sie erst im Modal
    // (`QrGross.test.tsx`). Hier zaehlt, dass die Karte sie DURCHREICHT und
    // nicht selbst einen Token zusammensetzt.
    const code = ohneKommentare(quelle("Lagekarte.tsx"));
    expect(code).toContain("url={teilnahmeUrl}");
    expect(code).not.toContain("buildToken");
    expect(knoepfe(z).some((b) => (b.textContent ?? "").includes(QR_KNOPF))).toBe(true);
  });
});

/**
 * MOBILE WERTE (§2.1 „Kartenstil (alle Zonen) … mobil `body.padding: 16`").
 *
 * Ein zu grosses Kartenpolster auf 390px fällt in keinem Test auf — deshalb
 * werden hier der Wert IM MARKUP und die Regel IM STYLESHEET geprüft, nicht
 * das Ergebnis im Browser.
 *
 * §4.14 „Mobile Feldschrift" stand frueher als eigener Test in diesem Block
 * (`.fb-form input/textarea/.ant-select-selector` in `feedback.css`, nur unter
 * 600px). Seit der Zoom suiteweit gesperrt ist (`app/layout.tsx`) gilt die
 * 16px-Untergrenze fuer Eingabefelder in JEDEM Modul, nicht nur `feedback` —
 * die Regel liegt jetzt ohne Breakpoint in `app/globals.css` und wird von
 * `core/theme/feldschrift.test.ts` geprueft (dort auch der Test, dass keine
 * CSS-Datei der Suite eine Eingabe-Regel unter 16px versteckt). Ein lokaler
 * Test hier waere Doppelung ohne zusaetzliche Sicherheit.
 *
 * Warum eine CSS-Variable und keine Klasse: `styles.body` ist bei antd ein
 * INLINE-Style. Eine Klasse `.fb-karte-body { padding: 16px }` verliert gegen
 * `style="padding:20px"` — dieselbe Falle, die `.fb-legende-woerter` und
 * `.fb-sticky` im Stylesheet dokumentieren. Die Karte reicht deshalb nur den
 * Variablennamen ein, und die Medienabfrage sitzt an der Variable.
 */
describe("Mobile Werte — Kartenpolster", () => {
  const kartenRumpf = (z: CockpitZustand): HTMLElement => {
    const rumpf = zeichne(karte(z)).querySelector<HTMLElement>(".ant-card-body");
    if (!rumpf) throw new Error("Kein Kartenrumpf gerendert");
    return rumpf;
  };

  it("polstert die ruhende Karte über die Variable, nicht mit einer festen 20", () => {
    const rumpf = kartenRumpf(zustand({ belegung: "A", modus: "einrichtung" }));
    const stil = rumpf.getAttribute("style");
    expect(stil).toContain("padding:var(--fb-kartenpolster)");
    expect(stil).not.toMatch(/padding:\s*20px/);
  });

  it("polstert die laufende Karte genauso — ein Wert, nicht einer pro Belegung", () => {
    const z = zustand({ belegung: "D", modus: "betrieb", laufend: laufendeLage({ antworten: 12 }) });
    const stil = kartenRumpf(z).getAttribute("style");
    expect(stil).toContain("padding:var(--fb-kartenpolster)");
    // Die Tönung bleibt: sie ist die Flächenaussage „hier läuft etwas" (§2.3).
    expect(stil).toContain("var(--fb-tint)");
  });

  it("setzt die Variable auf 20 und unter 767.98px auf 16", () => {
    const css = quelle("feedback.css");
    expect(css).toMatch(/:root\s*\{[^}]*--fb-kartenpolster:\s*20px/);

    const stelleMobil = css.indexOf("--fb-kartenpolster: 16px");
    expect(stelleMobil).toBeGreaterThan(-1);
    // Die 16 liegt IN einer Medienabfrage — sonst waere sie der neue Grundwert.
    const davor = css.slice(0, stelleMobil);
    expect(davor.lastIndexOf("@media (max-width: 767.98px)")).toBeGreaterThan(
      davor.lastIndexOf("}"),
    );
  });
});

describe("Quelltext-Assertionen — die RSC-Grenze und die Farb-Klausel", () => {
  it("haelt die Lagekarte serverfest: kein `use client`, kein Compound-Zugriff, keine Funktions-Props", () => {
    const code = ohneKommentare(quelle("Lagekarte.tsx"));
    expect(code).not.toContain("use client");
    // Falle 1 (§4.13): Compound-Zugriff auf antd in einer Server Component = HTTP 500.
    for (const compound of [
      "Typography.",
      "Form.Item",
      "Descriptions.Item",
      "List.Item",
      "Card.Meta",
      "Collapse.Panel",
      "Breadcrumb.Item",
      "Input.TextArea",
      "Space.Compact",
      "Table.Summary",
      "Grid.useBreakpoint",
    ]) {
      expect(code).not.toContain(compound);
    }
    // Falle 2: Funktions-Props kann eine Server Component nicht uebergeben.
    expect(code).not.toMatch(/\b(formatter|onChange|onConfirm|onRow)=/);
    // `Space` nimmt `orientation`, nicht `direction` (antd 6).
    expect(code).not.toMatch(/direction=/);
  });

  it("faerbt nirgends eine Datenflaeche rot (Farb-Klausel §4.9)", () => {
    for (const datei of [
      "Lagekarte.tsx",
      "StartFormular.tsx",
      "BeendenKnopf.tsx",
      "Aktualisierer.tsx",
      "datum.ts",
    ]) {
      const code = ohneKommentare(quelle(datei));
      expect(code.toLowerCase()).not.toContain("#c8000f");
      expect(code).not.toMatch(/\bdanger\b/);
      expect(code).not.toMatch(/type="error"/);
    }
  });

  it("baut das Rezept der Transaktion nicht nach", () => {
    // Die Karte startet ueber die Action; `createAndStartSurvey` bleibt die
    // EINE Stelle mit der Ein-aktive-Invariante.
    const code = ohneKommentare(quelle("StartFormular.tsx"));
    expect(code).toContain("startFeedbackAction");
    expect(code).not.toContain("insertEvening");
    expect(code).not.toContain("activateSurvey");
  });
});

/**
 * DER WEG ZUR TEILNEHMERZAHL DES LAUFENDEN ABENDS (2.4, wortgenau).
 *
 * `cockpitZustand.verlauf` schliesst den laufenden Abend aus (2.2) — Zone d zeigt
 * ihn also nicht, und ohne diesen Textknopf waere genau der Hauptfall
 * unerreichbar: die Teilnehmerzahl ist der Nenner jeder Ruecklaufquote und wird
 * typischerweise erst am Abend selbst bekannt. Am selben Weg haengt die einzige
 * erreichbare Datumskorrektur eines laufenden Abends, und damit die Neuankerung
 * der Frist in `updateEveningAction`.
 */
describe("Lagekarte — „Teilnehmerzahl nachtragen“ (2.4)", () => {
  const ohneNenner = zustand({
    belegung: "D",
    modus: "betrieb",
    laufend: laufendeLage({ id: 42, antworten: 12, teilnehmer: null }),
  });

  it("bietet den Textknopf genau dann an, wenn es keinen Nenner gibt", () => {
    expect(zeichne(karte(ohneNenner)).textContent).toContain("Teilnehmerzahl nachtragen");

    const mitNenner = zustand({
      belegung: "D",
      modus: "betrieb",
      laufend: laufendeLage({ antworten: 12, teilnehmer: 20 }),
    });
    expect(zeichne(karte(mitNenner)).textContent).not.toContain("Teilnehmerzahl nachtragen");
  });

  /**
   * BELEGUNG C IST DER HAUPTFALL, nicht der Randfall: die Teilnehmerzahl wird
   * typischerweise am Abend eingetragen, also BEVOR die erste Rueckmeldung da
   * ist. Stand der Knopf im `else`-Zweig der `nullAntworten`-Ternaere, gab es in
   * genau diesem Zustand keinen einzigen Weg zu `updateEveningAction` — `verlauf`
   * schliesst den laufenden Abend aus (`cockpit.ts:96`), und damit war auch die
   * Neuankerung von `closesAt` bei einer Datumskorrektur unerreichbar.
   *
   * Der Entwurf knuepft den Knopf an „Fehlt `participantCount`"
   * (feedback-admin.md:291), NICHT an „es gibt schon Rueckmeldungen".
   */
  it("bietet ihn auch in Belegung C an — 0 Rueckmeldungen, kein Nenner", () => {
    const c = zustand({
      belegung: "C",
      modus: "betrieb",
      laufend: laufendeLage({ id: 42, antworten: 0, teilnehmer: null }),
    });
    const t = zeichne(karte(c)).textContent ?? "";
    // Der Satz aus Belegung C bleibt — der Knopf tritt NEBEN ihn, nicht an
    // seine Stelle (§2.3, Zeile 249 der Entwurfstabelle).
    expect(t).toContain("Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends.");
    expect(t).toContain("Teilnehmerzahl nachtragen");
  });

  it("laesst ihn in Belegung C weg, sobald ein Nenner steht", () => {
    const c = zustand({
      belegung: "C",
      modus: "betrieb",
      laufend: laufendeLage({ antworten: 0, teilnehmer: 20 }),
    });
    expect(zeichne(karte(c)).textContent).not.toContain("Teilnehmerzahl nachtragen");
  });

  it("oeffnet die Zeilenbearbeitung des LAUFENDEN Abends und schickt sie ab", async () => {
    await mount(karte(ohneNenner));

    const knopf = [...document.querySelectorAll<HTMLElement>("button")].find(
      (b) => (b.textContent ?? "").trim() === "Teilnehmerzahl nachtragen",
    );
    if (!knopf) throw new Error("Kein Knopf „Teilnehmerzahl nachtragen“");
    await clickElement(knopf);

    const form = document.querySelector<HTMLFormElement>("form[data-testid='abend-bearbeiten']");
    if (!form) throw new Error("Keine Zeilenbearbeitung geoeffnet");
    // Der LAUFENDE Abend, nicht irgendeiner: `id` und Datum kommen aus `laufend`.
    expect(form.querySelector<HTMLInputElement>("input[name='id']")!.value).toBe("42");
    expect(form.querySelector<HTMLInputElement>("input[name='date']")!.value).toBe("2026-07-22");
    expect(form.querySelector<HTMLInputElement>("input[name='participantCount']")!.value).toBe("");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(updateEveningActionMock).toHaveBeenCalledTimes(1);
    const daten = updateEveningActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("id")).toBe("42");
    expect(daten.get("date")).toBe("2026-07-22");
    expect(daten.has("participantCount")).toBe(true);
  });
});
