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
import { uebernahme } from "../../../_lib/inventurUebernahme";
import { CHARGE_INVENTUR } from "../../../_lib/konstanten";
import type { InventurCharge, InventurZeile } from "../../../_lib/lesepfade/inventur";

export type NeueCharge = { schluessel: string; verfall: string; chargenNr: string; ist: number };
export type Zaehlung =
  | { art: "artikel"; ist: number }
  | {
      art: "chargen";
      chargen: Readonly<Record<string, number>>;
      neu: readonly NeueCharge[];
      /**
       * IDA-276 — je Charge: den Rest auf „Nicht zugeordnet" ausbuchen? Fehlt
       * der Eintrag, gilt JA (`AUSBUCHEN_VORGABE`) — der Regelfall beim
       * Einsortieren ist, dass alles in genau einem Schrank liegt. Nur ein
       * ausdrueckliches Nein wird gemerkt.
       */
      ausbuchen?: Readonly<Record<string, boolean>>;
    };
export type ZaehlStand = Readonly<Record<string, Zaehlung>>;

export function neuSchluessel(verfall: string, chargenNr: string): string {
  return `${chargenNr.trim() || CHARGE_INVENTUR}|${verfall}`;
}

function ohne(stand: ZaehlStand, artikelId: string): ZaehlStand {
  const rest: Record<string, Zaehlung> = { ...stand };
  delete rest[artikelId];
  return rest;
}

/** IDA-276 — ohne ausdrueckliche Wahl wird der Rest auf „Nicht zugeordnet" ausgebucht. */
export const AUSBUCHEN_VORGABE = true;

type ChargenTeil = { chargen: Record<string, number>; neu: NeueCharge[]; ausbuchen: Record<string, boolean> };

function chargenTeil(stand: ZaehlStand, artikelId: string): ChargenTeil {
  const z = stand[artikelId];
  return z?.art === "chargen"
    ? { chargen: { ...z.chargen }, neu: [...z.neu], ausbuchen: { ...z.ausbuchen } }
    : { chargen: {}, neu: [], ausbuchen: {} };
}

/** Der Zaehlungseintrag aus einem Teil — `ausbuchen` nur, wenn etwas gewaehlt ist. */
function alsZaehlung(teil: ChargenTeil): Zaehlung {
  const { chargen, neu, ausbuchen } = teil;
  return Object.keys(ausbuchen).length > 0
    ? { art: "chargen", chargen, neu, ausbuchen }
    : { art: "chargen", chargen, neu };
}

/** Wird der Rest dieser Charge auf „Nicht zugeordnet" ausgebucht? */
export function ausbuchenFuer(z: Zaehlung | undefined, chargeId: string): boolean {
  return z?.art === "chargen" ? (z.ausbuchen?.[chargeId] ?? AUSBUCHEN_VORGABE) : AUSBUCHEN_VORGABE;
}

export function artikelSetzen(stand: ZaehlStand, artikelId: string, ist: number): ZaehlStand {
  if (stand[artikelId]?.art === "chargen") return stand;
  return { ...stand, [artikelId]: { art: "artikel", ist } };
}

export function chargeSetzen(stand: ZaehlStand, artikelId: string, chargeId: string, ist: number): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.chargen[chargeId] = ist;
  return { ...stand, [artikelId]: alsZaehlung(teil) };
}

/**
 * IDA-276 — den Schalter „Rest ausbuchen" einer Charge setzen. Nur an einer
 * schon gezaehlten Charge: der Schalter ist eine Eigenschaft der Zaehlung, und
 * eine ungezaehlte Charge wird gar nicht gesendet.
 */
export function ausbuchenSetzen(stand: ZaehlStand, artikelId: string, chargeId: string, an: boolean): ZaehlStand {
  const z = stand[artikelId];
  if (z?.art !== "chargen" || !(chargeId in z.chargen)) return stand;
  if (ausbuchenFuer(z, chargeId) === an) return stand;
  const teil = chargenTeil(stand, artikelId);
  if (an === AUSBUCHEN_VORGABE) delete teil.ausbuchen[chargeId];
  else teil.ausbuchen[chargeId] = an;
  return { ...stand, [artikelId]: alsZaehlung(teil) };
}

export function neueChargeHinzufuegen(stand: ZaehlStand, artikelId: string, neu: NeueCharge): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  if (teil.neu.some((n) => n.schluessel === neu.schluessel)) return stand;
  teil.neu.push(neu);
  return { ...stand, [artikelId]: alsZaehlung(teil) };
}

/**
 * IDA-276 — eine ergaenzte Charge NACHTRAEGLICH aendern (Menge, MHD,
 * Chargennummer), statt sie zu loeschen und neu anzulegen. Die Position in der
 * Liste bleibt, damit die Zeile unter dem Finger nicht springt.
 *
 * ⚠️ EIN NEUER SCHLUESSEL, DEN SCHON EINE ANDERE ERGAENZUNG TRAEGT, AENDERT
 * NICHTS (referenzgleich zurueck). Der Server wiese zwei gleiche Ergaenzungen
 * als `chargeDoppelt` ab — die Oberflaeche laesst den Zustand gar nicht erst
 * entstehen und sagt es vorher (`ChargenZaehlung`).
 */
export function neueChargeAendern(
  stand: ZaehlStand, artikelId: string, schluessel: string, neu: NeueCharge,
): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  const index = teil.neu.findIndex((n) => n.schluessel === schluessel);
  if (index < 0) return stand;
  if (neu.schluessel !== schluessel && teil.neu.some((n) => n.schluessel === neu.schluessel)) return stand;
  teil.neu[index] = neu;
  return { ...stand, [artikelId]: alsZaehlung(teil) };
}

export function neueChargeEntfernen(stand: ZaehlStand, artikelId: string, schluessel: string): ZaehlStand {
  const teil = chargenTeil(stand, artikelId);
  teil.neu = teil.neu.filter((n) => n.schluessel !== schluessel);
  if (Object.keys(teil.chargen).length === 0 && teil.neu.length === 0) return ohne(stand, artikelId);
  return { ...stand, [artikelId]: alsZaehlung(teil) };
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
  stand: ZaehlStand, zeile: Pick<InventurZeile, "id" | "bestand"> & Partial<Pick<InventurZeile, "chargen">>,
): ZaehlStand {
  if (zeile.id in stand) return stand;
  /*
   * IDA-276 — LIEGT DER ARTIKEL NOCH AUF „NICHT ZUGEORDNET", HEISST „STIMMT":
   * alles, was hier und dort erwartet wird, liegt in diesem Schrank. Jede
   * Charge steht dann auf Schrank plus Wurzel; die Wurzel wird vollstaendig
   * umgelagert, ausgebucht wird nichts, und die Abweichung ist 0. Als
   * Artikelzaehlung bestaetigte „Stimmt" nur den (oft leeren) Schrank, und der
   * Bestand bliebe auf der Wurzel stehen.
   */
  const ungeordnet = (zeile.chargen ?? []).filter((c) => c.ungeordnet > 0);
  if (ungeordnet.length > 0) {
    const chargen: Record<string, number> = {};
    for (const c of zeile.chargen ?? []) chargen[c.id] = c.rest + c.ungeordnet;
    return { ...stand, [zeile.id]: { art: "chargen", chargen, neu: [] } };
  }
  return { ...stand, [zeile.id]: { art: "artikel", ist: zeile.bestand } };
}

/**
 * IDA-276 — DIE EINE CHARGE, DIE DER STEPPER DER HAUPTZEILE ZAEHLT, wenn der
 * Artikel noch auf „Nicht zugeordnet" liegt. Der Regelfall beim Einsortieren
 * ist genau eine Charge; dann zaehlt der Stepper sie direkt, und niemand muss
 * jede Zeile aufklappen. Bei mehreren Chargen gibt es keine richtige Wahl —
 * dann wird in der aufgeklappten Zeile gezaehlt (`undefined`).
 *
 * ⚠️ OHNE WURZELBESTAND BLEIBT ES DIE ARTIKELZAEHLUNG wie bisher; dort
 * entscheidet der Server per FEFO bzw. juengster Charge.
 */
export function stepperCharge(zeile: Pick<InventurZeile, "chargen" | "ungeordnet">): InventurCharge | undefined {
  if (zeile.ungeordnet <= 0 || zeile.chargen.length !== 1) return undefined;
  return zeile.chargen[0];
}

/**
 * Was der Stepper der Hauptzeile setzt — die Artikelzaehlung oder (IDA-276)
 * die eine Charge aus `stepperCharge`.
 */
export function istSetzen(
  stand: ZaehlStand, zeile: Pick<InventurZeile, "id" | "chargen" | "ungeordnet">, ist: number,
): ZaehlStand {
  const charge = stepperCharge(zeile);
  if (!charge) return artikelSetzen(stand, zeile.id, ist);
  const z = stand[zeile.id];
  // Mit Ergaenzungen ist der Stepper nur noch die Summe — wie im Chargenmodus.
  if (z?.art === "chargen" && z.neu.length > 0) return stand;
  return chargeSetzen(stand, zeile.id, charge.id, ist);
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

/**
 * IDA-276 — die Uebernahme-Rechnung EINER gezaehlten Charge, mit derselben
 * Funktion, mit der die Action bucht (`_lib/inventurUebernahme.ts`).
 */
export function chargenUebernahme(c: InventurCharge, z: Zaehlung | undefined, ist: number) {
  return uebernahme(c.rest, c.ungeordnet, ist, ausbuchenFuer(z, c.id));
}

/**
 * Die Abweichung einer Zeile, wie sie gebucht wird. Ohne Wurzelbestand ist das
 * `summeFuer - bestand` wie bisher; mit Wurzelbestand (IDA-276) zaehlt eine
 * Umlagerung nicht als Abweichung, ein ausgebuchter Rest schon.
 */
export function abweichungFuer(zeile: InventurZeile, z: Zaehlung | undefined): number {
  if (!z) return 0;
  if (z.art === "artikel") return z.ist - zeile.bestand;
  let summe = z.neu.reduce((s, n) => s + n.ist, 0);
  for (const c of zeile.chargen) {
    const ist = z.chargen[c.id];
    if (ist !== undefined) summe += chargenUebernahme(c, z, ist).abweichung;
  }
  return summe;
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
    for (const c of zeile.chargen) {
      const ist = z.chargen[c.id];
      if (ist !== undefined && chargenUebernahme(c, z, ist).abweichung !== 0) n++;
    }
    n += z.neu.length;
  }
  return n;
}

export function ausgeblendetGezaehlt(
  zeilen: readonly InventurZeile[], stand: ZaehlStand, filter: InventurFilter,
): number {
  return zeilen.filter((z) => z.id in stand && !inventurTrifft(z, filter)).length;
}

/**
 * ⚠️ IDA-276 — `ausbuchen` GEHT NUR AN CHARGEN MIT, DIE AUF DIESER SEITE AUF
 * „NICHT ZUGEORDNET" STANDEN (`zeilen`). Der Server liest den Wurzelbestand
 * selbst; fehlt das Feld, bucht er dort nichts aus. Ein Ja, das immer
 * mitginge, buchte sonst Wurzelbestand aus, den erst NACH dem Laden jemand
 * dorthin gelegt hat — gesehen haette ihn niemand.
 */
export function positionenAus(
  stand: ZaehlStand, zeilen: readonly Pick<InventurZeile, "chargen">[] = [],
): InventurNutzlast["positionen"] {
  const mitWurzel = new Set(zeilen.flatMap((z) => z.chargen.filter((c) => c.ungeordnet > 0).map((c) => c.id)));
  return Object.entries(stand).map(([artikelId, z]) => z.art === "artikel"
    ? { artikelId, ist: z.ist }
    : {
        artikelId,
        chargen: Object.entries(z.chargen).map(([chargeId, ist]) => (mitWurzel.has(chargeId)
          ? { chargeId, ist, ausbuchen: ausbuchenFuer(z, chargeId) }
          : { chargeId, ist })),
        neu: z.neu.map(({ verfall, chargenNr, ist }) => ({ verfall, chargenNr, ist })),
      });
}
