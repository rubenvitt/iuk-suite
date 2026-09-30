import { ART_NAME, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../plan/schema";
import { istLeer, maxX, minX } from "./kontur";
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

/** Die ganze Zeichnung einer Sicht: Wurzeln gierig nebeneinander, dann auf 0/0 normiert. */
export function zeichne(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}): Zeichnungsdaten {
  const u = umgebungFuer(inhalt, ziel, optionen);
  const teile = u.sicht.wurzeln.map((w) => setzeTeilbaum(w, 0, u));
  const s = new Sammler();
  const xs = packe(teile.map((t) => t.kontur), ABSTAND.wurzeln);
  teile.forEach((t, i) => s.uebernimm(t, xs[i], 0));
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
