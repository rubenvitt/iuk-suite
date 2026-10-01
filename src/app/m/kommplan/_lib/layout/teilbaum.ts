import type { PlanInhalt, Stelle, Verbindung } from "../plan/schema";
import { bildeGruppen, budgetFuer, gruppenAnzahl, type Gruppe } from "./gruppen";
import { kartenMass, type KartenMass } from "./karte";
import { LEER, istLeer, minX, nebeneinander, vereinige, verschiebe, type Kontur } from "./kontur";
import { ABSTAND, SECHSECK, STIEL } from "./masse";
import { Sammler, type Teilbaum } from "./sammler";
import { sechseckMass } from "./sechseck";
import { seitenBreite, setzeSeiten, type Umgebung } from "./seiten";
import { baueSicht } from "./sicht";
import type { LayoutOptionen, Ziel } from "./typen";
import { berechneZeilen } from "./zeilen";

const EPS = 1e-6;

/** Der Zeilenblock eines Kindes im Kamm-Budget: Seitenstapel links + Karten-/Einheitenblock + Seitenstapel rechts. */
export function zeilenblockBreite(st: Stelle, u: Pick<Umgebung, "sicht" | "masse">): number {
  const seiten = u.sicht.seiten(st.id);
  return seitenBreite(seiten.links, u) + u.masse(st).blockBreite + seitenBreite(seiten.rechts, u);
}

export function umgebungFuer(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}, budget = budgetFuer(ziel)): Umgebung {
  const sicht = baueSicht(inhalt, optionen);
  const cache = new Map<string, KartenMass>();
  const masse = (st: Stelle): KartenMass => {
    let m = cache.get(st.id);
    if (!m) {
      m = kartenMass({
        stelle: st, leerzeilen: inhalt.optionen.leerzeilen, darstellung: sicht.darstellung(st.id),
        versteckt: sicht.versteckt(st.id), anzahlGruppen: gruppenAnzahl(sicht.kinder(st.id)),
        kanaele: st.kanaele.map((id) => sicht.verbindung(id)).filter((v): v is Verbindung => v !== null),
      });
      cache.set(st.id, m);
    }
    return m;
  };
  const gruppenCache = new Map<string, Gruppe[]>();
  const gruppen = (st: Stelle): Gruppe[] => {
    let g = gruppenCache.get(st.id);
    if (!g) {
      g = bildeGruppen(sicht.kinder(st.id), (k) => zeilenblockBreite(k, { sicht, masse }), budget, (k) => sicht.kinder(k.id).length === 0);
      gruppenCache.set(st.id, g);
    }
    return g;
  };
  return { sicht, masse, zeilen: berechneZeilen(sicht, masse), budget, gruppen };
}

/** Gierig von links: jedes Teil so weit links wie seine Kontur es neben den bisherigen erlaubt. */
export function packe(konturen: readonly Kontur[], luecke: number): number[] {
  let zone: Kontur = LEER;
  return konturen.map((k) => {
    const dx = istLeer(zone) ? -minX(k) : nebeneinander(zone, k, luecke);
    zone = vereinige(zone, verschiebe(k, dx, 0));
    return dx;
  });
}

interface GesetzteGruppe { gruppe: Gruppe; teil: Teilbaum; busL: number; busR: number; mitte: number }

/** Eine Busgruppe in ihrem eigenen Rahmen: y = 0 ist die Kartenoberkante ihrer ersten Reihe. */
function setzeGruppe(g: Gruppe, eltern: Stelle, tiefe: number, u: Umgebung): GesetzteGruppe {
  const s = new Sammler();
  const netz = `${eltern.id}>${g.schluessel}`;
  const verbindung = u.sicht.verbindung(g.verbindungId);
  const duenn = verbindung === null;
  const reihenOben: number[] = [];
  const mitten: number[][] = [];
  let oben = 0;
  for (const reihe of g.reihen) {
    const teile = reihe.map((k) => setzeTeilbaum(k, tiefe + 1, u));
    const xs = packe(teile.map((t) => t.kontur), ABSTAND.geschwister);
    teile.forEach((t, i) => s.uebernimm(t, xs[i], oben));
    reihenOben.push(oben);
    mitten.push(teile.map((t, i) => xs[i] + t.mitte));
    oben += Math.max(...teile.map((t) => t.unten)) + ABSTAND.kammReihe;
  }
  const kamm = g.reihen.length > 1;
  const ruecken = kamm ? minX(s.kontur) - ABSTAND.kammEinzug : 0;
  mitten.forEach((ms, r) => {
    const y = reihenOben[r] - STIEL.busZuKarte;
    const links = kamm ? ruecken : Math.min(...ms);
    const rechts = Math.max(...ms);
    if (rechts > links + EPS) s.linie(netz, links, y, rechts, y, duenn);
    for (const x of ms) s.linie(netz, x, y, x, reihenOben[r], duenn);
  });
  const busY = -STIEL.busZuKarte;
  if (kamm) s.linie(netz, ruecken, busY, ruecken, reihenOben[reihenOben.length - 1] - STIEL.busZuKarte, duenn);
  const busL = kamm ? ruecken : Math.min(...mitten[0]);
  const busR = Math.max(...mitten[0]);
  const mitte = (busL + busR) / 2;
  const luecke = u.zeilen.luecke[tiefe];
  if (verbindung) {
    const hm = sechseckMass(verbindung);
    const hexOben = busY - STIEL.sechseckZuBus - SECHSECK.hoehe;
    s.sechseck(netz, verbindung, hm, mitte - hm.breite / 2, hexOben);
    s.linie(netz, mitte, hexOben + SECHSECK.hoehe, mitte, busY, false);
    s.belege(mitte - 0.25, -luecke, 0.5, luecke + hexOben); // freie Bahn für den Stiel bis zum Sechseck
  } else {
    s.belege(mitte - 0.25, -luecke, 0.5, luecke + busY);
  }
  return { gruppe: g, teil: s.fertig(mitte, 0), busL, busR, mitte };
}

/**
 * DIE STIELE (Spec §5.2, Abweichung 5 im Umsetzungsplan): jede Gruppe einen eigenen, ab der
 * Kartenunterkante. Kreuzungsfrei, weil Ansatz a und Ziel c streng steigen und äußere Gruppen
 * höher knicken — Fallunterscheidung im Umsetzungsplan Phase 1, Task 9.
 */
function verlegeStiele(
  s: Sammler, stelle: Stelle, m: KartenMass, gruppen: { schluessel: string; mitVerbindung: boolean; c: number }[],
  zeilenUnten: number, kinderOben: number,
): void {
  const k = gruppen.length;
  const a = m.gasse.length === k ? m.gasse : gruppen.map((_, i) => (m.breite * (i + 1)) / (k + 1));
  const indizes = gruppen.map((_, i) => i);
  const links = indizes.filter((i) => gruppen[i].c < a[i] - EPS);
  const rechts = indizes.filter((i) => gruppen[i].c > a[i] + EPS);
  const rang = new Map<number, number>();
  links.forEach((i, r) => rang.set(i, r));
  [...rechts].reverse().forEach((i, r) => rang.set(i, r));
  const busY = kinderOben - STIEL.busZuKarte;
  const hexOben = busY - STIEL.sechseckZuBus - SECHSECK.hoehe;
  gruppen.forEach((g, i) => {
    const netz = `${stelle.id}>${g.schluessel}`;
    const duenn = !g.mitVerbindung;
    const ende = g.mitVerbindung ? hexOben : busY;
    const r = rang.get(i);
    if (r === undefined) { s.linie(netz, a[i], m.hoehe, a[i], ende, duenn); return; }
    const knick = zeilenUnten + STIEL.ersterKnick + r * STIEL.knickTakt;
    s.linie(netz, a[i], m.hoehe, a[i], knick, duenn);
    s.linie(netz, a[i], knick, g.c, knick, duenn);
    s.linie(netz, g.c, knick, g.c, ende, duenn);
  });
}

export function setzeTeilbaum(stelle: Stelle, tiefe: number, u: Umgebung): Teilbaum {
  const m = u.masse(stelle);
  const s = new Sammler();
  s.karte(stelle, m, 0, 0, { einklappbar: u.sicht.einklappbar(stelle.id), eingeklappt: u.sicht.eingeklappt(stelle.id) });
  const seiten = u.sicht.seiten(stelle.id);
  setzeSeiten(s, stelle, m, "links", seiten.links, u);
  setzeSeiten(s, stelle, m, "rechts", seiten.rechts, u);
  const zeilenUnten = u.zeilen.hoehe[tiefe];
  const kinder = u.sicht.kinder(stelle.id);
  if (kinder.length === 0) return s.fertig(m.breite / 2, zeilenUnten);

  const kinderOben = zeilenUnten + u.zeilen.luecke[tiefe];
  const gruppen = u.gruppen(stelle).map((g) => setzeGruppe(g, stelle, tiefe, u));
  const versatz = packe(gruppen.map((g) => g.teil.kontur), ABSTAND.gruppen);
  const spanneL = gruppen[0].busL + versatz[0];
  const spanneR = gruppen[gruppen.length - 1].busR + versatz[gruppen.length - 1];
  const dx = m.breite / 2 - (spanneL + spanneR) / 2;
  gruppen.forEach((g, i) => s.uebernimm(g.teil, versatz[i] + dx, kinderOben));
  s.spanne(stelle.id, spanneL + dx, spanneR + dx);
  verlegeStiele(
    s, stelle, m,
    gruppen.map((g, i) => ({ schluessel: g.gruppe.schluessel, mitVerbindung: g.gruppe.verbindungId !== null, c: g.mitte + versatz[i] + dx })),
    zeilenUnten, kinderOben,
  );
  return s.fertig(m.breite / 2, zeilenUnten);
}
