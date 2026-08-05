/**
 * Fahrzeuge, Soll-Listen und Vorlagen. Kein "use client", kein Icon-Import.
 *
 * DIE ZENTRALE ASYMMETRIE DES MODELLS (§5.7.1), aus der jede Aggregation folgt:
 *
 *   Das SOLL ist pro (Fahrzeug, Fach, Artikel).
 *   Der BESTAND ist pro (Fahrzeug, Artikel).
 *
 * Derselbe Artikel darf in mehreren Faechern stehen — und teilt sich dann EINEN
 * Fahrzeugbestand. Deshalb wird das Soll JE ARTIKEL summiert, BEVOR es gegen den
 * Fahrzeugbestand verglichen wird (`queries.ts:290-291`). Wer je POSITION
 * vergleicht, zaehlt Artikel in zwei Faechern doppelt unter Soll.
 *
 * GRABSTEINE (`entfernt = true`) heissen „diese Vorlagen-Position ist auf diesem
 * Fahrzeug bewusst nicht vorhanden". Ein Grabstein ist KEIN Soll und wird aus der
 * Uebersicht, dem Check und der Vorlagen-Erzeugung herausgefiltert — aber
 * `sollFuerFahrzeug` gibt ihn MIT zurueck, damit der Editor ihn zeigen und
 * wiederherstellen kann. VERBINDLICH: jede neue Ansicht, die „das Soll" braucht,
 * filtert `entfernt` SELBST heraus.
 *
 * ⚠️ Die drei Vorlagen-Lesepfade liegen hier (Festlegung H4): §5.7 ist EIN
 * Abschnitt, und sie lesen dieselben Tabellen wie `fahrzeugUebersicht`.
 */
import { eq } from "drizzle-orm";
import { artikel, checks, fahrzeugTemplates, lagerorte, sollPositionen,
         templatePositionen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { bestandJeArtikelUndLagerort, type Leser } from "./bestand";
import { lagerortVerfallListe } from "./verfall";

export function fahrzeugListe(db: Leser) {
  return db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung,
                   aktiv: f.aktiv, templateId: f.templateId }));
}

export type FahrzeugUebersichtZeile = {
  id: string; name: string; kennung: string | null; aktiv: boolean;
  positionen: number; faecher: number;
  /** Artikel, deren Fahrzeugbestand die SOLL-SUMME unterschreitet. */
  artikelUnterSoll: number;
  /** Gemeldete Verfaelle im Warnbereich oder bereits abgelaufen. */
  verfallAuffaellig: number;
  letzterCheck: Date | null;
  templateName: string | null;
};

/**
 * Verdichtete Uebersicht — je Fahrzeug nur Kennzahlen, damit die Seite bei vielen
 * Fahrzeugen scanbar bleibt.
 *
 * ⚠️ EINE Bestandsabfrage fuer ALLE Fahrzeuge (`bestandJeArtikelUndLagerort`)
 * statt der heutigen Vollladung mit Filter je Artikel je Fahrzeug — der teuerste
 * der vier quadratischen Terme, O(N_Fahrzeug · N_ArtikelImSoll · N_Buchungen)
 * (§5.2.3 b).
 */
export function fahrzeugUebersicht(db: Leser, now: Date = new Date()): FahrzeugUebersichtZeile[] {
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  const bestand = bestandJeArtikelUndLagerort(db);
  // Grabsteine zaehlen NIRGENDS als Soll.
  const allSoll = db.select().from(sollPositionen).all().filter((s) => !s.entfernt);
  const templateNamen = new Map(
    db.select().from(fahrzeugTemplates).all().map((t) => [t.id, t.name]));

  const verfallProFzg = new Map<string, number>();
  for (const z of lagerortVerfallListe(db, { nurWarnend: true }, now)) {
    verfallProFzg.set(z.lagerortId, (verfallProFzg.get(z.lagerortId) ?? 0) + 1);
  }

  const letzterProFzg = new Map<string, Date>();
  for (const c of db.select().from(checks).all()) {
    if (!c.completedAt) continue;
    const prev = letzterProFzg.get(c.fahrzeugId);
    if (!prev || c.completedAt > prev) letzterProFzg.set(c.fahrzeugId, c.completedAt);
  }

  return fahrzeuge
    .map((f) => {
      const soll = allSoll.filter((s) => s.fahrzeugId === f.id);
      const faecher = new Set(soll.map((s) => s.fachLabel));
      // SOLL JE ARTIKEL SUMMIEREN, DANN vergleichen (§5.7.1).
      const sollProArtikel = new Map<string, number>();
      for (const s of soll) {
        sollProArtikel.set(s.artikelId, (sollProArtikel.get(s.artikelId) ?? 0) + s.soll);
      }
      const imFahrzeug = bestand.get(f.id);
      let artikelUnterSoll = 0;
      for (const [artikelId, sollSumme] of sollProArtikel) {
        if ((imFahrzeug?.get(artikelId) ?? 0) < sollSumme) artikelUnterSoll += 1;
      }
      return {
        id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv,
        positionen: soll.length, faecher: faecher.size, artikelUnterSoll,
        verfallAuffaellig: verfallProFzg.get(f.id) ?? 0,
        letzterCheck: letzterProFzg.get(f.id) ?? null,
        templateName: f.templateId ? (templateNamen.get(f.templateId) ?? null) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type SollHerkunft = "manuell" | "vorlage" | "ueberschrieben";

export type SollZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
  einheit: string; handlagerFach: string; soll: number;
  /** recorded Bestand AUF dem Fahrzeug — Ausgangspunkt des Abgleichs. */
  fahrzeugBestand: number;
  /** im Handlager verfuegbar zum Nachfuellen. */
  handlagerBestand: number;
  herkunft: SollHerkunft;
  /** GRABSTEIN: zaehlt nicht als Soll. Diese Funktion filtert ihn NICHT heraus. */
  entfernt: boolean;
};

export function sollFuerFahrzeug(db: Leser, fahrzeugId: string): SollZeile[] {
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const bestand = bestandJeArtikelUndLagerort(db);
  const imFahrzeug = bestand.get(fahrzeugId);
  const imHandlager = bestand.get(HANDLAGER_ID);
  return db.select().from(sollPositionen)
    .where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all()
    .map((p) => {
      const a = arts.get(p.artikelId);
      // `queries.ts:330` — die Herkunft ist abgeleitet, keine eigene Spalte.
      const herkunft: SollHerkunft = !p.templatePositionId
        ? "manuell"
        : p.ueberschrieben ? "ueberschrieben" : "vorlage";
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        // Tolerant gegen Waisen: `ergebnis`-JSONs und Importe koennen auf
        // geloeschte Zeilen zeigen, und eine Seite darf daran nicht abstuerzen.
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "",
        handlagerFach: a?.fach ?? "", soll: p.soll,
        fahrzeugBestand: imFahrzeug?.get(p.artikelId) ?? 0,
        handlagerBestand: imHandlager?.get(p.artikelId) ?? 0,
        herkunft, entfernt: p.entfernt,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
}

export type TemplateUebersichtZeile = {
  id: string; name: string; aktiv: boolean;
  positionen: number; faecher: number; fahrzeuge: number;
};

export function templateUebersicht(db: Leser): TemplateUebersichtZeile[] {
  const templates = db.select().from(fahrzeugTemplates).all();
  const allPos = db.select().from(templatePositionen).all();
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  return templates
    .map((t) => {
      const pos = allPos.filter((p) => p.templateId === t.id);
      return {
        id: t.id, name: t.name, aktiv: t.aktiv,
        positionen: pos.length,
        faecher: new Set(pos.map((p) => p.fachLabel)).size,
        fahrzeuge: fahrzeuge.filter((f) => f.templateId === t.id).length,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type TemplatePositionZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
  einheit: string; handlagerFach: string; soll: number;
};

export type TemplateDetail = {
  id: string; name: string; aktiv: boolean;
  positionen: TemplatePositionZeile[];
  fahrzeuge: { id: string; name: string; kennung: string | null; aktiv: boolean }[];
};

export function templateDetail(db: Leser, id: string): TemplateDetail | null {
  const t = db.select().from(fahrzeugTemplates)
    .where(eq(fahrzeugTemplates.id, id)).get();
  if (!t) return null;
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const positionen = db.select().from(templatePositionen)
    .where(eq(templatePositionen.templateId, id)).all()
    .map((p) => {
      const a = arts.get(p.artikelId);
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "",
        handlagerFach: a?.fach ?? "", soll: p.soll,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.templateId, id)).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv }))
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
  return { id: t.id, name: t.name, aktiv: t.aktiv, positionen, fahrzeuge };
}

export function templateListeAktiv(db: Leser) {
  return db.select().from(fahrzeugTemplates).where(eq(fahrzeugTemplates.aktiv, true)).all()
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
