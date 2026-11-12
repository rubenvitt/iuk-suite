/**
 * WOHIN DIE AKTE IN DIE NACHBAR-APPS ZEIGT (IDA-299): Beladung steht im Lagerbuch, Funkgeräte bei den
 * Funkgeräten. Die Akte liest dort nichts — weder Datenbank noch Schema —, sie baut nur die Adresse.
 *
 * Was dafür da ist:
 * - Lagerbuch: `quellzuordnung` (`_db/schema.ts`) kennt aus dem Erstimport die Zeile des Lagerbuchs
 *   (`lagerorte.id`), und dessen Verwaltung führt je Fahrzeug eine Seite unter `/verwaltung/fahrzeuge/<id>`.
 *   Genau eine Zuordnung → dorthin; keine oder mehrere → die Fahrzeugliste der Verwaltung.
 * - Funkgeräte: sie kennen keine Fahrzeugzeile, der Ort eines Geräts ist der Name des Fahrzeugs
 *   (`kurzname` in `_lib/bereitstellung.ts`). Die Geräteliste filtert über `?lagerort=`.
 *
 * Beide Ziele liegen in der Verwaltung der Nachbar-App. Wer sie nicht öffnen darf, bekommt die Startseite
 * der App statt eines Links in ein 404 (`docs/design/README.md`, „Was eine Oberfläche zeigen muss“). Das
 * Prädikat kommt aus `core` (`adminGroupsFor`, `verwaltungsGruppenFor`), nicht aus dem fremden Modul;
 * die Seite dort riegelt ohnehin selbst.
 *
 * Kein `"use client"`: die Akte-Seite ruft das auf dem Server und reicht nur Zeichenketten weiter.
 */
import { adminGroupsFor, hasAnyGroup } from "@/core/groups";
import { getModule, verwaltungsGruppenFor, VERWALTUNGSEINSTIEGE } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { FahrzeugeDb } from "../../_db/client";
import { kurzname, zuordnungenFuer } from "../bereitstellung";
import type { FahrzeugDTO } from "../daten";

export interface AkteVerweis {
  href: string;
  /** `true`: der Link führt auf dieses Fahrzeug; `false`: nur in die App. */
  genau: boolean;
}

export interface AkteVerweise {
  /** `null`, wenn die App in dieser Umgebung keine Adresse hat. */
  lagerbuch: AkteVerweis | null;
  funk: AkteVerweis | null;
}

type EnvLike = Record<string, string | undefined>;

export function akteVerweise(
  db: FahrzeugeDb,
  fahrzeug: Pick<FahrzeugDTO, "id" | "typ" | "funkkenner" | "funkrufname">,
  groups: readonly string[] | null | undefined,
  basis: (modul: string) => string | null = moduleUrl,
  env: EnvLike = process.env,
): AkteVerweise {
  const gruppen = groups ? [...groups] : null;
  return {
    lagerbuch: lagerbuchVerweis(db, fahrzeug.id, gruppen, basis("lagerbuch"), env),
    funk: funkVerweis(fahrzeug, gruppen, basis("radio"), env),
  };
}

function lagerbuchVerweis(db: FahrzeugeDb, fahrzeugId: string, gruppen: string[] | null, basis: string | null, env: EnvLike): AkteVerweis | null {
  if (!basis) return null;
  const wurzel = basis.replace(/\/$/, "");
  // Wie das Lagerbuch selbst (`istLagerbuchAdmin`): nur seine Admin-Gruppen, ohne den Kurzschluss für den Suite-Admin.
  if (!hasAnyGroup(gruppen, adminGroupsFor(getModule("lagerbuch"), env))) return { href: wurzel, genau: false };
  const zeilen = Object.entries(zuordnungenFuer("lagerbuch", db)).filter(([, stammId]) => stammId === fahrzeugId).map(([quellId]) => quellId);
  if (zeilen.length !== 1) return { href: `${wurzel}/verwaltung/fahrzeuge`, genau: false };
  return { href: `${wurzel}/verwaltung/fahrzeuge/${encodeURIComponent(zeilen[0])}`, genau: true };
}

function funkVerweis(
  fahrzeug: Pick<FahrzeugDTO, "typ" | "funkkenner" | "funkrufname">, gruppen: string[] | null, basis: string | null, env: EnvLike,
): AkteVerweis | null {
  if (!basis) return null;
  const wurzel = basis.replace(/\/$/, "");
  const einstieg = VERWALTUNGSEINSTIEGE.find((e) => e.modul === "radio");
  if (!einstieg || !hasAnyGroup(gruppen, verwaltungsGruppenFor(einstieg, env))) return { href: wurzel, genau: false };
  const ort = kurzname(fahrzeug);
  // Der Filter der Geräteliste ist eine Komma-Liste; ein Name mit Komma ließe sich dort nicht ausdrücken.
  if (ort.includes(",")) return { href: `${wurzel}${einstieg.pfad}/geraete`, genau: false };
  return { href: `${wurzel}${einstieg.pfad}/geraete?lagerort=${encodeURIComponent(ort)}`, genau: true };
}
