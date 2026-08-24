// src/app/m/radio/_lib/lesepfade/versionen.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): ein reiner Lesepfad, den
// Server Components rufen. `src/app/m/radio/riegel.test.ts:1064-1117` setzt beides fuer
// `_lib/` und `_db/` modulweit durch.
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { devices, softwareVersions } from "../../_db/schema";
import { datumMitUhrzeit } from "../anzeige";

/**
 * DIE SOFTWAREVERSIONEN DER VERWALTUNG — der erste Lesepfad des Bauabschnitts C
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:105`: die Pfade stehen VOR den Flaechen,
 * „sonst greift eine Flaeche zum naechstbesten").
 *
 * ⛔ `db` IST DER ERSTE PARAMETER, IMMER, und die Funktion holt sich die Verbindung NICHT
 * selbst — sonst ist sie im Test nicht gegen eine eigene Datei zu haengen, und `getModuleDb()`
 * waere dort ausserdem falsch: sein Cache ist per MODULSCHLUESSEL gekeyt, nicht per
 * `DATA_DIR` (`src/core/db/index.ts:31-35`). Dieselbe Auflage traegt `_db/leihen.ts:32-35`.
 */

/**
 * Eine Zeile der Verwaltungstabelle `/admin/versionen` (Insel 3, `Spec:4505`).
 *
 * ⚠️ `sortOrder` STEHT ABSICHTLICH NICHT HIER, obwohl das Alt-Lesemodell es fuehrt
 * (`radio-admin/server/src/repos/softwareVersionRepo.ts:145`, Feld `sortOrder` in
 * `SoftwareVersionListItem`): keine der fuenf Spalten der Alt-Maske zeigt die Zahl
 * (`radio-admin/client/src/features/settings/SoftwareVersionsPage.tsx:84-175`), und das
 * Verschieben schreibt die GANZE Reihenfolge als Id-Liste (`:68-82`), nie eine einzelne Zahl.
 * Die Anzeigeordnung IST die Reihenfolge dieser Liste; ein zweites Feld daneben waere ein
 * Wert, den niemand liest und den ein spaeterer Umbau gegen die Listenordnung driften lassen
 * kann.
 *
 * ⚠️ `angelegtText` IST EINE FERTIGE ZEICHENKETTE UND KEIN `Date`. Die Zeile geht als Prop an
 * eine Client-Insel, und ein `Date` ueber diese Grenze ist verboten
 * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`;
 * `Spec:4536-4539`). Formatiert wird mit `datumMitUhrzeit` (`_lib/anzeige.ts:75`) in der dort
 * festgenagelten Zone.
 */
export type VersionZeile = {
  id: string;
  wert: string;
  isTarget: boolean;
  deviceCount: number;
  angelegtText: string;
};

/**
 * ERSETZT `listSoftwareVersions`
 * (`radio-admin/server/src/repos/softwareVersionRepo.ts:139-151`).
 *
 * Drei Regeln wandern 1:1 mit:
 *  - Sortierung `desc(sortOrder)`, dann `desc(createdAt)` (`:150`) — die zweite Haelfte
 *    wandert 1:1 mit (`:150`), NICHT weil Gleichstaende haeufig waeren: `sortOrder` KANN
 *    kollidieren, weil die Spalte die Vorgabe 0 traegt (`_db/schema.ts:83`), waehrend jeder
 *    bekannte Schreibweg sie ausdruecklich und verschieden setzt
 *    (`softwareVersionRepo.ts:19-25` `MAX(sortOrder) + 1`, `:131` `ids.length - index`;
 *    auch der Suite-Seed, `_lib/seedLokal.ts:120-125`, setzt 0/1/2). Wo ein Gleichstand
 *    doch entsteht, antwortete dieselbe Liste ohne den Gleichstandsbrecher je nach
 *    Speicherlage verschieden.
 *  - `deviceCount` als Unterabfrage ueber `devices.software_version = software_versions.value`
 *    (`:147`) — sie zaehlt den ROHEN Versionswert des Geraets, ohne Normalisierung, genau wie
 *    `berechneUpdateStand` vergleicht (`_lib/updateStand.ts`).
 *  - `isTarget` (`:146`) — ohne das Feld kann die Flaeche die Marke weder anzeigen noch vom
 *    Knopf „Als Ziel" unterscheiden.
 */
export function versionenMitGeraetezahl(db: DB): VersionZeile[] {
  return db
    .select({
      id: softwareVersions.id,
      wert: softwareVersions.value,
      isTarget: softwareVersions.isTarget,
      deviceCount: sql<number>`(SELECT COUNT(*) FROM ${devices} WHERE ${devices.softwareVersion} = ${softwareVersions.value})`,
      angelegt: softwareVersions.createdAt,
    })
    .from(softwareVersions)
    .orderBy(desc(softwareVersions.sortOrder), desc(softwareVersions.createdAt))
    .all()
    .map((z) => ({
      id: z.id,
      wert: z.wert,
      isTarget: z.isTarget,
      deviceCount: z.deviceCount,
      angelegtText: datumMitUhrzeit(z.angelegt),
    }));
}

/**
 * ERSETZT `getTargetVersion` (`radio-admin/server/src/repos/softwareVersionRepo.ts:63-70`):
 * der Wert der Zeile mit gesetzter Marke, sonst `null`.
 *
 * ⛔ DIE EINE BENANNTE ABWEICHUNG DIESER AUFGABE — SIE IST KEINE 1:1-UEBERNAHME, UND SIE
 * STEHT HIER, DAMIT SIE NICHT ALS VERSEHEN GELESEN WIRD. Es gibt KEINEN DB-Constraint, der
 * genau eine Ziel-Marke erzwingt (`src/app/m/radio/_db/schema.ts:84-92`, dort mit der
 * Begruendung: ein partieller Index verwandelte das Setzen der Marke von einer
 * Zweischritt-Transaktion in einen Konflikt und braeche den bestehenden Schreibweg). ⛔ DIESE
 * SCHWAECHE WANDERT 1:1 MIT, INKLUSIVE DES FEHLENDEN CONSTRAINTS. Der Alt-Leser hat dazu
 * KEIN `ORDER BY` (`:63-70`): bei zwei Marken entscheidet die Reihenfolge, in der SQLite
 * liefert, ueber den angezeigten Stand JEDES Geraets — derselbe Datenbestand kann zweimal
 * verschieden antworten. Der Lesepfad bekommt deshalb ein `asc(sortOrder)` davor.
 *
 * ⚠️ WAS DAS `asc` NICHT BEHAUPTET: dass die kleinere Anzeigeordnung die RICHTIGE Marke ist.
 * Bei zwei Marken ist der Bestand bereits kaputt; keine Richtung waere fachlich richtig. Die
 * Abweichung kauft Determinismus, nicht Richtigkeit — und `_lib/lesepfade/versionen.test.ts`
 * schreibt genau das in den Fall.
 *
 * ⛔ DIE MARKE WIRD NIE AUS DEM ANLEGEDATUM ODER AUS DER ANZEIGEORDNUNG ABGELEITET
 * (Entscheidung E-V8, `.superpowers/sdd/planteil4/briefs/KOPF.md:698-700`):
 * `insertSoftwareVersionIfNew` legt eine neu gesehene Version OBEN in der Anzeigeordnung ab
 * (`softwareVersionRepo.ts:29-30`, `:39`), macht sie aber NIE zum Ziel. `where` auf `isTarget`
 * ist deshalb die Bedingung, `orderBy` nur der Gleichstandsbrecher.
 */
export function zielVersion(db: DB): string | null {
  const zeile = db
    .select({ wert: softwareVersions.value })
    .from(softwareVersions)
    .where(eq(softwareVersions.isTarget, true))
    .orderBy(asc(softwareVersions.sortOrder))
    .limit(1)
    .get();
  return zeile?.wert ?? null;
}
