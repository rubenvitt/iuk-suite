// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DIE ZUORDNUNG DER LEITUNG (Entwurf §2.6 Punkt 2).
 *
 * Ohne diese Oberflaeche sieht in Produktion kein Gruppenleiter seine Gruppe:
 * `user_groups` war ausschliesslich per Datenbankeingriff fuellbar. Vier Zusagen,
 * die still brechen:
 *
 * 1. ENTFERNEN FUNKTIONIERT, NICHT NUR HINZUFUEGEN. Eine Fehlzuordnung ohne
 *    Entfernen-Aktion ist wieder ein Datenbankeingriff.
 * 2. NAMEN, NICHT NUR KENNUNGEN. Eine Tabelle aus `sub`-UUIDs ist nicht
 *    pruefbar; wer noch keinen Anzeigenamen hat, bekommt den Satz „hat sich noch
 *    nicht angemeldet" statt einer leeren Zelle.
 * 3. FEHLER AM FELD, NICHT ALS ALERT (§4.4). „Diese E-Mail ist unbekannt" ist
 *    eine Feldaussage; ein `Alert type="error"` waere zusaetzlich ein Bruch der
 *    Farb-Klausel (§4.9).
 * 4. ROT IST HIER VERBOTEN (§4.9): `colorError === colorPrimary === #c8000f`.
 *    Kein `type="primary" danger`, kein `Alert type="error"`.
 */

const {
  useActionStateMock,
  addGroupLeaderActionMock,
  removeGroupLeaderActionMock,
  suchePersonenActionMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  addGroupLeaderActionMock: vi.fn(),
  removeGroupLeaderActionMock: vi.fn(),
  suchePersonenActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});
// Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
// nach — hier interessiert nur, DASS die richtige mit dem richtigen Schluessel
// gerufen wird.
vi.mock("../actions", () => ({
  addGroupLeaderAction: addGroupLeaderActionMock,
  removeGroupLeaderAction: removeGroupLeaderActionMock,
  suchePersonenAction: suchePersonenActionMock,
}));

import { Zuordnung, type ZuordnungPerson } from "./Zuordnung";
import type { FormState } from "../_lib/formState";
import { act } from "react";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  rerender,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const quelle = () =>
  readFileSync(join(process.cwd(), "src/app/m/feedback/_ui/Zuordnung.tsx"), "utf8");

const PERSONEN: ZuordnungPerson[] = [
  { userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" },
  { userId: "sub-neu", name: null, email: null },
];

const markup = (personen: ZuordnungPerson[] = PERSONEN) =>
  renderToStaticMarkup(<Zuordnung groupId={7} personen={personen} />);

beforeEach(() => {
  useActionStateMock.mockReset();
  removeGroupLeaderActionMock.mockReset();
  useActionStateMock.mockImplementation((_action: unknown, init: FormState) => [
    init,
    () => {},
    false,
  ]);
});
afterEach(async () => {
  await unmount();
});

describe("Zuordnung — die Liste", () => {
  it("nennt zugeordnete Personen mit Namen und Kennung", () => {
    const t = markup();
    expect(t).toContain("Anna Beispiel");
    expect(t).toContain("sub-anna");
  });

  it("ohne Anzeigenamen steht: Name unbekannt", () => {
    // Hier stand einmal „hat sich noch nicht angemeldet" — eine Vermutung ueber
    // die Ursache. Kein Name heisst nur: keine der beiden Quellen kennt einen.
    expect(markup()).toContain("Name unbekannt");
    expect(markup()).not.toContain("hat sich noch nicht angemeldet");
  });

  it("leer ist ein Zustand, keine leere Tabelle (§4.3)", () => {
    const t = markup([]);
    expect(t).toContain("Niemand einzeln zugeordnet");
  });

  /**
   * KEINE AUSSAGE UEBER SICHTBARKEIT im Leerzustand. `memberGroupIdsFor`
   * (`queries.ts:38-55`) gewaehrt Zugang zusaetzlich ueber das Fachgruppen-
   * Attribut per Abgleich mit `groups.slug` — der uebliche Weg im Projekt (siehe
   * `alsGruppenleitung` in `actions.test.ts`). Eine leere `user_groups`-Liste ist
   * deshalb NICHT „nur fuer Admins sichtbar", und dieser Test haelt die
   * Falschaussage draussen, statt sich auf den Wortlaut zu verlassen.
   */
  it("behauptet im Leerzustand nicht, nur Admins koennten die Gruppe sehen", () => {
    const t = markup([]);
    expect(t).not.toContain("nur Admins");
    // Der Fachgruppen-Weg wird stattdessen benannt.
    expect(t).toContain("Fachgruppen-Attribut");
  });

  it("bietet zu jeder Person eine Entfernen-Aktion", () => {
    const t = markup();
    expect(t.match(/Entfernen/g) ?? []).toHaveLength(2);
  });
});

describe("Zuordnung — Entfernen", () => {
  it("ruft removeGroupLeaderAction mit Gruppe und Kennung", async () => {
    await mount(<Zuordnung groupId={7} personen={PERSONEN} />);

    await clickElement(query('[data-testid="entfernen-sub-anna"]'));

    expect(removeGroupLeaderActionMock).toHaveBeenCalledTimes(1);
    const daten = removeGroupLeaderActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("groupId")).toBe("7");
    expect(daten.get("userId")).toBe("sub-anna");
  });
});

describe("Zuordnung — Hinzufuegen", () => {
  it("uebergibt addGroupLeaderAction an useActionState", () => {
    markup();
    expect(useActionStateMock).toHaveBeenCalledWith(addGroupLeaderActionMock, { ok: true });
  });

  it("traegt Gruppe und Eingabefeld im Formular", async () => {
    await mount(<Zuordnung groupId={7} personen={PERSONEN} />);

    expect(query<HTMLInputElement>('input[name="groupId"]').value).toBe("7");
    expect(queryAll('input[name="kennung"]')).toHaveLength(1);
  });

  it("beschriftet den Knopf wortgenau: Kennung oder E-Mail hinzufügen", () => {
    expect(markup()).toContain("Kennung oder E-Mail hinzufügen");
  });

  it("zeigt den Serverfehler AM FELD, mit aria-invalid und Verweis", () => {
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { kennung: "Diese E-Mail ist unbekannt." },
        values: { kennung: "wer@drk.example" },
      } satisfies FormState,
      () => {},
      false,
    ]);

    const t = markup();
    expect(t).toContain("Diese E-Mail ist unbekannt.");
    expect(t).toContain('aria-invalid="true"');
    // Die Eingabe geht nicht verloren (§4.4).
    expect(t).toContain("wer@drk.example");
  });
});

describe("Zuordnung — Farb-Klausel (§4.9)", () => {
  it("kein type=\"primary\" mit danger und kein Alert type=\"error\"", () => {
    const src = quelle();
    expect(src).not.toMatch(/type="primary"[^>]*danger/);
    expect(src).not.toMatch(/danger[^>]*type="primary"/);
    expect(src).not.toContain('type="error"');
  });
});

/**
 * DAS AUTOFILL AUS DEM PERSONENVERZEICHNIS.
 *
 * Der behobene Befund: `known_users` fuellt sich erst, wenn jemand das Modul
 * betreten hat — wer nie da war, war nicht zuordenbar, und am Cutover-Tag ist
 * das der Normalfall. Vier Zusagen, jede still brechbar:
 *
 * 1. DIE AUSWAHL SCHREIBT DEN `sub`. Ein Anzeigename im abgeschickten Feld
 *    erzeugt eine Zeile in `user_groups`, die richtig aussieht und nie wirkt.
 * 2. „NOCH NIE ANGEMELDET" IST KEIN FEHLER. Es wird genannt, nicht bestraft —
 *    und nicht rot (§4.9: `colorError === colorPrimary === #c8000f`).
 * 3. OHNE VERZEICHNIS KEINE COMBOBOX. Eine Combobox, die nie Vorschlaege zeigt,
 *    ist eine Zusage, die die Oberflaeche nicht halten kann.
 * 4. DIE SUCHE DARF NICHTS MITREISSEN. Wirft sie, bleibt das Feld bedienbar.
 */

/** Das sichtbare Suchfeld. Es traegt bewusst KEIN `name` — sonst kaeme der Anzeigetext mit. */
const SUCHFELD = "#fb-kennung";

const VORSCHLAEGE = [
  {
    userId: "sub-nie",
    name: "Nie Da",
    email: "nie@drk.example",
    angemeldet: false,
  },
  {
    userId: "sub-anna",
    name: "Anna Beispiel",
    email: "anna@drk.example",
    angemeldet: true,
  },
];

/** Debounce plus Mikrotasks der Server-Action durchlaufen lassen. */
async function warteAufSuche(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

/** Die Vorschlagsliste haengt in einem Portal an `document.body`, nicht im Host. */
function vorschlagsknoten(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".ant-select-item-option"));
}

async function mitVerzeichnis(personen: ZuordnungPerson[] = PERSONEN): Promise<void> {
  await mount(
    <Zuordnung groupId={7} personen={personen} verzeichnisAktiv sucheVerzoegerungMs={0} />,
  );
}

async function tippe(wert: string): Promise<void> {
  await fill(SUCHFELD, wert);
  await warteAufSuche();
}

describe("Zuordnung — Autofill", () => {
  beforeEach(() => {
    suchePersonenActionMock.mockReset();
    suchePersonenActionMock.mockResolvedValue(VORSCHLAEGE);
  });

  it("mit Verzeichnis heisst der Knopf nach der Person, nicht nach der Kennung", () => {
    const t = renderToStaticMarkup(
      <Zuordnung groupId={7} personen={PERSONEN} verzeichnisAktiv />,
    );

    expect(t).toContain("Person hinzufügen");
    expect(t).toContain("Name, E-Mail oder Kennung");
  });

  it("nennt Personen ohne Anmeldung als Normalfall, nicht als Voraussetzung", () => {
    const t = renderToStaticMarkup(
      <Zuordnung groupId={7} personen={PERSONEN} verzeichnisAktiv />,
    );

    expect(t).toContain("auch Personen, die hier noch nie waren");
    // Der alte Notbehelf-Satz waere jetzt eine Falschaussage.
    expect(t).not.toContain("damit ihre E-Mail bekannt ist");
  });

  it("OHNE Verzeichnis bleibt alles beim Alten — keine Combobox, alter Hinweis", () => {
    const t = renderToStaticMarkup(<Zuordnung groupId={7} personen={PERSONEN} />);

    expect(t).toContain("Die Person muss die Verwaltung einmal geöffnet haben");
    expect(t).toContain("Kennung oder E-Mail hinzufügen");
    expect(t).not.toContain("role=\"combobox\"");
  });

  it("fragt die Suche serverseitig, sobald zwei Zeichen stehen", async () => {
    await mitVerzeichnis();

    await tippe("an");

    expect(suchePersonenActionMock).toHaveBeenCalledWith("an");
  });

  it("unter zwei Zeichen wird gar nicht gesucht", async () => {
    await mitVerzeichnis();

    await tippe("a");

    expect(suchePersonenActionMock).not.toHaveBeenCalled();
  });

  it("zeigt Treffer mit Namen — und nennt den fehlenden Verwaltungsbesuch neutral daneben", async () => {
    await mitVerzeichnis();

    await tippe("an");

    const text = vorschlagsknoten()
      .map((k) => k.textContent ?? "")
      .join(" | ");
    expect(text).toContain("Nie Da");
    expect(text).toContain("Anna Beispiel");
    expect(text).toContain("noch nie in der Verwaltung");
    // „angemeldet" waere die falsche Auskunft: `known_users` fuellt sich erst
    // beim Betreten der Verwaltung, nicht beim Anmelden an der Suite.
    expect(text).not.toContain("noch nie angemeldet");
  });

  /**
   * DIE KENNUNG UNTER JEDEM VORSCHLAG — die Zusage, an der die Zuordnung haengt.
   *
   * Hier stand `p.email ?? p.userId`: die Adresse verdraengte die Kennung. Weil
   * die E-Mail im Verzeichnis ein OPTIONALES Feld ist und ausserdem nicht
   * eindeutig sein muss, waren mehrere Konten derselben Person fuer den Admin
   * drei identische Zeilen — und die falsche Wahl schreibt eine
   * `user_groups`-Zeile, die niemand einloest.
   *
   * Der Test nimmt deshalb bewusst zwei Personen mit DERSELBEN E-Mail und
   * demselben Namen. Genau der Fall aus dem Betrieb, und ohne die Kennung
   * waeren beide Zeilen zeichengleich.
   */
  it("jeder Vorschlag traegt seine Kennung — auch wenn E-Mail und Name gleich sind", async () => {
    suchePersonenActionMock.mockResolvedValue([
      { userId: "sub-eins", name: "Ruben Vitt", email: "rv@drk.example", angemeldet: false },
      { userId: "sub-zwei", name: "Ruben Vitt", email: "rv@drk.example", angemeldet: true },
    ]);
    await mitVerzeichnis();
    await tippe("ru");

    const zeilen = vorschlagsknoten().map((k) => k.textContent ?? "");
    expect(zeilen.some((z) => z.includes("sub-eins"))).toBe(true);
    expect(zeilen.some((z) => z.includes("sub-zwei"))).toBe(true);
    // Und die zwei Zeilen sind wirklich verschieden — sonst haette der Test oben
    // auch bestanden, wenn beide Kennungen in EINER Zeile staenden.
    expect(new Set(zeilen).size).toBe(zeilen.length);
  });

  it("DIE AUSWAHL SCHREIBT DEN sub, nicht Name oder E-Mail", async () => {
    await mitVerzeichnis();
    await tippe("an");

    const nieDa = vorschlagsknoten().find((k) => (k.textContent ?? "").includes("Nie Da"));
    if (!nieDa) throw new Error("Vorschlag 'Nie Da' nicht gefunden");
    await clickElement(nieDa);

    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("sub-nie");
    // Und sichtbar steht weiter etwas Lesbares — eine UUID im Feld ist nicht pruefbar.
    expect(query<HTMLInputElement>(SUCHFELD).value).toContain("Nie Da");
  });

  it("ohne Auswahl geht die rohe Eingabe durch — der alte Weg bleibt offen", async () => {
    await mitVerzeichnis();

    await tippe("sub-von-hand");

    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("sub-von-hand");
  });

  it("es bleibt bei GENAU EINEM Feld namens kennung", async () => {
    await mitVerzeichnis();

    expect(queryAll('input[name="kennung"]')).toHaveLength(1);
    expect(query<HTMLInputElement>('input[name="groupId"]').value).toBe("7");
  });

  it("AUSFALL: wirft die Suche, bleibt das Feld bedienbar und die Eingabe erhalten", async () => {
    suchePersonenActionMock.mockRejectedValue(new Error("Forbidden"));
    await mitVerzeichnis();

    await tippe("anna@drk.example");

    expect(vorschlagsknoten()).toHaveLength(0);
    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("anna@drk.example");
  });

  it("die Tabelle nennt fehlende Anmeldung auch bei bekanntem Namen", () => {
    const t = renderToStaticMarkup(
      <Zuordnung
        groupId={7}
        personen={[
          { userId: "sub-nie", name: "Nie Da", email: "nie@drk.example", angemeldet: false },
        ]}
        verzeichnisAktiv
      />,
    );

    expect(t).toContain("Nie Da");
    // GENAU EINMAL, naemlich in der Zeile. Bis 2026-07-28 stand die Formulierung
    // ein zweites Mal im Hinweis unter dem Formular („auch Personen, die sich
    // noch nie angemeldet haben"), und der Test zaehlte auf 2. Der Hinweis sagt
    // jetzt „die hier noch nie waren" — dieselbe Aussage, ohne das falsche Wort.
    expect(t.match(/noch nie in der Verwaltung/g) ?? []).toHaveLength(1);
    // Die Kennung bleibt sichtbar: sie ist der Wert, der wirklich gespeichert ist.
    expect(t).toContain("sub-nie");
  });

  it("ohne Angabe zum Verwaltungsbesuch wird nichts behauptet", () => {
    const t = renderToStaticMarkup(
      <Zuordnung
        groupId={7}
        personen={[{ userId: "sub-x", name: "Wer Auch Immer", email: null }]}
        verzeichnisAktiv
      />,
    );

    // Die Zeile behauptet nichts — und der Hinweis unter dem Formular sagt es
    // seit 2026-07-28 auch nicht mehr mit diesen Worten.
    expect(t.match(/noch nie in der Verwaltung/g) ?? []).toHaveLength(0);
  });
});

/**
 * DER RUECKSETZER UND DIE FEHLERANBINDUNG DES SUCHFELDES (§4.4).
 *
 * Beide Zusagen sind auf dem alten, unkontrollierten Feld selbstverstaendlich —
 * React setzt Formulare nach einer Action selbst zurueck, und `aria-invalid` am
 * `Input` landet garantiert am Eingabeelement. Die Combobox muss KONTROLLIERT
 * sein, damit die Auswahl den `sub` setzen kann; beide Selbstverstaendlichkeiten
 * fallen damit weg und muessen einzeln belegt werden:
 *
 * 1. NACH ERFOLG IST DAS FELD LEER. Sonst steht die eben zugeordnete Person noch
 *    drin, samt geladenem `sub` im versteckten Feld — und die naechste Zuordnung
 *    ist aus Versehen dieselbe. `FORM_START` und ein erfolgreiches Ergebnis sind
 *    BEIDE `{ ok: true }`; ein Ruecksetzer, der nur den Wert vergleicht, sieht
 *    diesen Fall nicht.
 * 2. NACH EINEM FELDFEHLER IST DIE EINGABE NOCH DA (§4.4: sie geht nie verloren).
 * 3. DER FEHLER HAENGT AM EINGABEELEMENT, nicht am Rahmen-`div`. Sonst liest ein
 *    Screenreader die Meldung nie vor, und §4.4 ist nur optisch erfuellt.
 */
describe("Zuordnung — Suchfeld nach dem Serverergebnis", () => {
  const feld = () => (
    <Zuordnung groupId={7} personen={PERSONEN} verzeichnisAktiv sucheVerzoegerungMs={0} />
  );

  beforeEach(() => {
    suchePersonenActionMock.mockReset();
    suchePersonenActionMock.mockResolvedValue([]);
  });

  it("nach ERFOLG ist das Feld leer — auch wenn der Serverwert vorher schon leer war", async () => {
    // Genau die Falle: `FORM_START` und das Erfolgsergebnis liefern beide "".
    let aktuell: FormState = { ok: true };
    useActionStateMock.mockImplementation(() => [aktuell, () => {}, false]);
    await mount(feld());
    await tippe("sub-von-hand");
    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("sub-von-hand");

    await submitForm();
    aktuell = { ok: true }; // neues Erfolgsobjekt, gleicher Wert
    await rerender(feld());

    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("");
    expect(query<HTMLInputElement>(SUCHFELD).value).toBe("");
  });

  it("nach einem FELDFEHLER steht die Eingabe wieder da (§4.4)", async () => {
    let aktuell: FormState = { ok: true };
    useActionStateMock.mockImplementation(() => [aktuell, () => {}, false]);
    await mount(feld());
    await tippe("wer@drk.example");

    await submitForm();
    aktuell = {
      ok: false,
      fieldErrors: { kennung: "Diese E-Mail ist unbekannt." },
      values: { kennung: "wer@drk.example" },
    };
    await rerender(feld());

    expect(query<HTMLInputElement>(SUCHFELD).value).toBe("wer@drk.example");
    expect(query<HTMLInputElement>('input[name="kennung"]').value).toBe("wer@drk.example");
  });

  it("der Feldfehler haengt am Eingabeelement mit role=combobox, nicht am Rahmen", () => {
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { kennung: "Diese E-Mail ist unbekannt." },
        values: { kennung: "wer@drk.example" },
      } satisfies FormState,
      () => {},
      false,
    ]);

    const wirt = document.createElement("div");
    wirt.innerHTML = renderToStaticMarkup(
      <Zuordnung groupId={7} personen={PERSONEN} verzeichnisAktiv />,
    );

    const eingabe = wirt.querySelector('[role="combobox"]');
    expect(eingabe).not.toBeNull();
    expect(eingabe?.getAttribute("aria-invalid")).toBe("true");
    expect(eingabe?.getAttribute("aria-describedby")).toBe("fb-kennung-err");
    // Und das Ziel des Verweises existiert wirklich — ein Verweis ins Leere ist
    // fuer einen Screenreader dasselbe wie gar keiner.
    expect(wirt.querySelector("#fb-kennung-err")?.textContent).toContain(
      "Diese E-Mail ist unbekannt.",
    );
  });
});
