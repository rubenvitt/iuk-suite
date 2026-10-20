/**
 * Personal aus dem Helferverzeichnis (Modul helfer, IDA-249) übernehmen: planen (Vorschau, schreibt
 * nichts), dann anwenden (EINE Transaktion). Die Quelle ist `bereitgestellteHelfer()` — die eine
 * Funktion, die das Modul helfer für andere Module veröffentlicht; seine Datenbank liest das
 * Einsatzbuch nie.
 *
 * KEINE FORMATÄNDERUNG an Draht und Einsatzformat (Runbook `einsatzbuch-release.md`): übernommene
 * Personen sind gewöhnliche Zeilen in `person`, kenntlich nur an der Kennung `helfer-<id>` (frei
 * wählbar, höchstens 80 Zeichen, `grenzen.rs` `PERSON_ID`). Von Hand angelegtes Personal bleibt
 * unberührt. Wer nicht mehr bereitgestellt wird, wird DEAKTIVIERT, nicht gelöscht — wie überall in
 * den Stammdaten; versiegelte Einsätze behalten ihren Schnappschuss.
 *
 * Die Qualifikation im Einsatzbuch ist EINE Kurzform aus `QUALIFIKATIONEN`. Aus den
 * HiOrg-Qualifikationen gewinnt die höchste, die sich zuordnen lässt; ohne Zuordnung wird die Person
 * nicht übernommen und in der Vorschau mit ihren Qualifikationen genannt.
 */
import { eq } from "drizzle-orm";
import type { BereitgestellterHelfer, Bereitstellung } from "@/app/m/helfer/_lib/bereitstellung";
import { person } from "../../_db/schema";
import { listePersonal, type Db } from "./daten";
import type { PersonDTO } from "./typen";
import { QUALIFIKATIONEN } from "./vorlage";

export const HELFER_PRAEFIX = "helfer-";

type Quali = (typeof QUALIFIKATIONEN)[number]["kurz"];

/** Höchste zuerst, wie `QUALIFIKATIONEN`. Geprüft werden Name und Kurzform der HiOrg-Qualifikation. */
const ZUORDNUNG: readonly (readonly [Quali, RegExp])[] = [
  ["NotSan", /notfallsanit|^notsan$|^ns$/i],
  ["RettAss", /rettungsassist|^rettass$|^ra$/i],
  ["RS", /rettungssanit|^rs$/i],
  ["SiK", /^sik$|im katastrophenschutz|^san$|^sanit(ä|ae)ter(in)?$/i],
  ["SanH", /sanit(ä|ae)tshelfer|^sanh$|^sh$/i],
];

export function qualiFuer(qualifikationen: BereitgestellterHelfer["qualifikationen"]): Quali | null {
  for (const [kurz, muster] of ZUORDNUNG) {
    if (qualifikationen.some((q) => muster.test(q.name.trim()) || muster.test(q.kurz.trim()))) return kurz;
  }
  return null;
}

/** „Nachname, Vorname“ wie in `personEingabe` verlangt: kein weiteres Komma, höchstens 80 Zeichen. */
export function nameFuer(h: Pick<BereitgestellterHelfer, "vorname" | "nachname">): string | null {
  const teil = (s: string) => s.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const name = `${teil(h.nachname)}, ${teil(h.vorname)}`;
  return name.length <= 80 && teil(h.nachname) && teil(h.vorname) ? name : null;
}

export type HelferKlasse = "neu" | "geaendert" | "unveraendert" | "deaktivieren" | "ohne_quali" | "doppelt" | "demo" | "fehler";

export interface HelferVorschauzeile {
  /** Die Kennung im Einsatzbuch (`helfer-…`). */
  id: string;
  name: string;
  quali: string | null;
  klasse: HelferKlasse;
  hinweis: string | null;
}

export interface HelferPlan {
  stand: string | null;
  zeilen: HelferVorschauzeile[];
}

export function planeHelferAbgleich(b: Bereitstellung, personal: PersonDTO[]): HelferPlan {
  const nachId = new Map(personal.map((p) => [p.id, p]));
  const vonHand = new Set(personal.filter((p) => p.aktiv && !p.id.startsWith(HELFER_PRAEFIX)).map((p) => p.name));
  const zeilen: HelferVorschauzeile[] = [];
  const geschrieben = new Set<string>();
  for (const h of b.helfer) {
    const id = `${HELFER_PRAEFIX}${h.id}`;
    const name = nameFuer(h);
    const quali = qualiFuer(h.qualifikationen);
    const anzeige = name ?? `${h.nachname}, ${h.vorname}`;
    const qualis = h.qualifikationen.map((q) => q.name).join(", ") || "keine";
    if (h.demo) {
      zeilen.push({ id, name: anzeige, quali, klasse: "demo", hinweis: "Demo-Person — wird nicht übernommen" });
      continue;
    }
    if (!name) {
      zeilen.push({ id, name: anzeige, quali, klasse: "fehler", hinweis: "Name zu lang für das Einsatzbuch (höchstens 80 Zeichen)" });
      continue;
    }
    if (!quali) {
      zeilen.push({ id, name, quali: null, klasse: "ohne_quali", hinweis: `Keine Qualifikation des Einsatzbuchs zuzuordnen (in HiOrg: ${qualis})` });
      continue;
    }
    const alt = nachId.get(id);
    if (!alt && vonHand.has(name)) {
      zeilen.push({ id, name, quali, klasse: "doppelt", hinweis: "Gleichnamige Person ist von Hand angelegt — erst deaktivieren, dann abgleichen" });
      continue;
    }
    geschrieben.add(id);
    const klasse: HelferKlasse = !alt ? "neu" : alt.name !== name || alt.quali !== quali || !alt.aktiv ? "geaendert" : "unveraendert";
    zeilen.push({ id, name, quali, klasse, hinweis: alt && !alt.aktiv ? "wird wieder aktiv" : null });
  }
  for (const p of personal) {
    if (p.id.startsWith(HELFER_PRAEFIX) && p.aktiv && !geschrieben.has(p.id)) {
      zeilen.push({ id: p.id, name: p.name, quali: p.quali, klasse: "deaktivieren", hinweis: "Nicht mehr im Helferverzeichnis freigegeben" });
    }
  }
  const reihe: Record<HelferKlasse, number> = { neu: 0, geaendert: 1, deaktivieren: 2, doppelt: 3, ohne_quali: 4, fehler: 5, demo: 6, unveraendert: 7 };
  zeilen.sort((a, b) => reihe[a.klasse] - reihe[b.klasse] || a.name.localeCompare(b.name, "de"));
  return { stand: b.stand, zeilen };
}

export interface HelferErgebnis { neu: number; geaendert: number; deaktiviert: number }

export function wendeHelferAbgleichAn(db: Db, plan: HelferPlan): HelferErgebnis {
  const e: HelferErgebnis = { neu: 0, geaendert: 0, deaktiviert: 0 };
  db.transaction((tx) => {
    for (const z of plan.zeilen) {
      if (z.klasse === "neu" && z.quali) {
        tx.insert(person).values({ id: z.id, name: z.name, quali: z.quali, aktiv: true }).run();
        e.neu++;
      } else if (z.klasse === "geaendert" && z.quali) {
        tx.update(person).set({ name: z.name, quali: z.quali, aktiv: true }).where(eq(person.id, z.id)).run();
        e.geaendert++;
      } else if (z.klasse === "deaktivieren") {
        tx.update(person).set({ aktiv: false }).where(eq(person.id, z.id)).run();
        e.deaktiviert++;
      }
    }
  });
  return e;
}

/** Plan gegen den aktuellen Bestand — Vorschau und Übernahme planen beide frisch. */
export function planeGegenBestand(db: Db, b: Bereitstellung): HelferPlan {
  return planeHelferAbgleich(b, listePersonal(db));
}
