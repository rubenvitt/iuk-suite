import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { KommplanDb } from "../_db/client";
import type { DruckseiteDaten } from "../_ui/druck/Druckseite";
import { msZuTag } from "./angaben";
import { kopfFuerZeichnung } from "./briefkopf";
import { tokenUrl, waehleQrFreigabe } from "./freigabe/regeln";
import { freigabenFuer } from "./freigaben";
import { teileAuf } from "./layout/papier";
import type { Papierformat } from "./layout/typen";
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
 */
export function qrZielIntern(db: KommplanDb, plan: LesbarerPlan, jetzt: number, basis: string | null = moduleUrl("kommplan")): QrZiel | null {
  if (!plan.inhalt?.optionen.qrAufDruck || plan.archiviertAm !== null || !basis) return null;
  const f = waehleQrFreigabe(freigabenFuer(db, plan.id, jetzt), jetzt);
  return f ? { url: tokenUrl(basis, f.token), notiz: f.notiz, ablauf: f.ablauf } : null;
}

/** QR des TOKEN-Drucks (Entscheidung 9): der benutzte Token, nie ein anderer Link des Plans (Review Focus 1). */
export function qrUrlFuerToken(plan: LesbarerPlan, token: string, basis: string | null = moduleUrl("kommplan")): string | null {
  return plan.inhalt?.optionen.qrAufDruck && basis ? tokenUrl(basis, token) : null;
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
    blaetter: inhalt ? teileAuf(inhalt, auftrag.format, { qr: qr !== null }) : null,
    rahmen: { ...rahmen, qr, schwarzweiss: sw },
    symbole: inhalt ? symboleFuer(inhalt, { schwarzweiss: sw }) : {},
    qrSatz: qr ? auftrag.qrSatz ?? null : null,
    svgExport: auftrag.mitSvgExport
      ? { titel: plan.titel, tag: plan.datum !== null ? msZuTag(plan.datum)! : heuteIso(plan.aktualisiertAm) }
      : null,
  };
}
