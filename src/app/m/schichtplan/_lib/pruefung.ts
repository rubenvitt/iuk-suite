/**
 * Die Prüfregeln einer Planung (IDA-308, bestätigt von Ruben am 01.11.2026): doppelt verplant,
 * Qualifikation fehlt, zu lange im Dienst. Konflikte werden angezeigt, nie blockiert. Rein und ohne
 * Datenbank — Planungsseite (live beim Ziehen) und Übersicht (Kennzahlen) rechnen mit derselben Funktion.
 */
import { erfuellt, strenge } from "./qualis";
import { type Anforderung, type EinheitDTO, type PlanHelfer, type PlanungDTO, type SchichtDTO, MINUTE, schluessel } from "./typen";
import { stunden, zeitspanne } from "./zeit";

export type KonfliktArt = "doppelt" | "quali" | "dienst";
export interface Konflikt { art: KonfliktArt; schichtIds: string[]; helfer?: string; text: string }
/** Offene Plätze einer Schicht; `braucht` sind Anforderungen, die diese Plätze noch decken müssen. */
export interface Luecke { schichtId: string; fehlen: number; braucht: Anforderung[] }

export const KONFLIKT_TITEL: Record<KonfliktArt, string> = {
  doppelt: "Doppelt verplant",
  quali: "Qualifikation fehlt",
  dienst: "Zu lange im Dienst",
};

/** Welche Anforderungen offen bleiben. Eine Person deckt höchstens eine Anforderung. */
export function offeneAnforderungen(einheit: Pick<EinheitDTO, "anforderungen">, personen: readonly Pick<PlanHelfer, "qualifikationen">[]): Anforderung[] {
  const frei = [...personen];
  const offen: Anforderung[] = [];
  // Strengste zuerst, damit eine Notfallsanitäterin nicht die Sanitäterstelle belegt, während RS fehlt;
  // und von den Passenden die mit den wenigsten Qualifikationen, damit die vielseitigen frei bleiben.
  for (const a of [...einheit.anforderungen].sort((x, y) => strenge(y.quali) - strenge(x.quali))) {
    let fehlt = a.anzahl;
    while (fehlt > 0) {
      const passend = frei.filter((p) => erfuellt(p.qualifikationen, a.quali)).sort((x, y) => x.qualifikationen.length - y.qualifikationen.length);
      if (passend.length === 0) break;
      frei.splice(frei.indexOf(passend[0]), 1);
      fehlt--;
    }
    if (fehlt > 0) offen.push({ quali: a.quali, anzahl: fehlt });
  }
  return offen;
}

export interface Auswertung {
  konflikte: Konflikt[];
  luecken: Luecke[];
  jeSchicht: Map<string, Konflikt[]>;
  jeHelfer: Map<string, Konflikt[]>;
  /** Eingeteilte Millisekunden je Helfer-Schlüssel. */
  dauer: Map<string, number>;
  soll: number;
  ist: number;
}

const name = (h: PlanHelfer | undefined) => (h ? `${h.vorname} ${h.nachname}` : "Nicht mehr im Bestand");

export function pruefe(p: PlanungDTO, alle: readonly PlanHelfer[]): Auswertung {
  const helfer = new Map(alle.map((h) => [h.schluessel, h]));
  const schicht = new Map(p.schichten.map((s) => [s.id, s]));
  const einheit = new Map(p.einheiten.map((e) => [e.id, e]));
  const konflikte: Konflikt[] = [];
  const luecken: Luecke[] = [];
  let soll = 0;
  let ist = 0;

  const proSchicht = new Map<string, string[]>();
  for (const z of p.zuordnungen) proSchicht.set(z.schichtId, [...(proSchicht.get(z.schichtId) ?? []), schluessel(z.quelle, z.helferId)]);

  for (const s of p.schichten) {
    const e = einheit.get(s.einheitId);
    if (!e) continue;
    const personen = (proSchicht.get(s.id) ?? []).map((k) => helfer.get(k)).filter((h): h is PlanHelfer => !!h);
    const anzahl = (proSchicht.get(s.id) ?? []).length;
    soll += e.soll;
    ist += Math.min(anzahl, e.soll);
    const frei = Math.max(0, e.soll - anzahl);
    const offen = offeneAnforderungen(e, personen);
    if (frei > 0) luecken.push({ schichtId: s.id, fehlen: frei, braucht: offen });
    // Eine fehlende Qualifikation ist erst ein Konflikt, wenn die freien Plätze sie nicht mehr
    // aufnehmen können; vorher gehört sie zur Lücke („1 Platz offen, braucht C1“).
    if (offen.reduce((n, a) => n + a.anzahl, 0) > frei) {
      const was = offen.map((a) => `${a.anzahl}× ${a.quali.name}`).join(", ");
      konflikte.push({ art: "quali", schichtIds: [s.id], text: `${e.name}, ${zeitspanne(s.von, s.bis)}: ${was} fehlt, ${frei === 0 ? "die Schicht ist aber voll" : `frei ${frei === 1 ? "ist nur 1 Platz" : `sind nur ${frei} Plätze`}`}` });
    }
  }

  const jeHelferSchichten = new Map<string, SchichtDTO[]>();
  for (const z of p.zuordnungen) {
    const s = schicht.get(z.schichtId);
    if (!s) continue;
    const k = schluessel(z.quelle, z.helferId);
    jeHelferSchichten.set(k, [...(jeHelferSchichten.get(k) ?? []), s]);
  }
  const dauer = new Map<string, number>();
  for (const [k, liste] of jeHelferSchichten) {
    const n = name(helfer.get(k));
    liste.sort((a, b) => a.von - b.von);
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length && liste[j].von < liste[i].bis; j++) {
        const a = einheit.get(liste[i].einheitId)?.name ?? "?";
        const b = einheit.get(liste[j].einheitId)?.name ?? "?";
        konflikte.push({ art: "doppelt", helfer: k, schichtIds: [liste[i].id, liste[j].id], text: `${n}: ${a} und ${b} überschneiden sich (${zeitspanne(Math.max(liste[i].von, liste[j].von), Math.min(liste[i].bis, liste[j].bis))})` });
      }
    }
    // Schichten mit weniger als `minRuhe` Abstand bilden einen Dienst; der darf `maxDienst` nicht übersteigen.
    let block: SchichtDTO[] = [];
    let ende = -Infinity;
    let summe = 0;
    const schliesse = () => {
      if (block.length === 0) return;
      const anfang = block[0].von;
      if (ende - anfang > p.maxDienstMin * MINUTE) {
        konflikte.push({ art: "dienst", helfer: k, schichtIds: block.map((s) => s.id), text: `${n}: ${stunden(ende - anfang)} im Dienst (${zeitspanne(anfang, ende)}) ohne ${stunden(p.minRuheMin * MINUTE)} Ruhe, erlaubt sind ${stunden(p.maxDienstMin * MINUTE)}` });
      }
      block = [];
    };
    for (const s of liste) {
      summe += s.bis - s.von;
      if (s.von - ende >= p.minRuheMin * MINUTE) { schliesse(); ende = -Infinity; }
      block.push(s);
      ende = Math.max(ende, s.bis);
    }
    schliesse();
    dauer.set(k, summe);
  }

  const jeSchicht = new Map<string, Konflikt[]>();
  const jeHelfer = new Map<string, Konflikt[]>();
  for (const k of konflikte) {
    for (const sid of k.schichtIds) jeSchicht.set(sid, [...(jeSchicht.get(sid) ?? []), k]);
    if (k.helfer) jeHelfer.set(k.helfer, [...(jeHelfer.get(k.helfer) ?? []), k]);
  }
  return { konflikte, luecken, jeSchicht, jeHelfer, dauer, soll, ist };
}
