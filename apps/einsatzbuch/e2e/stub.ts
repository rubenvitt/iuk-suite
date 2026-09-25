/**
 * Stub-Schicht für `invoke` — die einzige Naht, über die die Oberfläche mit Rust spricht
 * (`../src/befehle.ts`). `installiereStub` spielt vor jeder Navigation ein Fake-Backend in die
 * Seite ein (`page.addInitScript`), das die Regeln aus `src-tauri/kern/src/erfassung.rs` und
 * `versiegeln.rs` im Browser nachbildet: Pflichtfelder (getrimmt), ein nur halb angegebenes
 * Ende, die Grenzen des Readers (`grenzen.rs`), die Frist ohne Verlängerung bei einer
 * Bearbeitung, „verfallen“ beim Versiegeln über einen vorhandenen Entwurf, Nummern `T-JJJJ-NNN`
 * und ein Hash aus `crypto.subtle.digest`. Die Meldungen sind wörtlich die aus Rust, so wie
 * `fehler_text` in `src-tauri/src/befehle.rs` sie an die Oberfläche gibt.
 *
 * Die Funktion, die an `page.addInitScript` geht, läuft im Browser und hat dort keinen Zugriff
 * auf dieses Modul — jede Kleinigkeit, die sie braucht, kommt über `einstellungen` als Argument
 * oder steht in ihrem eigenen Rumpf.
 */
import type { Page } from "@playwright/test";

import type { Ausstehend, Entwurf, Stammdaten, Stammdatenpaket, Status, Versiegelung } from "../src/typen";

export interface StubOptionen {
  betrieb?: "test" | "echt" | null;
  fristSekunden?: number;
  entwicklung?: boolean;
}

/**
 * Drei Fahrzeuge, drei Personen — Ausschnitt aus `src-tauri/kern/entwicklung/stammdaten.json`
 * (derselbe Ortsverein Uelzen), klein genug für eine Spec: „83-1“ trifft nur ein Fahrzeug,
 * „Dierks“ nur eine Person.
 */
const STAMMDATEN: Stammdaten = {
  fahrzeuge: [
    { id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" },
    { id: "11-85-1", typ: "KTW-B", kennung: "11-85-1", ruf: "Rotkreuz Uelzen 11-85-1", standort: "Uelzen" },
    { id: "11-64-1", typ: "GW-San", kennung: "11-64-1", ruf: "Rotkreuz Uelzen 11-64-1", standort: "Uelzen" },
  ],
  personal: [
    { id: "p4", name: "Dierks, Paul", quali: "SanH", ov: "Bad Bodenteich" },
    { id: "p1", name: "Albers, Jana", quali: "SanH", ov: "Uelzen" },
    { id: "p8", name: "Hansen, Finn", quali: "NotSan", ov: "Suderburg" },
  ],
  // Wörtlich die fünf Gruppen aus der Vorlage (`docs/design/einsatzbuch-v2/vorlage/
  // Einsatzbuch v2.dc.html`, dieselbe Liste wie in `stammdaten.json`).
  stichworte: [
    { name: "Rettungsdienst", items: ["RD 1", "RD 2", "Unterstützung RD"] },
    { name: "MANV", items: ["MANV 5", "MANV 10", "MANV 25"] },
    { name: "Sanitätsdienst", items: ["SanD"] },
    { name: "Betreuung", items: ["Betreuung 25", "Betreuung 50", "Evakuierung"] },
    { name: "Sonstiges", items: ["Personensuche", "Sonstiges"] },
  ],
};

interface Einstellungen {
  betrieb: "test" | "echt" | null;
  fristSekunden: number;
  entwicklung: boolean;
  stammdaten: Stammdaten;
  bereitschaft: string;
  zeitzone: string;
}

/** Spielt das Fake-Backend ein. Muss vor `page.goto(...)` aufgerufen werden. */
export async function installiereStub(page: Page, optionen: StubOptionen = {}): Promise<void> {
  const einstellungen: Einstellungen = {
    betrieb: optionen.betrieb === undefined ? "test" : optionen.betrieb,
    fristSekunden: optionen.fristSekunden ?? 60,
    entwicklung: optionen.entwicklung ?? true,
    stammdaten: STAMMDATEN,
    bereitschaft: "DRK-Bereitschaft Uelzen",
    zeitzone: "Europe/Berlin",
  };

  await page.addInitScript((einstellungen: Einstellungen) => {
    const NICHT_EINGERICHTET = "Dieser Rechner ist noch nicht eingerichtet.";
    const GENESIS = "0".repeat(64);
    const FRIST_MS = einstellungen.fristSekunden * 1000;
    // Nur für den Anzeigetext („Nach dem Absenden … Minuten änderbar“); die Frist selbst läuft
    // über `FRIST_MS`, nicht über diesen gerundeten Wert.
    const FRIST_MINUTEN_ANZEIGE = Math.max(1, Math.round(einstellungen.fristSekunden / 60));

    interface AusstehendIntern {
      entwurf: Entwurf;
      abgesendetAm: string;
      fristBisMs: number;
    }

    interface Zustand {
      betrieb: "test" | "echt" | null;
      eingerichtet: boolean;
      entwurf: Entwurf | null;
      ausstehend: AusstehendIntern | null;
      versiegelung: Versiegelung | null;
      bloecke: { block: number; hash: string }[];
      nummern: Record<number, number>;
    }

    function neuerZustand(betrieb: "test" | "echt" | null): Zustand {
      return { betrieb, eingerichtet: betrieb !== null, entwurf: null, ausstehend: null, versiegelung: null, bloecke: [], nummern: {} };
    }

    let zustand = neuerZustand(einstellungen.betrieb);

    /** Wie `fehlendeAngaben` in `logik/formular.ts` und `pruefe_entwurf` in Rust, getrimmt. */
    function fehlendeAngaben(e: Entwurf): string[] {
      const fehlt: string[] = [];
      if (!e.stichwort.trim()) fehlt.push("Alarmstichwort");
      if (!e.beginnDatum.trim() || !e.beginnZeit.trim()) fehlt.push("Beginn");
      if (!e.strasse.trim() && !e.ort.trim()) fehlt.push("Einsatzort");
      return fehlt;
    }

    /**
     * Die übrigen Regeln aus `pruefe_entwurf`, soweit die Specs sie erreichen können: Ende nur
     * vollständig, Längen in UTF-16-Codeeinheiten (`String.length`) am getrimmten Wert (Notizen
     * ungetrimmt), Anzahl der Fahrzeuge und Kräfte.
     */
    function pruefeInhalt(e: Entwurf): void {
      if (!e.endeDatum.trim() !== !e.endeZeit.trim()) {
        throw new Error("Eingabe ungültig: Ende braucht Datum und Uhrzeit zusammen oder keins von beiden");
      }
      const laengen: [string, string, number][] = [
        ["Alarmstichwort", e.stichwort.trim(), 80],
        ["Straße", e.strasse.trim(), 200],
        ["Ort", e.ort.trim(), 200],
        ["Objekt", e.objekt.trim(), 500],
        ["Notizen", e.notizen, 20_000],
      ];
      for (const [feld, wert, hoechstens] of laengen) {
        if (wert.length > hoechstens) {
          throw new Error(`Eingabe ungültig: ${feld} darf höchstens ${hoechstens} Zeichen lang sein, hat ${wert.length}`);
        }
      }
      if (e.fahrzeuge.length > 200) {
        throw new Error(`Eingabe ungültig: höchstens 200 Fahrzeuge je Einsatz, gewählt sind ${e.fahrzeuge.length}`);
      }
      if (e.personal.length > 1000) {
        throw new Error(`Eingabe ungültig: höchstens 1000 Kräfte je Einsatz, gewählt sind ${e.personal.length}`);
      }
    }

    /**
     * Wie `pruefe_schritt` in `erfassung.rs`: Eine Bearbeitung (`bearbeitung = true`) braucht
     * einen ausstehenden Einsatz mit noch laufender Frist, ein neuer Einsatz darf keinen
     * ausstehenden vorfinden.
     */
    function pruefeSchritt(bearbeitung: boolean, jetztMs: number): void {
      if (bearbeitung) {
        if (zustand.ausstehend && jetztMs < zustand.ausstehend.fristBisMs) return;
        throw new Error("Die Frist ist abgelaufen. Versiegelt wird der zuletzt abgesendete Stand.");
      }
      if (zustand.ausstehend) {
        throw new Error("Es ist schon ein Einsatz abgesendet. Ändern lässt er sich über „Angaben ändern“, solange die Frist läuft.");
      }
    }

    async function hashHex(daten: unknown): Promise<string> {
      const bytes = new TextEncoder().encode(JSON.stringify(daten));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    function ausstehendFuerStatus(): Ausstehend | null {
      const a = zustand.ausstehend;
      if (!a) return null;
      return { entwurf: a.entwurf, abgesendetAm: a.abgesendetAm, fristBis: new Date(a.fristBisMs).toISOString(), fristBisMs: a.fristBisMs };
    }

    function status(): Status {
      const jetzt = new Date();
      return {
        betrieb: zustand.betrieb,
        eingerichtet: zustand.eingerichtet,
        entwicklung: einstellungen.entwicklung,
        startfehler: null,
        bereitschaft: zustand.eingerichtet ? einstellungen.bereitschaft : null,
        zeitzone: zustand.eingerichtet ? einstellungen.zeitzone : null,
        fristMinuten: zustand.eingerichtet ? FRIST_MINUTEN_ANZEIGE : null,
        besatzung: zustand.eingerichtet ? false : null,
        jetzt: jetzt.toISOString(),
        jetztMs: jetzt.getTime(),
        entwurf: zustand.entwurf,
        ausstehend: ausstehendFuerStatus(),
        kette: { anzahl: zustand.bloecke.length, letzter: zustand.bloecke.length > 0 ? zustand.bloecke[zustand.bloecke.length - 1] : null },
        versiegelung: zustand.versiegelung,
      };
    }

    function stammdaten(): Stammdatenpaket {
      if (!zustand.eingerichtet) throw new Error(NICHT_EINGERICHTET);
      return {
        version: 1,
        stammdaten: einstellungen.stammdaten,
        fristMinuten: FRIST_MINUTEN_ANZEIGE,
        besatzung: false,
        zeitzone: einstellungen.zeitzone,
        bereitschaft: einstellungen.bereitschaft,
      };
    }

    function entwurfSpeichern(entwurf: Entwurf, bearbeitung: boolean): void {
      if (!zustand.eingerichtet) throw new Error(NICHT_EINGERICHTET);
      pruefeSchritt(bearbeitung, Date.now());
      zustand.entwurf = entwurf;
    }

    function entwurfVerwerfen(): void {
      zustand.entwurf = null;
    }

    /**
     * Wie `sende_ab`: Die erste Absendung setzt die Frist, jede weitere (`bearbeitung = true`)
     * überschreibt nur den Inhalt, nie `abgesendetAm`/`fristBisMs`.
     */
    function absenden(entwurf: Entwurf, bearbeitung: boolean): Ausstehend {
      if (!zustand.eingerichtet) throw new Error(NICHT_EINGERICHTET);
      const fehlt = fehlendeAngaben(entwurf);
      if (fehlt.length > 0) throw new Error(`Fehlt: ${fehlt.join(", ")}`);
      pruefeInhalt(entwurf);
      pruefeSchritt(bearbeitung, Date.now());
      const letzter = zustand.bloecke[zustand.bloecke.length - 1];
      if (!bearbeitung && letzter && letzter.block >= 10_000) {
        throw new Error("Das Einsatzbuch ist voll: Mehr als 10 000 Einsätze nimmt dieser Rechner nicht auf. Bitte wende dich an die Verwaltung.");
      }
      if (zustand.ausstehend) {
        zustand.ausstehend = { ...zustand.ausstehend, entwurf };
      } else {
        const jetztMs = Date.now();
        zustand.ausstehend = { entwurf, abgesendetAm: new Date(jetztMs).toISOString(), fristBisMs: jetztMs + FRIST_MS };
      }
      zustand.entwurf = null;
      return ausstehendFuerStatus()!;
    }

    /**
     * Wie `versiegele_ausstehend`: Nummer je Kalenderjahr, Block an die (In-Memory-)Kette
     * angehängt, `verfallen` nur, wenn zugleich ein Entwurf besteht. Ohne Ausstehendes `null`.
     */
    async function versiegeleAusstehend(verfallenWennEntwurf: boolean): Promise<Versiegelung | null> {
      if (!zustand.ausstehend) return null;
      const verfallen = verfallenWennEntwurf && zustand.entwurf !== null;
      const jahr = new Date().getFullYear();
      zustand.nummern[jahr] = (zustand.nummern[jahr] ?? 0) + 1;
      const praefix = zustand.betrieb === "test" ? "T-" : "";
      const nummer = `${praefix}${jahr}-${String(zustand.nummern[jahr]).padStart(3, "0")}`;
      const letzter = zustand.bloecke[zustand.bloecke.length - 1];
      const block = letzter ? letzter.block + 1 : 1;
      const prev = letzter ? letzter.hash : GENESIS;
      const hash = await hashHex(zustand.ausstehend.entwurf);
      const versiegelt = new Date().toISOString();
      zustand.bloecke.push({ block, hash });
      zustand.ausstehend = null;
      zustand.entwurf = null;
      return { block, hash, prev, versiegelt, nummer, verfallen };
    }

    /** Wie `versiegele_jetzt`: `verfallen` ist immer `false`, ohne Ausstehendes zählt eine schon vorliegende, unquittierte Versiegelung. */
    async function jetztVersiegeln(): Promise<Versiegelung> {
      if (!zustand.eingerichtet) throw new Error(NICHT_EINGERICHTET);
      if (zustand.ausstehend) {
        const v = await versiegeleAusstehend(false);
        zustand.versiegelung = v;
        return v!;
      }
      if (zustand.versiegelung) return zustand.versiegelung;
      throw new Error("Es gibt keinen abgesendeten Einsatz, der versiegelt werden könnte.");
    }

    /** Wie `pruefe_frist_jetzt`: versiegelt selbst, sobald die Frist erreicht ist, und liefert die (ggf. schon vorliegende) unquittierte Versiegelung. */
    async function fristPruefen(): Promise<Versiegelung | null> {
      if (zustand.ausstehend && Date.now() >= zustand.ausstehend.fristBisMs) {
        zustand.versiegelung = await versiegeleAusstehend(true);
      }
      return zustand.versiegelung;
    }

    function versiegelungQuittieren(): void {
      zustand.versiegelung = null;
    }

    function testbetriebBeenden(): void {
      if (zustand.betrieb !== "test") {
        throw new Error(zustand.betrieb === "echt" ? "Testbetrieb beenden geht nur im Testbetrieb." : NICHT_EINGERICHTET);
      }
      zustand = neuerZustand(null);
    }

    function entwicklungEinrichten(): void {
      if (zustand.eingerichtet) throw new Error("Dieser Rechner ist schon eingerichtet.");
      zustand = neuerZustand("test");
    }

    const aufrufe: { cmd: string; args: Record<string, unknown> }[] = [];
    (window as unknown as { __aufrufe: typeof aufrufe }).__aufrufe = aufrufe;

    async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
      aufrufe.push({ cmd, args });
      switch (cmd) {
        case "status":
          return status();
        case "stammdaten":
          return stammdaten();
        case "entwurf_speichern":
          return entwurfSpeichern(args.entwurf as Entwurf, args.bearbeitung as boolean);
        case "entwurf_verwerfen":
          return entwurfVerwerfen();
        case "absenden":
          return absenden(args.entwurf as Entwurf, args.bearbeitung as boolean);
        case "jetzt_versiegeln":
          return jetztVersiegeln();
        case "frist_pruefen":
          return fristPruefen();
        case "versiegelung_quittieren":
          return versiegelungQuittieren();
        case "testbetrieb_beenden":
          return testbetriebBeenden();
        case "entwicklung_einrichten":
          return entwicklungEinrichten();
        default:
          throw new Error(`Unbekannter Befehl im Playwright-Stub: ${cmd}`);
      }
    }

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: (cb: unknown) => {
        const id = Math.random();
        (window as unknown as Record<string, unknown>)["_" + id] = cb;
        return id;
      },
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    };
  }, einstellungen);
}
