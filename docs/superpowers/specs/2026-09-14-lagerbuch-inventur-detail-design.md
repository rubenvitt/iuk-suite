# Lagerbuch — Inventur detaillierter (DRK-299)

**Datum:** 2026-09-14 · **Branch:** `claude/drk-299-817c5b` · **Basis:** `origin/main` (5daec826) ·
**Ticket:** DRK-299 unter Epic DRK-292

Die Gesprächsnotiz lautete nur „Inventur detaillierter!". Das Ticket war ausdrücklich nicht
umsetzungsreif; die offenen Fragen sind in dieser Sitzung mit dem Betreiber geklärt worden
(Kommentare auf dem Ticket). Kernsatz des Betreibers: **„Ich kann ja nur Zahlen eintragen."**

## Stand vor dieser Änderung

* `/verwaltung/inventur` ist eine Tabelle über **alle aktiven Artikel**: Artikel, Fach,
  Bestand, Abweichung, Ist mit ±. Dazu ein Pflichtkommentar. Gezählt wird **nur der Handlager**.
* Gezählt wird **je Artikel**. Bei Mehrbestand bucht `inventurKorrektur` auf die jüngste Charge
  des Artikels — die Charge ist **geraten** (`schreibpfade/korrektur.ts:15-27`).
* Gebucht werden nur angefasste Zeilen, und von denen nur die mit Differenz
  (`_actions/inventur.ts:68`, `if (diff === 0) continue`).
* **Einen Lauf gibt es nicht als Datensatz.** Übrig bleiben Korrekturzeilen im Journal mit
  gemeinsamer Referenz `inventur:<id>`, die niemand ausliest. Ein Lauf ohne Abweichung
  hinterlässt **nichts**.

## Betreiberentscheidungen

**E1 — Beides, Schwerpunkt Erfassung.** Erfassung wird detaillierter, und abgeschlossene Läufe
bekommen eine Übersicht.

**E2 — Filter optional.** Kategorie und Fach, leer heißt „alles zählen" wie heute.

**E3 — Zählung je Charge optional, als aufklappbare Zeile.** Nicht als Schalter für den ganzen
Lauf. Im System fehlende, im Regal gefundene Chargen lassen sich dort ergänzen.

**E4 — MHD und Mindestbestand in der Zeile.**

**E5 — Nur Handlager.** Fahrzeuge zählt weiter der Fahrzeug-Check; die Gleichstellung ist DRK-303.

**E6 — Eigene Speicherung je Lauf**, nicht aus dem Journal rekonstruiert. Verworfen, weil eine
Rekonstruktion aus `buchungen.referenz` einen Lauf ohne Abweichung gar nicht und einen
vollständigen Lauf mit zwei Abweichungen als „2 Positionen" zeigte — plausibel und still falsch.
Folge: nur künftige Läufe erscheinen im Verlauf.

## A — Zählzeile und Filter

### Zeile

Neu je Artikelzeile: **nächstes MHD** (FEFO-nächste Charge mit Handlager-Rest > 0) mit Ampel
wie in der Artikelliste, und **Mindestbestand**. Die Ampel wird **serverseitig** berechnet und
als Zeichenkette übergeben (`"gruen" | "gelb" | "rot"`), damit das Formular keine Uhr und
keine Schwellen braucht.

### Lesepfad

Neu: `_lib/lesepfade/inventur.ts` → `inventurZeilen(db, now)`. Er liefert je aktivem Artikel
die bisherigen Felder plus `kategorie`, `mindestbestand`, `naechstesMhd` und
`chargen: { id, chargenNr, verfall, rest, ampel }[]` (nur Rest > 0 am Handlager, FEFO-sortiert).
**Drei Abfragen, kein N+1** — dasselbe Muster wie `artikelListe` (Artikel, `restJeCharge`,
alle Chargen). `page.tsx` reicht nur diese serialisierbare Projektion an die Client-Insel
(Falle 6, Falle 9).

### Filter

Über der Tabelle zwei Mehrfachauswahlen: **Kategorie** (Optionen über `kategorieOptionen`,
Schlüssel über `kategorieSchluessel` — die Faltung aus DRK-294, nicht nachgebaut) und **Fach**
(die vorhandenen Fachwerte, exakt). Beide leer = alle Zeilen. Artikel ohne Kategorie erscheinen
nur, wenn kein Kategorienfilter gesetzt ist.

Das Prädikat ist eine reine Funktion in `_lib/inventurFilter.ts` (kein `"use client"`), unit-getestet.

**Regel: der Filter blendet aus, er verwirft nicht.** Gezählte Werte einer ausgeblendeten Zeile
bleiben im Zustand und werden mitgebucht. Sind gezählte Zeilen ausgeblendet, steht über dem
Abschlussknopf „N gezählte Positionen sind ausgeblendet". Ohne diesen Hinweis buchte der Knopf
etwas, das man nicht sieht; ohne das Behalten ginge Zählarbeit beim Umschalten des Filters
verloren.

Der Filter wird **nicht** je Konto gespeichert (anders als die ausgeblendeten Kategorien der
Artikelliste). Er wird beim Abschluss als **beschreibender** Umfang am Lauf abgelegt (§C).

## B — Zählung je Charge

### Bedienung

* Jede Artikelzeile ist aufklappbar (antd `expandable`). Aufgeklappt: je Charge aus
  `chargen` eine Unterzeile mit Chargennummer, MHD mit Ampel, erwartet (Rest), Ist mit ±.
* Darunter **„Charge ergänzen"**: MHD (Monat, Pflicht — dieselbe Monatseingabe und
  `MONAT_REGEX` wie im Wareneingang), Chargennummer (optional), Ist (≥ 1). Mehrere Ergänzungen
  je Artikel sind möglich, jede lässt sich wieder entfernen.
* **Je Artikel gilt genau ein Modus.** Solange keine Charge angefasst und nichts ergänzt ist,
  zählt das Artikelfeld wie heute. Sobald eine Charge angefasst oder ergänzt ist, wird das
  Artikelfeld zur schreibgeschützten Summe (Rest der nicht angefassten Chargen + gezählte +
  ergänzte), und ein zuvor eingegebener Artikelwert verfällt. Ein Knopf „Chargenzählung
  verwerfen" setzt den Artikel auf unberührt zurück.
* Bediendichte 44px auch in den Unterzeilen — **kein `size="small"`** (Falle 4; der Kommentar
  in `InventurForm.tsx` gilt weiter).

### ⚠️ Die Kernregel: nicht angefasst bleibt unverändert

**Eine nicht angefasste Charge eines aufgeklappten Artikels wird nicht gebucht und nie
implizit auf 0 gesetzt.** Das ist dieselbe Konvention wie heute auf Artikelebene (1:1-Pflicht 21,
`docs/lagerbuch-portierung-analyse.md:940`): die Inventur sendet nur Angefasstes und rechnet
gegen den Live-Bestand. Eine „fehlende = 0"-Regel machte jede parallele Entnahme still
rückgängig. Wer eine Charge nicht im Regal findet, setzt sie **ausdrücklich** auf 0.

### Nutzlast

```ts
positionen: Array<
  | { art: "artikel"; artikelId: string; ist: number }
  | {
      art: "chargen";
      artikelId: string;
      chargen: { chargeId: string; ist: number }[];         // nur angefasste
      neu: { verfall: string; chargenNr?: string; ist: number }[];
    }
>
```

Schema-Regeln (zod, `_actions/inventur.ts`):

* `ist`: ganzzahlig, 0 … 99 999 (wie heute); bei `neu` 1 … 99 999.
* `art: "chargen"` braucht mindestens eine Charge **oder** eine Ergänzung.
* `artikelId` höchstens einmal über alle Positionen; `chargeId` höchstens einmal je Position;
  zwei `neu`-Einträge mit gleichem Schlüssel (s. u.) in einer Position werden abgewiesen.
* `chargenNr`: getrimmt, leer → `CHARGE_INVENTUR`; Längengrenze wie im Wareneingang.

`positionenAus` im Formular wird entsprechend erweitert und bleibt eine reine, getestete Funktion.

### Server

`inventurKorrektur` behält Name, Guard (`requireLagerbuchAdmin`), Audit-Kontext und die eine
Transaktion. Der **Artikelweg bleibt unverändert** (Live-Bestand je Artikel, FEFO-Abgang bzw.
geratene Charge beim Plus). Neu ist der Chargenweg, je Position:

1. `restJeChargeFuerArtikel(tx, artikelId, HANDLAGER_ID)` frisch lesen.
2. Je `chargen[i]`: die Charge muss existieren **und** `artikelId` gehören, sonst wird der ganze
   Lauf abgewiesen (Meldung: „Eine Charge passt nicht mehr zum Artikel. Bitte die Seite neu
   laden."). `diff = ist − liveRest`.
   * `diff < 0` → **eine** Buchung `typ: "korrektur"`, `menge: diff` auf **genau diese** Charge —
     kein FEFO, denn die Charge ist gezählt, nicht geraten. Kappen ist nicht nötig:
     `ist ≥ 0` und `liveRest` ist der Rest dieser Charge, der Bestand bleibt ≥ 0 (I2).
   * `diff > 0` → eine Buchung `+diff` auf genau diese Charge.
   * `diff = 0` → keine Buchung, aber eine gespeicherte Position (§C).
3. Je `neu[j]`: Schlüssel ist (`artikelId`, `chargenNr` nach Trim/Vorgabe, `verfall`). Gibt es
   Chargen mit diesem Schlüssel, wird die **jüngste** wiederverwendet (`createdAt` absteigend,
   `id` absteigend — derselbe Tiebreak wie `korrektur.ts`); sonst wird eine Charge mit **echtem
   MHD** angelegt (kein `PSEUDO_VERFALL`). Dann wie Schritt 2 mit `liveRest` dieser Charge.
   Taucht dieselbe Charge schon unter `chargen` auf, wird der Lauf abgewiesen (doppelt gezählt).
4. Alle Buchungen tragen `referenz: inventur:<laufId>` und den Kommentar.

Rückgabe: `{ korrigiert: number; inventurId: string }`. `korrigiert` ist die Zahl der
**gespeicherten Positionen mit Differenz ≠ 0** — nicht die Zahl der Buchungszeilen, denn ein
FEFO-Abgang im Artikelmodus schreibt je berührter Charge eine Zeile. Im Artikelmodus ist das
dieselbe Zahl wie heute. Die Erfolgsmeldung verlinkt den Lauf.

**Nicht berührt:** `korrekturAufLagerort`, der Fahrzeug-Check und `lagerort_verfall`. Die dort
dokumentierte geratene Charge mit ihrer Kompensation bleibt, wie sie ist; diese Änderung macht
nur den Handlager-Pfad genauer, und nur für aufgeklappte Artikel.

## C — Speicherung und Verlauf

### Migration `0006_inventuren.sql` (handgeschrieben)

Handgeschrieben wie 0005, weil `drizzle-kit generate` die Audit-Trigger aus 0004 nicht kennt.

```sql
CREATE TABLE `inventuren` (
  `id` text PRIMARY KEY NOT NULL,
  `ts` integer NOT NULL,
  `quelle_typ` text NOT NULL,
  `quelle_id` text NOT NULL,
  `kommentar` text NOT NULL,
  `umfang` text            -- JSON {kategorien:string[], faecher:string[]}; NULL = vollständig
);
CREATE TABLE `inventur_positionen` (
  `id` text PRIMARY KEY NOT NULL,
  `inventur_id` text NOT NULL REFERENCES `inventuren`(`id`),
  `artikel_id` text NOT NULL REFERENCES `artikel`(`id`),
  `charge_id` text REFERENCES `chargen`(`id`),   -- NULL = gezählt je Artikel
  `erwartet` integer NOT NULL,
  `gezaehlt` integer NOT NULL
);
CREATE INDEX `idx_inventur_positionen_lauf` ON `inventur_positionen` (`inventur_id`);
```

* **Append-only** für beide Tabellen, Trigger nach dem Muster von `0001_append_only.sql`.
* **Audit:** beide `mode: "audited"` im Katalog `core/audit/catalog.ts`, mit den drei Triggern
  (create/update/delete) nach dem Muster von `buchungen` in 0004 — `buchungen` ist das Vorbild
  für „append-only und auditiert". `catalog.test.ts` erzwingt die Entscheidung. ⚠️ Das `WHEN`
  des Update-Triggers zählt **jede** Spalte einzeln auf (vgl. 0005) — alle sechs Spalten beider
  Tabellen; eine fehlende Spalte ist eine Änderung, die nie protokolliert wird, und das still.
* Eintrag in `meta/_journal.json`; Drizzle-Schema in `_db/schema.ts`.
* **Dreieck:** das Modul ist in `MODULE_MIGRATIONS` registriert, und das `Dockerfile` kopiert das
  ganze Verzeichnis `lagerbuch/_db/migrations` (Zeile 63) — keine neue `COPY`-Zeile nötig. Der
  Container-Start wird trotzdem im Plan geprüft.

### Was gespeichert wird

* **Die Lauf-ID ist die ID in `referenz: inventur:<id>`.** Journal und Lauf sind damit verbunden;
  das Präfix bleibt Vertrag (1:1-Pflicht 12), nur die ID hat jetzt einen Datensatz.
* **Jede angefasste Position**, auch mit `diff = 0`: Artikelmodus eine Zeile mit
  `charge_id = NULL`; Chargenmodus je gezählter und ergänzter Charge eine Zeile.
* `erwartet` ist der **Live-Bestand in der Transaktion**, nicht der Seitenstand — im Artikelmodus
  der Handlager-Bestand des Artikels, im Chargenmodus der Handlager-Rest **dieser einen Charge**
  (bei einer neu angelegten Charge 0). `gezaehlt` ist `ist`. Die Differenz wird nicht
  gespeichert, sondern auf der Detailseite je Zeile als `gezaehlt − erwartet` abgeleitet.
* `umfang` ist der Filter **zum Zeitpunkt des Abschlusses** und rein beschreibend.
* Lauf und Positionen entstehen in derselben Transaktion wie die Buchungen — alles oder nichts.

### Seiten

* **`/verwaltung/inventur/verlauf`** — Tabelle der Läufe, neueste zuerst, Grenze als Konstante
  in `_lib/grenzen.ts`: Datum, Person (über `quelleAufloeser` aus `_db/quelle`, wie das
  Journal), Kommentar, Umfang („vollständig" oder die Filterwerte), gezählte Positionen,
  Abweichungen. Leertext nennt den nächsten Schritt.
* **`/verwaltung/inventur/verlauf/[id]`** — Kopf des Laufs und Positionen: Artikel, Charge
  (Nummer, MHD) oder „je Artikel", erwartet, gezählt, Differenz als Chip. Chargenzeilen
  gruppiert unter ihrem Artikel. Unbekannte ID → `notFound()`.
* Zugriff wie die Inventur (Verwaltungsbereich, Lagerbuch-Admin). Die ID aus der URL ist
  unbedenklich: Läufe gehören dem Modul, nicht einer Person — es gibt keine Zugehörigkeit,
  die zu prüfen wäre.
* Einstieg: Link „Verlauf" im Seitenkopf der Inventur; kein neuer Navigationseintrag. Der
  aktive Navigationszustand für die Unterroute wird im Plan geprüft.
* Tabellen mit `render`-Funktionen in eigenen `"use client"`-Komponenten mit serialisierbaren
  Props (Falle 9); kein Compound-Zugriff auf antd in den Server Components (Falle 1).

## Release Notes

Eine Notiz unter `portal/_lib/neuigkeiten/notizen/lagerbuch/`, `datum` = Rollout-Tag. Entwurf:

> **Inventur je Charge und mit Verlauf**
>
> In der Inventur klappst du einen Artikel auf und zählst je Charge; eine im Regal gefundene
> Charge ergänzt du dort mit ihrem MHD. Filter nach Kategorie und Fach begrenzen die Liste.
>
> Unter Inventur → Verlauf siehst du jede abgeschlossene Inventur mit allen gezählten Positionen.

Grenzen (`NOTIZ_GRENZEN`) prüft `register.test.ts`.

## Tests

**Vitest**

* `inventurFilter`: leer lässt alles durch; Kategorie gefaltet; Artikel ohne Kategorie nur ohne
  Kategorienfilter; Fach exakt; beide UND-verknüpft.
* `positionenAus`: Artikelmodus; Chargenmodus nur mit angefassten Chargen; Wechsel verwirft
  den Artikelwert; ausgeblendete gezählte Zeilen bleiben enthalten.
* `inventurKorrektur`:
  * nicht angefasste Charge eines aufgeklappten Artikels bleibt unverändert;
  * Minus/Plus buchen auf genau die gezählte Charge;
  * fremde bzw. unbekannte `chargeId` → ganzer Lauf abgewiesen, **nichts** geschrieben;
  * Ergänzung legt Charge mit echtem MHD an; gleicher Schlüssel → Wiederverwendung;
  * Position mit `diff = 0` wird gespeichert, ohne Buchung;
  * `erwartet` = Live-Bestand, auch wenn zwischen Laden und Absenden entnommen wurde;
  * Lauf-ID = Referenz der Buchungen;
  * doppelte `artikelId` / `chargeId` / Ergänzungsschlüssel werden abgewiesen;
  * Artikelweg unverändert (bestehende Tests bleiben grün).
* `inventurZeilen`: nur Rest > 0 am Handlager, Fahrzeugbestand fließt nicht ein.
* Migration: Append-only-Trigger greifen; Audit-Katalog grün.

**Playwright** (`e2e/lagerbuch-inventur.spec.ts`) — die Klasse, die Vitest nicht sieht:
aufklappen, eine Charge zählen, eine Charge ergänzen, filtern (gezählte Zeile ausgeblendet →
Hinweis), abschließen (**`waitForResponse`** auf die Action, Falle 10), Verlauf öffnen und
Positionen prüfen (**`klickeWennRuhig`**, Falle 12). Mindesttapfläche 44px in den Unterzeilen.
Dazu ein echter Abruf der beiden Verlaufsseiten (HTTP 200, Fallen 1/7/9).

## Nicht Teil dieser Änderung

* Inventur für Fahrzeuge oder Taschen (DRK-303, DRK-309).
* Chargen je Lagerort über den Handlager hinaus (DRK-297).
* Übernahme früherer Läufe in den Verlauf.
* Export des Verlaufs, Verlinkung aus dem Journal, gespeicherter Filter je Konto, neue Sortierung.
