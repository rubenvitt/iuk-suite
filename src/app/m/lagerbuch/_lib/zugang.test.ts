import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { users } from "../_db/schema";

/**
 * DREI MOCKS, UND JEDER HAT EINEN GRUND.
 *
 * `next/navigation`: `redirect()` und `notFound()` werfen in der echten Laufzeit
 * Next-interne Fehler. Fuer die Unit-Aussage genuegt ein ERKENNBARER Wurf —
 * geprueft wird, DASS und WOHIN geworfen wird. Dieselbe Form wie in
 * `_lib/host.test.ts` (Teil 1, T10).
 *
 * `next/headers`: `requireLagerbuchAdmin` ruft `headers()`, und das gibt es
 * ausserhalb einer Anfrage nicht.
 *
 * `@/core/auth`: `auth()` liest das Session-JWT. Der Test steuert die Sitzung.
 *
 * `../_db/client`: `requireLagerbuchAdmin` ruft `merkeNutzer(getDb(), viewer)`.
 * Statt eines Stubs bekommt es eine ECHTE, migrierte Test-Datenbank — nur so
 * belegt dieser Test die Zusage „der Upsert laeuft NACH dem Riegel" (§3.7.2),
 * und ein Stub koennte sie nicht zeigen.
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
vi.mock("next/headers", () => ({ headers: async () => hostKopf }));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let t: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => t.db }));

import {
  viewerAusSession, viewerOderNull, istLagerbuchAdmin,
  verwaltungsZiel, requireLagerbuchAdmin, adminLandingPfad,
  _resetGemeldeteGruppen,
} from "./zugang";
import { _resetNamenlosGemeldet } from "./konto";

const ADMIN = { user: { id: "sub-1", groups: ["lagerbuch_nutzer"], name: "Anna Beispiel",
                        email: "anna@example.org" } };
const OHNE_GRUPPE = { user: { id: "sub-2", groups: ["irgendwas"], name: "Bert", email: null } };
const SUITE_ADMIN = { user: { id: "sub-3", groups: ["dashboard-admins"], name: "Chef",
                              email: "chef@example.org" } };

const altGruppe = process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
const altHost = process.env.SUITE_HOST_LAGERBUCH;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-zugang-");
  sitzung = null;
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  delete process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
  delete process.env.SUITE_HOST_LAGERBUCH;
  /**
   * DIE BEIDEN DEDUP-SPEICHER SIND MODULWEIT UND PROZESS-LOKAL — sie ueberleben
   * also jeden Testfall dieser Datei. Ohne diese zwei Zeilen faellt „meldet die
   * fehlende Gruppe EINMAL JE PERSON": die beiden Faelle davor weisen sub-3 und
   * sub-2 bereits ab, sub-2 steht danach im Set, und der Dedup-Fall saehe NULL
   * statt EINEM Aufruf. Der Fehlschlag ist echt und wurde gesehen, bevor diese
   * Zeilen entstanden — dafuer tragen `zugang.ts` und `konto.ts` die Haken.
   *
   * Der WARN-SPY steht hier, weil zwei Faelle (Suite-Admin und Eingeloggter ohne
   * Gruppe) sonst je eine echte Zeile in die Suitenausgabe schreiben. Die Faelle,
   * die das Loggen PRUEFEN, legen ihren eigenen Spy darueber.
   */
  _resetGemeldeteGruppen();
  _resetNamenlosGemeldet();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  t.schliessen();
  if (altGruppe === undefined) delete process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
  else process.env.SUITE_ADMIN_GROUP_LAGERBUCH = altGruppe;
  if (altHost === undefined) delete process.env.SUITE_HOST_LAGERBUCH;
  else process.env.SUITE_HOST_LAGERBUCH = altHost;
});

describe("viewerAusSession — VIER Felder, nicht zwei", () => {
  it("uebernimmt sub, groups, name und email", () => {
    /**
     * BEWUSST NICHT aus `m/files/_lib/access.ts:107-113` kopiert: dort hat
     * `Viewer` ZWEI Felder (sub, groups), hier VIER. `merkeNutzer(db, viewer)`
     * schreibt name und email in `users`; eine zweifeldrige Kopie truege still
     * `null` in beide Spalten und erzeugte damit den benannten Defektzustand aus
     * §4.13 — eine ROHE sub-Kennung im Journal statt eines Namens.
     *
     * Die Werte liegen an: `core/auth/config.ts:163-176` laesst
     * session.user.name/email UNANGETASTET und setzt nur groups, isAdmin und id.
     */
    expect(viewerAusSession(ADMIN)).toEqual({
      sub: "sub-1", groups: ["lagerbuch_nutzer"],
      name: "Anna Beispiel", email: "anna@example.org",
    });
  });

  it("ohne user.id gibt es keinen Viewer", () => {
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({})).toBeNull();
    expect(viewerAusSession({ user: {} })).toBeNull();
    expect(viewerAusSession({ user: { groups: ["lagerbuch_nutzer"] } })).toBeNull();
  });

  it("ein fehlender groups-Claim ist die LEERE MENGE, kein 500", () => {
    // Sonst haenge die Fehlerform an der Token-Version: ein aelteres Token ohne
    // `groups` liefe in einen Absturz statt in den 404 des Riegels.
    expect(viewerAusSession({ user: { id: "s" } }))
      .toEqual({ sub: "s", groups: [], name: null, email: null });
  });

  it("macht aus fehlendem name/email null, nicht undefined", () => {
    // `undefined` in einer Drizzle-`set`-Klausel bedeutet „Spalte nicht anfassen",
    // `null` bedeutet „auf NULL setzen". Der Unterschied entscheidet in
    // merkeNutzer ueber den Defektzustand.
    const v = viewerAusSession({ user: { id: "s", groups: [] } });
    expect(v?.name).toBeNull();
    expect(v?.email).toBeNull();
  });
});

describe("viewerOderNull — die nicht-werfende Form", () => {
  it("liefert den Viewer der laufenden Sitzung", async () => {
    sitzung = ADMIN;
    expect(await viewerOderNull()).toEqual({
      sub: "sub-1", groups: ["lagerbuch_nutzer"],
      name: "Anna Beispiel", email: "anna@example.org",
    });
  });

  it("liefert OHNE Sitzung null — und wirft NICHT", async () => {
    sitzung = null;
    await expect(viewerOderNull()).resolves.toBeNull();
  });

  it("prueft den Host ABSICHTLICH NICHT", async () => {
    /**
     * §2.6, Ausnahme: wer `requireLagerbuchHost` hier aus Analogie zu
     * `requireLagerbuchAdmin` nachtraegt, verwandelt das Praedikat zurueck in
     * einen Wurf — und schickte damit jeden anonymen Scan eines Regaletiketts
     * nach /login. Der Host-Riegel steht in allen drei aufrufenden Dateien
     * ohnehin als ERSTE Anweisung, vor dieser Funktion.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    sitzung = ADMIN;
    await expect(viewerOderNull()).resolves.toMatchObject({ sub: "sub-1" });
  });
});

describe("istLagerbuchAdmin — KEINE Suite-Admin-Abkuerzung", () => {
  it("laesst ein Mitglied der Admin-Gruppe durch", () => {
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(true);
  });

  it("weist den SUITE-Admin ohne Lagerbuch-Gruppe ab", () => {
    /**
     * Betreiber-Entscheidung 3. `isModuleAdmin` (`core/groups.ts:103-105`) laesst
     * ihn unbedingt durch, und der Kurzschluss ist dort begruendet („Ist ueberall
     * Admin, damit ein Modul nicht aussperrbar ist"). Fuer lagerbuch wiegt die
     * Gegenseite schwerer: Admin heisst hier Bestand korrigieren, aussondern,
     * Zugangs-Codes ausstellen und sperren, das JOURNAL MIT KLARNAMEN lesen und
     * Etiketten mit den CODES IM KLARTEXT drucken.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `istLagerbuchAdmin` auf
     * `isModuleAdmin` umstellen. Beide Dev-Logins der Suite setzen
     * `isAdmin = true`, die E2E blieben also ebenfalls gruen.
     */
    expect(istLagerbuchAdmin(viewerAusSession(SUITE_ADMIN))).toBe(false);
  });

  it("weist einen Eingeloggten ohne Gruppe ab", () => {
    expect(istLagerbuchAdmin(viewerAusSession(OHNE_GRUPPE))).toBe(false);
  });

  it("weist null ab", () => {
    expect(istLagerbuchAdmin(null)).toBe(false);
  });

  it("EINE LEERE GRUPPENLISTE GEWAEHRT NICHTS", () => {
    /**
     * DIE ZEILE, DIE AM TEUERSTEN FEHLT. `canAccess` (`registry.ts:157-159`)
     * steigt bei leerer Liste mit `true` aus — `core/groups.ts:53-54` nennt das
     * woertlich „eine OEFFNUNG". Wer diese Verknuepfung abschreibt, oeffnet die
     * Lagerbuch-Verwaltung fuer JEDEN Eingeloggten, und der Fehler ist still:
     * alles funktioniert, fuer zu viele.
     *
     * `SUITE_ADMIN_GROUP_LAGERBUCH=` (leer) sperrt damit ALLE aus dem
     * Verwaltungszweig aus — die richtige, restriktive Richtung. Dass das eine
     * Fehlkonfiguration ohne Rueckweg ist, faengt die Boot-Pruefung aus Teil 3
     * (§10.5, Pruefung 5) ab, nicht diese Funktion.
     */
    process.env.SUITE_ADMIN_GROUP_LAGERBUCH = "";
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(false);
    expect(istLagerbuchAdmin(viewerAusSession(SUITE_ADMIN))).toBe(false);
  });

  it("SUITE_ADMIN_GROUP_LAGERBUCH schlaegt den Registry-Wert", () => {
    /**
     * Die Mutation, die ohne diesen Fall gruen bliebe: `mod.adminGroups` statt
     * `adminGroupsFor(mod)`. Der direkte Feldzugriff macht die Env-Variable an
     * genau dieser Stelle wirkungslos — dieselbe Falle, die `registry.ts:28-34`
     * fuer prodHosts ausschreibt und die vor dem feedback-Cutover einmal
     * zugeschlagen hat.
     */
    process.env.SUITE_ADMIN_GROUP_LAGERBUCH = "anders-benannte-gruppe";
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(false);
    expect(istLagerbuchAdmin({ sub: "x", groups: ["anders-benannte-gruppe"],
                               name: null, email: null })).toBe(true);
  });

  it("liest requiredGroups NICHT mit", () => {
    /**
     * Die `files`-Verknuepfung (`requireFilesAccess` vereinigt adminGroupsFor mit
     * requiredGroupsFor) ist DORT richtig, weil beide Variablen dieselbe eine
     * Stufe gewaehren. Hier waere sie eine stille ZWEITE TUER ins Journal mit
     * Klarnamen und auf den Etikettenbogen (§2.5, Punkt 3).
     */
    process.env.SUITE_ACCESS_GROUP_LAGERBUCH = "zweite-tuer";
    try {
      expect(istLagerbuchAdmin({ sub: "x", groups: ["zweite-tuer"],
                                 name: null, email: null })).toBe(false);
    } finally {
      delete process.env.SUITE_ACCESS_GROUP_LAGERBUCH;
    }
  });
});

describe("verwaltungsZiel — absolut, sobald ein Prod-Host bekannt ist", () => {
  it("liefert VOR dem Cutover den relativen INNEREN Pfad", () => {
    // Ein geratener absoluter Host waere still fatal: `suiteRedirect` erlaubt ein
    // absolutes Ziel nur, wenn `moduleForHost` den Host kennt — ein unbekannter
    // landet STUMM auf dem Portal. Ein relativer Pfad geht unveraendert durch
    // (`core/auth/redirect.ts:41`).
    expect(verwaltungsZiel()).toBe("/m/lagerbuch/verwaltung");
  });

  it("liefert NACH dem Cutover das absolute AEUSSERE Ziel", () => {
    // Ein relatives Ziel setzte die verwaltende Person auf dem PORTAL-Host ab,
    // weil AUTH_URL suiteweit derselbe Wert ist (`core/auth/redirect.ts:8-18`) —
    // und entwertete den ganzen returnTo-Apparat.
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    expect(verwaltungsZiel()).toBe("https://lagerbuch.iuk-ue.de/verwaltung");
  });

  it("nimmt den ERSTEN Host, wenn mehrere gesetzt sind", () => {
    // §2.6 erlaubt >= 2 Hosts (etwa eine abgeloeste Domain, die mitlaeuft). Der
    // Rueckweg des Logins gehoert auf den kanonischen, also den ersten.
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de,alt.iuk-ue.de";
    expect(verwaltungsZiel()).toBe("https://lagerbuch.iuk-ue.de/verwaltung");
  });
});

describe("requireLagerbuchAdmin — der Backstop", () => {
  it("prueft den HOST vor der Person", async () => {
    /**
     * Die Host-Zeile steht hier ZUSAETZLICH, nicht ersatzweise: die Layouts rufen
     * requireLagerbuchHost ohnehin, aber requireLagerbuchAdmin wird auch aus
     * SERVER ACTIONS gerufen, und die haben kein Layout ueber sich. Der doppelte
     * Aufruf kostet einen Header-Lookup und schliesst dieselbe Luecke, die §2.6
     * fuer die Helfer-Actions ueber requireHelferSitzung schliesst.
     *
     * Fuer die Verwaltung ist das KEIN Autorisierungsgewinn (der Zugriffsriegel
     * ist host-blind und vollstaendig), sondern die Vermeidung einer ZWEITEN
     * funktionierenden Herkunft des Moduls.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    sitzung = ADMIN;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");

    /**
     * ⚠️ DIE MELDUNG ALLEIN BELEGT DIE REIHENFOLGE NICHT. Mit `sitzung = ADMIN`
     * endet der Aufruf in BEIDEN Reihenfolgen mit NEXT_NOT_FOUND — der Fall
     * zeigte dann nur die ANWESENHEIT der Host-Zeile, nicht ihre Stelle. Wer sie
     * ans Ende der Funktion verschiebt, bliebe gruen und schriebe dabei eine
     * users-Zeile fuer eine Anfrage vom FREMDEN Host.
     *
     * Die naechste Zeile pinnt Host VOR Upsert.
     */
    expect(t.db.select().from(users).all()).toHaveLength(0);
  });

  it("prueft den HOST vor der SITZUNG — fremder Host wirft, statt nach /login zu leiten", async () => {
    /**
     * Der zweite Teil derselben Zusicherung. OHNE Sitzung unterscheiden sich die
     * beiden Reihenfolgen sichtbar: steht der Host-Riegel zuerst, ist die Antwort
     * NEXT_NOT_FOUND; stuende die Sitzungspruefung davor, waere es ein
     * NEXT_REDIRECT nach /login — und damit verriete ein fremder Host die
     * EXISTENZ des Verwaltungszweigs, genau das, was §3.3 ausschliesst.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    sitzung = null;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("laesst ein Mitglied der Admin-Gruppe durch und liefert den Viewer", async () => {
    sitzung = ADMIN;
    const v = await requireLagerbuchAdmin();
    expect(v.sub).toBe("sub-1");
    expect(v.groups).toEqual(["lagerbuch_nutzer"]);
  });

  it("leitet OHNE Sitzung auf /login — mit callbackUrl", async () => {
    sitzung = null;
    await expect(requireLagerbuchAdmin()).rejects
      .toThrow(`NEXT_REDIRECT:/login?callbackUrl=${encodeURIComponent("/m/lagerbuch/verwaltung")}`);
  });

  it("leitet OHNE Sitzung mit gesetztem Prod-Host auf das ABSOLUTE Ziel", async () => {
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    sitzung = null;
    await expect(requireLagerbuchAdmin()).rejects.toThrow(
      `NEXT_REDIRECT:/login?callbackUrl=${encodeURIComponent("https://lagerbuch.iuk-ue.de/verwaltung")}`,
    );
  });

  it("antwortet dem Suite-Admin ohne Lagerbuch-Gruppe mit 404, nicht 403", async () => {
    // Suite-Standard (§3.3, Entscheidung 10a): was nicht freigegeben ist, sieht
    // genauso aus wie etwas, das es nicht gibt. Der bewusst hingenommene Verlust
    // ist die Benennbarkeit; der Gegenwert ist, dass die EXISTENZ von
    // /verwaltung nicht verraten wird.
    sitzung = SUITE_ADMIN;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("antwortet einem Eingeloggten ohne Gruppe mit 404", async () => {
    sitzung = OHNE_GRUPPE;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("meldet die fehlende Gruppe EINMAL JE PERSON, nicht je Anfrage", async () => {
    /**
     * Der Riegel liegt auf einem 404-Pfad, den ein Bot beliebig oft treffen kann;
     * unbegrenztes Loggen waere ein Flutungsvektor und machte `docker logs` fuer
     * genau den Zweck unbrauchbar, fuer den die Zeile da ist.
     *
     * Sie ersetzt `lagerbuch/src/auth.config.ts:94-99` — den einzigen Ort, an dem
     * heute sichtbar wird, WELCHE Gruppen im Token standen; laut Kommentar dort
     * die Antwort auf die haeufigste Fehlkonfiguration beim Go-live. Ein grep auf
     * `console\.` ueber `src/core/auth/` liefert null Treffer: die Suite
     * antwortet stumm.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sitzung = OHNE_GRUPPE;
      for (let i = 0; i < 5; i++) {
        await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      }
      expect(warn).toHaveBeenCalledTimes(1);
      const text = String(warn.mock.calls[0]?.[0]);
      expect(text).toContain("[lagerbuch]");
      expect(text).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
      expect(text).toContain("lagerbuch_nutzer");   // die ERWARTETE Gruppe
      expect(text).toContain("irgendwas");         // die VORHANDENEN Gruppen
      // KEINE Kennung, keine E-Mail, kein Name — dieselbe Form wie heute.
      expect(text).not.toContain("sub-2");
      expect(text).not.toContain("Bert");
    } finally {
      warn.mockRestore();
    }
  });

  it("schreibt den users-Satz NACH dem Riegel — und nur fuer den, der durchkommt", async () => {
    // §3.7.2: „nur wer die Pruefung uebersteht, wird zuordenbar". Die Zeile
    // entsteht kuenftig beim ERSTEN AUFRUF DER VERWALTUNG, nicht mehr beim Login
    // (die Suite hat keinen events-Block, Falle 22).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sitzung = OHNE_GRUPPE;
      await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(t.db.select().from(users).all()).toHaveLength(0);

      sitzung = ADMIN;
      await requireLagerbuchAdmin();
      const zeilen = t.db.select().from(users).all();
      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]).toMatchObject({ id: "sub-1", name: "Anna Beispiel",
                                        email: "anna@example.org" });
    } finally {
      warn.mockRestore();
    }
  });
});

describe("adminLandingPfad — 1:1 aus dem Bestand, minus einem Zweig", () => {
  it("faellt ohne Ziel auf /verwaltung", () => {
    expect(adminLandingPfad(null)).toBe("/verwaltung");
    expect(adminLandingPfad(undefined)).toBe("/verwaltung");
    expect(adminLandingPfad("")).toBe("/verwaltung");
  });

  it("behaelt ein Verwaltungsziel", () => {
    expect(adminLandingPfad("/verwaltung")).toBe("/verwaltung");
    expect(adminLandingPfad("/verwaltung/artikel")).toBe("/verwaltung/artikel");
    expect(adminLandingPfad("/verwaltung?tab=x")).toBe("/verwaltung?tab=x");
  });

  it("behaelt ein gescanntes Regaletikett als Ziel", () => {
    // /a/{id} leitet angemeldete Admins selbst in die Verwaltung weiter, ist also
    // schleifenfrei — so bleibt ein gescanntes Etikett als Ziel erhalten.
    expect(adminLandingPfad("/a/art-1")).toBe("/a/art-1");
    expect(adminLandingPfad("/a")).toBe("/a");
  });

  it("SPERRT /helfer — sonst ist es eine Endlosschleife", () => {
    /**
     * `helfer/layout.tsx` ruft `requireHelferSitzung`, das eine verwaltende
     * Person OHNE Helfer-Sitzung sofort wieder aufs Gate schickt (§3.4.4) — mit
     * /helfer als returnTo waere das eine Endlosschleife.
     *
     * ⚠️ Der Kommentar im Bestand begruendet das mit „siehe helferGateDecision".
     * Die Funktion ENTFAELLT (§3.1); der Verweis ist beim Port auf
     * `requireHelferSitzung` umzuhaengen — und zwar im portierten Kommentar,
     * nicht nur in der Spec.
     */
    expect(adminLandingPfad("/helfer")).toBe("/verwaltung");
    expect(adminLandingPfad("/helfer/check?fz=rtw-1")).toBe("/verwaltung");
  });

  it("weist jedes fremde Ziel auf /verwaltung", () => {
    expect(adminLandingPfad("//boese.example/verwaltung")).toBe("/verwaltung");
    expect(adminLandingPfad("https://boese.example")).toBe("/verwaltung");
    expect(adminLandingPfad("/g/abc")).toBe("/verwaltung");
  });

  it("kennt den Zweig /verwaltung/kein-zugriff NICHT mehr", () => {
    /**
     * `lagerbuch/src/lib/auth/cordon.ts:41` faengt ihn ab. Die SEITE faellt
     * ersatzlos weg (§3.3, §11.4): sie lebt von .gate/.gatebrand/.gatesub aus
     * globals.css, die beim antd-Neubau ohnehin fallen, und ihr einziger realer
     * Zugangsweg — `pages.error` — existiert in der Suite nicht.
     *
     * Der Pfad ist danach ein gewoehnliches fremdes Ziel und landet auf
     * /verwaltung. Dieser Fall behauptet nur, dass es KEINEN Sonderzweig mehr
     * gibt — der wuerde sonst als toter Code mitwandern.
     */
    expect(adminLandingPfad("/verwaltung/kein-zugriff")).toBe("/verwaltung/kein-zugriff");
  });
});
