import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { presets } from "@/app/m/qr/_db/schema";
import * as schema from "@/app/m/qr/_db/schema";
import type { Preset } from "@/app/m/qr/_lib/types";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT `_lib/seed.ts`.
 *
 * `seed.ts` läuft am Boot, sobald `shouldSeed()` wahr ist — also auch bei
 * `SUITE_SEED=1`, dem Schalter der GENERALPROBE. Dort soll genau ein
 * Beispiel-Preset stehen und nicht dieser Katalog. Diese Datei läuft
 * ausschließlich über das lokale Seed-Skript.
 *
 * ZIEL: jede vom Schema erlaubte `kind`-Variante ('url','wifi','tel','vcard',
 * 'text' — CHECK-Constraint in `_db/schema.ts`, identisch mit VALID_KINDS im
 * Validator) mindestens einmal, damit sich der Generator lokal komplett
 * durchklicken lässt.
 *
 * REIN ADDITIV: `demo-url` ("Beispiel-Link", sortOrder 0) bleibt unangetastet
 * und bleibt durch `sortOrder` 0 auch die erste Kachel — die E2E-Tests greifen
 * es über ein nacktes `getByText("Beispiel-Link")`, ein zweiter Textreffer wäre
 * ein Strict-Mode-Fehler. Kein Label hier enthält diese Zeichenfolge.
 */

/**
 * Der Wert wird JSON-kodiert gespeichert — auch bei `kind='url'`, wo dann
 * `"\"https://…\""` in der Spalte steht. Das Doppel-Encoding stammt aus easy-qr
 * (siehe Kommentar an `presets.value` im Schema); `toPreset` in `_lib/presets.ts`
 * liest es mit `JSON.parse` zurück. Gespeichert wird die INNERE Nutzlast, nicht
 * das ganze Payload-Objekt.
 */
type LokalesPreset = Preset & { sortOrder: number };

/**
 * `sortOrder` ab 10: `demo-url` (0) bleibt vorn, und `createPreset` vergibt für
 * ein neu angelegtes Preset `max(sort_order) + 1` — es landet also hinter
 * diesem Katalog, ohne Lücke.
 */
export const LOKALE_PRESETS: LokalesPreset[] = [
  {
    id: "lokal-wiki",
    label: "Wiki des Ortsvereins",
    icon: "📚",
    kind: "url",
    value: "https://wiki.localtest.me",
    sortOrder: 10,
  },
  {
    id: "lokal-dienstplan",
    label: "Dienstplan öffnen",
    icon: "🗓️",
    kind: "url",
    value: "https://dienstplan.localtest.me/heute",
    sortOrder: 11,
  },
  {
    id: "lokal-wlan-gast",
    label: "WLAN Gäste",
    icon: "📶",
    kind: "wifi",
    value: {
      ssid: "DRK-Gast",
      password: "HerzUndHand2026",
      encryption: "WPA",
      hidden: false,
    },
    sortOrder: 20,
  },
  {
    // Offenes Netz: `encryption: "nopass"` mit LEEREM Passwort — genau die
    // Nutzlast, die `validatePresetInput` für ein offenes WLAN erzeugt. Ohne
    // diese Zeile prüft lokal niemand, ob die WLAN-Ansicht ohne Passwortfeld
    // durchläuft.
    id: "lokal-wlan-offen",
    label: "WLAN Infoterminal (offen)",
    icon: "📡",
    kind: "wifi",
    value: { ssid: "DRK-Infoterminal", password: "", encryption: "nopass" },
    sortOrder: 21,
  },
  {
    // Versteckte SSID — der dritte WLAN-Fall (`hidden: true`).
    id: "lokal-wlan-einsatz",
    label: "WLAN Einsatzleitung (versteckt)",
    icon: "🛰️",
    kind: "wifi",
    value: {
      ssid: "DRK-EL-Intern",
      password: "Lagekarte!2026",
      encryption: "WPA",
      hidden: true,
    },
    sortOrder: 22,
  },
  {
    id: "lokal-tel-geschaeftsstelle",
    label: "Geschäftsstelle anrufen",
    icon: "☎️",
    kind: "tel",
    value: "+4962112345600",
    sortOrder: 30,
  },
  {
    id: "lokal-tel-bereitschaft",
    label: "Bereitschaftshandy",
    icon: "📱",
    kind: "tel",
    value: "+4915112345678",
    sortOrder: 31,
  },
  {
    id: "lokal-vcard-bereitschaftsleitung",
    label: "Visitenkarte Bereitschaftsleitung",
    icon: "👤",
    kind: "vcard",
    value: {
      name: "Anke Sommer",
      tel: "+4915112345678",
      email: "bereitschaft@localtest.me",
      org: "DRK Ortsverein Musterstadt",
    },
    sortOrder: 40,
  },
  {
    // vCard mit nur dem Pflichtfeld: `tel`, `email` und `org` sind optional und
    // dürfen in `encodeVcard` schlicht fehlen.
    id: "lokal-vcard-knapp",
    label: "Visitenkarte ohne Kontaktdaten",
    icon: "🪪",
    kind: "vcard",
    value: { name: "Materialausgabe" },
    sortOrder: 41,
  },
  {
    id: "lokal-text-treffpunkt",
    label: "Treffpunkt-Hinweis",
    icon: "📝",
    kind: "text",
    value:
      "Treffpunkt Sanitätsdienst: Haupteingang Nord, 30 Minuten vor Dienstbeginn. Einsatzkleidung mitbringen.",
    sortOrder: 50,
  },
  {
    id: "lokal-text-inventarnummer",
    label: "Inventaraufkleber",
    icon: "🏷️",
    kind: "text",
    value: "INV-2026-0815 · Notfallrucksack Erwachsene · Standort: Fahrzeug 1",
    sortOrder: 51,
  },
];

/**
 * Legt den lokalen Preset-Katalog an. Idempotent PRO ZEILE über den
 * Primärschlüssel `id` (`onConflictDoNothing`) — nicht über ein gemeinsames
 * Gate: ein abgebrochener Lauf ergänzt sich beim nächsten selbst.
 *
 * `createdBy`/`updatedBy` tragen `'system'` wie der Boot-Seed — reine
 * Audit-Felder ohne FK, es gibt dafür keine User-Zeile.
 */
export async function seedLokalQr(
  db: BetterSQLite3Database<typeof schema>,
): Promise<string[]> {
  const now = new Date();
  let angelegt = 0;

  for (const p of LOKALE_PRESETS) {
    const ergebnis = db
      .insert(presets)
      .values({
        id: p.id,
        label: p.label,
        icon: p.icon ?? null,
        kind: p.kind,
        value: JSON.stringify(p.value),
        sortOrder: p.sortOrder,
        createdAt: now,
        updatedAt: now,
        createdBy: "system",
        updatedBy: "system",
      })
      .onConflictDoNothing()
      .run();
    if (ergebnis.changes > 0) angelegt++;
  }

  const uebersprungen = LOKALE_PRESETS.length - angelegt;
  const arten = [...new Set(LOKALE_PRESETS.map((p) => p.kind))].join(", ");

  return [
    `qr: ${angelegt} Presets angelegt, ${uebersprungen} bereits vorhanden (${LOKALE_PRESETS.length} insgesamt).`,
    `qr: Arten abgedeckt — ${arten}.`,
    "qr: http://qr.localtest.me:3000/ — die Kacheln stehen hinter „Beispiel-Link“ (sortOrder ab 10).",
    "qr: http://qr.localtest.me:3000/wifi · /tel · /contact — die Formulare zu den drei Sonderarten.",
    "qr: Dev-Login mit groups=iuk-qr-admin öffnet http://qr.localtest.me:3000/admin (Bearbeiten/Sortieren).",
  ];
}
