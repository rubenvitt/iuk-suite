import type { Stelle, Verbindung } from "../plan/schema";
import type { Gruppe } from "./gruppen";
import type { KartenMass } from "./karte";
import { ABSTAND, SECHSECK } from "./masse";
import type { Sammler } from "./sammler";
import { sechseckMass, type SechseckMass } from "./sechseck";
import type { Sicht } from "./sicht";
import type { Zeilen } from "./zeilen";

/** Alles, was das Teilbaum-Layout über den Plan wissen muss; gebaut von `umgebungFuer` (Task 9). */
export interface Umgebung {
  sicht: Sicht;
  masse(s: Stelle): KartenMass;
  zeilen: Zeilen;
  /** Kamm-Budget des Ziels (Layout-mm, `budgetFuer`). */
  budget: number;
  /** Die Busgruppen der sichtbaren Kinder samt Kammreihen (`bildeGruppen`), je Stelle einmal gerechnet. */
  gruppen(s: Stelle): Gruppe[];
}

export function seitenAbstand(sechsecke: (SechseckMass | null)[]): number {
  const breitestes = Math.max(0, ...sechsecke.map((s) => s?.breite ?? 0));
  return ABSTAND.seiteSchiene + 2 * ABSTAND.seiteLuft + Math.max(breitestes, ABSTAND.seiteOhneSechseck);
}

function sechseckeDer(stellen: Stelle[], u: Pick<Umgebung, "sicht">): ({ v: Verbindung; m: SechseckMass } | null)[] {
  return stellen.map((st) => {
    const v = u.sicht.verbindung(st.verbindungId);
    return v ? { v, m: sechseckMass(v) } : null;
  });
}

/** Wie weit ein Seitenstapel über die Elternkarte (links) bzw. ihren Block (rechts) hinausragt — Teil des Zeilenblocks im Kamm-Budget. */
export function seitenBreite(stellen: Stelle[], u: Pick<Umgebung, "sicht" | "masse">): number {
  if (stellen.length === 0) return 0;
  return seitenAbstand(sechseckeDer(stellen, u).map((x) => x?.m ?? null)) + Math.max(...stellen.map((st) => u.masse(st).blockBreite));
}

/** Die erste Seitenstelle so tief, dass ihre Kopfmitte auf der Kopfmitte der Elternstelle liegt — nie über der Zeile. */
export function stapelOben(eltern: KartenMass, erste: KartenMass): number {
  return Math.max(0, eltern.kopfHoehe / 2 - erste.kopfHoehe / 2);
}

export function stapelHoehe(eltern: KartenMass, masse: KartenMass[]): number {
  if (masse.length === 0) return 0;
  return stapelOben(eltern, masse[0]) + masse.reduce((h, m) => h + m.blockHoehe, 0) + (masse.length - 1) * ABSTAND.seitenStapel;
}

export function setzeSeiten(
  s: Sammler, eltern: Stelle, m: KartenMass, seite: "links" | "rechts", stellen: Stelle[],
  u: Pick<Umgebung, "sicht" | "masse">,
): void {
  if (stellen.length === 0) return;
  const netz = `${eltern.id}<${seite}`;
  const masse = stellen.map((st) => u.masse(st));
  const sechsecke = sechseckeDer(stellen, u);
  const abstand = seitenAbstand(sechsecke.map((x) => x?.m ?? null));
  const links = seite === "links";
  const schieneX = links ? -ABSTAND.seiteSchiene : m.blockBreite + ABSTAND.seiteSchiene;
  const zweige: number[] = [];
  let oben = stapelOben(m, masse[0]);
  stellen.forEach((st, i) => {
    const sm = masse[i];
    const kx = links ? -abstand - sm.blockBreite : m.blockBreite + abstand;
    s.karte(st, sm, kx, oben, { einklappbar: false, eingeklappt: false });
    const y = oben + sm.kopfHoehe / 2;
    zweige.push(y);
    const kante = links ? kx + sm.breite : kx;
    const von = i === 0 ? (links ? 0 : m.breite) : schieneX;
    const hex = sechsecke[i];
    s.linie(netz, von, y, kante, y, hex === null);
    if (hex) s.sechseck(netz, hex.v, hex.m, (schieneX + kante) / 2 - hex.m.breite / 2, y - SECHSECK.hoehe / 2);
    oben += sm.blockHoehe + ABSTAND.seitenStapel;
  });
  if (zweige.length > 1) s.linie(netz, schieneX, zweige[0], schieneX, zweige[zweige.length - 1], sechsecke.every((x) => x === null));
}
