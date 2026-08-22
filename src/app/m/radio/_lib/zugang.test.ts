import { describe, it, expect, beforeEach } from "vitest";
import { viewerAusSession, istRadioAdmin, verwaltungsZiel, type RadioViewer } from "./zugang";

/**
 * NUR DIE REINEN FUNKTIONEN — kein `auth()`-Mock, kein `headers()`-Mock (Spec:650).
 *
 * `requireRadioAdmin` und `viewerOderNull` sind hier ABSICHTLICH nicht geprueft: beide
 * brauchen den Next-Anfragekontext, und ein Mock davon prueft den Mock. Was an ihnen
 * pruefbar IST, ist ihre BAUFORM — und die haelt `riegel.test.ts` (Z5) als
 * Quelltext-Zusicherung: die Reihenfolge Host-vor-Person und die Abwesenheit des
 * Host-Riegels in `viewerOderNull`.
 *
 * ⬜ Ihre WIRKUNG (Statuscode und Location-Kopf) ist ⬜ L7 und wird beim Cutover
 * abgelesen (docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091), nicht hier.
 */
const viewer = (groups: string[]): RadioViewer => ({ sub: "u-1", name: "Test Person", groups });
const kopf = (h: Record<string, string>) => new Headers(h);

/**
 * ⛔ DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht
 * angenommen: in diesem Repo laedt vitest KEINE `.env`-Datei (kein `dotenv` in
 * `vitest.config.ts`, `vitest.setup.ts` oder `package.json`). Ein lokal gesetztes
 * SUITE_ADMIN_GROUP_RADIO verfaelscht damit kein Tor — ein in der Shell oder in der CI
 * EXPORTIERTER Wert dagegen schon.
 *
 * Deshalb loescht `beforeEach` alle drei Variablen VOR jedem Fall, statt sich darauf zu
 * verlassen, dass der Prozess sie nicht mitbringt. `zuruecksetzen()` in `finally` stellt
 * den Ausgangszustand des Prozesses wieder her; die Form ist `try/finally` und nicht
 * `afterEach`, weil hier drei Variablen nebeneinanderstehen und ein Fall, der eine davon
 * setzt, die anderen nicht in einem Zwischenzustand hinterlassen darf. Vitest faehrt
 * Dateien parallel, Faelle INNERHALB einer Datei aber seriell.
 *
 * (Dieselbe Bauform wie `src/app/m/radio/_lib/host.test.ts:29-36`, dort fuer eine
 * Variable.)
 */
const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;
const zuruecksetzen = () => {
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
    ["SUITE_HOST_RADIO", alterHost],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
};
beforeEach(() => {
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_UPDATER_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
});

describe("viewerAusSession — reine Abbildung, ohne IO", () => {
  it("ohne user.id gibt es keinen Viewer", () => {
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({})).toBeNull();
    expect(viewerAusSession({ user: {} })).toBeNull();
  });

  it("ein fehlender groups-Claim ist die LEERE MENGE, kein Absturz", () => {
    // Sonst haenge die Fehlerform an der Token-Version: ein alter Token ohne `groups`
    // ergaebe 500 statt 404 (src/app/m/lagerbuch/_lib/zugang.ts:40-42).
    expect(viewerAusSession({ user: { id: "u-1" } })).toEqual({ sub: "u-1", name: null, groups: [] });
  });

  it("uebernimmt name, aber KEINE E-Mail — die users-Tabelle hat keine Spalte dafuer", () => {
    // `src/app/m/radio/_db/schema.ts:113-117`: sub, name, last_seen_at. Drei Felder,
    // drei Spalten.
    const v = viewerAusSession({ user: { id: "u-1", name: "A. Person", groups: ["g"] } });
    expect(v).toEqual({ sub: "u-1", name: "A. Person", groups: ["g"] });
    expect(Object.keys(v!).sort()).toEqual(["groups", "name", "sub"]);
  });
});

describe("istRadioAdmin — das Praedikat", () => {
  it("ohne Viewer: false", () => {
    expect(istRadioAdmin(null)).toBe(false);
  });

  it("mit der Registry-Vorgabegruppe: true", () => {
    // Das Env-Loeschen leistet das beforeEach oben (kein zweites hier, es waere tot).
    // Die Vorgabe steht in `src/core/registry.ts:193` (`adminGroups: ["iuk-radio-admin"]`).
    try {
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("SUITE_ADMIN_GROUP_RADIO greift — das Registry-Feld allein entscheidet NICHT", () => {
    /*
     * Der direkte Feldzugriff `mod.adminGroups` machte die Variable an genau dieser
     * Stelle wirkungslos, und der Fehler waere still: eine Instanz mit anders benannten
     * SSO-Gruppen liefe mit einem Riegel, der niemanden durchlaesst.
     * (`src/core/registry.ts:29-35` schreibt dieselbe Falle fuer `prodHosts` aus.)
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "leitung";
      expect(istRadioAdmin(viewer(["leitung"]))).toBe(true);
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("mit LEERER Admin-Liste: false — das .some()-Argument, und es ist Falle 23", () => {
    /*
     * `.some()` auf leerer Liste gewaehrt nichts. Das ist die richtige Richtung und
     * zugleich die stille Aussperrung: SUITE_ADMIN_GROUP_RADIO= (leer) ist eine GUELTIGE
     * Aussage und wird nicht gemeldet (docs/radio-portierung-analyse.md:1547-1576).
     * ⛔ Ein „leer bedeutet alle"-Zweig waere die Sperre, die sich selbst abschaltet.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — dieser Zweig existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "";
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
      expect(istRadioAdmin(viewer([]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte", () => {
    /*
     * Entscheidung 9 und Kapitel-4-Pflicht 17. `src/core/groups.ts:125` liesse ihn durch
     * (`if (groups.includes(suiteAdminGroup(env))) return true;`) — deshalb ist
     * `isModuleAdmin` hier NICHT die Quelle. `dashboard-admins` ist der Default von
     * ADMIN_GROUP (src/core/groups.ts:96-97).
     *
     * ⚠️ OHNE DIESEN FALL waere ein Umbau auf `isModuleAdmin` GRUEN — er sieht wie
     * Wiederverwendung aus und oeffnet /admin fuer jeden Suite-Betreiber. Genau das haelt
     * `src/app/m/lagerbuch/_lib/bauform.test.ts:230-249` mit einem Quelltext-Scan fest;
     * hier steht zusaetzlich die VERHALTENSaussage.
     *
     * Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(istRadioAdmin(viewer(["dashboard-admins"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR der Updater-Gruppe: false — die zweite Stufe weicht die erste NICHT auf", () => {
    /*
     * ⛔ DIE NAHT FUER PLANTEIL 4, ALS RIEGEL FORMULIERT (Betreiberentscheidung C.6 / B4,
     * 2026-08-21: zwei Rollen wie im Bestand).
     *
     * Planteil 4 baut die Updater-Stufe in `_lib/rollen.ts` (Spec:4420-4422), lesend aus
     * SUITE_UPDATER_GROUP_RADIO. Der naheliegende, falsche Weg dorthin ist, die Gruppe
     * HIER mit `||` danebenzustellen — das saehe nach „zwei Rollen" aus und waere eine
     * AUFWEICHUNG: jeder Updater kaeme durch jeden Admin-Riegel, und typecheck, lint und
     * build blieben alle drei gruen.
     *
     * Im Bestand ist die Rangfolge eindeutig: `mapGroupsToRole` gibt `admin` VOR
     * `updater` und `null` bei keinem Treffer (radio-admin/shared/src/role.ts:3-10);
     * `requireRole('admin')` sperrt ELF Routen hart — radio-admin/server/src/routes/
     * devices.ts:99,188, softwareVersions.ts:30,40,48,56, loans.ts:28, tokens.ts:22,44,47,
     * export.ts:71 —, und die eigentliche Differenzierung sitzt im FELD-Filter
     * `filterEditableFields`, nicht im Routing
     * (radio-admin/shared/src/editable-fields.ts:1-18). ⚠️ `role.ts` und `role.test.ts`
     * belegen NUR die Rangfolge; `requireRole` kommt dort nicht vor. ⚠️ Ein `grep` auf
     * `requireRole('admin')` liefert ZWOELF Zeilen — die zwoelfte, export.ts:66, ist ein
     * Kommentar, keine Route.
     *
     * ⬜ E1b: wie die Gruppe wirklich heisst, weiss nur der Betreiber
     * (docs/superpowers/plans/SPERREN-radio-spec2.md:110 — verfolgtes Dokument, nicht die
     * git-ignorierte Kladde unter `.superpowers/sdd/`). Dieser Fall setzt deshalb einen
     * FREI GEWAEHLTEN Wert und prueft die Richtung, nicht den Namen.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — das `||` existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     * Das Env-Loeschen von SUITE_ADMIN_GROUP_RADIO leistet das beforeEach oben.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      expect(istRadioAdmin(viewer(["eine-updater-gruppe"]))).toBe(false);
      // Und die Gegenrichtung: wer BEIDES hat, ist Admin — „admin gewinnt bei
      // Ueberschneidung" (radio-admin/shared/src/role.test.ts:15-17).
      expect(istRadioAdmin(viewer(["eine-updater-gruppe", "iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });
});

describe("verwaltungsZiel — absolutes Ziel fuer die callbackUrl", () => {
  it("nimmt den konfigurierten Prod-Host, auch wenn die Anfrage anders kam", () => {
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https" })))
        .toBe("https://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt ohne Prod-Host auf den ANGEFRAGTEN Host zurueck — aber nur, wenn er radio ist", () => {
    // Das Env-Loeschen leistet das beforeEach oben.
    try {
      expect(verwaltungsZiel(kopf({ host: "radio.localtest.me:3000" })))
        .toBe("http://radio.localtest.me:3000/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt auf den internen Pfad zurueck, wenn weder Prod-Host noch Radio-Host vorliegen", () => {
    /*
     * Das ist der Zustand VOR dem Cutover auf einem fremden Host. Ein absolutes Ziel waere
     * hier eine erfundene Domain; der interne Pfad ist die einzige ehrliche Antwort.
     * ⚠️ Er ist `/m/radio/admin` und NICHT `/admin` — die callbackUrl wird von der
     * Suite-Anmeldung aufgeloest, und die kennt nur interne Pfade.
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein FREMDER
     * Suite-Host. Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(verwaltungsZiel(kopf({ host: "iuk-ue.de" }))).toBe("/m/radio/admin");
      expect(verwaltungsZiel(kopf({}))).toBe("/m/radio/admin");
    } finally { zuruecksetzen(); }
  });

  it("liest das Protokoll aus x-forwarded-proto und nimmt bei Kommaliste den ersten Wert", () => {
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https,http" })))
        .toBe("https://radio.iuk-ue.de/admin");
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de" })))
        .toBe("http://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });
});
