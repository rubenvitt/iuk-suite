import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/app/m/portal/_db/schema";

/**
 * ANREICHERUNG NUR FÜR DIE LOKALE ARBEIT — bewusst NICHT `_lib/seed.ts`.
 *
 * `seed.ts` läuft am Boot, sobald `shouldSeed()` wahr ist, und das ist es auch
 * bei `SUITE_SEED=1` — dem Schalter der GENERALPROBE. Was dort landet, kann
 * also in einer Probe-Instanz stehen. Diese Datei hier läuft ausschließlich über
 * das lokale Seed-Skript und darf deshalb breit sein: ein vollständiger
 * Servicekatalog, an dem sich Gruppierung, Kategorien, Schutz und der
 * Aktiv-Schalter lokal wirklich ansehen lassen.
 *
 * REIN ADDITIV: die zwei Zeilen aus `seed.ts` ("bookstack", "vaultwarden") und
 * ihre `sortOrder` 1/2 bleiben unangetastet — alles hier beginnt bei 10 und
 * sortiert sich damit dahinter ein. Kein Name enthält "BookStack" oder
 * "Vaultwarden": die E2E-Tests greifen beide über ein nacktes `getByText`, ein
 * zweiter Treffer wäre dort ein Strict-Mode-Fehler.
 */

const KATEGORIE_EINSATZ = "Einsatz";
const KATEGORIE_AUSBILDUNG = "Ausbildung";
const KATEGORIE_ORGANISATION = "Organisation";
const KATEGORIE_DOKU = "Doku";
const KATEGORIE_TOOLS = "Tools";
const KATEGORIE_VERWALTUNG = "Verwaltung";

/**
 * Die Gruppen, gegen die `requiredGroups` prüft. `dashboard-admins` ist die
 * Suite-Admin-Gruppe (schon von `seed.ts` benutzt); die übrigen sind frei
 * erfunden und stehen hier, damit sich der Dev-Login gezielt damit anmelden
 * kann: `?groups=da-einsatz,da-ausbildung`.
 */
const GRUPPE_EINSATZ = "da-einsatz";
const GRUPPE_AUSBILDUNG = "da-ausbildung";
const GRUPPE_VERWALTUNG = "da-verwaltung";
const GRUPPE_SUITE_ADMIN = "dashboard-admins";

/** Exportiert, damit der Test gegen die Liste zählen kann statt gegen eine Zahl. */
export const LOKALE_DIENSTE: schema.NewService[] = [
  // ---------------------------------------------------------------- Einsatz
  {
    slug: "lokal-alarmierung",
    name: "Alarmierung 24/7",
    description: "Alarmierung, Rückmeldung und Verfügbarkeit der Einsatzkräfte.",
    url: "https://alarm.localtest.me",
    category: KATEGORIE_EINSATZ,
    tags: ["Alarmierung", "Einsatz"],
    requiredGroups: [GRUPPE_EINSATZ],
    isPublic: false,
    sortOrder: 10,
  },
  {
    slug: "lokal-lagekarte",
    name: "Lagekarte",
    description: "Kartenansicht der laufenden Einsatzabschnitte.",
    url: "https://lage.localtest.me",
    category: KATEGORIE_EINSATZ,
    tags: ["Einsatz", "Karte"],
    requiredGroups: [GRUPPE_EINSATZ],
    isPublic: false,
    sortOrder: 11,
  },
  {
    slug: "lokal-warnlage",
    name: "Warnlage",
    description: "Amtliche Wetter- und Gefahrenwarnungen für den Kreis.",
    url: "https://warnung.localtest.me",
    category: KATEGORIE_EINSATZ,
    tags: ["Wetter", "Öffentlich"],
    isPublic: true,
    sortOrder: 12,
  },

  // ------------------------------------------------------------- Ausbildung
  {
    slug: "lokal-lernplattform",
    name: "Lernplattform",
    description: "Online-Module zur Vorbereitung auf die Sanitätsausbildung.",
    url: "https://lernen.localtest.me",
    category: KATEGORIE_AUSBILDUNG,
    tags: ["Ausbildung", "E-Learning"],
    requiredGroups: [GRUPPE_AUSBILDUNG],
    isPublic: false,
    sortOrder: 20,
  },
  {
    slug: "lokal-kursanmeldung",
    name: "Kursanmeldung Erste Hilfe",
    description: "Termine und Anmeldung für die öffentlichen Erste-Hilfe-Kurse.",
    url: "https://kurse.localtest.me",
    category: KATEGORIE_AUSBILDUNG,
    tags: ["Kurse", "Öffentlich"],
    isPublic: true,
    sortOrder: 21,
  },
  {
    // Bewusst INAKTIV: `getVisibleServicesForUser` filtert die Zeile heraus,
    // die Verwaltungsliste (`getAllServices`) zeigt sie weiterhin. Ohne so eine
    // Zeile lässt sich der Unterschied lokal nicht sehen.
    slug: "lokal-pruefungsfragen",
    name: "Prüfungsfragen (Archiv)",
    description: "Abgelöst durch die Lernplattform — nur noch als Nachschlagewerk.",
    url: "https://fragen-archiv.localtest.me",
    category: KATEGORIE_AUSBILDUNG,
    tags: ["Archiv"],
    requiredGroups: [GRUPPE_AUSBILDUNG],
    isPublic: false,
    isActive: false,
    sortOrder: 22,
  },

  // ----------------------------------------------------------- Organisation
  {
    slug: "lokal-dienstplan",
    name: "Dienstplan",
    description: "Wer hat wann Bereitschaft — inklusive Tauschbörse.",
    url: "https://dienstplan.localtest.me",
    category: KATEGORIE_ORGANISATION,
    tags: ["Dienstplan", "Bereitschaft"],
    requiredGroups: [GRUPPE_EINSATZ],
    isPublic: false,
    sortOrder: 30,
  },
  {
    slug: "lokal-terminfindung",
    name: "Terminfindung",
    description: "Abstimmung über Termine für Übungen und Besprechungen.",
    url: "https://termine.localtest.me",
    category: KATEGORIE_ORGANISATION,
    tags: ["Termine"],
    isPublic: true,
    sortOrder: 31,
  },
  {
    slug: "lokal-jugendrotkreuz",
    name: "Jugendrotkreuz",
    description: "Gruppenstunden, Zeltlager und Anmeldungen der JRK-Gruppen.",
    url: "https://jrk.localtest.me",
    category: KATEGORIE_ORGANISATION,
    tags: ["Jugend", "Öffentlich"],
    isPublic: true,
    sortOrder: 32,
  },

  // ------------------------------------------------------------------- Doku
  {
    slug: "lokal-formularschrank",
    name: "Formularschrank",
    description: "Vordrucke für Einsatzdokumentation, Abrechnung und Meldungen.",
    url: "https://formulare.localtest.me",
    category: KATEGORIE_DOKU,
    tags: ["Formulare", "Dokumentation"],
    isPublic: true,
    sortOrder: 40,
  },
  {
    slug: "lokal-sop",
    name: "Handlungsanweisungen",
    description: "Verbindliche Abläufe für Sanitätsdienst und Betreuung.",
    url: "https://sop.localtest.me",
    category: KATEGORIE_DOKU,
    tags: ["Dokumentation", "Einsatz"],
    requiredGroups: [GRUPPE_EINSATZ, GRUPPE_AUSBILDUNG],
    isPublic: false,
    sortOrder: 41,
  },

  // ------------------------------------------------------------------ Tools
  {
    slug: "lokal-dateiablage",
    name: "Dateiablage",
    description: "Gemeinsame Ablage für Bilder, Präsentationen und Protokolle.",
    url: "https://ablage.localtest.me",
    category: KATEGORIE_TOOLS,
    tags: ["Dateien"],
    requiredGroups: [GRUPPE_EINSATZ, GRUPPE_AUSBILDUNG, GRUPPE_VERWALTUNG],
    isPublic: false,
    sortOrder: 50,
  },
  {
    // `openInNewTab: false` — die einzige Zeile im Katalog, die im selben Tab
    // öffnet. Ohne sie prüft lokal niemand, ob die Kachel `target`/`rel`
    // tatsächlich weglässt.
    slug: "lokal-statusmonitor",
    name: "Statusmonitor",
    description: "Erreichbarkeit der Dienste auf einen Blick.",
    url: "https://status.localtest.me",
    category: KATEGORIE_TOOLS,
    tags: ["Betrieb"],
    isPublic: true,
    openInNewTab: false,
    sortOrder: 51,
  },
  {
    slug: "lokal-linkverkuerzer",
    name: "Linkverkürzer",
    description: "Abgeschaltet — die Kurzlinks laufen jetzt über das QR-Modul.",
    url: "https://kurz.localtest.me",
    category: KATEGORIE_TOOLS,
    tags: ["Archiv"],
    isPublic: true,
    isActive: false,
    sortOrder: 52,
  },

  // ------------------------------------------------------------- Verwaltung
  {
    slug: "lokal-mitglieder",
    name: "Mitgliederverwaltung",
    description: "Stammdaten, Beiträge und Austrittsmeldungen.",
    url: "https://mitglieder.localtest.me",
    category: KATEGORIE_VERWALTUNG,
    tags: ["Mitglieder"],
    requiredGroups: [GRUPPE_VERWALTUNG],
    isPublic: false,
    sortOrder: 60,
  },
  {
    slug: "lokal-abrechnung",
    name: "Abrechnung Sanitätsdienste",
    description: "Rechnungsstellung für abgeleistete Sanitätsdienste.",
    url: "https://abrechnung.localtest.me",
    category: KATEGORIE_VERWALTUNG,
    tags: ["Abrechnung"],
    requiredGroups: [GRUPPE_VERWALTUNG, GRUPPE_SUITE_ADMIN],
    isPublic: false,
    sortOrder: 61,
  },
];

/**
 * Legt den lokalen Servicekatalog an. Idempotent PRO ZEILE über den eindeutigen
 * `slug` (`onConflictDoNothing`) — nicht über ein gemeinsames Gate: ein
 * abgebrochener Lauf ergänzt sich beim nächsten selbst, statt dauerhaft
 * unvollständig zu bleiben.
 *
 * Liefert Protokollzeilen für das aufrufende Skript.
 */
export async function seedLokalPortal(
  db: BetterSQLite3Database<typeof schema>,
): Promise<string[]> {
  let angelegt = 0;
  for (const dienst of LOKALE_DIENSTE) {
    const ergebnis = db
      .insert(schema.services)
      .values(dienst)
      .onConflictDoNothing()
      .run();
    if (ergebnis.changes > 0) angelegt++;
  }

  const uebersprungen = LOKALE_DIENSTE.length - angelegt;
  const kategorien = [...new Set(LOKALE_DIENSTE.map((d) => d.category))].join(", ");
  const alleGruppen = [GRUPPE_EINSATZ, GRUPPE_AUSBILDUNG, GRUPPE_VERWALTUNG].join(",");

  return [
    `portal: ${angelegt} Dienste angelegt, ${uebersprungen} bereits vorhanden (${LOKALE_DIENSTE.length} insgesamt).`,
    `portal: Kategorien — ${kategorien}.`,
    "portal: 2 Dienste sind inaktiv (nur in der Verwaltung sichtbar), 1 öffnet im selben Tab.",
    "portal: http://portal.localtest.me:3000/ — ohne Gruppen sieht man nur die öffentlichen Kacheln.",
    `portal: Dev-Login http://portal.localtest.me:3000/login mit groups=${alleGruppen} zeigt alle geschützten Kacheln.`,
    `portal: Dev-Login mit groups=${GRUPPE_SUITE_ADMIN} öffnet zusätzlich http://portal.localtest.me:3000/admin (Liste inklusive der inaktiven Dienste).`,
  ];
}
