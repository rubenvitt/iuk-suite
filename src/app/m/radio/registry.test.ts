import { describe, it, expect } from "vitest";
import { findModule, getModule, moduleForHost, prodHostsFor, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";
import { ICONS } from "@/core/shell/icons";

/**
 * DIE FELDWERTE DER REGISTRY-ZEILE, EINZELN (Spec 1 §1.1, Zeilen 158-180).
 *
 * Praezedenzfall im Repo: `src/app/m/aufgaben/registry.test.ts` — dort steht auch die
 * Begruendung, warum der Import von `ICONS` in einer TESTdatei erlaubt ist, obwohl die
 * Map client-only ist (`aufgaben/registry.test.ts:10-13`): `icons.test.ts` nimmt
 * `*.test.ts`/`*.test.tsx` aus seinem Quelltext-Scan aus („Tests laufen nie in RSC").
 * ⛔ Wer diese Zeile in eine NICHT-Testdatei kopiert, faerbt `src/core/shell/icons.test.ts`
 * rot — zu Recht. Der TIEFERE Grund, warum es dort ueberhaupt gutgeht, steht in
 * `CLAUDE.md`, Falle 7: Vitest laedt `react` ueber die `default`-Bedingung, es gibt keine
 * RSC-Ebene und damit keinen Falle-7-Wurf.
 *
 * `{}` STATT `process.env` UEBERALL, WO ES GEHT — dieselbe Entscheidung wie in
 * `src/core/auth/devGroups.test.ts:13-18`: der Test soll die REGISTRY pruefen, nicht die
 * `.env.local` der Maschine, auf der er gerade laeuft. Ein dort gesetztes
 * SUITE_HOST_RADIO machte den Test sonst auf einem Rechner rot und auf dem naechsten
 * gruen.
 */
const OHNE_ENV = {};

describe("radio: der Registry-Eintrag", () => {
  it("existiert unter dem Schluessel radio", () => {
    // Der Existenzfall steht vorn, damit die Ursache EINMAL namentlich in der Ausgabe
    // steht statt achtmal — `getModule` wirft `Unknown module: radio`
    // (`registry.ts:212-216`), es gibt also kein `null`, ueber das die folgenden Faelle
    // stolperten. Und weil dies die einzige Aussage ueber `findModule` (`:219-221`) ist.
    expect(findModule("radio")).not.toBeNull();
  });

  it("heisst Funkgeraete — der Titel steht in der Registry, nicht in der Release-Notiz", () => {
    // Spec:772-774: eine andere Betreiber-Wortwahl kostet EINE Zeile hier und keinen Code.
    // `CLAUDE.md`, Abschnitt „Release Notes", verbietet, den Modultitel in einer
    // Neuigkeitennotiz zu wiederholen — er steht hier und nur hier.
    expect(getModule("radio").title).toBe("Funkgeräte");
  });

  it("traegt requiresAuth: false — sonst schickt decideRoute JEDEN anonymen Aufruf in den Login", () => {
    /*
     * Spec:163-167. `/t/<code>` ist der Weg, den ein GESCANNTER QR-Code nimmt, und das
     * Gate auf `/` ist der Einstieg der anonymen Ausleihe. Mit `requiresAuth: true`
     * schickte `decideRoute` (routing.ts:71-73) jeden anonymen Aufruf in den Login — und
     * zwar sofort beim Umschwenk des Routers, OHNE Parallelfenster.
     */
    expect(getModule("radio").requiresAuth).toBe(false);
  });

  it("hat requiredGroups leer — unter requiresAuth: false waere jeder andere Wert eine Luege", () => {
    /*
     * Spec:191. Der Wert ist unter `requiresAuth: false` fuer das Gating WIRKUNGSLOS:
     * `canAccess` steigt vorher mit `true` aus (registry.ts:260). Eine gefuellte Liste
     * behauptete eine Wirkung, die es nicht gibt.
     *
     * Gelesen ueber `requiredGroupsFor`, NICHT ueber `mod.requiredGroups`: nur so faellt
     * ein gesetztes SUITE_ACCESS_GROUP_RADIO auf (registry.ts:242-244).
     */
    expect(requiredGroupsFor(getModule("radio"), OHNE_ENV)).toEqual([]);
  });

  it("hat prodHosts leer — die Domain steht AUSSCHLIESSLICH in SUITE_HOST_RADIO", () => {
    /*
     * Spec:159-161, dieselbe Betreiberauflage wie bei `lagerbuch` (registry.ts:106-108).
     * ⚠️ Der einzige Kollisionsfall im Repo ist `portal`, das `iuk-ue.de` DIREKT im Code
     * fuehrt (registry.ts:59) — und `validateHostConfig` sieht genau diese Kollision
     * NICHT, weil es seine Karte ausschliesslich aus `envHostsFor` fuellt
     * (lagerbuch/_lib/host.ts:98-104). Deshalb steht hier eine Behauptung ueber `radio`
     * und darunter eine ueber `portal`.
     */
    expect(prodHostsFor(getModule("radio"), OHNE_ENV)).toEqual([]);
  });

  it("beansprucht iuk-ue.de nicht — das fuehrt portal per prodHosts, und der Boot merkt es nicht", () => {
    expect(moduleForHost("iuk-ue.de", OHNE_ENV)?.key).toBe("portal");
  });

  it("ist ohne jede Env unter radio.localtest.me erreichbar", () => {
    // `moduleForHost` trifft `<key>.localtest.me` VOR und UNABHAENGIG von prodHostsFor
    // (registry.ts:246-253). Genau das macht in Z3 den „kein Prod-Host konfiguriert →
    // durchlassen"-Zweig ueberfluessig.
    expect(moduleForHost("radio.localtest.me", OHNE_ENV)?.key).toBe("radio");
  });

  it("traegt shell: full — der Wert gilt fuer die Verwaltung, nicht fuer den Ausleih-Zweig", () => {
    /*
     * Falle 23 (docs/radio-portierung-analyse.md:1547-1576): „Das Feld, das der Entwurf
     * zuerst vergass, ist `shell`" — `radio` braucht auf DEMSELBEN Host zwei Regime, und
     * ein einzelnes Registry-Feld kann das nicht ausdruecken. `registry.shell` packt
     * NICHTS ein; das Modul-Layout entscheidet (Pflicht 23). Deshalb rendert nur der
     * `RadioVerwaltungsRahmen` (Z6) eine Shell mit diesem Wert.
     *
     * Nebenwirkung, die hier festgehalten gehoert: `shell: "full"` erlaubt der
     * Verwaltungsnavigation `abschnitt:` (Spec:732-733) — `core/shell/navAbschnitte.test.ts:56-70`
     * verbietet es nur fuer `minimal`- und `kiosk`-Module.
     */
    expect(getModule("radio").shell).toBe("full");
  });

  it("zeigt die Kachel im Umschalter fuer JEDEN — switcherGroupSources ist leer, nicht [admin]", () => {
    /*
     * Spec:173-176, Betreiberentscheidung 5: die Kachel IST der zweite Zugangsweg zur
     * Ausleihe, auch fuer Personen ohne Verwaltungsgruppe. Ein `["admin"]` wie bei
     * `lagerbuch` verbaute genau diesen Weg (visibleSwitcherModules, registry.ts:271-279).
     *
     * Und: `showInSwitcher: true` entscheidet mit, WER die Release-Notizen zum Modul sieht —
     * `auswahl.ts:48` unter `src/app/m/portal/_lib`, im Unterverzeichnis der
     * Release-Notizen, ruft dafuer `visibleSwitcherModules`.
     *
     * ⛔ DIE ZWEI PFADE IN DIESEM ABSATZ STEHEN ABSICHTLICH ZERLEGT und nicht als
     * eine Zeichenkette. Der Waechter `register.test.ts:181-186` (dieselbe Ablage)
     * scannt JEDE Quelldatei ausserhalb von `m/portal` auf die Zeichenfolge aus
     * `_lib` und dem Verzeichnisnamen — der Scan ist TEXTUELL, nicht importbezogen
     * (`readFileSync` + Regex, `:184`), und faengt deshalb auch die blosse
     * Erwaehnung in einem Kommentar. GEMESSEN am 2026-08-22: mit der ungeteilten
     * Fassung war `register.test.ts` rot, mit dieser Datei als einzigem Treffer
     * (`1 failed | 441 passed (442)`). Wer den Pfad hier wieder zusammenzieht,
     * faerbt ihn erneut — der Waechter ist richtig, die Erwaehnung war es nicht.
     */
    expect(getModule("radio").showInSwitcher).toBe(true);
    expect(getModule("radio").switcherGroupSources).toEqual([]);
  });

  it("hat sein Icon in der ICONS-Map — sonst traegt es STILL das Portal-Icon", () => {
    /*
     * DIE FALLE, DIE SCHON EINMAL ZUGESCHLAGEN HAT (icons.ts:22-28,
     * AppUmschalter.test.tsx:203-215): beim Registry-Eintrag von `files` (2026-07-30)
     * stand `FolderOutlined` nicht in der Map — der Eintrag trug daraufhin still das
     * Portal-Icon. Kein Fehler, kein Log, nur ein falsches Bild in JEDER Kopfzeile und in
     * JEDEM Portal-Raster.
     *
     * `icon` muss ein Schluessel DIESER Map sein, nicht bloss ein existierender
     * @ant-design/icons-Name.
     */
    expect(Object.keys(ICONS)).toContain(getModule("radio").icon);
  });
});

describe("radio: der Verwaltungszugang wird ueber die Gruppe aufgeloest, nie ueber das Feld", () => {
  const alterWert = process.env.SUITE_ADMIN_GROUP_RADIO;
  const zuruecksetzen = () => {
    if (alterWert === undefined) delete process.env.SUITE_ADMIN_GROUP_RADIO;
    else process.env.SUITE_ADMIN_GROUP_RADIO = alterWert;
  };

  it("schlaegt ohne Env auf den Registry-Vorschlag zurueck", () => {
    // ⬜ E1: ob die Gruppe in Pocket ID wirklich so heisst, weiss nur der Betreiber
    // (Spec:766-768). Der Registry-Wert ist ein VORSCHLAG, kein bestaetigter Name.
    expect(adminGroupsFor(getModule("radio"), OHNE_ENV)).toEqual(["iuk-radio-admin"]);
  });

  it("laesst SUITE_ADMIN_GROUP_RADIO gewinnen", () => {
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "eine-andere-gruppe";
      expect(adminGroupsFor(getModule("radio"))).toEqual(["eine-andere-gruppe"]);
    } finally {
      zuruecksetzen();
    }
  });

  it("nimmt einen LEEREN Wert als gueltige Aussage an — und genau das ist Falle 23", () => {
    /*
     * ⚠️ HIER STEHT KEINE SICHERHEITSZUSAGE, SONDERN IHRE ABWESENHEIT.
     * `SUITE_ADMIN_GROUP_RADIO=` (leer) ist eine GUELTIGE Aussage („keine modul-eigenen
     * Admins") und wird NICHT gemeldet — kein Boot-Abbruch, keine Logzeile
     * (docs/radio-portierung-analyse.md:1547-1576). In Verbindung mit Pflicht 17
     * (`.some()` auf leerer Liste gewaehrt nichts, Z4) sperrt das die Verwaltung fuer
     * ALLE aus, den Betreiber eingeschlossen.
     *
     * Dieser Fall kann den Zustand deshalb nicht VERHINDERN. Er haelt fest, dass er
     * eintritt — damit die naechste Person, die ihn erlebt, ihn hier wiederfindet statt
     * ihn zu suchen. Die Abhilfe ist eine Runbook-Zeile (Spec:751-757, Punkt 2), kein Code.
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "";
      expect(adminGroupsFor(getModule("radio"))).toEqual([]);
    } finally {
      zuruecksetzen();
    }
  });
});
