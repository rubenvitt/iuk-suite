import type { Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * AUTOSAVE (Spec §6.6, Entscheidung 11) — eine Warteschlange ohne React.
 *
 * - `aendere` startet die Wartezeit neu; gesendet wird der Stand, der BEIM SENDEN aktuell ist.
 * - Immer nur ein Aufruf zugleich (`kette`); Planangaben reihen sich ein. Dadurch gibt es genau EINE
 *   Version im Umlauf, und Angaben + Inhalt erzeugen nie einen falschen Konflikt.
 * - „Keine Änderung" heißt „dasselbe Objekt" (jede Planoperation liefert ein neues, `verlauf.ts`).
 * - Konflikt: kein automatisches Speichern mehr, bis „Neu laden" (`uebernimm`) oder „Meine Fassung
 *   behalten" (`behalteMeine`) entschieden ist.
 * - Timer über `globalThis.setTimeout` JE AUFRUF, nicht gemerkt: so greifen die Fake-Timer im Test.
 * - Nach einem WURF (Netz weg, Sitzung abgelaufen) versucht er es selbst wieder, mit wachsendem
 *   Abstand (`WIEDERHOLUNG_MS`); Konflikt und „weg" wiederholen nie — dort entscheidet ein Mensch.
 */
export const WARTEZEIT_MS = 1000;
export const WIEDERHOLUNG_MS = [5_000, 15_000, 30_000, 60_000] as const;
export type SpeicherStatus = "gespeichert" | "ungespeichert" | "speichert" | "fehler" | "konflikt";
export interface SpeicherZustand { status: SpeicherStatus; version: number; konflikt: Speicherstand | null; zuletztGespeichert: number | null; fehler: string | null }
export interface Senden {
  inhalt(e: { id: string; version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis>;
  angaben(e: { id: string; version: number; angaben: Planangaben }): Promise<SpeicherErgebnis>;
}

const NETZFEHLER = "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist.";

export class Speicherer {
  private stand: SpeicherZustand;
  /** Was der Server zuletzt bestätigt hat; `null` = unbekannt, also immer senden („Meine Fassung behalten"). */
  private gespeichert: PlanInhalt | null;
  private aktuell: PlanInhalt;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private kette: Promise<unknown> = Promise.resolve();
  private versuche = 0;

  constructor(private readonly o: { planId: string; version: number; inhalt: PlanInhalt; senden: Senden; melde: (z: SpeicherZustand) => void; warte?: number }) {
    this.gespeichert = o.inhalt;
    this.aktuell = o.inhalt;
    this.stand = { status: "gespeichert", version: o.version, konflikt: null, zuletztGespeichert: null, fehler: null };
  }

  get zustand(): SpeicherZustand { return this.stand; }

  private setze(teil: Partial<SpeicherZustand>): void {
    this.stand = { ...this.stand, ...teil };
    this.o.melde(this.stand);
  }

  private planeSenden(warte: number = this.o.warte ?? WARTEZEIT_MS): void {
    this.abbrechen();
    this.timer = globalThis.setTimeout(() => { this.timer = null; void this.sendeInhalt(); }, warte);
  }

  private abbrechen(): void {
    if (this.timer !== null) { globalThis.clearTimeout(this.timer); this.timer = null; }
  }

  private reihe<T>(auftrag: () => Promise<T>): Promise<T> {
    const p = this.kette.then(auftrag, auftrag);
    this.kette = p.catch(() => undefined);
    return p;
  }

  hatUngespeichertes(): boolean {
    return this.aktuell !== this.gespeichert || this.stand.status === "speichert";
  }

  aendere(inhalt: PlanInhalt): void {
    this.aktuell = inhalt;
    if (this.stand.status === "konflikt") return;
    if (inhalt === this.gespeichert) {
      this.abbrechen();
      if (this.stand.status === "ungespeichert") this.setze({ status: "gespeichert" });
      return;
    }
    if (this.stand.status !== "speichert") this.setze({ status: "ungespeichert", fehler: null });
    this.planeSenden();
  }

  private sendeInhalt(): Promise<void> {
    return this.reihe(async () => {
      if (this.stand.status === "konflikt") return;
      const senden = this.aktuell;
      if (senden === this.gespeichert) {
        if (this.timer === null && this.stand.status !== "fehler") this.setze({ status: "gespeichert" });
        return;
      }
      this.setze({ status: "speichert" });
      let r: SpeicherErgebnis;
      try {
        r = await this.o.senden.inhalt({ id: this.o.planId, version: this.stand.version, inhalt: senden });
      } catch {
        this.setze({ status: "fehler", fehler: NETZFEHLER });
        this.planeSenden(WIEDERHOLUNG_MS[Math.min(this.versuche, WIEDERHOLUNG_MS.length - 1)]);
        this.versuche += 1;
        return;
      }
      this.versuche = 0;
      this.verarbeite(r, () => { this.gespeichert = senden; });
    });
  }

  private verarbeite(r: SpeicherErgebnis, beiErfolg: () => void): void {
    if (r.ok) {
      beiErfolg();
      const offen = this.aktuell !== this.gespeichert;
      this.setze({ version: r.version, zuletztGespeichert: r.aktualisiertAm, fehler: null, status: offen ? "ungespeichert" : "gespeichert" });
      if (offen && this.timer === null) this.planeSenden();
      return;
    }
    if (r.grund === "konflikt") { this.abbrechen(); this.setze({ status: "konflikt", konflikt: r.stand }); return; }
    if (r.grund === "weg") { this.setze({ status: "fehler", fehler: "Diesen Plan gibt es nicht mehr, oder er wurde archiviert." }); return; }
    this.setze({ status: "fehler", fehler: r.fehler });
  }

  /** Planangaben: sofort, aber hinter einem laufenden Auftrag. Feldfehler gehen ans Formular, nicht in den Status. */
  angaben(a: Planangaben): Promise<SpeicherErgebnis> {
    return this.reihe(async () => {
      const r = await this.o.senden.angaben({ id: this.o.planId, version: this.stand.version, angaben: a });
      if (!r.ok && r.grund === "ungueltig") return r;
      this.verarbeite(r, () => {});
      return r;
    });
  }

  /** Vor dem Drucken (Entscheidung 12): Wartendes sofort senden; `true`, wenn danach alles gespeichert ist. */
  async jetzt(): Promise<boolean> {
    this.abbrechen();
    await this.sendeInhalt();
    await this.kette;
    return this.stand.status === "gespeichert";
  }

  async behalteMeine(): Promise<void> {
    const k = this.stand.konflikt;
    if (!k) return;
    this.gespeichert = null;
    this.setze({ status: "ungespeichert", konflikt: null, version: k.version });
    this.abbrechen();
    await this.sendeInhalt();
  }

  uebernimm(stand: Speicherstand): void {
    this.abbrechen();
    if (stand.inhalt !== null) { this.gespeichert = stand.inhalt; this.aktuell = stand.inhalt; }
    this.setze({ status: "gespeichert", konflikt: null, version: stand.version, fehler: null, zuletztGespeichert: stand.aktualisiertAm });
  }

  /** „Erneut versuchen" und das Fensterereignis `online` (Editor): sofort, der Rückzug beginnt von vorn. */
  erneut(): Promise<void> {
    this.abbrechen();
    this.versuche = 0;
    return this.sendeInhalt();
  }

  /**
   * Entscheidung 21: Serverstand beim Montieren. Next zeigt nach Browser-Zurück die Seite aus dem
   * Client-Cache, die Props können also veraltet sein. Lokal unverändert → still übernehmen; lokal
   * schon geändert → derselbe Konflikt wie beim Speichern.
   */
  pruefeStand(s: Speicherstand): "aktuell" | "uebernommen" | "konflikt" {
    if (s.version <= this.stand.version) return "aktuell";
    if (!this.hatUngespeichertes() && this.stand.status !== "konflikt") { this.uebernimm(s); return "uebernommen"; }
    this.abbrechen();
    this.setze({ status: "konflikt", konflikt: s });
    return "konflikt";
  }
}
