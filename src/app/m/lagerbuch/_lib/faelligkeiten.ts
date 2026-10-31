/**
 * DIE FÄLLIGKEITEN DES LAGERBUCHS FÜR „WAS STEHT AN" IM PORTAL (IDA-297). Das Portal liest weder diese
 * Datenbank noch ihr Schema, sondern nur, was hier herausgegeben wird — dasselbe Muster wie
 * `fahrzeugbestand.ts`.
 *
 * ⚠️ HIER WIRD NICHTS NEU GERECHNET. Jede Quelle ist der Lesepfad, den die Verwaltungsseite derselben
 * Sache schon benutzt (`verfallListe`/`lagerortVerfallListe` → Verfall, `o2FlaschenUebersicht` →
 * Sauerstoff, `bzGeraeteUebersicht` → Blutzucker). Eine zweite Rechnung liefe auseinander, und dann
 * meldete der Push etwas, das die Seite im Modul nicht zeigt — oder umgekehrt.
 *
 * Was herausgegeben wird:
 *   * Verfall im Handlager (Chargen) und in Fahrzeugen/Taschen/Entnahmebox (gemeldete Verfälle), beide
 *     nur mit nicht grüner Ampel: abgelaufen → überfällig, rot/gelb → bald.
 *   * Sauerstoffflaschen, deren letzte Messung die Wechselgrenze erreicht → überfällig. Eine Flasche
 *     ohne Messung ist keine Frist und bleibt draußen; die Verwaltung zeigt sie als „keine Messung".
 *   * BZ-Geräte, deren Kontrolle überfällig ist oder nie stattfand → überfällig; im Warnfenster → bald.
 *   * Plomben, die angelegt, aber nicht gesetzt sind (Fach offen) → bald.
 * Ausgemusterte Flaschen, Geräte und Einheiten (`aktiv = false`) zählen nicht.
 */
import { and, eq, isNull } from "drizzle-orm";
import { adminGroupsFor } from "@/core/groups";
import { getModule } from "@/core/registry";
import { tageDativ, type Faelligkeit } from "@/core/faelligkeiten";
import { getDb } from "../_db/client";
import { lagerorte, plomben } from "../_db/schema";
import { bzGeraeteUebersicht } from "./lesepfade/bz";
import { o2FlaschenUebersicht } from "./lesepfade/o2";
import { lagerortVerfallListe, verfallListe } from "./lesepfade/verfall";
import type { Leser } from "./lesepfade/bestand";
import { verwaltungDetailPfad } from "./verwaltungPfad";

/**
 * Die Arten, die diese Datei herausgibt — die Auswahl im Portal („Was soll aufs Telefon?") bietet genau
 * diese an, auch wenn gerade nichts davon fällig ist. Eine neue Art gehört hier dazu, sonst lässt sie
 * sich nicht abwählen.
 */
export const LAGERBUCH_FAELLIGKEITS_ARTEN = ["Verfall", "Sauerstoff", "BZ-Kontrolle", "Plombe"] as const;
/** Der Typ hält `art` an der Liste oben fest: eine Art außerhalb davon bricht `pnpm typecheck`. */
type LagerbuchFaelligkeit = Faelligkeit & { art: (typeof LAGERBUCH_FAELLIGKEITS_ARTEN)[number] };

/**
 * Darf diese Person die Fälligkeiten des Lagerbuchs sehen? Dasselbe Prädikat wie
 * `istLagerbuchAdmin` (`_lib/zugang.ts`): die Admin-Gruppen des Moduls, OHNE den Suite-Admin-
 * Kurzschluss von `isModuleAdmin` — wer hier etwas sieht, muss den Link dahinter auch öffnen dürfen
 * (`docs/design/README.md`, „führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?").
 */
export function darfLagerbuchFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  if (!groups) return false;
  const erlaubt = adminGroupsFor(getModule("lagerbuch"));
  return groups.some((g) => erlaubt.includes(g));
}

export function lagerbuchFaelligkeiten(jetzt: Date, db: Leser = getDb()): Faelligkeit[] {
  return [
    ...verfall(db, jetzt),
    ...sauerstoff(db),
    ...blutzucker(db, jetzt),
    ...offenePlomben(db),
  ];
}

function verfall(db: Leser, jetzt: Date): Faelligkeit[] {
  const imHandlager = verfallListe(db, jetzt).map((e): LagerbuchFaelligkeit => ({
    id: `charge:${e.chargeId}`,
    art: "Verfall",
    titel: e.chargenNr ? `${e.artikelName} · Charge ${e.chargenNr}` : e.artikelName,
    wo: "Handlager",
    zustand: e.text,
    dringlichkeit: e.abgelaufen ? "ueberfaellig" : "bald",
    sortierung: e.verfall,
    pfad: "/verwaltung/verfall",
  }));
  const aktiveOrte = new Set(
    db.select({ id: lagerorte.id }).from(lagerorte).where(eq(lagerorte.aktiv, true)).all().map((o) => o.id),
  );
  const gemeldet = lagerortVerfallListe(db, { nurWarnend: true }, jetzt)
    .filter((z) => aktiveOrte.has(z.lagerortId))
    .map((z): LagerbuchFaelligkeit => ({
      id: `ort:${z.lagerortId}:${z.artikelId}`,
      art: "Verfall",
      titel: z.artikelName,
      wo: z.lagerortName,
      zustand: z.text,
      dringlichkeit: z.abgelaufen ? "ueberfaellig" : "bald",
      sortierung: z.verfall,
      pfad: "/verwaltung/verfall",
    }));
  return [...imHandlager, ...gemeldet];
}

function sauerstoff(db: Leser): Faelligkeit[] {
  return o2FlaschenUebersicht(db)
    .filter((f) => f.aktiv && f.status?.wechseln)
    .map((f): LagerbuchFaelligkeit => ({
      id: `o2:${f.id}`,
      art: "Sauerstoff",
      titel: `Flasche ${f.name}`,
      wo: f.lagerortName,
      zustand: `noch ${f.status!.prozent} %, wechseln`,
      dringlichkeit: "ueberfaellig",
      sortierung: f.letzteMessung?.toISOString() ?? "",
      pfad: verwaltungDetailPfad("sauerstoff", f.id),
    }));
}

function blutzucker(db: Leser, jetzt: Date): Faelligkeit[] {
  return bzGeraeteUebersicht(db, jetzt)
    .filter((g) => g.aktiv && g.faelligkeit.ampel !== "gruen")
    .map((g): LagerbuchFaelligkeit => {
      const f = g.faelligkeit;
      // ⚠️ `nieGeprueft` ZUERST und eigenständig: dort ist `ueberfaellig` false (`domain/bz.ts`).
      const zustand = f.nieGeprueft
        ? "noch nie kontrolliert"
        : f.ueberfaellig
          ? `Kontrolle seit ${tageDativ(Math.max(1, -(f.tageBisFaellig ?? 0)))} überfällig`
          : f.tageBisFaellig === 0 ? "Kontrolle heute fällig" : `Kontrolle fällig in ${tageDativ(f.tageBisFaellig ?? 0)}`;
      return {
        id: `bz:${g.id}`,
        art: "BZ-Kontrolle",
        titel: g.name,
        wo: g.lagerortName,
        zustand,
        dringlichkeit: f.nieGeprueft || f.ueberfaellig ? "ueberfaellig" : "bald",
        sortierung: f.faelligAm?.toISOString() ?? "",
        pfad: verwaltungDetailPfad("bz", g.id),
      };
    });
}

function offenePlomben(db: Leser): Faelligkeit[] {
  return db.select({
    id: plomben.id, bezeichnung: plomben.bezeichnung, fachLabel: plomben.fachLabel,
    lagerortId: lagerorte.id, lagerortName: lagerorte.name,
  }).from(plomben)
    .innerJoin(lagerorte, eq(lagerorte.id, plomben.lagerortId))
    .where(and(eq(plomben.aktiv, true), isNull(plomben.nummer), eq(lagerorte.aktiv, true)))
    .all()
    .map((p): LagerbuchFaelligkeit => ({
      id: `plombe:${p.id}`,
      art: "Plombe",
      titel: p.fachLabel ? `${p.bezeichnung} (${p.fachLabel})` : p.bezeichnung,
      wo: p.lagerortName,
      zustand: "nicht gesetzt",
      dringlichkeit: "bald",
      sortierung: "",
      pfad: verwaltungDetailPfad("fahrzeuge", p.lagerortId),
    }));
}
