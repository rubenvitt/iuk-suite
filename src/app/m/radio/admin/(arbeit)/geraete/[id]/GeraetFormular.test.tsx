// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetFormular.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 6 — DAS GERAETEFORMULAR, DAS NOTIZFELD UND DIE LOESCHFLAECHE (`Spec:4508`,
 * `briefs/V14.md`).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ EINE TESTDATEI FUER DREI CLIENT-DATEIEN — und das ist eine benannte Entscheidung, kein
 * Versehen. `briefs/V14.md:3-5` fuehrt genau eine Testdatei; Vorabscan-Fund F22
 * (`.superpowers/sdd/planteil4/VORABSCAN.md:522-536`) verlangt dagegen, dass `NotizFeld` und
 * `GeraetLoeschen` NICHT ungeprueft ausgeliefert werden — „letztere traegt den V-L6-Fall".
 * Beides zusammen geht nur so: die Faelle stehen hier, in eigenen `describe`-Bloecken.
 *
 * ⚠️ WAS DIESE DATEI STRUKTURELL NICHT SEHEN KANN, und es steht hier, statt verschwiegen zu
 * werden: **Falle 1**. In jsdom gibt es keine RSC-Grenze — `Form.Item` ist dort ein
 * gewoehnlicher Compound-Zugriff und rendert klaglos. Zoege jemand die `Form.Item` aus der
 * Insel in `page.tsx`, bliebe JEDER Fall dieser Datei gruen (Sonde **S-V14d**, im Brief
 * vorhergesagt: „⛔ kein Vitest-Fall wird rot"). Der einzige Waechter ist der Playwright-Fall
 * aus `Spec:4879` — Eigentuemer Aufgabe V23.
 */

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/geraete/[id]";
const QUELLE_FORMULAR = `${INSEL_ORDNER}/GeraetFormular.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DREI DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"): eine VIERTE Client-Datei in
 * diesem Verzeichnis, ohne Direktive oder mit einem Wertimport aus `_db/`, waere fuer eine
 * handgeschriebene Namensliste unsichtbar.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**): gefiltert wird ueber
 * Endung und Dateinamen. Unterverzeichnisse bleiben draussen, weil `readdirSync` nicht
 * absteigt — `ereignisse/` (V15) ist eine eigene Insel mit eigener Testdatei.
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.test\.tsx?$/.test(name))
    .filter((name) => !SERVER_EINSTIEGE.includes(name))
    .sort();
}

/** ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung. */
const INSEL_SOLL = ["GeraetFormular.tsx", "GeraetLoeschen.tsx", "NotizFeld.tsx"];

/*
 * ⛔ `admin/actions.ts` WIRD ERSETZT, NICHT GELADEN. Die Datei traegt `"use server"` als erste
 * Zeile und zieht ueber `getDb`/`next/headers` den ganzen Serverbaum nach — in einer
 * jsdom-Umgebung ist das weder ladbar noch der Pruefgegenstand. Die drei Inseln importieren
 * ihre Actions DIREKT (Bauform-Zulaessigkeitstafel Nr. 6: eine Server Action wird nie als Prop
 * durchgereicht), und genau diese Importe werden hier ersetzt.
 *
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD (gemessen in V13:
 * `ReferenceError: Cannot access 'x' before initialization`, und die ganze Datei faellt aus).
 */
const { aendernMock, notizMock, loeschenMock } = vi.hoisted(() => ({
  aendernMock: vi.fn(),
  notizMock: vi.fn(),
  loeschenMock: vi.fn(),
}));
vi.mock("../../../actions", () => ({
  geraetAendernAction: aendernMock,
  notizAnfuegenAction: notizMock,
  geraetLoeschenAction: loeschenMock,
}));

import dayjs from "dayjs";
import {
  click,
  exists,
  existsPortal,
  fill,
  mount,
  query,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../../_lib/quelltextScan";
import { FELD_ETIKETTEN } from "../../../../_lib/lesepfade/ereignisse";
import type { GeraetFormWerte, Vorschlagsfeld } from "../../../../_lib/lesepfade/geraete";
import { GERAETE_MODI, STATUS_OPTIONEN } from "../../../../_lib/geraeteFelder";
import { UPDATER_FELDER } from "../../../../_lib/rollen";
import {
  FORMULAR_FELDER,
  GeraetFormular,
  baueGeaenderteFelder,
  gesperrtFuer,
  listeZuModi,
  modiZuListe,
  type FormularWerte,
} from "./GeraetFormular";
import { GeraetLoeschen } from "./GeraetLoeschen";
import { NotizFeld } from "./NotizFeld";

/** Ein Geraet mit ausschliesslich Nullwerten ausser der ISSI — der Normalfall nach dem Anlegen. */
function werte(teil: Partial<GeraetFormWerte> = {}): GeraetFormWerte {
  return {
    id: "g-1",
    issi: "1000001",
    rufname: null,
    tei: null,
    serialNumber: null,
    deviceType: null,
    status: null,
    location: null,
    assignedTo: null,
    softwareVersion: null,
    lastUpdatedAt: null,
    notes: null,
    hiorgId: null,
    opta: null,
    funktion: null,
    hersteller: null,
    bedieneinheit: null,
    deviceModes: null,
    alamosIntegrated: null,
    loanable: null,
    updateNote: null,
    updateStand: "unbekannt",
    ...teil,
  };
}

const LEERE_VORSCHLAEGE: Record<Vorschlagsfeld, string[]> = {
  rufname: [],
  geraeteTyp: [],
  lagerort: [],
  zuordnung: [],
  opta: [],
  funktion: [],
  hersteller: [],
  bedieneinheit: [],
};

/**
 * Die Formularwerte, die antd nach dem Initialisieren liefern WUERDE — der Ausgangspunkt jedes
 * Diff-Falles.
 *
 * ⛔ DIE ZWEI FALTUNGEN SIND DIE DES BESTANDS (`DeviceEditForm.tsx:39-47`): der Datumswaehler
 * traegt ein dayjs oder `null`, die Modi eine Liste, und die beiden Wahrheitswerte werden von
 * `null` auf `false` gezogen, damit die Kaestchen kontrolliert bleiben.
 */
function formularWerte(gespeichert: GeraetFormWerte): FormularWerte {
  return {
    issi: gespeichert.issi,
    rufname: gespeichert.rufname,
    tei: gespeichert.tei,
    serialNumber: gespeichert.serialNumber,
    deviceType: gespeichert.deviceType,
    status: gespeichert.status,
    location: gespeichert.location,
    assignedTo: gespeichert.assignedTo,
    softwareVersion: gespeichert.softwareVersion,
    lastUpdatedAt: null,
    notes: gespeichert.notes,
    hiorgId: gespeichert.hiorgId,
    opta: gespeichert.opta,
    funktion: gespeichert.funktion,
    hersteller: gespeichert.hersteller,
    bedieneinheit: gespeichert.bedieneinheit,
    deviceModes: modiZuListe(gespeichert.deviceModes),
    alamosIntegrated: gespeichert.alamosIntegrated ?? false,
    loanable: gespeichert.loanable ?? false,
    updateNote: gespeichert.updateNote,
  };
}

beforeEach(() => {
  aendernMock.mockReset();
  notizMock.mockReset();
  loeschenMock.mockReset();
});

afterEach(async () => {
  await unmount();
});

describe("radio-Geraetakte: der Feldriegel der Updater-Stufe", () => {
  it("als Updater sind alle Felder ausser den dreien gesperrt", () => {
    /*
     * ⛔ DER FALL, DEN `Spec:4863` NAMENTLICH NENNT, und die 1:1-Uebernahme von
     * `DeviceEditForm.tsx:36-37`. ⛔ DIE ZAHL 20 STEHT AUSSERHALB DER SCHLEIFE: eine
     * Zusicherung nur INNERHALB waere ueber einer geschrumpften Liste still gruen — dieselbe
     * Fehlerform wie NT11 („ein Waechter, der `>= 5` statt `= 6` prueft, bewacht nichts").
     */
    expect(FORMULAR_FELDER.length, "zwanzig BENANNTE Felder (DeviceFields.tsx:56-191)").toBe(20);

    const gesperrt = gesperrtFuer("updater");
    /*
     * ⚠️ SORTIERT VERGLICHEN, UND DAS IST BENANNT: `FORMULAR_FELDER` steht in der Reihenfolge
     * der MASKE (`DeviceFields.tsx:56-191`), `UPDATER_FELDER` in der des Bestands
     * (`editable-fields.ts:3`). Beide Reihenfolgen sind eigene Zusicherungen — jene haelt
     * `_lib/rollen.test.ts` mit `toEqual` fest —, und sie sind verschieden. Verglichen wird
     * hier die MENGE.
     */
    const offen = FORMULAR_FELDER.filter((feld) => !gesperrt(feld));
    expect([...offen].sort(), "die Feld-Allowlist der Updater-Stufe (editable-fields.ts:3)")
      .toEqual([...UPDATER_FELDER].sort());
    expect(
      FORMULAR_FELDER.filter((feld) => gesperrt(feld)).length,
      "17 der 20 Felder sind fuer die Updater-Stufe gesperrt",
    ).toBe(17);
  });

  it("als Admin ist kein Feld gesperrt", () => {
    /* Die Gegenprobe. Ohne sie bestuende ein `gesperrt = () => true` den Fall darueber. */
    const gesperrt = gesperrtFuer("admin");
    expect(FORMULAR_FELDER.filter((feld) => gesperrt(feld))).toEqual([]);
  });

  it("die zwanzig Feldnamen stehen im Markup und in der Etikettenliste gleich", () => {
    /*
     * ⛔ VORABSCAN-FUND F11 (`.superpowers/sdd/planteil4/VORABSCAN.md:327-344`): dieselben
     * zwanzig Felder entstehen ZWEIMAL — als `FELD_ETIKETTEN` fuer die Ereignisliste
     * (`_lib/lesepfade/ereignisse.ts:62`, V7) und als `label`/`name` dieses Formulars. Der
     * Brief verlangt „⛔ Er darf nicht an zwei Stellen verschieden dastehen" — ohne diesen
     * Fall waere das eine Bitte.
     *
     * ⛔ UND DIE LISTE WIRD AM MARKUP GEMESSEN, NICHT NUR BEHAUPTET: `FORMULAR_FELDER` koennte
     * sonst zwanzig Namen fuehren, waehrend das Formular neunzehn rendert. Gescannt werden die
     * `name="…"`-Attribute der Quelle (ueber `ohneKommentare`, weil der Kopfkommentar Feldnamen
     * nennt).
     *
     * ⛔ DER IMPORT VON `_lib/lesepfade/ereignisse.ts` STEHT NUR HIER, IN DER TESTDATEI. Die
     * Insel selbst darf ihn nie fuehren — jene Datei zieht `drizzle-orm` und `_db/schema` als
     * WERTE, und der Bundle-Waechter unten faerbt sich zu Recht.
     */
    expect(Object.keys(FELD_ETIKETTEN).sort()).toEqual([...FORMULAR_FELDER].sort());

    const quelle = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    const imMarkup = [...quelle.matchAll(/\bname="([a-zA-Z]+)"/g)].map((t) => t[1]!);
    expect(new Set(imMarkup).size, "ein Feldname steht doppelt im Markup").toBe(imMarkup.length);
    expect(imMarkup.sort()).toEqual([...FORMULAR_FELDER].sort());
  });
});

describe("radio-Geraetakte: die Feldregeln des Bestands", () => {
  it("ISSI ist das einzige Pflichtfeld", () => {
    /*
     * `DeviceFields.tsx:64`. ⛔ DIE ZAHL 1 STEHT ALS EIGENE ZUSICHERUNG — ein zweites
     * `required: true` an einem Feld, das der Bestand nicht als Pflicht fuehrt, waere eine
     * Regel, die der Alt-Bestand nicht hat, und niemand saehe sie.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(
      (quelle.match(/required:\s*true/g) ?? []).length,
      "genau EIN Pflichtfeld (DeviceFields.tsx:64)",
    ).toBe(1);
    expect(quelle, "der Pflichtfeldtext des Bestands").toMatch(/ISSI ist erforderlich/);
    expect(quelle.indexOf('name="issi"')).toBeLessThan(quelle.indexOf("required:"));
  });

  it("kein Feld traegt eine Maximallaenge", () => {
    /*
     * ⛔ DER FALL GEGEN DIE ERFINDUNG. Beleg am Fall: `radio-admin/shared/src/schemas.ts:50-99`
     * fuehrt `issi` plus **19** `nullable().optional()` — KEINE serverseitige Grenze auf
     * irgendeinem Textfeld —, und die Spalten sind `text(...)` ohne Laengenbegrenzung
     * (`_db/schema.ts:19-65`). Ein erfundener Deckel waere die F1-Fehlerklasse: eine Regel, die
     * niemand beschlossen hat, und die erst beim Import einer langen Bemerkung auffaellt.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(quelle, "eine erfundene Maximallaenge").not.toMatch(/maxLength/i);
  });

  it("der Statuswahl liegen genau die fuenf Optionen zugrunde", () => {
    /*
     * `radio-admin/shared/src/constants.ts:10-16`. ⛔ `toEqual`, REIHENFOLGE INKLUSIVE — und
     * die Liste kommt aus `_lib/geraeteFelder.ts:154`, das Formular legt keine zweite an
     * (`geraeteFelder.ts:151-152`: „⬜ Aufgabe V14 baut die Statusauswahl des Formulars und
     * liest sie VON HIER").
     */
    expect([...STATUS_OPTIONEN]).toEqual([
      "Einsatzbereit",
      "Defekt",
      "Ausgeliehen",
      "Wartung",
      "Sonstiges",
    ]);
    const quelle = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(quelle, "eine zweite Statusliste im Formular").toMatch(/STATUS_OPTIONEN/);
    for (const wort of STATUS_OPTIONEN) {
      expect(quelle, `${wort} steht als Literal im Formular`).not.toMatch(
        new RegExp(`["']${wort}["']`),
      );
    }
  });

  it("die Geraetefunktionen tragen genau die vier Modi, in dieser Reihenfolge", () => {
    /*
     * `constants.ts:4`, woertlich: „The order here IS the canonical output order — do not
     * sort." ⛔ Deshalb `toEqual` und nicht `toContain`, und deshalb misst der zweite Teil die
     * Umrechnung: `modiZuListe`/`listeZuModi` stellen die kanonische Reihenfolge her, egal in
     * welcher der Bediener die Modi anhakt (`deviceModes.ts:8-17`, `:24-31`).
     */
    expect([...GERAETE_MODI]).toEqual(["TMO", "DMO", "REP", "GAT"]);
    expect(modiZuListe("DMO,TMO")).toEqual(["TMO", "DMO"]);
    expect(modiZuListe(null)).toEqual([]);
    expect(modiZuListe("TMO, XYZ ,GAT"), "unbekannte Token fallen weg").toEqual(["TMO", "GAT"]);
    expect(listeZuModi(["GAT", "TMO"])).toBe("TMO,GAT");
    expect(listeZuModi([]), "die leere Auswahl laeuft mit der Spalte rund").toBeNull();
  });
});

describe("radio-Geraetakte: der Diff des Formulars", () => {
  it("ein unveraendertes Formular sendet keinen Patch", () => {
    /*
     * `DeviceEditForm.tsx:87-90`. ⛔ Ohne diese Regel schriebe jedes Oeffnen-und-Speichern eine
     * Ereigniszeile je Feld — und die Action steigt zwar bei leerem Diff frueh aus
     * (`admin/actions.ts`, Schritt 4), aber sie kann nur ueberspringen, was gar nicht erst
     * ankommt.
     */
    const gespeichert = werte({
      rufname: "Florian 1",
      status: "Einsatzbereit",
      deviceModes: "TMO,DMO",
      loanable: true,
      lastUpdatedAt: "2026-08-03",
    });
    const roh = formularWerte(gespeichert);
    const gleich: FormularWerte = { ...roh, lastUpdatedAt: dayjsAus("2026-08-03") };
    expect(baueGeaenderteFelder(gespeichert, gleich)).toEqual({});
  });

  it("ein unangehakter Wahrheitswert ueber einem gespeicherten null erzeugt keinen Patcheintrag", () => {
    /*
     * `DeviceEditForm.tsx:79-82`, woertlich: „the form coerces null -> false on init, so treat
     * them as equal". ⛔ DER FALL GEGEN ZWEI FALSCHE EREIGNISZEILEN JE SPEICHERN: ohne ihn
     * meldete jedes Oeffnen-und-Speichern eines frisch angelegten Geraets „Ausleihbar: null ->
     * false" und „Alamos integriert: null -> false" in die Historie.
     */
    const gespeichert = werte({ loanable: null, alamosIntegrated: null });
    const roh = formularWerte(gespeichert);
    expect(roh.loanable, "die Initialisierung zieht null auf false").toBe(false);
    expect(baueGeaenderteFelder(gespeichert, roh)).toEqual({});

    /* ⛔ DIE GEGENRICHTUNG: ein ANGEHAKTES Kaestchen ueber demselben null IST eine Aenderung. */
    expect(baueGeaenderteFelder(gespeichert, { ...roh, loanable: true })).toEqual({
      loanable: true,
    });
    /* ⛔ UND EIN ABGEHAKTES ueber einem gespeicherten `true` ebenfalls. */
    const wahr = werte({ loanable: true });
    expect(baueGeaenderteFelder(wahr, { ...formularWerte(wahr), loanable: false })).toEqual({
      loanable: false,
    });
  });

  it("die Update-Anmerkung fehlt im Formular, wenn die Rolle updater ist", () => {
    /*
     * `DeviceFields.tsx:181-190`: das Feld wird fuer Updater NICHT gerendert — „so wird die
     * Anmerkung nicht doppelt angezeigt", sie haengen ueber `NotizFeld` an. ⛔ UND DER DIFF
     * BEHAELT DANN DEN GESPEICHERTEN WERT (`DeviceEditForm.tsx:73`): ein fehlendes Feld ist
     * KEINE Loeschung. Ohne die Zeile riebe jedes Speichern durch eine Updater-Person die
     * gesamte append-only-Anmerkung weg.
     */
    const gespeichert = werte({ updateNote: "[2026-08-01 · Anna] ISSI weicht ab" });
    const ohneFeld = { ...formularWerte(gespeichert) } as Partial<FormularWerte>;
    delete ohneFeld.updateNote;
    expect(baueGeaenderteFelder(gespeichert, ohneFeld as FormularWerte)).toEqual({});

    const quelle = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(quelle, "die Update-Anmerkung haengt an keiner Rollenbedingung").toMatch(
      /!gesperrt\("updateNote"\)/,
    );
  });

  it("lastUpdatedAt geht als YYYY-MM-DD, nicht als Zahl", () => {
    /*
     * ⛔ ENTSCHEIDUNG **E-V11**. Der Bestand sendet `values.lastUpdatedAt.valueOf()`
     * (`DeviceEditForm.tsx:61`) — epoch-ms —, weil seine Spalte epoch-ms fuehrt. Die
     * Suite-Spalte IST der Kalendertag (`_db/schema.ts:34-39`); eine Zahl dort waere
     * typkorrekt, lint-sauber und faende sich als „1754172000000" in der Zelle wieder.
     *
     * ⛔ UND DER RUNDLAUF IST IDENTITAET: derselbe gespeicherte Tag, durch den Datumswaehler
     * und zurueck, ergibt dieselbe Zeichenkette — sonst erzeugte jedes Speichern in einer Zone
     * oestlich von Berlin einen Diff auf den VORTAG. Deshalb geht der Tag als ISO-Zeichenkette
     * in `tagAusWert` (`_lib/csv/spalten.ts:207`, Zweig „ISO YYYY-MM-DD") und NICHT als `Date`.
     */
    const gespeichert = werte({ lastUpdatedAt: null });
    const patch = baueGeaenderteFelder(gespeichert, {
      ...formularWerte(gespeichert),
      lastUpdatedAt: dayjsAus("2026-08-24"),
    });
    expect(patch).toEqual({ lastUpdatedAt: "2026-08-24" });
    expect(typeof patch.lastUpdatedAt, "eine Zahl statt des Kalendertags (E-V11)").toBe("string");

    const mitTag = werte({ lastUpdatedAt: "2026-08-24" });
    expect(
      baueGeaenderteFelder(mitTag, {
        ...formularWerte(mitTag),
        lastUpdatedAt: dayjsAus("2026-08-24"),
      }),
      "der Rundlauf durch den Datumswaehler ist nicht die Identitaet",
    ).toEqual({});

    /* Das Leeren des Waehlers ist eine echte Aenderung auf `null`. */
    expect(
      baueGeaenderteFelder(mitTag, { ...formularWerte(mitTag), lastUpdatedAt: null }),
    ).toEqual({ lastUpdatedAt: null });
  });
});

describe("radio-Geraetakte: das Notizfeld", () => {
  it("zeigt die bisherige Anmerkung nur der Updater-Stufe", async () => {
    /*
     * ⛔ DIE FALLUNTERSCHEIDUNG WANDERT 1:1 MIT, SONST STEHT SIE DOPPELT
     * (`briefs/V14.md:92-96`; Bestand `DeviceDetailDrawer.tsx:109`, dort `{!isAdmin && …}`).
     * Die Suite zeigt die Anmerkung fuer Admins IM FORMULAR (`updateNote`, dort nicht gesperrt)
     * und fuer Updater HIER. ⛔ ANHAENGEN DARF ABER JEDE STUFE (`Spec:4448`, Tafel
     * `Spec:4444-4454`: „Notiz anfuegen | ja | ja") — deshalb bleibt das Eingabefeld stehen.
     */
    await mount(<NotizFeld geraetId="g-1" anmerkung="Antenne locker" rolle="updater" />);
    expect(query('[data-rolle="radio-notiz-bisher"]').textContent).toContain("Antenne locker");
    expect(exists('[data-rolle="radio-notiz-eingabe"]')).toBe(true);
    await unmount();

    await mount(<NotizFeld geraetId="g-1" anmerkung="Antenne locker" rolle="admin" />);
    expect(
      exists('[data-rolle="radio-notiz-bisher"]'),
      "die Anmerkung steht fuer Admins doppelt — hier UND im Formularfeld",
    ).toBe(false);
    expect(exists('[data-rolle="radio-notiz-eingabe"]'), "auch Admins duerfen anhaengen").toBe(
      true,
    );
  });

  it("zeigt den Leertext, wenn keine Anmerkung gespeichert ist", async () => {
    /* `UpdateNotePanel.tsx:35`, woertlich. */
    await mount(<NotizFeld geraetId="g-1" anmerkung={null} rolle="updater" />);
    expect(query('[data-rolle="radio-notiz-bisher"]').textContent).toBe("Keine Anmerkung.");
  });

  it("haengt den GETRIMMTEN Text an und ruft bei leerer Eingabe gar nicht", async () => {
    /*
     * `UpdateNotePanel.tsx:17-19`: `if (!text.trim()) return;` und `mutateAsync(text.trim())`.
     * ⛔ Die serverseitige Haelfte steht in `admin/actions.ts` (`notizAnfuegenAction`, Trimmung
     * vor dem Anhaengen) — eine Regel, die nur im Client steht, ist keine Regel
     * (`Spec:3583-3585`); dieser Fall prueft die Client-Haelfte.
     */
    aendernMock.mockResolvedValue({ ok: true });
    notizMock.mockResolvedValue({ ok: true });
    await mount(<NotizFeld geraetId="g-1" anmerkung={null} rolle="updater" />);

    await click('[data-rolle="radio-notiz-anhaengen"]');
    expect(notizMock, "die leere Eingabe hat die Action gerufen").not.toHaveBeenCalled();

    await fill('[data-rolle="radio-notiz-eingabe"]', "  ISSI weicht ab  ");
    await click('[data-rolle="radio-notiz-anhaengen"]');
    expect(notizMock).toHaveBeenCalledWith("g-1", "ISSI weicht ab");
  });

  it("zeigt bei ok:false den Satz DER ACTION", async () => {
    /*
     * ⛔ KEIN TOAST UND KEINE ZWEITE TEXTLISTE — Entscheidung E6 (`Spec:3754-3776`), im Modul
     * dreimal ausgeschrieben (`_ui/RueckgabeDialog.tsx`, `_ui/AusleihVorgang.tsx`,
     * `NeuGeraetModal.tsx:40-45`). Der Text kommt aus der Action selbst.
     */
    notizMock.mockResolvedValue({ ok: false, fehler: "Anmerkung fehlgeschlagen" });
    await mount(<NotizFeld geraetId="g-1" anmerkung={null} rolle="updater" />);
    await fill('[data-rolle="radio-notiz-eingabe"]', "Text");
    await click('[data-rolle="radio-notiz-anhaengen"]');
    expect(query('[data-rolle="radio-notiz-fehler"]').textContent).toBe("Anmerkung fehlgeschlagen");
  });
});

describe("radio-Geraetakte: die Loeschflaeche und die Warnung aus V-L6", () => {
  it("warnt VOR dem Loeschen und nennt den Entleiher", async () => {
    /*
     * ⛔ BETREIBERENTSCHEIDUNG **V-L6** vom 2026-08-24 (`progress.md`, Abschnitt „✅ V-L6"),
     * Ausformung 1: „Die Warnung steht VOR dem Loeschen, als Bestaetigungsschritt — sonst ist
     * sie keine Warnung, sondern eine Meldung ueber etwas bereits Geschehenes. Sie NENNT DEN
     * ENTLEIHER und sagt, dass die Leihe beim Loeschen als zurueckgegeben gebucht wird."
     *
     * ⚠️ SIE ERSETZT DIE ABLEHNUNG, DIE DER BRIEF NOCH SCHREIBT (`briefs/V14.md:99-101`,
     * `KOPF.md:378`) — das Ledger ueberholt den Plan (Vorabscan-Fund F2).
     */
    await mount(<GeraetLoeschen geraetId="g-1" offeneLeiheEntleiher="Anna Beispiel" />);
    /*
     * ⛔ ANTD RENDERT DEN `Popconfirm` DURCH EIN PORTAL nach `document.body` — der Inhalt ist
     * ein GESCHWISTER des Mount-Wirts, kein Nachfahre (`qr/_lib/test-dom.tsx:174-186`).
     * Und er entsteht erst beim Oeffnen: DAS ist der Bestaetigungsschritt, den V-L6 verlangt.
     */
    await click('[data-rolle="radio-loeschen-knopf"]');
    const warnung = queryPortal('[data-rolle="radio-loeschen-warnung"]').textContent ?? "";
    expect(warnung, "die Warnung nennt den Entleiher nicht").toContain("Anna Beispiel");
    expect(warnung, "die Warnung sagt nicht, was mit der Leihe geschieht").toMatch(
      /zur(ü|ue)ckgegeben/,
    );
    expect(loeschenMock, "die Warnung darf nichts ausloesen").not.toHaveBeenCalled();
  });

  it("ohne offene Leihe steht keine Warnung", async () => {
    /* Die Gegenprobe: eine Warnung, die immer da steht, ist keine. */
    await mount(<GeraetLoeschen geraetId="g-1" offeneLeiheEntleiher={null} />);
    expect(exists('[data-rolle="radio-loeschen-knopf"]'), "der Knopf wird versteckt").toBe(true);
    await click('[data-rolle="radio-loeschen-knopf"]');
    expect(existsPortal('[data-rolle="radio-loeschen-warnung"]')).toBe(false);
  });

  it("die Loeschflaeche steht nur fuer die Admin-Stufe im Markup der Seite", () => {
    /*
     * `DeviceDetailDrawer.tsx:111` (`{isAdmin && …}`), Rechtetafel `Spec:4444-4454`
     * („Geraet anlegen / loeschen | ja | **nein**"). ⛔ DIE SPERRE IST DIE ACTION
     * (`geraetLoeschenAction` ruft `requireRadioAdmin()` als erste Anweisung); dies hier ist
     * die ANZEIGE-Entscheidung — aber eine, die kein anderer Waechter dieses Wegs liest.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Rollenableitung der Seite").toMatch(/const istAdmin = rolle === "admin";/);
    expect(quelle, "die Loeschflaeche haengt an keiner Rollenbedingung").toMatch(
      /istAdmin && \(\s*<GeraetLoeschen/,
    );
  });
});

describe("radio-Geraetakte: die Bauform der Insel", () => {
  it("die drei Dateien der Insel tragen use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 1 (Bauform-Zulaessigkeitstafel Nr. 3): `DeviceFields.tsx` ist 194 Zeilen fast
     * ausschliesslich `Form.Item` — **21 gerenderte, davon 20 benannte**. Compound-Zugriff in
     * einer Server Component ist HTTP 500, und typecheck, lint und build saehen nichts.
     * Dieselbe Lage bei `Input.TextArea` (`:178`, `:187`) und `Space.Compact`
     * (`UpdateNotePanel.tsx:37`).
     *
     * ⛔ DIE MENGE WIRD GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("keine Datei der Insel zieht _db/ oder drizzle-orm in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen
     * (`.superpowers/sdd/planteil4/BERICHT-V13.md`): eine Insel-Datei las einen WERT aus
     * `_lib/lesepfade/geraete.ts`, und jene Datei importiert `drizzle-orm` und `_db/schema` als
     * Werte. Die Regel steht im Modul woertlich (`_lib/csv/klassifizieren.ts:6-9`): „ein
     * Wertimport aus `_db/` zoege Drizzle und `better-sqlite3` ins Browser-Bundle, und weder
     * `typecheck` noch `lint` noch `build` saehen es."
     *
     * ⛔ HIER IST DIE GEFAHR NAMENTLICH: `_lib/lesepfade/ereignisse.ts` (die Etikettenliste aus
     * F11) und `_lib/lesepfade/geraete.ts` (der Typ `GeraetFormWerte`) duerfen NUR als
     * `import type` vorkommen — und ein `import type` ist eine EIGENE Anweisung, kein `type`
     * in einer gemischten Klammer.
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE DREI DATEIEN (Ruling R-V11-3: „Ein
     * Gegen-`grep` mit Dateiliste prueft die Liste, nicht die Klasse").
     *
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: keine dynamischen Importe, kein
     * Nicht-Relativpfad ausser den vier verbotenen Namen, kein Seiteneffekt-Import. Was das
     * Bundle wirklich enthaelt, zeigt erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

    /** Ein `import`/`export … from` mit seiner Typ-Markierung und seinem Modulpfad. */
    const BEZUG = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

    function aufloesen(vonDatei: string, spezifizierer: string): string | null {
      if (!spezifizierer.startsWith(".")) return null;
      const basis = normalize(join(dirname(vonDatei), spezifizierer));
      for (const kandidat of [`${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts")]) {
        if (existsSync(kandidat)) return kandidat;
      }
      return null;
    }

    const gesehen = new Set<string>(WURZELN);
    const offen = [...WURZELN];
    const verstoesse: string[] = [];

    /*
     * ⛔ AN EINER `"use server"`-DATEI ENDET DER GRAPH, UND DAS IST DIE GRENZE SELBST: Next
     * ersetzt den Import durch eine Referenz, die Datei wird nie ins Client-Bundle kopiert.
     * Ohne diese Zeile waere der Fall rot-by-construction, sobald eine Insel eine Action ruft.
     */
    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        if (/^(?:drizzle-orm|node:|better-sqlite3)(?:\/|$)|^node:/.test(spezifizierer)) {
          verstoesse.push(`${datei}: Wertimport von ${spezifizierer}`);
          continue;
        }
        const ziel = aufloesen(datei, spezifizierer);
        if (ziel === null) continue;
        if (/[/\\]_db[/\\]/.test(ziel)) {
          verstoesse.push(`${datei}: Wertimport aus _db/ (${spezifizierer})`);
          continue;
        }
        if (!gesehen.has(ziel)) {
          gesehen.add(ziel);
          offen.push(ziel);
        }
      }
    }

    /*
     * ⛔ DIE UNTERGRENZE DES WALKERS (Ruling R-V11-1, Auflage 1): ohne sie waere `toEqual([])`
     * ueber einer Menge von drei Wurzeln gruen, auch wenn die Aufloesung gar nichts findet.
     * Gemessen am 2026-08-25 mit DIESEM Walker: **7** Module — die drei Wurzeln,
     * `_lib/rollen.ts`, `_lib/geraeteFelder.ts`, `_lib/csv/spalten.ts` und `admin/actions.ts`
     * als Graphgrenze. Die Untergrenze ist bewusst KEINE exakte Zahl.
     */
    expect(gesehen.size, "der Walker ist dem Importgraphen nicht gefolgt").toBeGreaterThanOrEqual(6);
    expect(verstoesse).toEqual([]);
  });

  it("die Seite traegt den Riegel der Verwaltungs-Stufe und antwortet mit notFound", () => {
    /*
     * ⛔ `Spec:4371`: die Geraeteakte ist eine der Flaechen, die auch eine Updater-Person sieht
     * (`Spec:4444-4454`). `riegel.test.ts` faengt eine faelschlich ANGEHOBENE Seite im
     * `(arbeit)`-Zweig strukturell NICHT — die ODER-Klausel dort laesst beide Namen zu
     * (`riegel.test.ts:253-262`). Diese Zeile ist der einzige Waechter dagegen.
     *
     * ⛔ UND EIN FEHLENDES GERAET IST `notFound()`, NICHT EINE FEHLERSEITE
     * (`radio-admin/server/src/routes/devices.ts:84`, `_lib/lesepfade/geraete.ts:566-591`).
     *
     * ⛔ Ueber `ohneKommentare`: der Kopfkommentar der Seite nennt beide Riegelnamen, um die
     * Stufenwahl zu begruenden.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle).toMatch(/await requireRadioVerwaltung\(\)/);
    expect(quelle, "auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404").not.toMatch(
      /\brequireRadioAdmin\s*\(/,
    );
    expect(quelle, "ein fehlendes Geraet endet nicht in notFound()").toMatch(/notFound\(\)/);
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte. Eine Server Action wird
     * DIREKT importiert, nie durchgereicht.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[a-zA-Z]*Action\}/);
    expect(quelle, "ein Date ueber die Grenze").not.toMatch(/=\{new Date\(/);
  });

  it("die Versionsliste erreicht die Insel", () => {
    /*
     * ⛔ DER WAECHTER UEBER DEM VIERTEN PROP. `versionen` steht ueber `Spec:4508` hinaus, weil
     * der Bestand das Feld „Letztes Update" an einen `Combobox allowCreate` ueber
     * `useSoftwareVersions()` bindet (`DeviceFields.tsx:152-160`) und ein ersatzloses
     * Weglassen ein stiller Verlust an einem Feld waere. ⛔ Genau deshalb schuldet die
     * Wiederherstellung ihren eigenen Fall: ein weggefallenes `versionen={versionen}` oder
     * eine leere Liste waere sonst eine Mutation ohne Waechter — Ruling **R-V11-1**.
     *
     * ⛔ BEIDE HAELFTEN: die Quelle der Liste (V5) UND ihr Weg ueber die Grenze.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Liste wird gar nicht erst gelesen").toMatch(/versionenMitGeraetezahl\(db\)/);
    expect(quelle, "die Versionsliste erreicht die Insel nicht").toMatch(/versionen=\{versionen\}/);

    const insel = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(insel, "die Insel bietet die Versionen nicht an").toMatch(
      /options=\{versionen\.map\(/,
    );
  });

  it("die Kopfdaten tragen die fuenf Alt-Felder, den Titel und die Hiorg-Regel", () => {
    /*
     * ⛔ 1:1 AUS `DeviceDetailDrawer.tsx:61` UND `:77-102`. Die Seite ist eine Server Component
     * und laesst sich hier nicht mounten (`getDb`, `requireRadioVerwaltung`, `next/headers`);
     * gemessen wird deshalb die Quelle. ⚠️ Das ist die Untergrenze, nicht der Beweis — den
     * fuehrt der echte Abruf (V23, `Spec:4879`).
     *
     * ⛔ FUENF ZEILEN, EXAKT: eine verlorene faellt sonst nirgends auf. Die fuenfte
     * („Abweichung") haengt an `updateAnmerkung` und wird nur gezeigt, wenn etwas gemeldet ist.
     *
     * ⛔ DIE RUECKFALLKETTE DES TITELS MIT `||` UND NICHT `??`: beide Spalten sind Freitext
     * (`_db/schema.ts:21`, `:43`), die LEERE Zeichenkette muss weiterfallen.
     *
     * ⛔ UND DIE HIORG-REGEL 1:1 (`DeviceDetailDrawer.tsx:28-40`): Link nur bei `http://` oder
     * `https://`, sonst Text — inklusive `target="_blank" rel="noreferrer"`. Ohne `noreferrer`
     * traegt der Abruf der fremden Seite die Adresse dieser Verwaltungsflaeche im Referer.
     *
     * ⚠️ KEIN UMLAUT ALS ANKER (Hausregel): die Zeile „Ge<umlaut>ndert" wird ueber die ZAHL der
     * Kopfzeilen mitgemessen, nicht ueber ihren Text.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect((quelle.match(/<KopfZeile/g) ?? []).length, "fuenf Kopfzeilen").toBe(5);
    for (const etikett of ["Hiorg-ID", "Ausleihbar", "Zuletzt aktualisiert", "Abweichung"]) {
      expect(quelle, `die Kopfzeile ${etikett} fehlt`).toMatch(
        new RegExp(`etikett="${etikett}"`),
      );
    }
    expect(quelle, "die Abweichungszeile steht auch ohne gemeldete Abweichung").toMatch(
      /akte\.updateAnmerkung && \(/,
    );
    expect(quelle, "die Rueckfallkette des Titels").toMatch(
      /akte\.rufname \|\| akte\.opta \|\| akte\.issi/,
    );
    expect(quelle, "die ISSI fehlt in Klammern hinter dem Titel").toMatch(/\(\$\{akte\.issi\}\)/);
    expect(quelle, "die Hiorg-ID wird immer zum Link").toMatch(/startsWith\("https:\/\/"\)/);
    expect(quelle, "der Hiorg-Link ohne noreferrer").toMatch(/rel="noreferrer"/);
  });

  it("die Stelle fuer den Ereignis-Link bleibt frei und nennt V15", () => {
    /*
     * ⛔ EIN LINK AUF EINE 404 IST SCHLIMMER ALS KEIN LINK (`briefs/V14.md:33-36`, Vorbild
     * `qr/layout.tsx:16-18`): `/admin/geraete/<id>/ereignisse` entsteht erst in V15. Die Stelle
     * bleibt mit einem ⬜-Kommentar frei, der den Nachfolger NAMENTLICH nennt — ein
     * auskommentierter Link ohne Eigentuemer waere eine Auslassung, keine Leerstelle.
     *
     * ⛔ ROH GELESEN, NICHT UEBER `ohneKommentare`: gepruefte Aussage ist gerade, dass der
     * Vermerk ein KOMMENTAR ist.
     */
    const roh = readFileSync(QUELLE_SEITE, "utf8");
    expect(roh, "der Nachfolger steht nicht namentlich in der Leerstelle").toMatch(/V15/);
    expect(
      ohneKommentare(roh),
      "ein Link auf die Ereignisseite, die es noch nicht gibt (404)",
    ).not.toMatch(/ereignisse/);
  });
});

describe("radio-Geraetakte: das Formular im DOM", () => {
  it("rendert die fuenf Abschnitte und ruft die Action mit dem Diff", async () => {
    /*
     * ⛔ DIE FUENF ABSCHNITTE SIND DIE `Divider` DES BESTANDS (`DeviceFields.tsx:56`, `:91`,
     * `:119`, `:149`, `:174`): Identitaet · Geraet · Einsatz · Update · Bemerkung. Ein
     * verlorener Abschnitt faellt sonst nirgends auf — die Felder stuenden weiter da, nur ohne
     * Gliederung.
     *
     * ⚠️ DER DIFF-WEG WIRD HIER AM ECHTEN FORMULAR GEFAHREN, damit `baueGeaenderteFelder` nicht
     * nur als reine Funktion gruen ist, sondern auch verdrahtet.
     */
    aendernMock.mockResolvedValue({ ok: true });
    await mount(
      <GeraetFormular
        geraet={werte()}
        rolle="admin"
        vorschlaege={LEERE_VORSCHLAEGE}
        versionen={["FW 1", "FW 2"]}
      />,
    );

    expect(document.querySelectorAll(".ant-divider").length, "fuenf Abschnitte").toBe(5);
    /*
     * ⛔ UND ALLE FUENF LINKSBUENDIG (`DeviceFields.tsx:56`, `:91`, `:119`, `:149`, `:174`:
     * `orientation="left"`). In antd 6 heisst das `titlePlacement`, weil `orientation` dort die
     * ACHSE traegt (`node_modules/antd/es/divider/index.d.ts:21-24`) — ohne das Attribut stehen
     * die fuenf Ueberschriften zentriert, und die gerenderte Zahl darueber bleibt 5. Gemessen:
     * die Sonde ohne `titlePlacement` war vor diesem Fall **0 rot**.
     */
    const quelleFormular = ohneKommentare(readFileSync(QUELLE_FORMULAR, "utf8"));
    expect(
      (quelleFormular.match(/<Divider titlePlacement="start">/g) ?? []).length,
      "eine Abschnittsueberschrift steht zentriert statt linksbuendig",
    ).toBe(5);
    /*
     * ⛔ GEFUELLT WIRD EIN SCHLICHTES `Input` (`tei`), NICHT EIN VORSCHLAGSFELD: antds
     * `AutoComplete` ist ein `Select` im Combobox-Modus (`_ui/EntleiherFeld.tsx:39-41`), und
     * ein getippter Text landet dort im Suchzustand, nicht im Formularwert. Der Fall pruefte
     * sonst das Zeichenpaket statt dieser Flaeche.
     */
    await fill("#tei", "TEI-4711");
    await click('[data-rolle="radio-formular-speichern"]');
    expect(aendernMock).toHaveBeenCalledWith("g-1", { tei: "TEI-4711" });
  });

  it("zeigt bei ok:false den Satz DER ACTION", async () => {
    aendernMock.mockResolvedValue({ ok: false, fehler: "ISSI bereits vergeben" });
    await mount(
      <GeraetFormular
        geraet={werte()}
        rolle="admin"
        vorschlaege={LEERE_VORSCHLAEGE}
        versionen={[]}
      />,
    );
    await fill("#tei", "TEI-4711");
    await click('[data-rolle="radio-formular-speichern"]');
    expect(query('[data-rolle="radio-formular-fehler"]').textContent).toBe("ISSI bereits vergeben");
  });
});

/**
 * Ein dayjs-Objekt aus einem Kalendertag — der Wert, den antds `DatePicker` liefert.
 *
 * ⛔ ER STEHT AM ENDE DER DATEI UND NICHT OBEN: `dayjs` ist ein WERTimport, und die Faelle
 * darueber sollen zeigen, dass die Umrechnung in `_lib/csv/spalten.ts` liegt und nicht hier.
 */
function dayjsAus(tag: string): FormularWerte["lastUpdatedAt"] {
  return dayjs(tag);
}
