// src/app/m/zeichen/_lib/seedLokal.ts
// KEIN "use client" (Falle 6).
import { eq } from "drizzle-orm";
import type { DB } from "../_db/client";
import { lernsets, lernsetZeichen, lernstand, merkliste, newId } from "../_db/schema";
import { findeZeichen } from "./katalog";

/*
 * Lokale Demodaten. Idempotent PRO ZEILE (`onConflictDoNothing()`), rein additiv —
 * nichts wird geloescht oder ueberschrieben, damit ein zweiter Lauf eine von Hand
 * angelegte Zeile nicht wegraeumt.
 *
 * ⛔ HAENGT NICHT AM BOOT. `shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV ===
 * "development"`, und SUITE_SEED=1 ist der GENERALPROBEN-Schalter. Diese Daten
 * schluesseln auf `dev:demo@localtest.me` — in einer Generalprobe erschienen damit
 * Lernstaende und Merklisten einer Person, die es auf der Instanz nicht gibt.
 */

const DEV_SUB = "dev:demo@localtest.me";

/** Zugleich die ANKER-Liste in `_lib/katalog.test.ts` — beide zusammen pflegen. */
const GRUNDLAGEN_SET = [
  "grund:base.formation", "rezept:C.1.1", "rezept:E.1.1", "rezept:I.3.5",
] as const;

const RETTUNGSDIENST_SET = ["rezept:C.1.1", "rezept:E.1.1"] as const;

async function seedeSet(
  db: DB, slug: string, titel: string, beschreibung: string, ids: readonly string[],
): Promise<string> {
  const vorhanden = db.select().from(lernsets).where(eq(lernsets.slug, slug)).get();
  const id = vorhanden?.id ?? newId();
  if (!vorhanden) {
    db.insert(lernsets).values({
      id, slug, titel, beschreibung, aktiv: true, erstelltVon: DEV_SUB,
    }).onConflictDoNothing().run();
  }
  let position = 0;
  let uebersprungen = 0;
  for (const zeichenId of ids) {
    const z = findeZeichen(zeichenId);
    if (!z) { uebersprungen += 1; continue; }
    db.insert(lernsetZeichen).values({
      lernsetId: id, zeichenId, titelSchnappschuss: z.titel, position: position++,
    }).onConflictDoNothing().run();
  }
  const zusatz = uebersprungen > 0 ? ` (${uebersprungen} nicht im Katalog)` : "";
  return `Lernset „${titel}“: ${position} Zeichen${zusatz} — /m/zeichen/lernen?set=${slug}`;
}

export async function seedLokalZeichen(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  zeilen.push(await seedeSet(
    db, "grundlagen", "Grundzeichen und Organisationen",
    "Der Einstieg: Grundformen und die Farben der Organisationen.", GRUNDLAGEN_SET,
  ));
  zeilen.push(await seedeSet(
    db, "rettungsdienst", "Rettungsdienst",
    "Die Zeichen, die im Sanitätsdienst am häufigsten vorkommen.", RETTUNGSDIENST_SET,
  ));

  // Wie `seedeSet`: die Protokollzeile zaehlt das TATSAECHLICH Geschriebene, nicht die
  // Laenge der Eingabeliste — sonst behauptet sie nach einem Paketupgrade weiter "3
  // Zeichen", waehrend eine der drei IDs schon uebersprungen wurde.
  let merklisteAngelegt = 0;
  let merklisteUebersprungen = 0;
  for (const zeichenId of GRUNDLAGEN_SET.slice(0, 3)) {
    const z = findeZeichen(zeichenId);
    if (!z) { merklisteUebersprungen += 1; continue; }
    db.insert(merkliste).values({
      sub: DEV_SUB, zeichenId, titelSchnappschuss: z.titel,
    }).onConflictDoNothing().run();
    merklisteAngelegt += 1;
  }
  const merklisteZusatz =
    merklisteUebersprungen > 0 ? ` (${merklisteUebersprungen} nicht im Katalog)` : "";
  zeilen.push(`Merkliste für ${DEV_SUB}: ${merklisteAngelegt} Zeichen${merklisteZusatz} — /m/zeichen/merkliste`);

  // `gefestigt` steht an der Fixtur selbst statt aus `stufe`/`faelligAm` neu
  // hergeleitet zu werden — die Klassifikation ist eine Demodaten-Entscheidung
  // dieses Seeds, keine fachliche Regel, die anderswo im Modul lebt.
  const staende = [
    { zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01", richtig: 4, falsch: 0, gefestigt: true },
    { zeichenId: "rezept:E.1.1", stufe: 1, faelligAm: "2000-01-01", richtig: 1, falsch: 2, gefestigt: false },
    { zeichenId: "rezept:I.3.5", stufe: 0, faelligAm: "2000-01-01", richtig: 0, falsch: 1, gefestigt: false },
  ];
  let gefestigtAngelegt = 0;
  let faelligAngelegt = 0;
  let staendeUebersprungen = 0;
  for (const { gefestigt, ...s } of staende) {
    if (!findeZeichen(s.zeichenId)) { staendeUebersprungen += 1; continue; }
    db.insert(lernstand).values({ sub: DEV_SUB, ...s }).onConflictDoNothing().run();
    if (gefestigt) gefestigtAngelegt += 1; else faelligAngelegt += 1;
  }
  const staendeZusatz =
    staendeUebersprungen > 0 ? ` (${staendeUebersprungen} nicht im Katalog)` : "";
  zeilen.push(
    `Lernstand für ${DEV_SUB}: ${gefestigtAngelegt} gefestigt, ${faelligAngelegt} fällig` +
    `${staendeZusatz} — /m/zeichen/lernen`,
  );
  zeilen.push(
    `Verwaltung der Lernsets: /m/zeichen/verwaltung/lernsets — ` +
    `braucht die Gruppe aus SUITE_ADMIN_GROUP_ZEICHEN (Vorgabe iuk-zeichen-admin) ` +
    `oder die Suite-Admin-Gruppe.`,
  );

  return zeilen;
}
