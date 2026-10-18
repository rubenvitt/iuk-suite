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

/**
 * IDA-237 — „STIMMT": die erwartete Menge als gezaehlt uebernehmen, ohne die
 * Zahl anzufassen.
 *
 * ⚠️ DAS IST WOERTLICH DASSELBE, WIE DIE ERWARTUNG VON HAND EINZUTIPPEN —
 * `{ artikelId, ist: bestand }`, keine neue Nutzlast, keine neue Buchungsregel.
 * Der Server rechnet weiter gegen den LIVE-Bestand: stimmt der mit dem Stand
 * dieser Seite ueberein (der Regelfall), entsteht eine Position mit
 * `gezaehlt === erwartet` und KEINE Korrekturbuchung; im Verlauf steht die
 * Zeile als gezaehlt ohne Abweichung. Hat sich der Bestand seit dem Laden
 * bewegt, verhaelt sich die Bestaetigung wie jede andere Zaehlung auch: gilt,
 * was im Regal lag.
 *
 * ⚠️ EINE SCHON ERFASSTE ZEILE BLEIBT, WIE SIE IST. Ein „Stimmt" auf einer
 * Zeile im Chargenmodus ueberschriebe sonst still die gezaehlten Chargen —
 * referenzgleich zurueck heisst: nichts geschehen, niemand wird geweckt.
 */
export function artikelBestaetigen(
  stand: ZaehlStand, zeile: Pick<InventurZeile, "id" | "bestand">,
): ZaehlStand {
  if (zeile.id in stand) return stand;
  return { ...stand, [zeile.id]: { art: "artikel", ist: zeile.bestand } };
}

/**
 * Nimmt ein „Stimmt" zurueck — aber NUR eines: eine Artikelzaehlung, die genau
 * auf der Erwartung steht. Eine abweichende Zahl oder eine Chargenzaehlung ist
 * Arbeit, die ein Fehltipp nicht verwerfen darf; dafuer gibt es den
 * ausdruecklichen Weg („Zählung verwerfen" bzw. „Chargenzählung verwerfen").
 */
export function bestaetigungZuruecknehmen(
  stand: ZaehlStand, zeile: Pick<InventurZeile, "id" | "bestand">,
): ZaehlStand {
  const z = stand[zeile.id];
  if (z?.art !== "artikel" || z.ist !== zeile.bestand) return stand;
  return ohne(stand, zeile.id);
}

/**
 * IDA-237 — „x von y erfasst", bezogen auf den UMFANG (Kategorie/Fach), nicht
 * auf die Suche: wer „Hygiene" zaehlt, will wissen, wie viel von Hygiene fehlt.
 * Erfasst heisst: steht im Zaehlstand — angefasst, gezaehlt oder bestaetigt;
 * genau das, was `positionenAus` sendet.
 */
export function fortschritt(
  zeilen: readonly InventurZeile[], stand: ZaehlStand, filter: InventurFilter,
): { erfasst: number; gesamt: number } {
  let erfasst = 0;
  let gesamt = 0;
  for (const z of zeilen) {
    if (!inventurTrifft(z, filter)) continue;
    gesamt++;
    if (z.id in stand) erfasst++;
  }
  return { erfasst, gesamt };
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
