/**
 * DRK-299 — der Zaehlzustand der Inventur als REINE Funktionen. Kein
 * "use client": Tests und die Client-Insel lesen ihn, und keine Server
 * Component braucht einen Wert daraus (Falle 6 bleibt damit ausgeschlossen).
 *
 * DIE REGEL, DIE HIER NICHT KAPUTTGEHEN DARF: nur Angefasstes wird gesendet. Eine
 * nicht angefasste Charge fehlt in `chargen` und wird serverseitig nicht gebucht
 * — nie implizit 0 (1:1-Pflicht 21). Eine beruehrte Artikelzeile bleibt auch dann
 * eingereicht, wenn ihr Wert dem Seitenstand entspricht: der Server vergleicht
 * gegen den LIVE-Bestand und verhindert damit Lost Updates.
 */
import type { InventurNutzlast } from "../../../_actions/inventur";
import type { InventurFilter } from "../../../_lib/inventurFilter";
import { inventurTrifft } from "../../../_lib/inventurFilter";
import { CHARGE_INVENTUR } from "../../../_lib/konstanten";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";

export type NeueCharge = { schluessel: string; verfall: string; chargenNr: string; ist: number };
export type Zaehlung =
  | { art: "artikel"; ist: number }
  | { art: "chargen"; chargen: Readonly<Record<string, number>>; neu: readonly NeueCharge[] };
export type ZaehlStand = Readonly<Record<string, Zaehlung>>;

export function neuSchluessel(verfall: string, chargenNr: string): string {
  return `${chargenNr.trim() || CHARGE_INVENTUR}|${verfall}`;
}

function ohne(stand: ZaehlStand, artikelId: string): ZaehlStand {
  const rest: Record<string, Zaehlung> = { ...stand };
  delete rest[artikelId];
  return rest;
}

function chargenTeil(stand: ZaehlStand, artikelId: string): { chargen: Record<string, number>; neu: NeueCharge[] } {
  const z = stand[artikelId];
  return z?.art === "chargen" ? { chargen: { ...z.chargen }, neu: [...z.neu] } : { chargen: {}, neu: [] };
}

export function artikelSetzen(stand: ZaehlStand, artikelId: string, ist: number): ZaehlStand {
  if (stand[artikelId]?.art === "chargen") return stand;
  return { ...stand, [artikelId]: { art: "artikel", ist } };
}

export function chargeSetzen(stand: ZaehlStand, artikelId: string, chargeId: string, ist: number): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.chargen[chargeId] = ist;
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function neueChargeHinzufuegen(stand: ZaehlStand, artikelId: string, neu: NeueCharge): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  if (teil.neu.some((n) => n.schluessel === neu.schluessel)) return stand;
  teil.neu.push(neu);
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function neueChargeEntfernen(stand: ZaehlStand, artikelId: string, schluessel: string): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.neu = teil.neu.filter((n) => n.schluessel !== schluessel);
  if (Object.keys(teil.chargen).length === 0 && teil.neu.length === 0) return ohne(stand, artikelId);
  return { ...stand, [artikelId]: { art: "chargen", ...teil } };
}

export function chargenzaehlungVerwerfen(stand: ZaehlStand, artikelId: string): ZaehlStand {
  return ohne(stand, artikelId);
}

export function summeFuer(zeile: InventurZeile, z: Zaehlung | undefined): number {
  if (!z) return zeile.bestand;
  if (z.art === "artikel") return z.ist;
  const vorhanden = zeile.chargen.reduce((s, c) => s + (z.chargen[c.id] ?? c.rest), 0);
  return vorhanden + z.neu.reduce((s, n) => s + n.ist, 0);
}

export function abweichungenIn(zeilen: readonly InventurZeile[], stand: ZaehlStand): number {
  let n = 0;
  for (const zeile of zeilen) {
    const z = stand[zeile.id];
    if (!z) continue;
    if (z.art === "artikel") { if (z.ist !== zeile.bestand) n++; continue; }
    for (const c of zeile.chargen) if (c.id in z.chargen && z.chargen[c.id] !== c.rest) n++;
    n += z.neu.length;
  }
  return n;
}

export function ausgeblendetGezaehlt(
  zeilen: readonly InventurZeile[], stand: ZaehlStand, filter: InventurFilter,
): number {
  return zeilen.filter((z) => z.id in stand && !inventurTrifft(z, filter)).length;
}

export function positionenAus(stand: ZaehlStand): InventurNutzlast["positionen"] {
  return Object.entries(stand).map(([artikelId, z]) => z.art === "artikel"
    ? { artikelId, ist: z.ist }
    : {
        artikelId,
        chargen: Object.entries(z.chargen).map(([chargeId, ist]) => ({ chargeId, ist })),
        neu: z.neu.map(({ verfall, chargenNr, ist }) => ({ verfall, chargenNr, ist })),
      });
}
