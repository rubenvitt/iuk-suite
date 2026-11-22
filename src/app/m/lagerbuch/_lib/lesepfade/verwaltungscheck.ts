/**
 * DIE DATEN DER ZÄHLSEITE EINER EINHEIT (Verwaltungscheck) — alles, was die
 * Client-Insel `VerwaltungsZaehlung` braucht, in EINEM serialisierbaren Wurf.
 *
 * ⚠️ NUR TEXT, ZAHLEN, BOOLEANS — kein `Date`, keine `Map`. Zeitpunkte stehen
 * als fertiger Text (Muster `PlombenEditor`, `fmtDatumZeit` ist zonenexplizit);
 * ein `Date` über die RSC-Grenze formatierte in der Zone des Geräts.
 *
 * ⚠️ JEDE `.map()` HIER SCHNEIDET AUF DIE FELDER DES TYPS. Die Lesepfade führen
 * mehr (`SollZeile.sort/herkunft/entfernt`, `GeraetZeile` zwölf Felder,
 * `VerfallAmLagerort.erfasstAt`); ein Durchreichen kompilierte sauber und legte
 * die Verwaltungsfelder still in den Payload (Falle 15, Kommentar in
 * `helfer/check/page.tsx`).
 *
 * ⚠️ `schwellen` REIST MIT, weil der Client die Ampel über `verfallStatus`
 * rechnet und `verfallSchwellen()` aus einem Servermodul dort nicht lesbar wäre
 * (Falle 6) — dieselbe Zusage wie `warn` an `CheckFlow`.
 *
 * ⚠️ `null` HEISST „KEINE FAHRZEUG-EINHEIT". Ob die Einheit AKTIV ist, entscheidet
 * die Seite: sie zeigt dann einen Leerzustand und kein `notFound` (Falle 23).
 */
import { eq, inArray } from "drizzle-orm";
import { chargen, lagerorte, o2Flaschen } from "../../_db/schema";
import type { GeraetTyp } from "../domain/geraet";
import { verfallSchwellen, type VerfallSchwellen } from "../domain/verfall";
import { fmtVerfall } from "../format";
import { standortZeile, type Einheitenart } from "../konstanten";
import { fmtDatumZeit } from "../zeit";
import { chargenJeArtikelAmLagerort } from "./artikel";
import { bestandJeArtikelAnOrt, type Leser } from "./bestand";
import { lagerortOptionen, type LagerortOption } from "./bz";
import { boxOrt } from "./entnahmebox";
import { sollFuerFahrzeug } from "./fahrzeuge";
import { geraeteFuerLagerort, geraeteUebersicht } from "./geraete";
import { o2FlaschenFuerLagerort } from "./o2";
import { zugangsZiele } from "./orte";
import { plombenFuerLagerort } from "./plomben";
import { fachVerfallFuerLagerort, verfallFuerLagerort } from "./verfall";

export type VerwaltungscheckDaten = {
  fahrzeug: {
    id: string; name: string; kennung: string | null;
    einheitenart: Einheitenart | null; aktiv: boolean;
  };
  positionen: {
    id: string; fachLabel: string | null; artikelId: string; artikelName: string;
    einheit: string; soll: number; sollMax: number | null;
  }[];
  /** Bestand je Artikel an der Einheit (Buchstand), artikelId → Menge. */
  buchstand: Record<string, number>;
  /** Das gemeldete Datum je Fach (`YYYY-MM`), sollPositionId → Datum. */
  verfallFach: Record<string, string>;
  /** Das gemeldete Datum je Artikel (`YYYY-MM`), artikelId → Datum. */
  verfallArtikel: Record<string, string>;
  /**
   * Chargen mit Rest an der Einheit — für das Zurücklegen, in FEFO-Reihenfolge
   * (`vergleicheFefoCharge`). Der Client rechnet daraus den Stand nach der
   * Zählung (`chargenNachZaehlung`); `verfall` ist sein Sortierschlüssel.
   */
  chargenAnEinheit: Record<string, { chargeId: string; label: string; verfall: string; menge: number }[]>;
  /**
   * Je gezähltem Artikel die Charge, auf die ein PLUS der Korrektur geht: die
   * jüngste des Artikels, gleich wo sie liegt — dieselbe Regel wie
   * `korrekturAufLagerort` (`_lib/schreibpfade/korrektur.ts`). Fehlt der
   * Artikel, hat er keine Charge, und der Server legt eine Korrektur-Charge an.
   */
  korrekturPlusCharge: Record<string, { chargeId: string; label: string; verfall: string }>;
  plomben: {
    id: string; bezeichnung: string; fachLabel: string | null;
    nummer: string | null; gesetzt: string | null;
  }[];
  geraete: { id: string; name: string; typ: GeraetTyp; barcode: string | null; selbsttest: boolean }[];
  flaschen: { id: string; name: string; nennfuelldruckBar: number; wechselAbProzent: number }[];
  geraeteWoanders: { id: string; name: string; ortLabel: string }[];
  flaschenWoanders: { id: string; name: string; ortLabel: string }[];
  ruecklaufZiele: { id: string; name: string }[];
  entnahmeboxAktiv: boolean;
  lagerorte: LagerortOption[];
  schwellen: VerfallSchwellen;
};

export function verwaltungscheckDaten(db: Leser, fahrzeugId: string): VerwaltungscheckDaten | null {
  const ort = db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get();
  if (!ort || ort.typ !== "fahrzeug") return null;

  // Grabsteine (`entfernt`) sind kein Soll und werden nicht gezählt.
  const positionen = sollFuerFahrzeug(db, fahrzeugId).filter((p) => !p.entfernt).map((p) => ({
    id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
    einheit: p.einheit, soll: p.soll, sollMax: p.sollMax,
  }));

  const chargenAnEinheit: VerwaltungscheckDaten["chargenAnEinheit"] = {};
  for (const [artikelId, liste] of chargenJeArtikelAmLagerort(db, fahrzeugId)) {
    chargenAnEinheit[artikelId] = liste.map((c) => ({
      chargeId: c.id, label: `${c.chargenNr} · ${fmtVerfall(c.verfall)}`, verfall: c.verfall, menge: c.rest,
    }));
  }

  /*
   * Die geratene Charge eines Plus — gespiegelt aus `korrekturAufLagerort`:
   * `verfall`, dann `createdAt`, dann `id`, jeweils ABSTEIGEND, über ALLE
   * Chargen des Artikels. `lesepfade/verwaltungscheck.test.ts` hält beide Wege gegeneinander.
   */
  const korrekturPlusCharge: VerwaltungscheckDaten["korrekturPlusCharge"] = {};
  const sollArtikel = [...new Set(positionen.map((p) => p.artikelId))];
  if (sollArtikel.length > 0) {
    const juengste = new Map<string, typeof chargen.$inferSelect>();
    for (const c of db.select().from(chargen).where(inArray(chargen.artikelId, sollArtikel)).all()) {
      const bisher = juengste.get(c.artikelId);
      if (!bisher || (c.verfall.localeCompare(bisher.verfall)
        || (c.createdAt.getTime() - bisher.createdAt.getTime())
        || c.id.localeCompare(bisher.id)) > 0) {
        juengste.set(c.artikelId, c);
      }
    }
    for (const [artikelId, c] of juengste) {
      korrekturPlusCharge[artikelId] = {
        chargeId: c.id, label: `${c.chargenNr} · ${fmtVerfall(c.verfall)}`, verfall: c.verfall,
      };
    }
  }

  const orte = new Map(db.select().from(lagerorte).all().map((l) => [l.id, {
    name: l.name, typ: l.typ, kennung: l.kennung, einheitenart: l.einheitenart,
  }]));

  return {
    fahrzeug: {
      id: ort.id, name: ort.name, kennung: ort.kennung,
      einheitenart: ort.einheitenart, aktiv: ort.aktiv,
    },
    positionen,
    buchstand: Object.fromEntries(bestandJeArtikelAnOrt(db, fahrzeugId)),
    verfallFach: Object.fromEntries(fachVerfallFuerLagerort(db, fahrzeugId)),
    verfallArtikel: Object.fromEntries(
      [...verfallFuerLagerort(db, fahrzeugId)].map(([artikelId, e]) => [artikelId, e.verfall]),
    ),
    chargenAnEinheit,
    korrekturPlusCharge,
    // Der Zeitpunkt wird HIER formatiert — die Insel bekommt Text, kein `Date`.
    plomben: plombenFuerLagerort(db, fahrzeugId).map((p) => ({
      id: p.id, bezeichnung: p.bezeichnung, fachLabel: p.fachLabel, nummer: p.nummer,
      gesetzt: p.nummer !== null && p.gesetztAt !== null
        ? `${p.nummer} · gesetzt ${fmtDatumZeit(p.gesetztAt)}`
        : null,
    })),
    geraete: geraeteFuerLagerort(db, fahrzeugId).map((g) => ({
      id: g.id, name: g.name, typ: g.typ, barcode: g.barcode, selbsttest: g.selbsttest,
    })),
    flaschen: o2FlaschenFuerLagerort(db, fahrzeugId).map((f) => ({
      id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar,
      wechselAbProzent: f.wechselAbProzent,
    })),
    // „Verknüpfen" holt etwas von woanders HIERHER: aktiv und nicht schon hier.
    geraeteWoanders: geraeteUebersicht(db)
      .filter((g) => g.aktiv && g.lagerortId !== fahrzeugId)
      .map((g) => ({ id: g.id, name: g.name, ortLabel: standortZeile(g.lagerortStandort) })),
    // `o2FlaschenUebersicht` trägt die Standort-Id nicht — hier direkt aus dem Stamm.
    flaschenWoanders: db.select().from(o2Flaschen).all()
      .filter((f) => f.aktiv && f.lagerortId !== fahrzeugId)
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((f) => {
        const standort = orte.get(f.lagerortId);
        return { id: f.id, name: f.name, ortLabel: standort ? standortZeile(standort) : "–" };
      }),
    ruecklaufZiele: zugangsZiele(db).map(({ id, name }) => ({ id, name })),
    entnahmeboxAktiv: boxOrt(db)?.aktiv ?? false,
    lagerorte: lagerortOptionen(db),
    schwellen: verfallSchwellen(),
  };
}
