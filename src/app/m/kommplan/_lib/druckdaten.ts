import { createHash } from "node:crypto";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { KommplanDb } from "../_db/client";
import type { DruckseiteDaten } from "../_ui/druck/Druckseite";
import { msZuTag } from "./angaben";
import type { PlanInhalt } from "./plan/schema";
import { kopfFuerZeichnung } from "./briefkopf";
import { tokenUrl, waehleQrFreigabe } from "./freigabe/regeln";
import { qrZielSatz } from "./freigabe/texte";
import { freigabenFuer } from "./freigaben";
import { teileAuf } from "./layout/papier";
import type { Blatt, Papierformat } from "./layout/typen";
import type { LesbarerPlan } from "./plaene";
import { qrGrafikAus } from "./qrGrafik";
import { rahmenFuer } from "./rahmen";
import { heuteIso } from "./tagesfassung";
import { symboleFuer } from "./zeichen/zeichen";

/**
 * DIE DATEN EINER DRUCKSEITE (Umsetzungsplan Phase 5, Entscheidung 13) — nur Server (liest das Rezept-Generat).
 * Gleich für die internen und die Token-Druckrouten; was sich unterscheidet (QR-Ziel, SVG-Export), kommt als Auftrag.
 */
export interface DruckAuftrag { format: Papierformat; qrUrl: string | null; qrSatz?: string | null; mitSvgExport?: boolean }
export interface QrZiel { url: string; notiz: string | null; ablauf: number | null }

/**
 * QR des INTERNEN Drucks (Entscheidung 10): Option an, nicht archiviert, Adresse eingerichtet, gültiger Link — der
 * beste. Notiz und Ablauf gehen in den Satz der `noprint`-Leiste („Der QR-Code führt auf …").
 * NUR FÜR VERWALTENDE (Review Phase 5; `_lib/rechte.ts`): der Code IST der Link. Wer nur ansehen oder bearbeiten
 * darf, behielte mit einem Ausdruck anonymen Zugang über den Entzug hinaus — Links sehen darf er ohnehin nicht.
 */
export function qrZielIntern(db: KommplanDb, plan: LesbarerPlan, darfVerwalten: boolean, jetzt: number, basis: string | null = moduleUrl("kommplan")): QrZiel | null {
  if (!darfVerwalten || !plan.inhalt?.optionen.qrAufDruck || plan.archiviertAm !== null || !basis) return null;
  const f = waehleQrFreigabe(freigabenFuer(db, plan.id, jetzt), jetzt);
  return f ? { url: tokenUrl(basis, f.token), notiz: f.notiz, ablauf: f.ablauf } : null;
}

/** QR des TOKEN-Drucks (Entscheidung 9): der benutzte Token, nie ein anderer Link des Plans (Review Focus 1). */
export function qrUrlFuerToken(plan: LesbarerPlan, token: string, basis: string | null = moduleUrl("kommplan")): string | null {
  return plan.inhalt?.optionen.qrAufDruck && basis ? tokenUrl(basis, token) : null;
}

/**
 * DIE AUFTEILUNG JE INHALT, gemerkt (Abnahme kommplan, Befund „Token-Druck blockiert"): die Druckrouten sind
 * `force-dynamic`, und wer einen Link hat, kann sie beliebig oft abrufen. Schlüssel ist der Inhalt selbst (SHA-256
 * über das JSON) mit Format und QR — nicht Plan-ID und Version, denn eine ID wird nach dem Löschen wieder frei.
 * Prozessspeicher, die letzten `GEMERKT` Aufteilungen; die Blätter sind reine Daten und werden nie verändert.
 */
const GEMERKT = 16;
const aufteilungen = new Map<string, Blatt[]>();
export function blaetterFuer(inhalt: PlanInhalt, format: Papierformat, qr: boolean): Blatt[] {
  const schluessel = `${format}|${qr ? "qr" : "-"}|${createHash("sha256").update(JSON.stringify(inhalt)).digest("base64url")}`;
  const da = aufteilungen.get(schluessel);
  if (da) {
    aufteilungen.delete(schluessel);
    aufteilungen.set(schluessel, da);
    return da;
  }
  const neu = teileAuf(inhalt, format, { qr });
  aufteilungen.set(schluessel, neu);
  if (aufteilungen.size > GEMERKT) aufteilungen.delete(aufteilungen.keys().next().value!);
  return neu;
}

export async function druckseitenDaten(db: KommplanDb, plan: LesbarerPlan, auftrag: DruckAuftrag): Promise<DruckseiteDaten> {
  const inhalt = plan.inhalt;
  const rahmen = rahmenFuer({
    titel: plan.titel, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
    aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: inhalt?.optionen.vermerkVsNfD ?? false, kopf: kopfFuerZeichnung(db),
  });
  const sw = inhalt?.optionen.schwarzweiss ?? false;
  const qr = inhalt && auftrag.qrUrl ? qrGrafikAus(await qrSvg(auftrag.qrUrl), auftrag.qrUrl) : null;
  return {
    format: auftrag.format,
    blaetter: inhalt ? blaetterFuer(inhalt, auftrag.format, qr !== null) : null,
    rahmen: { ...rahmen, qr, schwarzweiss: sw },
    symbole: inhalt ? symboleFuer(inhalt, { schwarzweiss: sw }) : {},
    qrSatz: qr ? auftrag.qrSatz ?? null : null,
    svgExport: auftrag.mitSvgExport
      ? { titel: plan.titel, tag: plan.datum !== null ? msZuTag(plan.datum)! : heuteIso(plan.aktualisiertAm) }
      : null,
  };
}

/**
 * Die Daten der INTERNEN Druckrouten A4 und A3 (Falle 18: eine Route je Format, aber ein Rumpf — Abnahme kommplan):
 * QR nach `qrZielIntern` samt Satz für die `noprint`-Leiste, SVG-Export. Die Riegel bleiben in den Seiten
 * (`riegel.test.ts`).
 */
export async function interneDruckdaten(
  db: KommplanDb, plan: LesbarerPlan, darfVerwalten: boolean, format: Papierformat, jetzt: number, basis: string | null = moduleUrl("kommplan"),
): Promise<DruckseiteDaten> {
  const ziel = qrZielIntern(db, plan, darfVerwalten, jetzt, basis);
  return druckseitenDaten(db, plan, { format, qrUrl: ziel?.url ?? null, qrSatz: ziel ? qrZielSatz(ziel) : null, mitSvgExport: true });
}
