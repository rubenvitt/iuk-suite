import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { quelleAufloeser } from "./quelle";
import { tokens, users } from "./schema";
import { merkeNutzer, _resetNamenlosGemeldet } from "../_lib/konto";

let t: TestDb;
beforeEach(() => { t = migrierteTestDb("lagerbuch-quelle-"); });
afterEach(() => t.schliessen());

const ALT_SUB = "a1b2c3d4-alt";       // Kennung aus dem historischen Journal
const NEU_SUB = "e5f6g7h8-neu";       // Kennung aus dem Suite-Login

describe("quelleAufloeser", () => {
  it("loest oidc → users.name auf", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("faellt auf die E-Mail zurueck, wenn kein Name da ist", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("loest token → tokens.label auf, nicht den Code", () => {
    // Der Code allein sagt niemandem etwas. Ein umkodierter Token-Code macht das
    // gesamte historische Journal namenlos.
    t.db.insert(tokens).values({ id: "tk1", code: "482-137", label: "RTW 1 Kaertchen",
      aktiv: true, createdAt: new Date(), createdBy: NEU_SUB }).run();
    expect(quelleAufloeser(t.db)("token", "482-137")).toBe("RTW 1 Kaertchen");
  });

  it("loest system → 'System'", () => {
    expect(quelleAufloeser(t.db)("system", "irgendwas")).toBe("System");
  });

  it("faellt bei unbekannter Kennung auf die ROHE ID zurueck", () => {
    expect(quelleAufloeser(t.db)("oidc", "gibt-es-nicht")).toBe("gibt-es-nicht");
    expect(quelleAufloeser(t.db)("token", "999-999")).toBe("999-999");
  });

  it("traegt BEIDE Kennungsraeume nebeneinander — deshalb gibt es keine Zuordnungstabelle", () => {
    // Historische Zeilen tragen den Alt-`sub` und finden ihre importierte Zeile;
    // neue Zeilen tragen den Neu-`sub` und finden die vom Upsert geschriebene.
    // Es gibt keine Kollision, weil beide Werte Primaerschluessel DERSELBEN Tabelle
    // sind — und die Kennung wird nirgends gefiltert, gruppiert oder aggregiert,
    // nur angezeigt (§4.13).
    t.db.insert(users).values({ id: ALT_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    const q = quelleAufloeser(t.db);
    expect(q("oidc", ALT_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("DER BENANNTE DEFEKTZUSTAND: name UND email null → die rohe Kennung", () => {
    /**
     * Der Test verhindert den Zustand NICHT — er macht ihn benannt und auffindbar,
     * statt ihn als „unerklaerliche UUID im Journal" wiederzuentdecken.
     *
     * Der Ausfall im Klartext: eine Person bucht nach dem Cutover, und das Journal
     * zeigt fuer DIESE Zeile eine rohe sub-Kennung, waehrend ihre Zeilen von VOR dem
     * Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in
     * derselben Liste.
     *
     * Zwei moegliche Ursachen, beide sofort zu melden statt still hinzunehmen: die
     * Suite-Sitzung fuehrt keine name/email-Claims, oder `merkeNutzer` laeuft an
     * einer Stelle, an der die Claims noch nicht vorliegen.
     */
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: null }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe(NEU_SUB);
  });

  it("trimmt — ein Name aus Leerzeichen zaehlt nicht als Name", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "   ", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("laedt beide Nachschlagetabellen EINMAL und ist danach wiederverwendbar", () => {
    // Den Resolver pro Request bauen und ueber alle Zeilen wiederverwenden — eine
    // Journalseite hat bis zu JOURNAL_GRENZE Zeilen.
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel" }).run();
    const q = quelleAufloeser(t.db);
    // Zeile NACH dem Bau eingefuegt: der Resolver sieht sie bewusst nicht mehr.
    t.db.insert(users).values({ id: "spaeter", name: "Zu spaet" }).run();
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", "spaeter")).toBe("spaeter");
  });
});

describe("merkeNutzer — die Gegenprobe zum Defektzustand (§4.13 i)", () => {
  it("schreibt beim INSERT die mitgelieferten Werte", () => {
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                        email: "anna@example.org" });
    const z = t.db.select().from(users).all();
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ id: NEU_SUB, name: "Anna Beispiel",
                                 email: "anna@example.org" });
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("ueberschreibt beim UPDATE einen bekannten Namen NICHT mit null", () => {
    /**
     * DIE REGEL GILT NUR FUER DAS UPDATE (§4.13 i). Ein spaeterer Login ohne
     * Klarnamen darf einen bereits bekannten Namen nicht ueberschreiben — die
     * Bedingung steht heute schon so da (`lagerbuch/src/auth.ts:22-27`).
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `set: { name, email, ... }`
     * unbedingt. Sie sieht sauberer aus und macht aus jedem Aufruf ohne
     * name/email-Claims einen NAMENSVERLUST — und zwar fuer jemanden, der vorher
     * einen Namen hatte. Im Journal steht danach die rohe Kennung.
     */
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                        email: "anna@example.org" });
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
    const z = t.db.select().from(users).all();
    expect(z).toHaveLength(1);                       // KEIN zweiter Satz
    expect(z[0]?.name).toBe("Anna Beispiel");
    expect(z[0]?.email).toBe("anna@example.org");
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("aktualisiert einen NEUEN Namen sehr wohl", () => {
    // Die Regel heisst „nicht mit null ueberschreiben", nicht „nie aendern".
    // Eine Heirat, eine korrigierte Schreibweise: der neue Wert gewinnt.
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel", email: null });
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Muster", email: "a@example.org" });
    const z = t.db.select().from(users).all();
    expect(z[0]).toMatchObject({ name: "Anna Muster", email: "a@example.org" });
  });

  it("BEIM INSERT gilt die Regel NICHT — und das ist der Defektzustand mit Ansage", () => {
    /**
     * Wer die Nicht-Ueberschreiben-Bedingung auf BEIDES zieht, erzeugt den
     * Defektzustand aus §4.13 (i): die frisch angelegte Zeile bliebe leer und
     * loeste sofort auf die ROHE Kennung auf.
     *
     * Dieser Fall behauptet den Ist-Zustand, nicht den Wunsch: eine Sitzung ohne
     * name/email schreibt eine Zeile mit null/null. Der Test verhindert das
     * nicht — er macht es BENANNT und auffindbar, statt es als „unerklaerliche
     * UUID im Journal" wiederzuentdecken.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
      const z = t.db.select().from(users).all();
      expect(z).toHaveLength(1);
      expect(z[0]?.name).toBeNull();
      expect(z[0]?.email).toBeNull();
      expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe(NEU_SUB);   // die ROHE Kennung
    } finally {
      warn.mockRestore();
    }
  });

  it("MELDET den Defektzustand sichtbar — mit der Kennung, und nur einmal je Person", () => {
    /**
     * „Sichtbar loggen statt still schlucken" (`lagerbuch/src/auth.ts:29-33`).
     * Zwei moegliche Ursachen, beide sofort zu melden: die Suite-Sitzung fuehrt
     * keine name/email-Claims, oder merkeNutzer laeuft an einer Stelle, an der
     * die Claims noch nicht vorliegen.
     *
     * ⚠️ ANDERS ALS BEI meldeFehlendeGruppe STEHT DIE KENNUNG IN DER ZEILE: dort
     * ist der sub nur Dedup-Schluessel, hier ist er der einzige Weg zur
     * betroffenen Zeile.
     *
     * Dedupliziert, weil merkeNutzer bei JEDER Verwaltungsanfrage laeuft — ohne
     * das schriebe eine einzige betroffene Person bei jedem Seitenwechsel eine
     * Zeile.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      for (let i = 0; i < 4; i++) {
        merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(NEU_SUB);
      expect(String(warn.mock.calls[0]?.[0])).toContain("[lagerbuch]");
    } finally {
      warn.mockRestore();
    }
  });

  it("EIN NAME AUS LEERRAUM IST KEIN NAME — er meldet und ueberschreibt nicht", () => {
    /**
     * DIE AUFLOESUNG EINER PLAN-UNEINHEITLICHKEIT, nicht eine Abweichung vom Plan.
     *
     * `_db/quelle.ts:38` trimmt (`u.name?.trim() || u.email?.trim() || u.id`) und
     * haelt damit fest: ein Name aus Leerzeichen IST KEIN NAME. Der Plan schreibt
     * `merkeNutzer` an derselben Sache mit einer Falsy-Pruefung vor und kommt zum
     * gegenteiligen Ergebnis. Beide Formen stehen woertlich im Plan; sie koennen
     * nicht beide gelten. §4.13 (i) sagt „ueberschreibe keinen bekannten Namen mit
     * NICHTS" — und `"   "` IST nichts, das sagt `quelle.ts` selbst.
     *
     * Ohne die Aufloesung ist `"   "` TRUTHY, und dann besiegt genau die Eingabe,
     * gegen die die Regel geschrieben wurde, die Regel — und zwar STILL: das
     * UPDATE ueberschreibt den bekannten Klarnamen, und `meldeNamenlos` schweigt
     * dabei, obwohl es der einzige Weg zur betroffenen Zeile waere.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                          email: "anna@example.org" });
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "   ", email: "  " });

      const z = t.db.select().from(users).all();
      expect(z).toHaveLength(1);
      expect(z[0]?.name).toBe("Anna Beispiel");        // NICHT ueberschrieben
      expect(z[0]?.email).toBe("anna@example.org");
      expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");

      expect(warn).toHaveBeenCalledTimes(1);           // und die Meldung kam
      expect(String(warn.mock.calls[0]?.[0])).toContain(NEU_SUB);
    } finally {
      warn.mockRestore();
    }
  });

  it("die GEGENRICHTUNG: ein echter Name meldet nicht und ueberschreibt sehr wohl", () => {
    // Die Aufloesung darf den Normalfall nicht mitnehmen. Ohne diesen Fall bliebe
    // ein zu scharfes Praedikat (etwa `=== null`) unbemerkt.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                          email: "anna@example.org" });
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Muster",
                          email: "neu@example.org" });
      const z = t.db.select().from(users).all();
      expect(z[0]).toMatchObject({ name: "Anna Muster", email: "neu@example.org" });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("NUR die Leerheitsentscheidung trimmt — gespeichert wird der Wert wie geliefert", () => {
    /**
     * Die Abweichung bleibt so klein wie moeglich: `?.trim()` entscheidet, OB der
     * Wert etwas aussagt; geschrieben wird weiter `viewer.name`. `quelleAufloeser`
     * trimmt beim Lesen ohnehin, ein zweites Trimmen beim Schreiben waere eine
     * stille Datenaenderung ohne Nutzen.
     *
     * Dieser Fall haelt die Entscheidung fest, damit niemand sie spaeter „zu Ende
     * fuehrt" und den gespeicherten Wert mit beschneidet.
     */
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: " Anna Beispiel ", email: null });
    const z = t.db.select().from(users).all();
    expect(z[0]?.name).toBe(" Anna Beispiel ");
  });

  it("schreibt lastLoginAt in SEKUNDEN, nicht in Millisekunden", () => {
    // Die 1000er-Falle. `mode: "timestamp"` rechnet in beide Richtungen dieselbe
    // Umrechnung — nur ein Blick auf den ROHEN Spaltenwert sieht den Unterschied
    // (§4.16, Punkt 1). Zehnstellig, nicht dreizehnstellig.
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "A", email: null });
    const roh = t.sqlite.prepare("select last_login_at from users where id = ?")
      .get(NEU_SUB) as { last_login_at: number };
    expect(String(roh.last_login_at)).toHaveLength(10);
  });

  it("wirft NICHT, wenn der Upsert scheitert — der Zugang funktioniert auch ohne Satz", () => {
    // `lagerbuch/src/auth.ts:29-33` begruendet das bereits so. Ein Wurf hier
    // machte aus einem Datenbankproblem einen Ausfall der ganzen Verwaltung.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      t.sqlite.exec("drop table users");
      expect(() => merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "A", email: null }))
        .not.toThrow();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
