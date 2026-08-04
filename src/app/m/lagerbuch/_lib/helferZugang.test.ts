import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { tokens } from "../_db/schema";

vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
let cookieWert: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => hostKopf,
  cookies: async () => ({
    get: (name: string) =>
      name === "helfer_session" && cookieWert !== undefined ? { name, value: cookieWert } : undefined,
  }),
}));

import { createHelferSitzung } from "./helferSitzung";
import { helferZugangOderNull, requireHelferSitzung, requireHelferSchreibend } from "./helferZugang";

let t: TestDb;
const altGeheim = process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;

/** Eine aktive Token-Zeile — der Regelfall. */
function tokenAnlegen(id: string, aktiv = true): void {
  t.db.insert(tokens).values({
    id, code: "482-137", label: "RTW 1 Kaertchen",
    aktiv, createdAt: new Date(), createdBy: "sub-1",
  }).run();
}

beforeEach(() => {
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = "e2e-helfer-secret-nicht-produktiv-32z";
  t = migrierteTestDb("lagerbuch-helferzugang-");
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  cookieWert = undefined;
});
afterEach(() => {
  t.schliessen();
  if (altGeheim === undefined) delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  else process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = altGeheim;
});

describe("der HOST-Riegel ist in ALLEN DREI Funktionen die ERSTE Anweisung", () => {
  /**
   * Nur so ist „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr
   * und nicht durch eine Liste, die die naechste Action vergisst (§2.6, §2.8).
   *
   * Ohne den Riegel loeste ein Aufruf auf `files.iuk-ue.de/m/lagerbuch/t/123-456`
   * einen echten Code ein und legte auf DIESEM Host ein gueltiges Helfer-Cookie
   * ab — eine zweite funktionierende Herkunft des Moduls, aus der echte
   * Buchungen in das append-only Journal liefen.
   */
  beforeEach(() => { hostKopf = new Headers({ host: "feedback.localtest.me" }); });

  it("helferZugangOderNull wirft auf fremdem Host", async () => {
    await expect(helferZugangOderNull(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requireHelferSitzung wirft auf fremdem Host", async () => {
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requireHelferSchreibend wirft auf fremdem Host — trotz 'wirft nicht'", async () => {
    /**
     * DER SCHEINBARE WIDERSPRUCH, UND ER IST KEINER. Der Rueckgabewert-Vertrag
     * gilt fuer ERWARTBARE Lagen (§7.3): Sitzung abgelaufen, Code gesperrt. §7.3
     * nimmt den Riegelfall ausdruecklich aus — „nicht 'erwartbar', sondern
     * 'manipuliert'". Ein Action-POST auf dem FALSCHEN Host ist kein
     * Betriebsfall, den ein Formular anzeigen muesste.
     *
     * Wer den Aufruf hier „aus Konsistenz" entfernt, oeffnet genau die Luecke,
     * gegen die Falle 61 gebaut ist — und `pnpm build` sieht nichts.
     */
    await expect(requireHelferSchreibend(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("prueft den Host VOR dem Cookie — auch ohne jedes Cookie", async () => {
    // Sonst antwortete der fremde Host auf ein fehlendes Cookie mit einem
    // Redirect aufs Gate und verriete damit, dass es das Modul dort gibt.
    cookieWert = undefined;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("helferZugangOderNull — das Praedikat fuer die beiden Rollen-Weichen", () => {
  it("liefert code und label AUS DER DATENBANK, nicht aus der Nutzlast", async () => {
    /**
     * DAS IST DER GRUND, WARUM DAS KLARTEXT-SECRET AUS DEM COOKIE VERSCHWINDEN
     * KONNTE (§3.4.3). Die Nutzlast traegt nur noch {tokenId}.
     *
     * Der Test aendert das Label NACH der Ausstellung des Cookies: kaemen die
     * Werte aus der Nutzlast, staende hier noch der alte Text.
     */
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    t.db.update(tokens).set({ label: "RTW 2 Kaertchen" }).run();

    const z = await helferZugangOderNull(t.db);
    expect(z).toMatchObject({ tokenId: "tk1", code: "482-137", label: "RTW 2 Kaertchen" });
  });

  it("liefert laeuftAb AUS DEM COOKIE", async () => {
    // Die einzige Angabe, die NICHT aus der Token-Zeile stammt — mit Absicht: die
    // Sperrung wirkt sofort und kommt aus der Datenbank, der Ablauf steht seit
    // der Ausstellung fest und kommt aus dem Cookie. Sie traegt die
    // Restzeit-Anzeige des Helfer-Rahmens (§3.4.3, §7.8.2).
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const z = await helferZugangOderNull(t.db);
    expect(z?.laeuftAb).toBeInstanceOf(Date);
    expect(z!.laeuftAb.getTime()).toBeGreaterThan(Date.now());
  });

  it("liefert null ohne Cookie", async () => {
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("liefert null bei ungueltigem Cookie", async () => {
    cookieWert = "kein.gueltiges.jwt";
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("EIN GESPERRTER CODE BLOCKT DEN LESEPFAD — nicht nur den Schreibpfad", async () => {
    /**
     * DIE ZENTRALE ZUSAGE DIESER DATEI (Entscheidung 13 b, §3.4.4).
     *
     * Heute prueft `getHelferPayload` nur Signatur und Ablauf; nur die zwei
     * SCHREIBENDEN Stellen machen den DB-Recheck. Ein gesperrter Code liest damit
     * bis zu 12 Stunden weiter den GESAMTEN Bestand — was passiert, wenn ein
     * laminiertes Etikett aus einem Fahrzeug verschwindet.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: den Recheck aus dem
     * Lesepfad entfernen. Das ist das Verhalten von HEUTE — gruen in jedem Test,
     * der nur schreibt.
     */
    tokenAnlegen("tk1", true);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await helferZugangOderNull(t.db)).not.toBeNull();

    t.db.update(tokens).set({ aktiv: false }).run();
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("liefert null, wenn die Token-Zeile gar nicht existiert", async () => {
    // Ein manipuliertes tokenId in einem sonst gueltig signierten Cookie ist der
    // Fall — er verhaelt sich wie „gesperrt", weil `redeemToken` denselben
    // Doppeltest fuehrt (`!t || !t.aktiv`, `token-redeem.ts:15`).
    cookieWert = await createHelferSitzung({ tokenId: "gibt-es-nicht" });
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("LEITET NICHT UM und LOESCHT NICHTS — es ist ein Praedikat", async () => {
    // Die beiden Rollen-Weichen haben je DREI gueltige Faelle und entscheiden
    // selbst (§3.2.1, §7.4.3). Ein Wurf hier schickte jeden anonymen Scan eines
    // Regaletiketts weg.
    cookieWert = "muell";
    await expect(helferZugangOderNull(t.db)).resolves.toBeNull();
  });
});

describe("requireHelferSitzung — NUR aus helfer/layout.tsx", () => {
  it("liefert den Zugang im Regelfall", async () => {
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect((await requireHelferSitzung(t.db)).tokenId).toBe("tk1");
  });

  it("OHNE Cookie: unmittelbar aufs Gate, KEIN Umweg", async () => {
    /**
     * „fehlt es ganz, gibt es nichts zu raeumen und der Redirect geht unmittelbar
     * aufs Gate" (§3.4.4). Ein Umweg ueber /abmelden waere hier ein zweiter 303
     * ohne Wirkung — und auf einem Telefon im Fahrzeug zwei Runden statt einer.
     */
    cookieWert = undefined;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("ABGELAUFEN oder ungueltig: ueber /abmelden, mit grund=abgelaufen", async () => {
    /**
     * DER UMWEG IST DER GRUND, WARUM DAS UEBERHAUPT MOEGLICH IST. `cookies()` ist
     * in einer Server Component VERSIEGELT: delete/set/clear sind durch einen
     * Proxy ersetzt, der wirft
     * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53,171`,
     * nachgeschlagen im Arbeitsbaum, Next 16.2.11). Ein
     * `cookies().delete(HELFER_COOKIE)` an dieser Stelle ist kein Stilproblem,
     * sondern ein LAUFZEITFEHLER.
     *
     * Ein totes Cookie darf nicht liegen bleiben: es sorgte sonst bei jedem
     * weiteren Aufruf fuer denselben Umweg.
     */
    cookieWert = "kein.gueltiges.jwt";
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=abgelaufen");
  });

  it("GESPERRT: ueber /abmelden, mit grund=gesperrt", async () => {
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
  });

  it("unterscheidet die beiden toten Lagen im GRUND", async () => {
    // §3.9: „Dein Zugang ist abgelaufen. Scanne das Kaertchen erneut." gegen
    // „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." Der erste
    // Satz waere bei einem gesperrten Kaertchen eine Aufforderung zu etwas, das
    // garantiert scheitert.
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const gesperrt = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    cookieWert = "muell";
    const abgelaufen = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    expect(gesperrt).not.toBe(abgelaufen);
  });

  it("benutzt AUSSCHLIESSLICH Gruende aus dem geschlossenen Satz", async () => {
    // Der Route Handler /abmelden reicht nur Werte aus `GateGrund` weiter (§3.9);
    // ein Grund ausserhalb des Satzes verschwaende die Meldung stumm.
    const { istGateGrund } = await import("./gateTexte");
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const m1 = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    cookieWert = "muell";
    const m2 = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    for (const m of [m1, m2]) {
      const grund = new URL(String(m).replace("NEXT_REDIRECT:", ""), "http://x")
        .searchParams.get("grund");
      expect(istGateGrund(grund), `unbekannter Grund: ${grund}`).toBe(true);
    }
  });
});

describe("requireHelferSchreibend — WIRFT NICHT, sondern liefert", () => {
  it("liefert {ok:true, zugang} im Regelfall", async () => {
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const r = await requireHelferSchreibend(t.db);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.zugang).toMatchObject({ tokenId: "tk1", code: "482-137" });
  });

  it("liefert grund 'sitzung' bei abgelaufener oder fehlender Sitzung", async () => {
    /**
     * KEIN Redirect. Laeuft die Sitzung zwischen Eingabe und Absenden ab, verwuerfe
     * ein Redirect die eingetragenen Mengen — genau der Datenverlust, den
     * `docs/design/README.md` unter „Kommen Fehler aus Server-Actions am Feld an?"
     * ausschliesst. Der Text lautet „Dein Zugang ist abgelaufen. Scanne das
     * Kaertchen erneut — deine Eingaben bleiben stehen." (§7.3, Teil 4).
     */
    cookieWert = undefined;
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung" });
    cookieWert = "muell";
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung" });
  });

  it("liefert grund 'gesperrt' bei gesperrtem Code", async () => {
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt" });
  });

  it("HAELT DIE BEIDEN GRUENDE AUSEINANDER — daran haengt §7.4.4", async () => {
    /**
     * Nicht kosmetisch: bei `sitzung` hilft ein erneutes Einloesen, bei
     * `gesperrt` NICHT (derselbe Code scheitert genauso). Genau daran haengt, ob
     * §7.4.4 das Inline-Feld zur Code-Erneuerung ueberhaupt anbietet.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: die beiden Gruende
     * zusammenlegen. Dann bietet der Fahrzeug-Check der Helferin ein Feld an, in
     * das sie einen Code eingibt, der garantiert abgewiesen wird — mitten im
     * Abschluss eines zwanzigminuetigen Checks.
     */
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const a = await requireHelferSchreibend(t.db);
    cookieWert = undefined;
    const b = await requireHelferSchreibend(t.db);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) expect(a.grund).not.toBe(b.grund);
  });

  it("NIMMT DEN /abmelden-UMWEG NIE", async () => {
    // Es leitet nicht um, sondern gibt zurueck (§7.3) — und der naechste
    // Seitenaufruf laeuft ohnehin durch das Layout, das raeumt dann.
    cookieWert = "muell";
    await expect(requireHelferSchreibend(t.db)).resolves.toEqual({ ok: false, grund: "sitzung" });
  });
});

describe("der Sperrbefund ist DER Sofort-Widerruf des Moduls", () => {
  it("wirkt bei der NAECHSTEN Anfrage — lesend wie schreibend", async () => {
    /**
     * Er ist es genau deshalb, weil er aus der DATENBANK kommt und nicht aus dem
     * Token. Das ist die Gegenprobe zur Gruppenfrische in §3.6.4, wo ein
     * Gruppenentzug bis zu eine Stunde braucht.
     *
     * Ein Einzel-Widerruf JE SITZUNG wird bewusst NICHT gebaut: ein Code wird von
     * mehreren Menschen gleichzeitig benutzt, „diese eine Sitzung" ist fachlich
     * keine Einheit. Ein `jti` haette darum keinen Leser.
     */
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await helferZugangOderNull(t.db)).not.toBeNull();
    expect((await requireHelferSchreibend(t.db)).ok).toBe(true);

    t.db.update(tokens).set({ aktiv: false }).run();

    expect(await helferZugangOderNull(t.db)).toBeNull();
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt" });
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
  });
});
