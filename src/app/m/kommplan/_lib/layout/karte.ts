import { kontaktZeilen } from "../plan/kontakte";
import type { Stelle, Verbindung } from "../plan/schema";
import { ABZEICHEN, EINHEIT, KANAL, KARTE, SCHRIFT, SECHSECK, STIEL, zeilenhoehe } from "./masse";
import { sechseckMass, type SechseckMass } from "./sechseck";
import { grundlinie, kuerze, textBreite, umbrechen } from "./text";
import type { AbzeichenL, Darstellung, EinheitL, KarteL, KontaktZeileL, TextZeile } from "./typen";

export interface KartenEingabe {
  stelle: Stelle; leerzeilen: boolean; darstellung: Darstellung; versteckt: number; anzahlGruppen: number;
  /** Die Kanäle der Stelle, aufgelöst (unbekannte fallen beim Aufrufer weg). */
  kanaele: Verbindung[];
}
export interface KartenMass {
  breite: number; hoehe: number; kopfHoehe: number; art: KarteL["art"];
  titel: TextZeile[]; titelVoll: string; gekuerzt: boolean; leiter: TextZeile | null;
  kontakte: KontaktZeileL[]; verweis: TextZeile | null;
  einheiten: Omit<EinheitL, "stelleId">[];
  abzeichen: Omit<AbzeichenL, "stelleId"> | null;
  kanalSechsecke: { verbindung: Verbindung; mass: SechseckMass; x: number; y: number }[];
  kanalLinien: { x1: number; y1: number; x2: number; y2: number }[];
  blockBreite: number; blockHoehe: number; gasse: number[];
}

/**
 * Titelschrift: 9,5 pt, solange jedes Wort in die Zeile passt. Ein längeres Einzelwort
 * („Transportorganisation") verkleinert die Schrift in halben Punkten bis 8 pt, statt mitten im
 * Wort umzubrechen — wie die Excel-Vorlage, die solche Titel kleiner setzt. Passt es auch bei 8 pt
 * nicht, bricht `umbrechen` weiter hart (Sichtprüfung Phase 1, Abweichung U3).
 */
function titelGroesse(titel: string, breite: number): number {
  const woerter = titel.split(/\s+/).filter((w) => w.length > 0);
  for (let pt: number = SCHRIFT.titel; pt > KARTE.titelMin; pt -= KARTE.titelStufe) {
    if (woerter.every((w) => textBreite(w, pt, true) <= breite)) return pt;
  }
  return KARTE.titelMin;
}

const zeile = (text: string, x: number, y: number, groesse: number, fett: boolean, anker: TextZeile["anker"] = "start"): TextZeile =>
  ({ text, x, y, groesse, fett, anker });

/**
 * Der Text eines Einheitenkastens: eine Zeile, wenn sie passt; sonst zwei — bevorzugt Typ / Rufname,
 * sonst nach Wörtern. Nie kleiner als 8 pt (sonst hielte `MIN_MASSSTAB` die 6 pt nicht) und nie am
 * Ende gekürzt, solange zwei Zeilen reichen: das Ende ist die Rufnummer, der unterscheidende Teil
 * (Review Phase 1: „GW Betreuung RK LG 45-7…").
 */
function einheitenZeilen(typ: string, rufname: string, voll: string, innen: number): string[] {
  const pt = SCHRIFT.einheit;
  if (textBreite(voll, pt, false) <= innen) return [voll];
  if (typ !== "" && rufname !== "" && textBreite(typ, pt, false) <= innen && textBreite(rufname, pt, false) <= innen) return [typ, rufname];
  return umbrechen(voll, innen, pt, false, EINHEIT.zeilenMax).zeilen;
}

/**
 * Das Maß einer Karte (Spec §5.1): feste Breite, nur die Höhe wächst. Block = Karte + Kanal-Sechsecke
 * + Einheitenspalte (+ Abzeichen), er ist das, was in der Zeile Platz belegt. `gasse` sind die
 * x-Positionen der Stiele, wenn Kanäle oder Einheiten die Kartenmitte darunter belegen; die
 * Kanallinie läuft im Platz rechts neben dem letzten Stiel, die Sechsecke und Einheiten beginnen
 * rechts davon (`einzug`). Stiele links, Kanallinie in der Mitte, Kästen rechts: nichts kreuzt.
 */
export function kartenMass(e: KartenEingabe): KartenMass {
  const { stelle } = e;
  const art: KarteL["art"] = e.darstellung === "normal" ? "normal" : e.darstellung === "anker" ? "anker" : "verweis";
  const titelX = stelle.zeichen !== null ? KARTE.titelX : KARTE.rand;
  const titelBreite = KARTE.breite - titelX - KARTE.innenRechts;
  // Ein leerer Titel ist ein Handeintrag-Feld (Spec §2): keine Titelzeile, Mindestkopf, kein Platzhalter.
  const titelVoll = stelle.titel.trim();
  const ptT = titelGroesse(titelVoll, titelBreite);
  const lhT = zeilenhoehe(ptT), lhL = zeilenhoehe(SCHRIFT.leiter), lhK = zeilenhoehe(SCHRIFT.kontakt);
  const umbruch = titelVoll === ""
    ? { zeilen: [] as string[], gekuerzt: false }
    : umbrechen(titelVoll, titelBreite, ptT, true, KARTE.titelZeilenMax, true);
  const leiterRoh = art === "normal" ? stelle.leiter?.trim() ?? "" : "";
  const leiterText = leiterRoh === "" ? null : kuerze(leiterRoh, titelBreite, SCHRIFT.leiter, false).text;
  const textHoehe = umbruch.zeilen.length * lhT + (leiterText ? lhL : 0);
  const kopfHoehe = Math.max(KARTE.kopfMin, textHoehe + 2 * KARTE.rand);
  let y = (kopfHoehe - textHoehe) / 2;
  const titel = umbruch.zeilen.map((text) => { const z = zeile(text, titelX, grundlinie(y, lhT, ptT), ptT, true); y += lhT; return z; });
  const leiter = leiterText ? zeile(leiterText, titelX, grundlinie(y, lhL, SCHRIFT.leiter), SCHRIFT.leiter, false) : null;

  let hoehe = kopfHoehe;
  const kontakte: KontaktZeileL[] = [];
  let verweis: TextZeile | null = null;
  if (art === "normal") {
    const wertBreite = KARTE.breite - KARTE.wertX - KARTE.innenRechts;
    for (const k of kontaktZeilen(stelle.kontakte, e.leerzeilen)) {
      const u = umbrechen(k.wert, wertBreite, SCHRIFT.kontakt, false, KARTE.kontaktZeilenMax);
      const zh = Math.max(KARTE.kontaktHoehe, u.zeilen.length * lhK + KARTE.rand);
      let ty = hoehe + (zh - u.zeilen.length * lhK) / 2;
      const zeilen = u.zeilen.map((text) => { const z = zeile(text, KARTE.wertX, grundlinie(ty, lhK, SCHRIFT.kontakt), SCHRIFT.kontakt, false); ty += lhK; return z; });
      kontakte.push({ art: k.art, y: hoehe, hoehe: zh, zeilen });
      hoehe += zh;
    }
  } else if (art === "verweis" && typeof e.darstellung === "object") {
    verweis = zeile(`→ Blatt ${e.darstellung.verweisAufBlatt}`, KARTE.rand, grundlinie(hoehe, KARTE.kontaktHoehe, SCHRIFT.verweis), SCHRIFT.verweis, true);
    hoehe += KARTE.kontaktHoehe;
  }

  const einheiten: Omit<EinheitL, "stelleId">[] = [];
  const gasse: number[] = [];
  const kanalSechsecke: KartenMass["kanalSechsecke"] = [];
  const kanalLinien: KartenMass["kanalLinien"] = [];
  const kanaele = art === "normal" ? e.kanaele : [];
  let blockBreite: number = KARTE.breite;
  let blockHoehe = hoehe;
  let einzug: number = EINHEIT.einzugMin;
  let unterbau = hoehe; // Unterkante dessen, was bisher unter der Karte steht
  if (art === "normal" && (stelle.einheiten.length > 0 || kanaele.length > 0)) {
    for (let i = 0; i < e.anzahlGruppen; i++) gasse.push(STIEL.gasseStart + i * STIEL.gasseTakt);
    const plaetze = e.anzahlGruppen + (kanaele.length > 0 ? 1 : 0);
    einzug = Math.max(EINHEIT.einzugMin, STIEL.gasseStart + plaetze * STIEL.gasseTakt + 1);
  }
  if (kanaele.length > 0) {
    const kanalX = STIEL.gasseStart + e.anzahlGruppen * STIEL.gasseTakt;
    kanaele.forEach((v, i) => {
      const y = hoehe + EINHEIT.abstandOben + i * KANAL.takt;
      const mass = sechseckMass(v);
      kanalSechsecke.push({ verbindung: v, mass, x: einzug, y });
      kanalLinien.push({ x1: kanalX, y1: y + SECHSECK.hoehe / 2, x2: einzug, y2: y + SECHSECK.hoehe / 2 });
      blockBreite = Math.max(blockBreite, einzug + mass.breite);
    });
    const letzte = kanalSechsecke[kanalSechsecke.length - 1];
    kanalLinien.unshift({ x1: kanalX, y1: hoehe, x2: kanalX, y2: letzte.y + SECHSECK.hoehe / 2 });
    unterbau = letzte.y + SECHSECK.hoehe;
    blockHoehe = unterbau;
  }
  if (art === "normal" && stelle.einheiten.length > 0) {
    const n = stelle.einheiten.length;
    const spalten = n >= EINHEIT.zweiSpaltenAb ? 2 : 1;
    const proSpalte = Math.ceil(n / spalten);
    const luft = EINHEIT.takt - EINHEIT.hoehe;
    const lh = zeilenhoehe(SCHRIFT.einheit);
    const spaltenY: number[] = [];
    stelle.einheiten.forEach((eh, i) => {
      const spalte = Math.floor(i / proSpalte);
      const x = einzug + spalte * (EINHEIT.breite + EINHEIT.spaltenAbstand);
      const ey = spaltenY[spalte] ?? unterbau + EINHEIT.abstandOben;
      const voll = `${eh.typ} ${eh.rufname}`.trim();
      const zeichenPlatz = eh.zeichen ? EINHEIT.zeichen + KARTE.rand : 0;
      const innen = EINHEIT.breite - 2 * KARTE.rand - zeichenPlatz;
      const texte = einheitenZeilen(eh.typ.trim(), eh.rufname.trim(), voll, innen);
      const eHoehe = EINHEIT.hoehe + (texte.length - 1) * lh;
      const tx = KARTE.rand + zeichenPlatz + innen / 2;
      const oben = (eHoehe - texte.length * lh) / 2;
      einheiten.push({ id: eh.id, x, y: ey, breite: EINHEIT.breite, hoehe: eHoehe, voll, zeichen: eh.zeichen,
        zeilen: texte.map((t, j) => zeile(t, tx, grundlinie(oben + j * lh, lh, SCHRIFT.einheit), SCHRIFT.einheit, false, "mitte")) });
      spaltenY[spalte] = ey + eHoehe + luft;
    });
    blockBreite = Math.max(blockBreite, einzug + spalten * EINHEIT.breite + (spalten - 1) * EINHEIT.spaltenAbstand);
    blockHoehe = Math.max(...spaltenY) - luft;
  }

  let abzeichen: Omit<AbzeichenL, "stelleId"> | null = null;
  if (e.versteckt > 0) {
    const ay = blockHoehe + ABZEICHEN.abstand;
    abzeichen = {
      x: (KARTE.breite - ABZEICHEN.breite) / 2, y: ay, breite: ABZEICHEN.breite, hoehe: ABZEICHEN.hoehe,
      text: zeile(e.versteckt === 1 ? "+1 Stelle" : `+${e.versteckt} Stellen`, ABZEICHEN.breite / 2,
        grundlinie(0, ABZEICHEN.hoehe, SCHRIFT.abzeichen), SCHRIFT.abzeichen, true, "mitte"),
    };
    blockHoehe = ay + ABZEICHEN.hoehe;
  }

  return { breite: KARTE.breite, hoehe, kopfHoehe, art, titel, titelVoll, gekuerzt: umbruch.gekuerzt, leiter,
    kontakte, verweis, einheiten, abzeichen, kanalSechsecke, kanalLinien, blockBreite, blockHoehe, gasse };
}
