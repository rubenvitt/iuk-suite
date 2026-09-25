/**
 * Status der Rechner für die Verwaltungsseite „Rechner" (Plan Stufe 5, Task 5). Reine Lesefunktion:
 * der aktive echte Rechner (Anker, Abweichungen, Schlüssel-Fingerabdruck), die Test-Rechner und die
 * letzten Schlüsselfreigaben (Entscheidung 4). Zeiten kommen als Text in der Suite-Zone
 * (`zeitFormat`), nie als Datum — die Seite formatiert nichts selbst nach.
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { zeitFormat } from "@/core/zeit";
import { anker, ankerAbweichung, freigabe, rechner, schluesselpaar } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";

export interface EchterRechnerStatus {
  id: string;
  name: string;
  eingerichtetAm: string;
  eingerichtetVon: string;
  letzterKontakt: string | null;
  letzteSicherung: string | null;
  ankerBis: number | null;
  abweichungen: { block: number; erwartet: string; gemeldet: string; zeitpunkt: string }[];
  schluesselId: string | null;
}
/** Ein widerrufener echter Rechner (Stufe 6, Task 7, Entscheidung 11) — dieselben Felder wie
 *  `EchterRechnerStatus`, ohne `letzterKontakt`/`letzteSicherung`/`schluesselId` (für einen
 *  widerrufenen Rechner ohne Aussagekraft), dafür mit `widerrufenAm`. */
export interface WiderrufenerRechnerStatus {
  id: string;
  name: string;
  eingerichtetAm: string;
  eingerichtetVon: string;
  widerrufenAm: string;
  ankerBis: number | null;
  abweichungen: { block: number; erwartet: string; gemeldet: string; zeitpunkt: string }[];
}
export interface TestRechnerZeile {
  id: string;
  name: string;
  eingerichtetAm: string;
  eingerichtetVon: string;
  letzterKontakt: string | null;
  ankerBis: number | null;
  abweichungen: number;
}
export interface FreigabeZeile {
  zeitpunkt: string;
  name: string;
  art: "echt" | "test";
  rechnerName: string;
  bloecke: string;
  anzahl: number;
}

const HOECHSTENS_FREIGABEN = 20;

const ANZEIGE = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** `letzteSicherung` steht als ISO-Zeitpunkt mit Offset in der DB (Meldung des Rechners, Schnittstelle 6). */
function formatiereIso(iso: string | null): string | null {
  return iso === null ? null : ANZEIGE.format(new Date(iso));
}
function formatiereDatum(datum: Date | null): string | null {
  return datum === null ? null : ANZEIGE.format(datum);
}

/** Der höchste bestätigte Block dieses Rechners, oder `null` ohne einen einzigen Anker. */
function ankerBisFuer(db: Db, rechnerId: string): number | null {
  const zeile = db.select({ block: anker.block }).from(anker).where(eq(anker.rechnerId, rechnerId)).orderBy(desc(anker.block)).limit(1).get();
  return zeile?.block ?? null;
}

/** Die Abweichungen eines Rechners, formatiert und neueste zuerst. */
function abweichungenFuer(db: Db, rechnerId: string): EchterRechnerStatus["abweichungen"] {
  return db.select().from(ankerAbweichung)
    .where(eq(ankerAbweichung.rechnerId, rechnerId))
    .orderBy(desc(ankerAbweichung.zeitpunkt))
    .all()
    .map((a) => ({ block: a.block, erwartet: a.erwartet, gemeldet: a.gemeldet, zeitpunkt: ANZEIGE.format(a.zeitpunkt) }));
}

export function rechnerStatus(
  db: Db,
): { echt: EchterRechnerStatus | null; test: TestRechnerZeile[]; freigaben: FreigabeZeile[]; widerrufeneEcht: WiderrufenerRechnerStatus[] } {
  const echtZeile = db.select().from(rechner).where(and(eq(rechner.art, "echt"), isNull(rechner.widerrufenAm))).get();
  let echt: EchterRechnerStatus | null = null;
  if (echtZeile) {
    // Das echte Paar trägt `rechnerId: null` (Spec §12); es gibt höchstens eines.
    const paar = db.select({ schluesselId: schluesselpaar.schluesselId }).from(schluesselpaar).where(eq(schluesselpaar.art, "echt")).get();
    echt = {
      id: echtZeile.id,
      name: echtZeile.name,
      eingerichtetAm: ANZEIGE.format(echtZeile.eingerichtetAm),
      eingerichtetVon: echtZeile.eingerichtetVon,
      letzterKontakt: formatiereDatum(echtZeile.letzterKontakt),
      letzteSicherung: formatiereIso(echtZeile.letzteSicherung),
      ankerBis: ankerBisFuer(db, echtZeile.id),
      abweichungen: abweichungenFuer(db, echtZeile.id),
      schluesselId: paar?.schluesselId ?? null,
    };
  }

  const testZeilen = db.select().from(rechner).where(and(eq(rechner.art, "test"), isNull(rechner.widerrufenAm))).orderBy(desc(rechner.eingerichtetAm)).all();
  const test: TestRechnerZeile[] = testZeilen.map((r) => ({
    id: r.id,
    name: r.name,
    eingerichtetAm: ANZEIGE.format(r.eingerichtetAm),
    eingerichtetVon: r.eingerichtetVon,
    letzterKontakt: formatiereDatum(r.letzterKontakt),
    ankerBis: ankerBisFuer(db, r.id),
    abweichungen: db.select({ id: ankerAbweichung.id }).from(ankerAbweichung).where(eq(ankerAbweichung.rechnerId, r.id)).all().length,
  }));

  // Widerrufene echte Rechner (Entscheidung 11), neueste zuerst — die Sortierung nach
  // `widerrufenAm` ist wohldefiniert, weil hier nur Zeilen mit gesetztem `widerrufenAm` stehen.
  const widerrufeneZeilen = db.select().from(rechner)
    .where(and(eq(rechner.art, "echt"), isNotNull(rechner.widerrufenAm)))
    .orderBy(desc(rechner.widerrufenAm))
    .all();
  const widerrufeneEcht: WiderrufenerRechnerStatus[] = widerrufeneZeilen.map((r) => ({
    id: r.id,
    name: r.name,
    eingerichtetAm: ANZEIGE.format(r.eingerichtetAm),
    eingerichtetVon: r.eingerichtetVon,
    // `widerrufenAm` ist hier nie `null` (der WHERE-Filter oben verlangt es); der Nicht-Null-
    // Ausrufer ist trotzdem noetig, weil die Spaltensicht selbst `Date | null` bleibt.
    widerrufenAm: ANZEIGE.format(r.widerrufenAm!),
    ankerBis: ankerBisFuer(db, r.id),
    abweichungen: abweichungenFuer(db, r.id),
  }));

  const freigaben: FreigabeZeile[] = db.select().from(freigabe)
    .orderBy(desc(freigabe.zeitpunkt))
    .limit(HOECHSTENS_FREIGABEN)
    .all()
    .map((f) => ({ zeitpunkt: ANZEIGE.format(f.zeitpunkt), name: f.name, art: f.art, rechnerName: f.rechnerName, bloecke: f.bloecke, anzahl: f.anzahl }));

  return { echt, test, freigaben, widerrufeneEcht };
}
