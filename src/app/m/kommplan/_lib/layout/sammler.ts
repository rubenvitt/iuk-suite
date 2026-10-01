import type { Stelle, Verbindung } from "../plan/schema";
import type { KartenMass } from "./karte";
import { LEER, rechteck, strecke, vereinige, verschiebe, type Kontur } from "./kontur";
import type { SechseckMass } from "./sechseck";
import { leereElemente, verschiebeElemente, type Elemente } from "./typen";

export interface Teilbaum { kontur: Kontur; unten: number; elemente: Elemente; mitte: number }

/**
 * Sammelt gezeichnete Elemente UND belegt ihren Platz in der Kontur — in EINEM Aufruf. Ein Element,
 * das gezeichnet, aber nicht belegt wird, wäre die Einladung an den Nachbarn, darüber zu packen.
 */
export class Sammler {
  elemente: Elemente = leereElemente();
  kontur: Kontur = LEER;
  unten = 0;

  belege(x: number, y: number, b: number, h: number): void {
    this.kontur = vereinige(this.kontur, rechteck(x, y, b, h));
    this.unten = Math.max(this.unten, y + h);
  }

  karte(stelle: Stelle, m: KartenMass, x: number, y: number, zustand: { einklappbar: boolean; eingeklappt: boolean }): void {
    this.elemente.karten.push({
      id: stelle.id, x, y, breite: m.breite, hoehe: m.hoehe, kopfHoehe: m.kopfHoehe, art: m.art,
      hervorheben: stelle.hervorheben, zeichen: stelle.zeichen, titel: m.titel, titelVoll: m.titelVoll,
      gekuerzt: m.gekuerzt, leiter: m.leiter, kontakte: m.kontakte, verweis: m.verweis, ...zustand,
    });
    for (const e of m.einheiten) this.elemente.einheiten.push({ ...e, stelleId: stelle.id, x: x + e.x, y: y + e.y });
    if (m.abzeichen) this.elemente.abzeichen.push({ ...m.abzeichen, stelleId: stelle.id, x: x + m.abzeichen.x, y: y + m.abzeichen.y });
    // Kanäle (Abweichung 12): eigenes Netz ohne Bus; Linien und Sechsecke liegen im Block.
    const kanalNetz = `${stelle.id}#kanal`;
    for (const l of m.kanalLinien) this.linie(kanalNetz, x + l.x1, y + l.y1, x + l.x2, y + l.y2, false);
    for (const h of m.kanalSechsecke) this.sechseck(kanalNetz, h.verbindung, h.mass, x + h.x, y + h.y);
    this.belege(x, y, m.blockBreite, m.blockHoehe);
  }

  linie(netz: string, x1: number, y1: number, x2: number, y2: number, duenn: boolean): void {
    if (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9) return;
    this.elemente.linien.push({ netz, x1, y1, x2, y2, duenn });
    this.kontur = vereinige(this.kontur, strecke(x1, y1, x2, y2));
    this.unten = Math.max(this.unten, y1, y2);
  }

  sechseck(netz: string, v: Verbindung, m: SechseckMass, x: number, y: number): void {
    this.elemente.sechsecke.push({
      netz, verbindungId: v.id, art: v.art, form: m.form, x, y, breite: m.breite, hoehe: m.hoehe,
      beschriftung: m.beschriftung, voll: m.voll, piktogramm: m.piktogramm, pikto: m.pikto,
    });
    this.belege(x, y, m.breite, m.hoehe);
  }

  spanne(stelleId: string, links: number, rechts: number): void {
    this.elemente.spannen.push({ stelleId, links, rechts });
  }

  uebernimm(t: Teilbaum, dx: number, dy: number): void {
    const e = verschiebeElemente(t.elemente, dx, dy);
    this.elemente.karten.push(...e.karten);
    this.elemente.einheiten.push(...e.einheiten);
    this.elemente.linien.push(...e.linien);
    this.elemente.sechsecke.push(...e.sechsecke);
    this.elemente.abzeichen.push(...e.abzeichen);
    this.elemente.spannen.push(...e.spannen);
    this.kontur = vereinige(this.kontur, verschiebe(t.kontur, dx, dy));
    this.unten = Math.max(this.unten, t.unten + dy);
  }

  fertig(mitte: number, mindestUnten: number): Teilbaum {
    return { kontur: this.kontur, unten: Math.max(this.unten, mindestUnten), elemente: this.elemente, mitte };
  }
}
