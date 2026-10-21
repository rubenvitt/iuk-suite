/**
 * Fahrzeuge aus der Fahrzeugverwaltung (Modul fahrzeuge, IDA-257) übernehmen: planen (Vorschau, schreibt
 * nichts), dann anwenden (EINE Transaktion). Die Quelle ist `fahrzeuge/_lib/bereitstellung.ts` — die eine
 * Datei, die das Modul fahrzeuge für andere Module veröffentlicht; seine Datenbank liest das Einsatzbuch
 * nie. Bauform wie `helferAbgleich.ts`.
 *
 * WELCHE ZEILE ZU WELCHEM STAMMFAHRZEUG GEHÖRT, sagt der Erstimport der Fahrzeugverwaltung
 * (`zuordnungenFuer("einsatzbuch")`); was danach dort neu angelegt wird, bekommt hier die Kennung
 * `fz-<id>`. Die ID einer vorhandenen Zeile ändert sich NIE (Draht und versiegelte Einsätze tragen
 * sie, Runbook `einsatzbuch-release.md`) — übernommen werden nur Typ, Kennung (= Funkkenner),
 * Funkrufname, Standort und der Status.
 *
 * Fahrzeuge ohne Zuordnung bleiben, wie sie sind: lokale Fahrzeuge (Leihfahrzeuge, Fremdkräfte) sind
 * im Einsatzbuch ausdrücklich erlaubt.
 */
import { eq } from "drizzle-orm";
import type { BereitgestelltesFahrzeug, Fahrzeugbereitstellung } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { fahrzeug } from "../../_db/schema";
import { listeFahrzeuge, type Db } from "./daten";
import type { FahrzeugDTO } from "./typen";

export const STAMM_PRAEFIX = "fz-";

export type FahrzeugKlasse = "neu" | "geaendert" | "unveraendert" | "deaktivieren" | "ohne_kenner" | "doppelt";

export interface FahrzeugVorschauzeile {
  /** Die Kennung der Zeile im Einsatzbuch (vorhanden oder `fz-…`). */
  id: string;
  typ: string;
  kennung: string;
  ruf: string;
  standort: string;
  /** Der Status nach dem Abgleich. */
  aktiv: boolean;
  klasse: FahrzeugKlasse;
  hinweis: string | null;
}

export interface FahrzeugPlan {
  stand: string | null;
  zeilen: FahrzeugVorschauzeile[];
}

type Soll = Pick<FahrzeugDTO, "typ" | "kennung" | "ruf" | "standort" | "aktiv">;

const gleich = (a: Soll, b: Soll) =>
  a.typ === b.typ && a.kennung === b.kennung && a.ruf === b.ruf && a.standort === b.standort && a.aktiv === b.aktiv;

/**
 * @param zuordnung Einsatzbuch-ID → Stammfahrzeug-ID (`null` = „kein Fahrzeug“), aus dem Erstimport.
 */
export function planeFahrzeugAbgleich(
  b: Fahrzeugbereitstellung,
  zuordnung: Record<string, string | null>,
  bestand: FahrzeugDTO[],
): FahrzeugPlan {
  // Je Stammfahrzeug die Zeilen im Einsatzbuch: aus dem Erstimport und über die Kennung `fz-<id>`.
  const zeilenJeStamm = new Map<string, FahrzeugDTO[]>();
  for (const f of bestand) {
    const stammId = f.id.startsWith(STAMM_PRAEFIX) ? f.id.slice(STAMM_PRAEFIX.length) : zuordnung[f.id];
    if (stammId) zeilenJeStamm.set(stammId, [...(zeilenJeStamm.get(stammId) ?? []), f]);
  }
  const kennungen = new Map(bestand.map((f) => [f.kennung, f]));

  const zeilen: FahrzeugVorschauzeile[] = [];
  for (const s of b.fahrzeuge) {
    const [haupt, ...weitere] = (zeilenJeStamm.get(s.id) ?? []).sort((x, y) => Number(y.aktiv) - Number(x.aktiv) || x.id.localeCompare(y.id));
    for (const w of weitere.filter((x) => x.aktiv)) {
      zeilen.push({ ...w, aktiv: false, klasse: "deaktivieren", hinweis: `Demselben Fahrzeug zugeordnet wie ${haupt.ruf} — doppelt` });
    }
    const kennung = s.funkkenner ?? haupt?.kennung ?? null;
    if (!kennung) {
      if (s.aktiv) zeilen.push({ ...soll(s, ""), id: `${STAMM_PRAEFIX}${s.id}`, klasse: "ohne_kenner", hinweis: hinweisOhneKenner(s) });
      continue;
    }
    const ziel = soll(s, kennung);
    const halter = kennungen.get(kennung);
    if (halter && halter.id !== haupt?.id) {
      if (haupt?.aktiv && !s.aktiv) zeilen.push({ ...haupt, aktiv: false, klasse: "deaktivieren", hinweis: "In der Fahrzeugverwaltung außer Dienst" });
      else if (s.aktiv) zeilen.push({ ...ziel, id: haupt?.id ?? `${STAMM_PRAEFIX}${s.id}`, klasse: "doppelt", hinweis: `Die Kennung ${kennung} trägt schon ${halter.ruf} — dort ändern oder in der Fahrzeugverwaltung zuordnen` });
      continue;
    }
    if (!haupt) {
      if (s.aktiv) zeilen.push({ ...ziel, id: `${STAMM_PRAEFIX}${s.id}`, klasse: "neu", hinweis: null });
      continue;
    }
    const klasse: FahrzeugKlasse = gleich(haupt, ziel) ? "unveraendert" : haupt.aktiv && !ziel.aktiv ? "deaktivieren" : "geaendert";
    const hinweis = klasse === "deaktivieren" ? "In der Fahrzeugverwaltung außer Dienst" : !haupt.aktiv && ziel.aktiv ? "wird wieder aktiv" : null;
    zeilen.push({ ...ziel, id: haupt.id, klasse, hinweis });
  }
  const reihe: Record<FahrzeugKlasse, number> = { neu: 0, geaendert: 1, deaktivieren: 2, doppelt: 3, ohne_kenner: 4, unveraendert: 5 };
  zeilen.sort((x, y) => reihe[x.klasse] - reihe[y.klasse] || x.kennung.localeCompare(y.kennung, "de", { numeric: true }));
  return { stand: b.stand, zeilen };
}

function soll(s: BereitgestelltesFahrzeug, kennung: string): Soll {
  return { typ: s.typ, kennung, ruf: s.funkrufname, standort: s.standort, aktiv: s.aktiv };
}

function hinweisOhneKenner(s: BereitgestelltesFahrzeug): string {
  return s.art === "anhaenger"
    ? "Anhänger ohne Funkkenner — im Einsatzbuch nur nötig, wenn er einen bekommt"
    : "Ohne Funkkenner — in der Fahrzeugverwaltung ergänzen";
}

export interface FahrzeugErgebnis { neu: number; geaendert: number; deaktiviert: number }

export function wendeFahrzeugAbgleichAn(db: Db, plan: FahrzeugPlan): FahrzeugErgebnis {
  const e: FahrzeugErgebnis = { neu: 0, geaendert: 0, deaktiviert: 0 };
  db.transaction((tx) => {
    for (const z of plan.zeilen) {
      const werte = { typ: z.typ, kennung: z.kennung, ruf: z.ruf, standort: z.standort, aktiv: z.aktiv };
      if (z.klasse === "neu") {
        tx.insert(fahrzeug).values({ id: z.id, ...werte }).run();
        e.neu++;
      } else if (z.klasse === "geaendert" || z.klasse === "deaktivieren") {
        tx.update(fahrzeug).set(werte).where(eq(fahrzeug.id, z.id)).run();
        if (z.klasse === "geaendert") e.geaendert++;
        else e.deaktiviert++;
      }
    }
  });
  return e;
}

/** Plan gegen den aktuellen Bestand — Vorschau und Übernahme planen beide frisch. */
export function planeFahrzeugeGegenBestand(db: Db, b: Fahrzeugbereitstellung, zuordnung: Record<string, string | null>): FahrzeugPlan {
  return planeFahrzeugAbgleich(b, zuordnung, listeFahrzeuge(db));
}
