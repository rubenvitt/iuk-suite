/**
 * EINE FÄLLIGKEIT, so wie ein Modul sie dem Portal herausgibt (IDA-297, „Was steht an").
 *
 * Warum in `core`: zwei Module geben heute Fälligkeiten heraus (`lagerbuch`, `radio`), jedes über
 * GENAU EINE Datei `<modul>/_lib/faelligkeiten.ts` — dasselbe Muster wie `fahrzeugbestand.ts` für den
 * Erstimport der Fahrzeugverwaltung. Das Portal liest weder ihre Datenbanken noch ihre Schemata,
 * sondern nur, was dort herausgegeben wird. Der Typ ist der Vertrag dazwischen, und ein Vertrag, den
 * zwei Seiten unterschreiben, gehört keiner von beiden.
 *
 * Kein `"use client"` (Falle 6): Seite, Kachel und der wöchentliche Push lesen ihn serverseitig.
 */

/**
 * `ueberfaellig`: die Frist ist vorbei oder es ist jetzt zu tun (abgelaufen, nie kontrolliert,
 * Flasche unter der Wechselgrenze). `bald`: liegt im Vorwarnfenster des Moduls.
 */
export type Dringlichkeit = "ueberfaellig" | "bald";

export interface Faelligkeit {
  /** Eindeutig innerhalb des Moduls — Schlüssel für Listen. */
  id: string;
  /** Die Art, wie sie auf dem Bildschirm des Moduls heißt: „Verfall", „Sauerstoff", „BZ-Kontrolle" … */
  art: string;
  /** Was betroffen ist, z. B. „Kochsalz 0,9 % · Charge 12345" oder „Funkgerät Rotkreuz 1/83-1". */
  titel: string;
  /** Wo es liegt („Handlager", „RTW 1"); `null`, wenn der Ort nichts beiträgt. */
  wo: string | null;
  /** Der Zustand in Worten: „abgelaufen", „fällig in 4 Tagen", „seit 9 Tagen ausgeliehen". */
  zustand: string;
  dringlichkeit: Dringlichkeit;
  /**
   * Sortierschlüssel innerhalb derselben Dringlichkeit, früheste zuerst (ISO-Datum oder Monat
   * „JJJJ-MM"). `""` sortiert nach vorn — für „sofort", wo es kein Datum gibt.
   */
  sortierung: string;
  /** Pfad auf dem Host des Moduls, an dem die Sache erledigt wird, z. B. `/verwaltung/verfall`. */
  pfad: string;
  /**
   * Eine Person (Entleiher einer Ausleihe). Steht NUR auf der Seite, die das Modulrecht prüft — NIE im
   * Push: das ntfy-Thema lesen alle, die irgendein Quellmodul verwalten, und ein Klarname gehört nicht
   * in eine Mitteilung auf fremden Sperrbildschirmen.
   */
  person?: string;
}

/** „1 Tag" / „3 Tagen" — die Dativform, die nach „seit" und „in" steht. */
export function tageDativ(tage: number): string {
  return tage === 1 ? "1 Tag" : `${tage} Tagen`;
}

/**
 * EINE SOFORTMELDUNG (IDA-298) — etwas, das nicht bis Montag warten soll, z. B. ein gemeldeter Mangel.
 * Das Portal schickt sie an dieselben Abos wie „Was steht an", sobald es sie sieht (etwa jede Minute),
 * an alle, die die Fälligkeiten des Moduls sehen dürfen und die Art nicht abgewählt haben.
 *
 * ⚠️ KEIN KLARNAME UND KEIN FREITEXT: die Mitteilung steht auf fremden Sperrbildschirmen, und das Thema
 * liest jeder, der seinen Namen kennt. `zeilen` sind feste Wörter vom Bildschirm des Moduls.
 */
export interface Sofortmeldung {
  /** Eindeutig innerhalb des Moduls — damit vermerkt das Modul den Versand. */
  id: string;
  /** Eine der Arten des Moduls (`FaelligkeitsQuelle.arten`), z. B. „Mangel". */
  art: string;
  /** Kopf der Mitteilung, z. B. „Mangel gemeldet: RTW 1". */
  titel: string;
  /** Höchstens ein paar kurze Zeilen. */
  zeilen: string[];
  /** Pfad auf dem Host des Moduls, an dem die Sache erledigt wird. */
  pfad: string;
}
