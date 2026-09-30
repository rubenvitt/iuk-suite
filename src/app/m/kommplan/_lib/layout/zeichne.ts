import { ART_NAME, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../plan/schema";
import { istLeer, maxX, minX } from "./kontur";
import { reihenNachBreite } from "./gruppen";
import { ABSTAND } from "./masse";
import { Sammler } from "./sammler";
import type { Sicht } from "./sicht";
import { packe, setzeTeilbaum, umgebungFuer } from "./teilbaum";
import { verschiebeElemente, type LayoutOptionen, type LegendenEintrag, type Zeichnungsdaten, type Ziel } from "./typen";

export function legende(inhalt: PlanInhalt, sicht: Sicht): LegendenEintrag[] {
  const wurzeln = new Set(sicht.wurzeln.map((w) => w.id));
  const gezeichnet = new Set<VerbindungsArt>();
  for (const s of sicht.sichtbar) {
    const v = wurzeln.has(s.id) ? null : sicht.verbindung(s.verbindungId);
    if (v) gezeichnet.add(v.art);
    if (sicht.darstellung(s.id) !== "normal") continue; // Anker und Verweise zeigen keine Kanäle
    for (const k of s.kanaele) {
      const kanal = sicht.verbindung(k);
      if (kanal) gezeichnet.add(kanal.art);
    }
  }
  // „Reserve" = weder Weg zur Elternstelle noch Kanal irgendeiner Stelle (Abweichung 12).
  const benutzt = new Set(inhalt.stellen.flatMap((s) => [s.verbindungId, ...s.kanaele]).filter((x): x is string => x !== null));
  return [
    ...VERBINDUNGS_ARTEN.filter((a) => gezeichnet.has(a)).map((art) => ({ art, text: ART_NAME[art], reserve: false })),
    ...inhalt.verbindungen.filter((v) => !benutzt.has(v.id)).map((v) => ({ art: v.art, text: `Reserve ${v.bezeichnung}`, reserve: true })),
  ];
}

/**
 * Die ganze Zeichnung einer Sicht: Wurzeln gierig nebeneinander, dann auf 0/0 normiert.
 *
 * WURZELREIHEN: Wurzeln hängen an keinem Bus, also bricht ihre Reihe nach demselben Budget um wie
 * eine Kinderreihe (Spec §5.5) — jede weitere Reihe beginnt 16 mm unter dem tiefsten Punkt der
 * vorigen. Ohne Umbruch wäre ein Plan mit vielen Wurzeln nur durch Schneiden aufs Papier zu
 * bringen, und eine Wurzel ohne Kinder lässt sich nicht sinnvoll schneiden (Review Phase 1).
 */
export function zeichne(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}): Zeichnungsdaten {
  const u = umgebungFuer(inhalt, ziel, optionen);
  const teile = u.sicht.wurzeln.map((w) => setzeTeilbaum(w, 0, u));
  const s = new Sammler();
  const breite = (i: number) => (istLeer(teile[i].kontur) ? 0 : maxX(teile[i].kontur) - minX(teile[i].kontur));
  let reiheOben = 0;
  for (const reihe of reihenNachBreite(teile.map((_, i) => i), breite, u.budget, ABSTAND.wurzeln)) {
    const xs = packe(reihe.map((i) => teile[i].kontur), ABSTAND.wurzeln);
    reihe.forEach((i, j) => s.uebernimm(teile[i], xs[j], reiheOben));
    reiheOben = s.unten + ABSTAND.wurzeln;
  }
  if (istLeer(s.kontur)) return { ...s.elemente, breite: 0, hoehe: 0, legende: legende(inhalt, u.sicht) };
  const links = minX(s.kontur);
  const oben = Math.min(0, ...s.kontur.links.map((st) => st.y0));
  return {
    ...verschiebeElemente(s.elemente, -links, -oben),
    breite: maxX(s.kontur) - links,
    hoehe: s.unten - oben,
    legende: legende(inhalt, u.sicht),
  };
}
