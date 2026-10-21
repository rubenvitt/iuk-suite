/**
 * Lesen aus der eingestellten Quelle — der einzige Ort, an dem Demo und HiOrg sich unterscheiden.
 * Beide laufen danach durch denselben Filter und denselben Abgleich.
 */
import { zeitFormat } from "@/core/zeit";
import type { HelferDb } from "../_db/client";
import { demoAntwort } from "./demo/antwort";
import type { Einstellungen } from "./einstellungen";
import { statusParameter } from "./filter";
import { holePersonal, HiorgFehler, type Abruf } from "./hiorg/api";
import { hiorgKonfiguration } from "./hiorg/konfiguration";
import { lesePersonal, type QuellPerson } from "./hiorg/person";
import { accessToken } from "./hiorg/verbindung";

export type Gelesen = { ok: true; personen: QuellPerson[]; unlesbar: number } | { ok: false; fehler: string };

const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });

/** Der Kalendertag in der Suite-Zone als `YYYY-MM-DD` — die Grenze für „ausgetreten“. */
export function heuteInZone(jetzt: Date = new Date()): string {
  return TAG.format(jetzt);
}

export async function liesQuelle(db: HelferDb, e: Einstellungen, abruf: Abruf = fetch): Promise<Gelesen> {
  if (e.quelle === "demo") {
    const s = lesePersonal(demoAntwort());
    return s.ok ? { ok: true, personen: s.personen, unlesbar: s.unlesbar } : s;
  }
  const k = hiorgKonfiguration();
  if (!k.ok) return { ok: false, fehler: `Die Anbindung an HiOrg-Server ist nicht eingerichtet (es fehlt: ${k.fehlt.join(", ")}).` };
  try {
    const token = await accessToken(db, k.konfiguration, abruf);
    return { ok: true, ...(await holePersonal(k.konfiguration, abruf, token, statusParameter(e.filter))) };
  } catch (fehler) {
    if (fehler instanceof HiorgFehler) return { ok: false, fehler: fehler.message };
    throw fehler;
  }
}
