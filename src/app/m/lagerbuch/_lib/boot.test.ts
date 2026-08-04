import { describe, it, expect } from "vitest";
import { lagerbuchBootFehler } from "./boot";

/** Eine vollstaendige, gueltige Umgebung MIT Prod-Host. */
const OK: Record<string, string | undefined> = {
  SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
  SUITE_ADMIN_GROUP_LAGERBUCH: "lagerbuch_nutzer",
  LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
  AUTH_SECRET: "ein-anderes-suite-geheimnis",
};

describe("lagerbuchBootFehler — die Bedingtheit", () => {
  it("liefert OHNE Prod-Host KEINE EINZIGE Meldung, auch wenn alles fehlt", async () => {
    /**
     * §10.5: `assertHostConfig()` laeuft fuer die GANZE Suite. Eine unbedingte
     * Pflicht hiesse — sobald ein Image mit lagerbuch auf dem Server landet,
     * startet die Suite nicht mehr, portal/qr/feedback/files inklusive —, bis der
     * Betreiber die .env ergaenzt hat. Damit blockierte dieses Modul jeden
     * unbeteiligten Deploy im Fenster zwischen Merge und Cutover.
     */
    await expect(lagerbuchBootFehler({})).resolves.toEqual([]);
    await expect(lagerbuchBootFehler({
      SUITE_ACCESS_GROUP_LAGERBUCH: "irgendwas",
      LAGERBUCH_VERFALL_ROT_TAGE: "kaputt",
    })).resolves.toEqual([]);
  });

  it("liefert MIT Prod-Host und vollstaendiger Umgebung eine leere Liste", async () => {
    await expect(lagerbuchBootFehler(OK)).resolves.toEqual([]);
  });
});

describe("lagerbuchBootFehler — sie WIRFT NIE", () => {
  it("liefert auch bei durchweg kaputter Umgebung eine LISTE, keinen Wurf", async () => {
    /**
     * ⚠️ DIE WICHTIGSTE ZEILE DIESER DATEI. `grenzen()` WIRFT bei einem kaputten
     * Wert. Reichte dieser Wurf durch, braeche `assertHostConfig()` mit einem
     * fremden Fehler ab — und `assertHostConfig` laeuft fuer portal, qr, feedback
     * und files MIT. Ein Wurf naehme alle vier mit.
     */
    const fehler = await lagerbuchBootFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_VERFALL_ROT_TAGE: "fuenf",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "0x10",
      SUITE_ACCESS_GROUP_LAGERBUCH: "verboten",
    });
    expect(Array.isArray(fehler)).toBe(true);
    expect(fehler.length).toBeGreaterThanOrEqual(4);
  });
});

describe("lagerbuchBootFehler — Pruefungen 1 bis 4 kommen aus grenzenFehler", () => {
  it("reicht die Zahlen- und Geheimnis-Meldungen durch", async () => {
    const f = (await lagerbuchBootFehler({ ...OK, LAGERBUCH_VERFALL_ROT_TAGE: "90" })).join("\n");
    expect(f).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(f).toContain("Gelb-Zweig");
  });

  it("meldet ein fehlendes Sitzungsgeheimnis", async () => {
    const { LAGERBUCH_HELFER_SITZUNG_SECRET: _weg, ...ohne } = OK;
    expect((await lagerbuchBootFehler(ohne)).join("\n"))
      .toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });
});

describe("lagerbuchBootFehler — Pruefung 5: SUITE_ADMIN_GROUP_LAGERBUCH ist gesetzt", () => {
  it("meldet die FEHLENDE Variable, obwohl der Registry-Default greift", async () => {
    /**
     * ⚠️ DIESE PRUEFUNG LIEST DIE VARIABLE DIREKT und NICHT ueber
     * `adminGroupsFor` — das faellt bei nicht gesetzter Variable auf
     * `mod.adminGroups` zurueck (`core/groups.ts:83`), also auf den
     * ENTWICKLUNGS-Vorgabewert `["lagerbuch_nutzer"]`, und meldete nichts.
     *
     * Die haeufigste Go-live-Fehlkonfiguration ist genau die: der Betreiber
     * vergisst die Zeile, der Registry-Default greift, in Pocket ID ist aber
     * niemand in einer Gruppe namens `lagerbuch_nutzer` — und die Folge ist ein
     * STUMMES 404 fuer ALLE Verwaltenden, weil der Suite-Admin-Kurzschluss fuer
     * dieses Modul bewusst nicht gilt (Betreiber-Entscheidung 3, §3.6.2).
     */
    const { SUITE_ADMIN_GROUP_LAGERBUCH: _weg, ...ohne } = OK;
    const f = (await lagerbuchBootFehler(ohne)).join("\n");
    expect(f).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
    expect(f).toContain("404");
  });

  it("meldet die LEER gesetzte Variable", async () => {
    for (const wert of ["", "   ", ","]) {
      expect((await lagerbuchBootFehler({ ...OK, SUITE_ADMIN_GROUP_LAGERBUCH: wert })).join("\n"))
        .toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
    }
  });

  it("meldet NICHT, wenn ein Wert gesetzt ist — auch nicht den FALSCHEN", async () => {
    // ⚠️ Diese Pruefung faengt den LEEREN, nicht den FALSCHEN Wert. Ein falscher
    // Gruppenname sperrt jede verwaltende Person aus, und der einzige Weg zurueck
    // ist eine .env-Aenderung auf dem Server. Das steht als Runbook-Zeile in §6.
    await expect(lagerbuchBootFehler({ ...OK, SUITE_ADMIN_GROUP_LAGERBUCH: "tippfehler" }))
      .resolves.toEqual([]);
  });
});

describe("lagerbuchBootFehler — Pruefung 6: SUITE_ACCESS_GROUP_LAGERBUCH ist NICHT gesetzt", () => {
  it("meldet einen GESETZTEN Wert und nennt den Ausweg", async () => {
    /**
     * Ein gesetzter Wert waere STILL WIRKUNGSLOS: `canAccess` steigt fuer
     * `requiresAuth: false` sofort mit `true` aus (`core/registry.ts:155`) und
     * liest `requiredGroups` NIE. `validateGroupConfig` (`core/groups.ts:120-142`)
     * meldet nur den LEER gesetzten Fall (`:137`) — der Betreiber setzte also eine
     * Zugangsgruppe, bekaeme keine Warnung, und das Modul bliebe fuer jeden offen.
     */
    const f = (await lagerbuchBootFehler({ ...OK, SUITE_ACCESS_GROUP_LAGERBUCH: "irgendwer" }))
      .join("\n");
    expect(f).toContain("SUITE_ACCESS_GROUP_LAGERBUCH");
    expect(f).toContain("requiresAuth");
    expect(f).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");   // der Ausweg
  });

  it("meldet auch den LEER gesetzten Wert", async () => {
    // Den faengt `validateGroupConfig` bereits — aber zwei Meldungen sind besser
    // als eine fehlende, und die hiesige nennt den Grund, warum die Variable fuer
    // DIESES Modul gar nicht existieren darf.
    expect((await lagerbuchBootFehler({ ...OK, SUITE_ACCESS_GROUP_LAGERBUCH: "" })).join("\n"))
      .toContain("SUITE_ACCESS_GROUP_LAGERBUCH");
  });

  it("meldet NICHTS, wenn die Variable gar nicht vorkommt", async () => {
    await expect(lagerbuchBootFehler(OK)).resolves.toEqual([]);
  });
});
