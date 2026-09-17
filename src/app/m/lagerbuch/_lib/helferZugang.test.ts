import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { lagerorte, tokens } from "../_db/schema";

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

/*
 * DRK-305 — DER ZWEITE WEG IN DEN HELFER-AST, hier als Attrappe.
 *
 * `viewerOderNull` ruft `auth()` und braucht dafuer eine Sitzung, eine
 * Konfiguration und einen Request; `merkeNutzer` schreibt in `users`. Beides
 * gehoert nicht in einen Test ueber die REIHENFOLGE der beiden Herkuenfte.
 *
 * ⚠️ DIE ATTRAPPE IST STANDARDMAESSIG LEER (`angemeldet = null`). Ohne das
 * liefen die Kaertchen-Tests unten still durch den Konto-Zweig und waeren
 * gleichzeitig gruen — die Reihenfolge waere dann ungeprueft.
 */
let angemeldet: { sub: string; groups: string[]; name: string | null; email: string | null } | null = null;
const gemerkteNutzer: string[] = [];
vi.mock("./zugang", () => ({
  viewerOderNull: async () => angemeldet,
  istLagerbuchAdmin: (v: { groups: string[] } | null) => !!v?.groups.includes("lagerbuch"),
}));
vi.mock("./konto", () => ({
  merkeNutzer: (_db: unknown, v: { sub: string }) => { gemerkteNutzer.push(v.sub); },
}));

import { BEREICH_TEXT } from "./actionTypen";
import { nurEntnahmeAbweisung } from "./helferBereich";
import { createHelferSitzung } from "./helferSitzung";
import { HANDLAGER_ID } from "./konstanten";
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
  angemeldet = null;
  gemerkteNutzer.length = 0;
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
    expect(await requireHelferSitzung(t.db)).toMatchObject({ herkunft: "token", tokenId: "tk1" });
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
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung", nochAngemeldet: false });
    cookieWert = "muell";
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung", nochAngemeldet: false });
  });

  it("liefert grund 'gesperrt' bei gesperrtem Code", async () => {
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt", nochAngemeldet: false });
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
    await expect(requireHelferSchreibend(t.db)).resolves.toEqual({ ok: false, grund: "sitzung", nochAngemeldet: false });
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
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt", nochAngemeldet: false });
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
  });
});

describe("die Fahrzeugbindung des Kaertchens (DRK-302)", () => {
  /**
   * Sie kommt aus DERSELBEN Token-Zeile wie `code` und `label` und ist der
   * einzige Weg, auf dem `/helfer/check` erfaehrt, WELCHES Kaertchen gescannt
   * wurde: die Cookie-Nutzlast traegt nur `{tokenId}` (§3.4.3), und ein `?fz=`
   * in der URL ist Nutzereingabe, kein Beleg.
   */
  async function zugangMit(args: {
    zielTyp?: "fahrzeug" | "artikel" | null;
    zielId?: string | null;
  }) {
    t.db.insert(tokens).values({
      id: "tk1", code: "482-137", label: "RTW 1 Kaertchen", aktiv: true,
      createdAt: new Date(), createdBy: "sub-1",
      zielTyp: args.zielTyp ?? null, zielId: args.zielId ?? null,
    }).run();
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    return helferZugangOderNull(t.db);
  }

  it("traegt bei einem Fahrzeug-Kaertchen dessen Fahrzeug", async () => {
    expect((await zugangMit({ zielTyp: "fahrzeug", zielId: "rtw-1" }))?.fahrzeugBindung)
      .toBe("rtw-1");
  });

  it("bleibt bei einem Artikel- und einem zielllosen Kaertchen null", async () => {
    // Ein Regaletikett und ein allgemeines Helfer-Kaertchen binden an kein
    // Fahrzeug — sonst verschwaende nach ihrem Scan die Fahrzeugwahl.
    expect((await zugangMit({ zielTyp: "artikel", zielId: "art-1" }))?.fahrzeugBindung)
      .toBeNull();
    t.db.delete(tokens).run();
    expect((await zugangMit({}))?.fahrzeugBindung).toBeNull();
  });

  it("kommt aus der DATENBANK, nicht aus dem Cookie", async () => {
    /*
     * DIESELBE ZUSAGE WIE BEI `code`/`label` (§3.4.4), und sie ist hier teurer:
     * wird ein Kaertchen in der Verwaltung auf ein anderes Fahrzeug umgewidmet,
     * muss die naechste Seite das sehen. Kaeme der Wert aus dem Cookie, checkte
     * die Helferin bis zu zwoelf Stunden lang weiter das ALTE Fahrzeug — und
     * die Buchung haengt danach im Journal am falschen Lagerort.
     */
    const z1 = await zugangMit({ zielTyp: "fahrzeug", zielId: "rtw-1" });
    expect(z1?.fahrzeugBindung).toBe("rtw-1");
    t.db.update(tokens).set({ zielId: "rtw-2" }).run();
    expect((await helferZugangOderNull(t.db))?.fahrzeugBindung).toBe("rtw-2");
  });

  it("steht in ALLEN DREI Riegeln, nicht nur im Praedikat", async () => {
    // `requireHelferSitzung` traegt die Check-Seite, `requireHelferSchreibend`
    // waere der Ansatzpunkt einer spaeteren Durchsetzung. Ein Feld, das nur an
    // einem der drei Ausgaenge haengt, faellt genau dann auf, wenn jemand den
    // zweiten benutzt.
    await zugangMit({ zielTyp: "fahrzeug", zielId: "rtw-1" });
    expect((await requireHelferSitzung(t.db)).fahrzeugBindung).toBe("rtw-1");
    const schreibend = await requireHelferSchreibend(t.db);
    expect(schreibend.ok && schreibend.zugang.fahrzeugBindung).toBe("rtw-1");
  });

  it("bindet eine HALBE Zeile an nichts", async () => {
    // `zielTyp` und `zielId` sind je fuer sich nullbar; ein Alt-Import kann eine
    // halbe Zeile tragen. Eine Bindung an "" faende kein Fahrzeug — die Helferin
    // saehe mit einem gueltigen Kaertchen gar nichts mehr.
    expect((await zugangMit({ zielTyp: "fahrzeug", zielId: null }))?.fahrzeugBindung)
      .toBeNull();
  });
});

/**
 * DRK-305 — DER KONTO-ZUGANG.
 *
 * Er ist der Gegenpol zu DRK-302: nach dem Scan gilt das Fahrzeug des
 * Kärtchens, angemeldet gilt keins. Was hier geprüft wird, ist nicht die
 * Oberfläche, sondern die REIHENFOLGE und der ZUSCHNITT der drei Riegel.
 */
const ADMIN = { sub: "sub-42", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };
const FREMD = { sub: "sub-99", groups: ["andere-gruppe"], name: "B. Fremd", email: null };

describe("DRK-305 — ein angemeldetes Konto traegt in den Helfer-Ast", () => {
  it("OHNE Cookie: requireHelferSitzung liefert einen KONTO-Zugang statt aufs Gate zu werfen", async () => {
    angemeldet = ADMIN;
    const z = await requireHelferSitzung(t.db);
    expect(z).toEqual({
      herkunft: "konto",
      sub: "sub-42",
      name: "A. Verwaltung",
      laeuftAb: null,
      fahrzeugBindung: null,
      nurEntnahme: false,
    });
  });

  it("KEINE Bindung an ein Fahrzeug — das ist der ganze Punkt des Tickets", async () => {
    /*
     * DRK-302 begrenzt den Einstieg nach dem SCAN auf das Fahrzeug des
     * Kärtchens. Wer angemeldet kommt, hat keins gescannt: `helfer/check`
     * zeigt darum die volle Fahrzeugwahl. Die `null` steht im TYP
     * (`KontoZugang`), nicht in einer Abfrage der Seite — eine Bindung kann
     * hier konstruktiv nicht entstehen.
     */
    angemeldet = ADMIN;
    expect((await requireHelferSitzung(t.db)).fahrzeugBindung).toBeNull();
  });

  it("legt die users-Zeile an — sonst zeigt das Journal die ROHE Kennung", async () => {
    // `quelleAufloeser` schlägt `oidc`-Quellen in `users` nach (`_db/quelle.ts`).
    // Ohne die Zeile gelänge jede Buchung und niemand läse sie.
    angemeldet = ADMIN;
    await requireHelferSitzung(t.db);
    expect(gemerkteNutzer).toEqual(["sub-42"]);
  });

  it("OHNE die Gruppe bleibt es beim Gate — eine Anmeldung allein genuegt NICHT", async () => {
    angemeldet = FREMD;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_REDIRECT:/");
    expect(gemerkteNutzer).toEqual([]);
  });

  it("DAS KAERTCHEN GEWINNT: ein gueltiges Cookie schlaegt die Anmeldung", async () => {
    /*
     * ⚠️ DIE REIHENFOLGE IST DIE ZUSAGE, NICHT EINE LAUNE. Wer angemeldet ist
     * UND ein Fahrzeug-Kärtchen gescannt hat, steht mit dem Kärtchen in der
     * Hand vor genau diesem Fahrzeug. Käme das Konto zuerst, verschwände die
     * Bindung aus DRK-302 für jede angemeldete Person — still, und nur für die,
     * die beides haben.
     */
    tokenAnlegen("tk1");
    t.db.update(tokens).set({ zielTyp: "fahrzeug", zielId: "rtw-1" }).run();
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    angemeldet = ADMIN;
    const z = await requireHelferSitzung(t.db);
    expect(z.herkunft).toBe("token");
    expect(z.fahrzeugBindung).toBe("rtw-1");
    // Der Konto-Zweig wurde gar nicht erst betreten.
    expect(gemerkteNutzer).toEqual([]);
  });

  it("ein TOTES Kaertchen-Cookie sperrt die angemeldete Person NICHT aus", async () => {
    /*
     * Gesperrter Code plus Anmeldung: ohne diesen Zweig landete die Person auf
     * `/abmelden` und käme mit ihrem eigenen, gültigen Zugang nirgendwohin.
     * Das tote Cookie bleibt liegen und ist wirkungslos — `befund()` prüft es
     * bei jedem Aufruf erneut gegen die Datenbank.
     */
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    angemeldet = ADMIN;
    expect((await requireHelferSitzung(t.db)).herkunft).toBe("konto");
  });

  it("requireHelferSchreibend liefert denselben Zugang, ohne zu werfen", async () => {
    angemeldet = ADMIN;
    const r = await requireHelferSchreibend(t.db);
    expect(r.ok && r.zugang.herkunft).toBe("konto");
  });

  it("ohne Gruppe bleibt requireHelferSchreibend bei seinem Grund — aber NICHT bei seiner Auskunft",
    async () => {
    /*
     * ⚠️ DER ZWEITE HALBSATZ IST DER BEFUND (P2 zu PR #169). Der GRUND bleibt
     * `sitzung`: `SperrGrund` ist die geteilte Haelfte von `HelferGrund` und in
     * beiden Inseln eine Anzeigeweiche — ein dritter Wert dort waere eine
     * Aenderung an `RIEGEL_TEXTE`, `CheckFlow` und `Entnahme` fuer einen
     * Zustand, den nur die Zielwahl auswertet.
     *
     * `nochAngemeldet` faehrt deshalb DANEBEN mit, und genau hier entsteht der
     * Unterschied, den es traegt: diese Person IST angemeldet, ihr fehlt die
     * Gruppe. Waere das Feld `false`, bekaeme sie „melde dich erneut an" — und
     * landete nach dem ganzen Pocket-ID-Weg in derselben Sperre.
     */
    angemeldet = FREMD;
    expect(await requireHelferSchreibend(t.db))
      .toEqual({ ok: false, grund: "sitzung", nochAngemeldet: true });
  });

  it("OHNE Sitzung meldet derselbe Riegel `nochAngemeldet: false`", async () => {
    // Die Gegenprobe. Ohne sie waere auch ein fest verdrahtetes `true` gruen —
    // und dann bekaeme JEDE Person „wende dich an die Leitung", auch die, der
    // schlicht die Anmeldung fehlt und der ein Login sofort hilft.
    angemeldet = null;
    expect(await requireHelferSchreibend(t.db))
      .toEqual({ ok: false, grund: "sitzung", nochAngemeldet: false });
  });

  it("helferZugangOderNull IGNORIERT das Konto — es ist das Kaertchen-Praedikat", async () => {
    /*
     * ⚠️ DIE AUSNAHME IST DIE WICHTIGSTE ZEILE DIESER DATEI. `a/[artikelId]`
     * fragt dieses Prädikat ZUERST und schickt eine angemeldete Person erst
     * danach in die Verwaltung. Zöge man das Konto auch hier ein, führte ein
     * gescanntes Regaletikett eine verwaltende Person in die Helfer-Ansicht
     * statt auf die Artikelseite der Verwaltung — die drei Ausgänge im Kopf
     * jener Datei stimmten nicht mehr, und kein Tor sähe es.
     */
    angemeldet = ADMIN;
    await expect(helferZugangOderNull(t.db)).resolves.toBeNull();
  });

  it("der HOST-Riegel steht auch vor dem Konto-Zweig", async () => {
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    angemeldet = ADMIN;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requireHelferSchreibend(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

/**
 * DIE REICHWEITE DES REGAL-CODES — DRK-406.
 *
 * ⚠️ SIE WIRD HIER AM ECHTEN `befund()` GEMESSEN, nicht an `nurEntnahmeAus`
 * allein. Die Funktion für sich ist ein Zweizeiler; was schiefgehen kann, ist
 * die VERDRAHTUNG — dass die Zeile aus der Datenbank kommt, dass es die `ort_id`
 * ist und nicht die `ziel_id`, und dass der Altbestand nichts abbekommt.
 */
describe("nurEntnahme — der Ortscode des Handlagers darf nur entnehmen", () => {
  /** Eine Ortscode-Zeile — wie `stelleOrtCodesSicher` sie anlegt. */
  function ortscodeAnlegen(args: {
    id: string; code: string; ortId: string | null;
    zielTyp?: "fahrzeug"; zielId?: string;
  }): void {
    t.db.insert(tokens).values({
      id: args.id, code: args.code, label: "Ortskarte",
      ortId: args.ortId,
      zielTyp: args.zielTyp ?? null, zielId: args.zielId ?? null,
      aktiv: true, createdAt: new Date(), createdBy: "sub-1",
    }).run();
  }

  it("setzt nurEntnahme für den Ortscode des Handlagers", async () => {
    ortscodeAnlegen({ id: "tok-regal", code: "111-111", ortId: HANDLAGER_ID });
    cookieWert = await createHelferSitzung({ tokenId: "tok-regal" });

    const z = await requireHelferSitzung(t.db);
    expect(z.nurEntnahme).toBe(true);
  });

  it("lässt den Ortscode einer Einheit unberührt", async () => {
    t.db.insert(lagerorte).values({
      id: "rtw-1", name: "RTW 1", typ: "fahrzeug",
      kennung: null, aktiv: true, einheitenart: "fahrzeug",
    }).run();
    ortscodeAnlegen({
      id: "tok-rtw", code: "222-222", ortId: "rtw-1",
      zielTyp: "fahrzeug", zielId: "rtw-1",
    });
    cookieWert = await createHelferSitzung({ tokenId: "tok-rtw" });

    const z = await requireHelferSitzung(t.db);
    expect(z.nurEntnahme).toBe(false);
    expect(z.fahrzeugBindung).toBe("rtw-1");
  });

  /**
   * ⚠️ DER TEUERSTE FEHLGRIFF DIESES TICKETS, UND ER WÄRE STILL: ein
   * Altbestands-Kärtchen mit der Zielart „Artikel-Liste" landet auf DEMSELBEN
   * Schirm wie der Regal-Code — `tokenZielPfad(null, null)` ist für beide
   * `/helfer`. Wer die Einschränkung über die ZIELART ableitet statt über die
   * Zugehörigkeit, nimmt jedem laminierten Kärtchen im Umlauf über Nacht Box
   * und Check weg, und die Betreiberentscheidung „Altbestand bleibt gültig"
   * wäre gebrochen, ohne dass ein Tor etwas meldet.
   */
  it("lässt ein Altbestands-Kärtchen mit derselben LANDUNG unberührt", async () => {
    ortscodeAnlegen({ id: "tok-alt", code: "333-333", ortId: null });
    cookieWert = await createHelferSitzung({ tokenId: "tok-alt" });

    const z = await requireHelferSitzung(t.db);
    expect(z.nurEntnahme).toBe(false);
  });

  it("weist Check und Box ab, sobald nurEntnahme gilt — und sonst nie", async () => {
    ortscodeAnlegen({ id: "tok-regal2", code: "444-444", ortId: HANDLAGER_ID });
    cookieWert = await createHelferSitzung({ tokenId: "tok-regal2" });
    const regal = await requireHelferSitzung(t.db);
    expect(nurEntnahmeAbweisung(regal))
      .toEqual({ ok: false, grund: "bereich", text: BEREICH_TEXT });

    ortscodeAnlegen({ id: "tok-frei", code: "555-555", ortId: null });
    cookieWert = await createHelferSitzung({ tokenId: "tok-frei" });
    expect(nurEntnahmeAbweisung(await requireHelferSitzung(t.db))).toBeNull();
  });
});
