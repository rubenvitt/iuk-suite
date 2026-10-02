# Kommunikationspläne — Entwurf und gebauter Stand

**Modulschlüssel `kommplan` · ClickUp DRK-500 · Entwurf 2026-09-30 · gebaut bis 2026-10-01**

Kommunikationspläne und Fernmeldeskizzen zeigen, wer im Einsatz wem untersteht und über welchen
Weg (Funkkanal, Draht, Telefon …) die Stellen einander erreichen. Heute entstehen sie in der
Excel-Vorlage „Vorlage Fernmeldeskizze.xls": je Einsatz oder Tag ein Blatt, jede Karte, jede Linie
und jedes Kanalsechseck ein frei platziertes Zeichnungsobjekt. Das Modul ersetzt das durch Daten
plus ein Layout, das sich **selbst** anordnet.

Diese Spec beschreibt den **gebauten Stand** nach fünf Phasen und der Abnahme. Warum etwas vom
ersten Entwurf abweicht, steht in den Umsetzungsplänen
`docs/superpowers/plans/2026-09-30-kommplan-phase-{1..5}.md` (Abschnitte „Entscheidungen" und
„Abweichungen bei der Umsetzung"); den Betrieb beschreibt `docs/runbooks/kommplan-inbetriebnahme.md`.

---

## 1. Anforderungen aus dem Gespräch

| # | Anforderung | Quelle |
|---|---|---|
| A1 | Pläne maximal bequem erstellen | Auftrag |
| A2 | Das Diagramm ist **immer** sinnvoll angeordnet und sieht gut aus | Auftrag |
| A3 | Bildschirm (Zoom, Einklappen) und Druck (PDF) gleichwertig | Rückfrage 1 |
| A4 | Große Bäume bis zur Stab-Lage (Kat-Fall), mit Seitenstellen | Rückfrage 2 |
| A5 | Erstellen direkt im Diagramm **und** in einer Gliederung, auf dieselben Daten | Rückfrage 3 |
| A6 | Eigene Bibliothek für Stellen, Fahrzeuge, Verbindungen; freie Angaben im Plan gleichwertig | Rückfrage 4 |
| A7 | Verteilung: Druck/PDF, Ansicht für Angemeldete, zusätzlich Token-Link ohne Anmeldung | Rückfrage 5 |
| A8 | Taktische Zeichen aus `@einsatzzeichen` | Auftrag |
| A9 | Eigene, deterministische Layout-Engine (Ansatz A) | Entscheidung |
| A10 | Logo nicht im Code; hochladbar | Nachtrag |

## 2. Was die Excel-Vorlage zeigt

Ausgewertet über einen PDF-Export aller elf Blätter (die Inhalte stecken in Zeichnungsobjekten,
nicht in Zellen).

- **Stelle als Karte:** Kopf mit Taktischem Zeichen (EL, EAL, Stab, TEL, KatSL, LtS …) und Titel,
  darunter Zeilen mit Piktogramm je Kontaktart: ◇ (Funkrufname), Digitalfunkgerät, Telefon, Handy,
  Fax, PC/E-Mail. Leere Zeilen dienen dem Handeintrag.
- **Kanal am Bus:** Ein Kanal (R_UE_2) verbindet die Einsatzleitung über **eine** Sammelleitung mit
  mehreren Einsatzabschnitten; das Sechseck sitzt auf dem Stiel. Ein zweiter Kanal (R_UE_3) derselben
  Elternstelle hat eigenen Stiel und Bus. Die Sechseckform trägt die Verbindungsart.
- **Fahrzeuge** als Spalte kleiner Kästen unter dem Abschnitt (bis 9 je Abschnitt).
- **Fernmeldeskizze:** dieselbe Struktur auf Stabsebene plus **Seitenstellen** (KatSL links über
  Draht, LtS rechts über Funk).
- **Rahmen:** A4 quer, Titel, „Stand", „VS – nur für den Dienstgebrauch", Bearbeiter, Logo.
- **Reservekanäle** stehen lose am Rand („Reserve K_UE_2").
- **Tagesfassungen** (OpenR 01./02./03.07.2022) sind Fast-Kopien.

## 3. Modulrahmen

- Neues Modul `kommplan`, Titel „Kommunikationspläne", Vollhülle, eigene SQLite-Datenbank.
- **Dreieck** (`CLAUDE.md`): `_db/migrations`, Eintrag in `MODULE_MIGRATIONS`, `COPY`-Zeile im
  `Dockerfile`. Dazu Registry-Eintrag, Icon in `ICONS` (`core/shell/icons.ts`), Seed in
  `scripts/seed-lokal.ts`, Audit-Labels und **eine** Release-Notiz für das ganze Modul.
- **`requiresAuth: false`** in der Registry, weil die Token-Ansicht (§8) ohne Anmeldung erreichbar
  sein muss — dasselbe Muster wie `feedback` und `einsatzbuch`. Den Seitenzugang setzt ein
  `_lib/zugang.ts` im Modul durch; die Arbeitsrouten liegen in der Routengruppe `(intern)`, deren
  `layout.tsx` die Prüfung **oberhalb** jeder `loading.tsx` macht (Falle 23). Bibliothek und
  Einstellungen liegen darunter in `(intern)/(verwaltung)`, deren Layout zusätzlich das
  Bearbeitungsrecht prüft; jede Seite ruft ihre Riegel trotzdem selbst noch einmal (Layouts und Seiten
  rendern parallel). Wer nicht hindarf, bekommt 404, nie 403.
- **Gruppen:** Zugangsgruppe `iuk-kommplan` (geteilte Pläne ansehen und drucken, eigene Pläne anlegen,
  bearbeiten, teilen); Admin-Gruppe `iuk-kommplan-bearbeiten` über `isModuleAdmin` (jeden geteilten Plan
  bearbeiten und verwalten, Bibliothek pflegen, Briefkopf). Was an einem einzelnen Plan erlaubt ist, entscheidet
  §8.4. Die Admin-Gruppe genügt auch für den Zugang, der Suite-Admin darf beides.
  Beide per `SUITE_ACCESS_GROUP_KOMMPLAN`/`SUITE_ADMIN_GROUP_KOMMPLAN` überschreibbar.
  `switcherGroupSources: ["access", "admin"]`.
- **Host-Riegel:** Das Modul liefert nur auf seinem eigenen Host aus (`SUITE_HOST_KOMMPLAN`, lokal
  `kommplan.localtest.me`); jede Seite, jede Route und jede Action prüft das (`_lib/host.ts`), ein anderer
  Suite-Host bekommt 404. In Produktion ist `SUITE_HOST_KOMMPLAN` deshalb Pflicht: ohne ihn antwortet das
  Modul überall mit 404. Derselbe Wert ist die Basis der Token-Links und des QR (`moduleUrl`); liefert
  `moduleUrl` nichts, stellt „Teilen" keine Links aus und der Druck trägt keinen QR (§8.2).
- **Keine Modulnavigation** in der Hülle: „Bibliothek" und „Einstellungen" (nur Bearbeitende) und
  „Archiv" (alle mit Zugang) stehen als Links im Seitenkopf der Planliste, und jede dieser Seiten führt
  mit „Alle Pläne" zurück. Eine Seitenleiste nähme dem Editor bei 1024 px rund 218 px Breite.
- Nach `core` kommt nichts: kein zweites Modul braucht Layout, Zeichen oder Planmodell. Einzige,
  begründete Ausnahme: die Antwortköpfe der Token-Ansicht setzt der Proxy (`core/routing.ts`).

## 4. Datenmodell

### 4.1 Tabellen

| Tabelle | Spalten | Schlüssel und Prüfungen |
|---|---|---|
| `plan` | `id`, `titel`, `typ` (`kommunikationsplan` \| `fernmeldeskizze`), `anlass`, `datum` (Kalendertag), `ist_vorlage`, `archiviert_am`, `version` (int, optimistisches Sperren), `aktualisiert_am`, `aktualisiert_von`, `inhalt` (JSON), `eigentuemer` (Kennung, leer nur beim Altbestand), `sichtbarkeit` (`privat` \| `organisation`) | `typ` und `sichtbarkeit` per `CHECK`, privat nur mit Eigentümer; `inhalt` muss gültiges JSON sein; `version ≥ 1`; Index über (`archiviert_am`, `aktualisiert_am`) und `eigentuemer` |
| `plan_mitglied` | `plan_id`, `nutzer` (Kennung), `name` (Anzeigename beim Einladen), `eingeladen_am`, `eingeladen_von` — wer einen geteilten Plan mitbearbeiten darf (§8.4) | Primärschlüssel (`plan_id`, `nutzer`); Index über `nutzer` |
| `kommplan_person` | `nutzer` (Kennung), `name` — wer das Modul mit Zugang geöffnet hat; Quelle der Einladungs-Suche, im Audit ausgenommen | Primärschlüssel `nutzer` |
| `bib_stelle` | `id`, `titel`, `zeichen`, `leiter`, `kontakte` (JSON), `notiz` | `kontakte` gültiges JSON |
| `bib_einheit` | `id`, `typ`, `rufname`, `zeichen`, `notiz` | — |
| `bib_verbindung` | `id`, `art`, `bezeichnung`, `notiz` | `art` per `CHECK` (die acht Arten aus §4.2) |
| `plan_freigabe` | `id`, `plan_id`, `token` (Klartext), `notiz`, `ablauf` (leer = unbegrenzt), `widerrufen_am`, `erstellt_am`, `erstellt_von`, `zuletzt_abgerufen`, `abrufe` | `token` eindeutig; `plan_id` Fremdschlüssel mit Index |
| `plan_bearbeitung` | `plan_id`, `nutzer` (Kennung der Person, nie gedruckt), `seit` — eine Zeile je Person und Plan (gebündeltes Audit, s. u.) | Primärschlüssel (`plan_id`, `nutzer`) |
| `briefkopf` | genau eine Zeile: `id` = 1, `organisation` (leer = `NULL`), `logo` (Blob, leer erlaubt), `logo_mime`, `logo_sha256`, `aktualisiert_am`, `aktualisiert_von` | `CHECK (id = 1)`; Logo vollständig (Blob, Typ aus PNG/JPEG/WebP/SVG und SHA-256 alle gesetzt oder alle leer) und höchstens 1 048 576 Byte |

`aktualisiert_am` ist der gedruckte „Stand". Zeiten rechnen über `core/zeit`; `datum` ist ein
Kalendertag (Mitternacht UTC). `aktualisiert_von` und `erstellt_von` tragen nur einen echten Anzeigenamen,
sonst eine leere Zeichenkette (die Spalten sind `NOT NULL`) — nie E-Mail-Adresse oder Kennung, denn der Name
steht auf jedem Ausdruck und in der login-freien Token-Ansicht. Ist er leer, lassen Blattfuß, Token-Kopf,
Konflikthinweis und Teilen-Flyin die Angabe weg.

`plan_freigabe` statt `freigabe`: die Audit-Oberfläche benennt Objekte nur über den Tabellennamen, und
`freigabe` gehört dort dem Einsatzbuch (Schlüsselfreigabe).

**Audit beim Autosave (gebündelt):** `inhalt`, `version`, `aktualisiert_am` und `aktualisiert_von` von `plan`
sind nicht auditiert — sonst schriebe jeder Autosave eine Zeile. Stattdessen legt das Speichern je Person und
Plan eine Zeile in der auditierten Tabelle `plan_bearbeitung` an und rückt ihr `seit` höchstens alle
15 Minuten nach — so entsteht je Person und Viertelstunde höchstens eine Audit-Zeile, auch wenn zwei Personen
abwechselnd speichern. Titel, Art, Anlass, Datum, Vorlage und Archiv bleiben einzeln auditiert. Bei
`plan_freigabe` sind nur die Abrufzähler `zuletzt_abgerufen` und `abrufe` nicht auditiert (Ausstellen =
Anlegen, Widerrufen = Ändern); beim `briefkopf` ist jede Spalte auditiert, auch das Logo. Die Tabelle
`plan_bearbeitung` und der umgebaute Trigger kamen mit Migration 0001, der Briefkopf mit 0002.

### 4.2 Planinhalt (JSON, zod, `schema: 1`)

Ein Plan ist **ein** Dokument. Duplizieren ist eine Zeilenkopie, Rückgängig ist ein Stapel von
Dokumenten, das Layout bekommt genau ein Objekt, und Umhängen eines Teilbaums ist eine Operation,
die in sich stimmig bleibt. Titel, Art, Anlass und Datum sind dagegen Spalten (§4.1): sie speichern sich
selbst und gehören nicht zum Rückgängig-Stapel (§6.6).

```ts
type PlanInhalt = {
  schema: 1;
  optionen: { leerzeilen: boolean; vermerkVsNfD: boolean; qrAufDruck: boolean; schwarzweiss: boolean };
  stellen: Stelle[];          // Baum über `eltern`; genau eine Wurzel oder mehrere Wurzeln nebeneinander
  verbindungen: Verbindung[]; // weder Weg zu einer Elternstelle noch Kanal einer Stelle = „Reserve" in der Legende
};
type Stelle = {
  id: string; eltern: string | null; lage: "unter" | "links" | "rechts"; reihenfolge: number;
  zeichen: string | null;     // Rezeptschlüssel aus dem Zeichen-Generat
  titel: string; leiter: string | null; hervorheben: boolean;
  verbindungId: string | null; // Weg zur Elternstelle (an einer Wurzel kein Weg, gezeichnet wird er nie)
  kanaele: string[];           // Kanäle ohne Gegenstelle, die die Stelle benutzt — Sechsecke unter der Karte
  kontakte: { art: KontaktArt; wert: string }[];
  einheiten: { id: string; typ: string; rufname: string; zeichen: string | null }[];
};
type KontaktArt = "funkrufname" | "digitalfunk" | "telefon" | "mobil" | "fax" | "email" | "sonstiges";
type Verbindung = { id: string; art: VerbindungsArt; bezeichnung: string };
type VerbindungsArt = "tmo" | "dmo" | "analogfunk" | "draht" | "telefon" | "mobil" | "fax" | "daten";
```

**Invarianten** (zod-`superRefine`, geprüft beim Speichern): IDs eindeutig; `eltern` zeigt auf eine
existierende Stelle; kein Zyklus; Seitenstellen (`lage ≠ "unter"`) haben keine Kinder und nie
`eltern = null`; `verbindungId` und jeder Eintrag von `kanaele` zeigen auf eine existierende Verbindung,
kein Kanal steht doppelt an einer Stelle.

**Grenzen** (`GRENZE` in `_lib/plan/schema.ts`, dieselben Zahlen an den Eingabefeldern): 500 Stellen,
200 Verbindungen, je Stelle 30 Kontakte, 60 Einheiten und 12 Kanäle, höchstens 15 Ebenen (Seitenstellen
zählen als eigene Ebene) und 800 000 Byte für das ganze Dokument — eine Server Action nimmt höchstens 1 MB an.
Feldlängen (`LAENGE`): Titel 200, Leiter 120, Kontaktwert 200, Einheitentyp 40, Rufname 80,
Verbindungsbezeichnung 60 Zeichen. Die Ebenengrenze hält die Aufteilung aufs Papier bezahlbar (§5.6).
Eine Operation, die eine Grenze überschritte, scheitert mit einem Hinweis, nie als Speicherfehler.

Die Anzeigereihenfolge der Kontaktarten ist fest (wie die Vorlage) und unabhängig von der
Eingabereihenfolge.

### 4.3 Bibliothek

Einfügen aus der Bibliothek **kopiert** in den Plan. Im Plan gibt es danach keinen Unterschied
zwischen Bibliotheks- und freien Angaben, und ein Plan ändert sich nie still, wenn jemand die
Bibliothek pflegt. Für freie Angaben gibt es „In Bibliothek übernehmen" (§6.4). Kanäle (`kanaele`)
haben keine Bibliothek.

- **Seite `/m/kommplan/bibliothek`** (nur Bearbeitende): Reiter „Stellen | Einheiten | Verbindungen", je
  Bereich ein Suchfeld über alle Textfelder, „Neu …", eine Kartentabelle und Bearbeiten im Flyin. Gespeichert
  wird hier **ausdrücklich** („Speichern"/„Abbrechen"; Stammdatenpflege ohne Rückgängig); beim Anlegen
  zusätzlich „Speichern und nächste" (Formular bleibt offen, Fokus wieder im ersten Feld). Löschen fragt
  nach („Pläne behalten ihre Kopien.").
- **Dubletten** (Vergleich getrimmt, Leerraum zusammengezogen, ohne Groß/Klein): Stelle nach Titel, Einheit
  nach Rufname, Verbindung nach Bezeichnung **und** Art. Anlegen oder Umbenennen auf eine Dublette wird mit
  Feldfehler abgewiesen. Höchstens 2000 Einträge je Bereich, Notiz höchstens 500 Zeichen.
- **Einheiten importieren:** „Liste einfügen" (je Zeile erstes Wort Typ, Rest Rufname — derselbe Parser wie
  im Flyin) und „CSV importieren" (`Typ;Rufname[;Notiz]`, Semikolon, Felder in Anführungszeichen, Kopfzeile
  wird erkannt; UTF-8, sonst Windows-1252, wie Excel deutsche CSV speichert). Beide führen in dieselbe Vorschau
  mit Status je Zeile („neu", „schon in der Bibliothek", „doppelt in der Liste"); ein Fehler mit
  Zeilennummer verhindert die ganze Übernahme, nichts wird still gekürzt. Höchstens 500 Zeilen je Import; der
  Server prüft Dubletten in derselben Transaktion erneut und meldet „n angelegt, m übersprungen".

### 4.4 Briefkopf (Logo und Organisation)

Logo und Organisationsname stehen **nicht im Code**, sondern werden hochgeladen bzw. eingetragen
(A10). Ohne Eintrag bleibt die Stelle im Kopf leer; es gibt keinen eingebauten Ersatz. Einzige
Ausnahme ist der lokale Seed (`pnpm seed:lokal`, e2e): er trägt den Namen „Musterorganisation" ohne Logo ein,
damit lokale Ausdrucke den Kopf zeigen. Am Boot-Pfad läuft er nie.

- Seite `/m/kommplan/einstellungen`, nur Modul-Admin: Organisationsname, Logo hochladen,
  ersetzen, entfernen; Vorschau des Kopfes. Organisationsname und „Logo entfernen" sind Server Actions,
  das Hochladen ein eigener Route Handler (`POST /logo`, §6.1), weil eine Server Action höchstens 1 MB
  annimmt — ein 1-MB-Logo samt Multipart-Rahmen also nicht.
- Erlaubt: PNG, JPEG, WebP, SVG; höchstens 1 MB (1 048 576 Byte). Der Typ wird aus den ersten Bytes
  bestimmt, nicht aus Dateiname oder `Content-Type`. Jede Datei geht synchron im Upload durch den
  Virenscanner (`core/av`, wie `aufgaben` — per Pfad über eine Wegwerfdatei auf dem Volume `kommplan_scan`,
  Scanner über `KOMMPLAN_AV_HOST`/`_PORT`/`_TIMEOUT_MS`). Ein Befund und ein nicht erreichbarer Scanner
  lehnen beide ab (fail-closed). Gescannt werden die hochgeladenen Bytes, gespeichert die bereinigten.
- **SVG-Bereinigung nach Allowlist**, ohne DOM, mit eigenem strengem XML-Zerleger und linearer Laufzeit
  (sie läuft synchron auf dem einzigen Node-Thread):
  - DOCTYPE und ENTITY lehnen die Datei ab; Kommentare und Verarbeitungsanweisungen fallen weg.
  - Erlaubt sind nur die Elemente `svg g defs symbol use path rect circle ellipse line polyline polygon text
    tspan title desc linearGradient radialGradient stop clipPath mask pattern image style`. Alles andere —
    `script`, `foreignObject`, `a`, Animationen, jedes Element mit Präfix — fällt samt Inhalt weg.
  - `on*`-Attribute fallen. `href` nur als `#id` bzw. an `image` als eingebettetes Rasterbild
    (`data:image/png|jpeg|webp;base64,…`); ohne gültigen Verweis fällt das `use`/`image` ganz. Jeder Wert mit
    `javascript:` (auch mit Steuerzeichen dazwischen) fällt.
  - Präsentationsattribute, `style` und `<style>` gehen je Deklaration durch eine Eigenschaften-Allowlist;
    vor jeder Klammer muss eine erlaubte CSS-Funktion stehen (`url(#…)` nur lokal, Farbfunktionen,
    Transformationen) — `image-set()` und andere Funktionen mit einer URL als Zeichenkette fallen. Kein `@`,
    kein Backslash. `<style>` bleibt erhalten (Illustrator-Logos färben über Klassen), über 64 KB wird er
    abgelehnt. Es fällt immer nur die Deklaration bzw. das Attribut, nicht das Logo.
  - An der Wurzel setzt die Bereinigung `preserveAspectRatio="xMaxYMid meet"`, damit ein SVG-Logo wie ein
    Rasterbild rechtsbündig in der Logo-Box steht.
  - Ungültig nach der Bereinigung (kein `svg`-Wurzelelement, weder `viewBox` noch Breite und Höhe, nichts
    mehr zu zeichnen) → Ablehnung. Die Bereinigung ist idempotent.
- Eingebettet wird das Logo als `data:`-URI in **einem** `<image id="kp-logo">` in den `<defs>` der Druckseite;
  jedes Blatt verweist per `<use>` darauf. So braucht weder der Druck noch die Token-Ansicht eine eigene
  Bildroute, ein SVG-Logo führt dort nie Skript aus, und viele Blätter tragen das Logo nicht vielfach.
- Hochladen, Ersetzen und Entfernen gehen ins Audit-Log.

## 5. Layout

`layout(inhalt, ziel) → { karten, linien, sechsecke, einheiten, seiten }` ist eine **reine,
synchrone Funktion** in `_lib/layout/`. Server (Druck, Token-Ansicht) und Client (Editor) teilen
sie. Gleiche Daten ergeben immer dasselbe Bild. `ziel` ist `bildschirm` oder ein Papierformat
(`a4-quer`, `a3-quer`).

### 5.1 Karte

- Feste Breite (46 mm bei Maßstab 1); nur die Höhe wächst.
- Kopf: Zeichen links; rechts Titel in 9,5 pt fett (Umbruch bis 3 Zeilen, danach Kürzung mit vollem
  Text im Tooltip bzw. in der Gliederung), darunter Leiter. Passt ein einzelnes Wort nicht in die Zeile,
  schrumpft die Titelschrift in halben Punkten bis 8 pt; was selbst dann nicht passt, bricht hart mit „-"
  um. Kontaktwerte (Rufnummern) brechen ohne Strich, dort wäre er eine falsche Ziffer.
- Eine Karte ohne Titel druckt eine leere Titelzeile in Mindesthöhe (Handeintrag, §2); der Platzhalter
  „(ohne Titel)" steht nur im Tooltip und in Bildschirmbeschriftungen, nie auf dem Papier.
- Kontaktzeilen mit Piktogramm, nur belegte — oder alle, wenn `optionen.leerzeilen`.
- Textbreiten aus `ARIMO_TEXT_METRICS` (über das Generat, §7); gerendert wird in Arimo. Keine
  DOM-Messung, damit Server und Client dasselbe rechnen. Kleinste Schrift der Zeichnung bei Maßstab 1
  ist 8 pt.

### 5.2 Ebenen, Busse, Teilbäume

- Jede Baumtiefe ist eine Zeile; alle Karten einer Zeile sind **oben bündig**. Zeilenhöhe = höchste
  Karte plus Einheitenspalte der Zeile.
- Von der Elternstelle führt ein senkrechter Stiel nach unten; darauf das Sechseck der Verbindung
  (Form je Art, Piktogramm aus dem Katalog, Beschriftung); darunter der waagerechte Bus mit einer
  Abzweigung je Kind.
- Geschwister mit derselben Verbindung stehen **zusammenhängend**; die Gruppen sortieren nach der
  kleinsten `reihenfolge` ihrer Mitglieder. Jede Gruppe hat eigenen Stiel und Bus.
- Kinder ohne Verbindung hängen an einer dünnen Linie ohne Sechseck.
- Teilbäume nach Reingold-Tilford mit Konturen: schmale, tiefe Teilbäume schieben sich zusammen;
  jede Elternstelle steht mittig über ihrer Busspanne. Kreuzungen sind konstruktionsbedingt
  ausgeschlossen.
- Mehrere Gruppen: jede hat ab der Kartenunterkante einen eigenen Stiel; die Stiele knicken
  gestaffelt (äußere Gruppen höher), damit sie sich nicht kreuzen. Tragen Kanäle oder Einheiten die
  Kartenmitte darunter, laufen die Stiele in einer Gasse links unter der Piktogrammspalte; Kanäle und
  Einheiten beginnen rechts davon. Die Linie der Kanal-Sechsecke steht dort deutlich abgesetzt
  neben den Busstielen, damit sie nicht als weiterer Bus liest.
- Kanäle einer Stelle (`kanaele`) sind Sechsecke an einer eigenen senkrechten Linie unter der Karte,
  über den Einheiten, ohne Bus.

### 5.3 Seitenstellen

Links oder rechts auf Kopfhöhe der Elternstelle, verbunden über eine waagerechte Linie mit dem
Sechseck in der Mitte. Seitenstellen sind Blätter (§4.2). Ihr Platzbedarf geht in die Kontur des
Teilbaums ein, damit Nachbarn nicht hineinragen. Mehrere Seitenstellen derselben Seite stehen
untereinander an einer gemeinsamen senkrechten Schiene; die erste auf Kopfhöhe der Elternstelle.

### 5.4 Einheiten

Spalte kleiner Kästen unter der Karte (Typ + Rufname, optional Zeichen). Ab 10 Einheiten zwei
Spalten.

### 5.5 Breite Ebenen

Überschreitet die Kinderreihe einer Stelle ein Breitenbudget, brechen Kinder **in mehrere Reihen
unter demselben Bus** um (Kamm). Gemessen wird die Breite der ganzen Kinderreihe über alle Busgruppen
(samt Seitenstellen und Einheitenspalten der Kinder); solange sie das Budget überschreitet, schrumpft
die breiteste kämmbare Gruppe (Gleichstand: die frühere). Kämmen dürfen nur Gruppen, deren Kinder keine
sichtbaren Unterstellen haben. Das Budget ist die Blattbreite bei Mindestmaßstab; der Bildschirm nimmt
das von A3. Ein A3-Blatt probiert zusätzlich das Budget von A4 und nimmt den größeren Maßstab — sonst
bliebe eine breite Ebene auf A3 einreihig bis genau zur Mindestschrift und druckte kleiner als auf A4.
Keine globale Optimierung, damit eine zusätzliche Stelle das Bild nicht umwirft.

### 5.6 Papier

1. Auf die Seite skalieren, bis zur Mindestschrift von 6 pt.
2. Reicht das nicht: aufteilen. Blatt 1 zeigt die oberen Ebenen; große Teilbäume erscheinen dort
   als Verweiskarte „→ Blatt n". Jeder solche Teilbaum bekommt ein eigenes Blatt, mit seiner
   Elternstelle grau als Anker. Geschnitten wird von der tiefsten Ebene her, je Ebene gierig nach
   Teilbaumgröße, bis das Blatt passt; das gilt rekursiv für jedes Teilblatt. Hat ein Blatt ohne Anker
   mehrere Wurzeln, sind die Wurzeln selbst Kandidaten. Die Blätter sind in Lesereihenfolge nummeriert.
   Die Aufteilung ist deterministisch; ihren Aufwand begrenzt ein Budget gezeichneter Karten je Plan (ist es
   aufgebraucht, bleibt der Rest ungeteilt), das Ergebnis merkt sich der Server je Inhalt, Format und QR.
3. Jedes Blatt trägt Kopf (Titel, Anlass, Datum, Organisation/Logo aus dem Briefkopf §4.4), Fuß (VS-NfD-Vermerk
   abschaltbar, Stand, Bearbeiter, „Blatt x von y") und die Legende der verwendeten
   Verbindungsarten samt Reservekanälen. Im Kopf steht rechts oben die Logo-Box (40 × 11 mm, Seitenverhältnis
   gehalten, rechtsbündig), links daneben rechtsbündig die Organisation (höchstens 80 mm). Der Plantitel
   schrumpft in halben Punkten bis 10 pt und wird danach mit „…" gekürzt; im Untertitel wird der Anlass mit
   „…" gekürzt, das Datum bleibt. Nichts läuft unter Organisation oder Logo; ohne Briefkopf steht dort nichts,
   auch kein Rahmen.
4. Mit QR (§8.2) ist nur die Ecke unten rechts gesperrt (24 mm samt Beschriftung): berührt ein Element
   der Zeichnung sie, wird so weit verkleinert, bis keines sie berührt. Einen Link auszustellen kann
   deshalb Maßstab und Blattzahl eines Ausdrucks ändern. Ohne QR ist das Blatt bytegleich zu einem Plan ohne
   Link.

### 5.7 Bildschirm

Dasselbe Layout mit Zoom und Verschieben (Maus, Touch, Tastatur). Im Editor gehören die Pfeiltasten dem
Wandern durch den Baum (§6.3); per Tastatur bleiben dort Zoom (+, −, 0) und dass die gewählte Stelle ins
Bild rückt. Jede Stelle ist einklappbar und zeigt dann ein Abzeichen „+n Stellen". Eingeklappt ist
Ansichtszustand, nicht Planinhalt.

Die Ansicht bleibt **eingepasst**, bis man selbst zoomt, verschiebt oder das Rad benutzt; bis dahin passt
sie sich jedem neuen Layout an (im Editor höchstens bis 4 px/mm, damit eine einzelne Karte nicht die Fläche
füllt) und gleitet dabei wie die Karten. „Einpassen" und `0` kehren zurück. Im Editor hält das Einpassen oben
Platz für die Auswahlleiste und unten für den Hinweisplatz frei, und ein offenes Flyin zählt nicht zur Fläche
— eingepasst liegt nie ein Planelement unter Leiste, Hinweis oder Flyin.

## 6. Editor

### 6.1 Routen

| Route | Inhalt | Wer |
|---|---|---|
| `/m/kommplan` | Planliste: „Pläne", darunter „Vorlagen" (Titel, Typ, Datum, Stand); „Neu" und Zeilenaktionen (§6.7); im Seitenkopf „Bibliothek", „Einstellungen", „Archiv" (§3) | Zugang; „Neu" und Zeilenaktionen nur Bearbeitende |
| `/m/kommplan/p/[id]` | Editor (Bearbeitende) bzw. Betrachter (Zugangsgruppe; archivierte Pläne für alle nur lesbar, §8.3). `?ansicht=diagramm\|gliederung` hält die gewählte Ansicht (§6.2), `?kopie=…` zeigt nach dem Duplizieren einmal den Hinweis (§6.7) | Zugang |
| `/m/kommplan/p/[id]/druck/a4`, `…/a3` | Druckrouten (§8.1); `?export=svg` öffnet ohne Druckdialog für die SVG-Dateien | Zugang; QR nur für Bearbeitende |
| `/m/kommplan/bibliothek` | Stellen, Einheiten, Verbindungen (§4.3) | Bearbeitende |
| `/m/kommplan/einstellungen` | Briefkopf: Organisation und Logo (§4.4) | Bearbeitende |
| `/m/kommplan/archiv` | Archiv: archivierte Pläne und Vorlagen, nur lesbar | Zugang; „Wiederherstellen" nur Bearbeitende |
| `/m/kommplan/t/[token]` | Token-Ansicht (§8.2); eigene 404-Seite „Dieser Link gilt nicht (mehr)." | ohne Anmeldung |
| `/m/kommplan/t/[token]/druck/a4`, `…/a3` | Token-Druck, ohne SVG-Export | ohne Anmeldung |
| `POST /m/kommplan/logo` | Route Handler: Logo hochladen oder ersetzen (§4.4). Liegt außerhalb der Routengruppe und prüft selbst: Host, Anmeldung, Bearbeitungsrecht (sonst 404), gleiche Herkunft (`Origin` gegen `x-forwarded-host`/`host`, sonst 403 — Route Handler haben die CSRF-Prüfung der Actions nicht), Größe (früh über `content-length`), Typ aus den ersten Bytes, Virenscan | Bearbeitende |

Am Modul-Host fehlt das Präfix `/m/kommplan` (die Planseite ist dort `/p/[id]`); die Planseiten liegen
unter `p/`, damit eine Plan-ID nie mit `bibliothek`, `archiv` oder `einstellungen` kollidiert und kein
dynamisches Segment unter der Modulwurzel Anfragen wie `/robots.txt` abfängt.

Die Plan-ID wird in jeder Server Action und jeder Seite aus der Datenbank aufgelöst (IDOR, `CLAUDE.md`).

### 6.2 Rahmen

Kopfleiste: Rückweg „Alle Pläne", Titel mit Angabenzeile (Art · Anlass · Datum · Stand), Umschalter
**Diagramm | Gliederung**, Rückgängig/Wiederholen, „Plan und Verbindungen", „Teilen", „Drucken" (geteilter
Knopf: der Knopf druckt A4 quer, der Pfeil daneben bietet „A4 quer", „A3 quer" und die Gruppe „SVG-Dateien"),
Speicherstatus. Arbeitsfläche füllt den Rest; bearbeitet wird im Flyin rechts (`flyinBreite()`), ohne Maske:
ab 768 px hält der Editor die Breite des Flyins frei, damit es nie über Kopfleiste oder Konflikthinweis liegt.

- **Ansicht:** Ohne Wahl öffnet der Editor unter 768 px in der Gliederung, darüber im Diagramm; das
  entscheidet CSS, damit der erste Render nie die falsche Ansicht zeigt. Eine Wahl im Umschalter steht als
  `?ansicht=…` in der Adresse (ohne Neuladen, ohne Verlaufseintrag). Beide Ansichten bleiben montiert:
  Umschalten verliert weder Zoom noch Einklappen, Auswahl, Rückgängig-Stapel oder offenes Flyin, und es
  speichert nichts.
- **Telefon (unter 768 px):** Die Handlungsknöpfe der Kopfleiste stehen **einspaltig** untereinander in voller
  Breite (`docs/design/README.md`, „Mobil"). Rückgängig und Speicherstatus stehen dort nicht in der
  Kopfleiste, sondern in einer klebenden Verlaufsleiste am unteren Rand, damit sie beim Bearbeiten im Bild
  bleiben.
- **Flyin „Plan und Verbindungen":** Angaben (Titel, Art, Anlass, Datum), die Optionen (Leerzeilen,
  VS-NfD-Vermerk, QR-Code „Aktuelle Fassung" auf dem Ausdruck, Schwarzweiß drucken) und die Verbindungen des
  Plans samt Reserve; „Verbindungen bearbeiten" unter der Legende öffnet es am Abschnitt Verbindungen.
- **Leerer Plan:** statt der Zeichnung „Dieser Plan hat noch keine Stellen." mit „Erste Stelle anlegen"
  (legt eine Wurzel an, öffnet das Flyin, Fokus im Titel).

### 6.3 Diagramm-Ansicht

- Die ausgewählte Karte trägt einen Auswahlrahmen; ihre Griffe („Bearbeiten", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts")
  stehen in einer Auswahlleiste oben in der Fläche, die eingepasst über keinem Planelement liegt (an der Karte verdeckten 44-px-Griffe Nachbarn).
- Die Leiste nennt die gewählte Stelle (unter 768 px nur im `aria-label`), bricht nie um und ist am Telefon
  waagerecht scrollbar; „Bearbeiten" steht vorn, weil das Diagramm am Telefon für kleine Korrekturen da ist
  und das Ende der Leiste dort außerhalb des Bildes liegt. An einer
  Seitenstelle stehen nur „Bearbeiten" und „+ Einheit" (Seitenstellen tragen keine Unterstellen); `N` meldet
  dort „Eine Seitenstelle trägt keine Unterstellen.".
- Ein Klick wählt eine Karte; ein zweiter Klick, Doppelklick, Enter, F2 oder „Bearbeiten" öffnen das Flyin.
- Neues Element wird sofort gesetzt, ausgewählt, Fokus im Titelfeld. Das Layout gleitet an die neue
  Position (kurze Animation, ohne bei `prefers-reduced-motion`). Eine neue Unterstelle tritt dem Bus bei:
  sie übernimmt die Verbindung der in Anzeigereihenfolge letzten Unterstelle ihrer Elternstelle (ohne
  Geschwister keine); eine neue Seitenstelle hat keine Verbindung. Esc oder X verwerfen ein per Griff
  angelegtes, unberührtes Element; Enter im Titel heißt „fertig" und behält es.
- Tastatur: ↑ zur Elternstelle, ↓ zur ersten sichtbaren Unterstelle, ←/→ zum Nachbarn in
  Anzeigereihenfolge (jede Stelle eingerahmt von ihren Seitenstellen, auch über Kammreihen hinweg); Enter
  oder F2 öffnen das Flyin, `N` neue Unterstelle, Entf löscht (Rückgängig statt Nachfrage). Andere Tasten
  tun auf der Fläche nichts — „Tippen bearbeitet den Titel" gibt es bewusst nicht, sonst legte jedes Wort mit
  N eine Stelle an. Der Bedienhinweis steht sichtbar unter der Fläche. Nach Flyin-Schließen, Löschen und
  „Erste Stelle anlegen" hat die Fläche den Fokus, wenn er sonst verloren wäre; so lautet die Schleife
  N → Titel → Enter → N.
- **Löschen** entfernt den Teilbaum samt Seitenstellen und Einheiten; Verbindungen bleiben im Plan (unbenutzt
  stehen sie in der Legende als „Reserve"). Der Hinweis nennt die Zahl der mitgelöschten Stellen und trägt
  „Rückgängig", solange nichts anderes geschehen ist.
- Hinweise (Löschen, Planregeln, Speicherfehler) liegen als Überlagerung unten mittig in der Fläche und
  schließen per X, durch den nächsten Hinweis oder die nächste strukturelle Änderung, nicht beim Tippen.
- Kein Ziehen von Karten: angeordnet wird immer automatisch (A2).

### 6.4 Flyin einer Stelle

- **Aus Bibliothek** (oben, Auswahl mit Suche): ersetzt Titel, Zeichen, Leiter und Kontakte; Einheiten, Lage
  und Verbindung bleiben. Danach Fokus im Titel.
- **Zeichen:** Suche über den Katalog-Index (Langformen wie „Rettungswagen" finden „RTW"), oben die zuletzt
  genutzten (im Browser gemerkt, höchstens 8, ergänzt um die Zeichen des Plans). Der Editor bekommt nur den
  schlanken Index; die SVGs der sichtbaren Treffer lädt eine lesende Action nach.
- **Titel, Leiter, Hervorheben.** Unter dem Titel dieselben Titelvorschläge aus der Bibliothek wie in der
  Gliederung (§6.5), hier als gewöhnliche Tabstopps; Alt+Enter nimmt den ersten.
- **Untersteht / Lage:** Auswahl; darüber läuft das Umhängen.
- **Verbindung zur Elternstelle:** vorhandene wählen, aus der Bibliothek übernehmen („Aus Bibliothek: R_UE_1 ·
  Digitalfunk TMO" legt eine Kopie im Plan an) oder neu eintippen (Bezeichnung + Art). Darunter die **Kanäle**
  der Stelle als Mehrfachauswahl.
- **Kontakte:** ein Wertfeld je Kontaktart in der festen Reihenfolge der Karte; leer heißt „kein Kontakt dieser
  Art". „Weiterer <Art>" legt eine zweite Zeile derselben Art an.
- **Einheiten:** einzeln, als Mehrfachauswahl „Aus Bibliothek" (der Suchtext bleibt nach jeder Wahl stehen;
  an dieser Stelle schon vorhandene Fahrzeuge sind gesperrt, anderswo eingesetzte tragen „— schon bei
  <Stelle>") und **„Liste einfügen"** — je Zeile erstes Wort = Typ, Rest = Rufname („RTW RK UE 40-83-5").
- **„In Bibliothek übernehmen"** legt die Stelle dort an (Titel, Zeichen, Leiter, Kontakte); gibt es sie schon,
  bietet der Hinweis „Eintrag in der Bibliothek aktualisieren". „Einheiten in Bibliothek übernehmen" übernimmt
  alle Einheiten der Stelle (Dubletten übersprungen); im Flyin „Plan und Verbindungen" übernimmt
  „Verbindungen in Bibliothek übernehmen" alle Verbindungen des Plans in einem Aufruf. So füllt der erste
  echte Plan die Bibliothek.
- Jede Kopie aus der Bibliothek ist **ein** Rückgängig-Schritt. Enter im Titelfeld schließt das Flyin
  („fertig"), die Auswahl bleibt.

### 6.5 Gliederungs-Ansicht

- Eingerückte Baumliste in **derselben Reihenfolge wie das Diagramm**: Stelle, dann ihre Seitenstellen (eine
  Ebene tiefer, mit Kennzeichen „Seitenstelle links/rechts"), dann ihre Unterstellen in Anzeigereihenfolge.
  Je Zeile Zeichenknopf, Titel, Verbindung, Einheitenzahl und „⋯"; ↑/↓ wandern durch die Zeilen.
- **Enter** legt direkt nach der Zeile samt Teilbaum eine leere Stelle an (gleiche Elternstelle, Lage und
  Verbindung). Enter auf einer Zeile mit leerem Titel legt nichts an, sondern **rückt aus**; eine eben per Enter
  angelegte, unberührte Zeile verschwindet dabei in einem Schritt. **Tab** hängt die Stelle als letzte
  Unterstelle unter die vorige Geschwisterstelle, **Umschalt+Tab** stellt sie direkt hinter ihre Elternstelle;
  der Teilbaum wandert mit, ein unmöglicher Schritt ist ein Hinweis und der Fokus bleibt im Titel.
  **Alt+↑/↓** tauscht innerhalb der Busgruppe, am Gruppenrand wandert die ganze Gruppe — Gruppen stehen im
  Layout immer zusammenhängend, und eine Verbindung still zu ändern hieße, Daten zu erfinden.
- **Entf/Rücktaste** auf einer ganz leeren Zeile ohne Unter- und Seitenstellen löscht sie; trägt sie Angaben,
  meldet der Editor, dass es über „⋯" → „Stelle löschen" geht. Gehaltene Tasten löschen und legen nie an.
  Unberührte, per Enter angelegte Zeilen verschwinden, sobald der Fokus die Zeile verlässt.
- **Weitere Tasten im Titel:** Alt+V öffnet die Verbindung, Alt+Z das Zeichen (nach der Wahl zurück in den
  Titel), F2 oder Strg/Cmd+Enter die Details (Flyin), Esc verlässt das Titelfeld auf „⋯", Strg/Cmd+Z nimmt
  Schritte des Dokuments zurück, Alt+Enter übernimmt den ersten Titelvorschlag aus der Bibliothek. Die
  Tastenkürzel stehen in einer Bedienzeile über der Liste. Nur die aktive Zeile ist in der Tab-Folge.
- **„⋯" je Zeile** (der Weg für Maus, Touch und Telefon): „Neue Stelle darunter", „Unterstelle anlegen",
  „Seitenstelle links/rechts"; „Einrücken", „Ausrücken", „Nach oben", „Nach unten"; „Verbindung „…" für
  Geschwister ohne Verbindung übernehmen", „Details …"; „Stelle löschen".
- **Verbindung inline:** Auswahl mit Suche; „keine (dünne Linie)", die Verbindungen des Plans, Bibliotheks-
  verbindungen, und für getippten Text je Art „Neu: „<Text>“ als <Art>". Versetzt eine neue Verbindung die
  Zeile in eine andere Busgruppe, holt die Gliederung sie ins Bild und sagt es.
- **Zeichen** über einen kompakten Knopf mit Popover, **Einheiten** als Zähler („3 Einheiten"), der dieselbe
  Einheitenliste wie im Flyin aufklappt. Am Telefon zeigt nur die gewählte Zeile Verbindung und Einheiten.
- **Titelvorschläge aus der Bibliothek** nur an der aktiven Zeile, ab 2 Zeichen, höchstens 3, ohne Enter, Tab,
  Pfeile oder Esc abzufangen; übernommen per Klick oder Alt+Enter. Ein Vorschlag mit genau dem eigenen Titel
  erscheint nur, solange die Stelle weder Leitung noch Kontakte trägt.
- **Mehrzeiliges Einfügen** mit Einrückung (Tabs oder Leerzeichen) legt einen Teilbaum an. Aufzählungszeichen
  und Nummern wie `1.` oder `2.1.` mit folgendem Leerraum fallen vorn weg; sonst wird nichts geraten (auch
  „RTW RK UE 40-83-5" wird eine Stelle). Ein zu langer Titel ist ein Fehler mit Zeilennummer, dann wird nichts
  eingefügt. Die oberste Ebene wird Geschwister nach der Cursorzeile, tiefere Zeilen Unterstellen ohne
  Verbindung; das Einfügen ist **ein** Rückgängig-Schritt. Stehen eingefügte Titel genau so in der Bibliothek,
  bietet der Hinweis „Angaben übernehmen" (füllt nur seither unberührte Stellen, ein Schritt).
- Am Telefon öffnet der Editor in der Gliederung; das Diagramm bleibt über den Umschalter für kleine Korrekturen erreichbar.

### 6.6 Speichern und Rückgängig

- Autosave etwa 1 s nach der letzten Änderung über eine Server Action mit `version`-Prüfung; gesendet wird der
  dann aktuelle Stand, nie zwei Aufrufe gleichzeitig. Speicherstatus: „Gespeichert", „Gespeichert 11:05",
  „Ungespeichert", „Speichert …", „Nicht gespeichert", „Konflikt".
- Konflikt → Hinweis mit „Neu laden" oder „Meine Fassung behalten" (überschreibt den Inhalt; die Planangaben
  der anderen Fassung werden übernommen). Solange ein Konflikt offen ist, wird nicht gespeichert. Keine
  Echtzeit-Zusammenarbeit.
- Nach einem Netzfehler versucht der Editor es selbst wieder (nach 5 s, 15 s, 30 s, dann jede Minute, sofort
  beim Wiederverbinden); „Erneut versuchen" bleibt. Ungespeichertes hält das Schließen des Tabs auf. Beim
  Öffnen gleicht der Editor seinen Stand mit dem Server ab (nach Browser-Zurück zeigte er sonst einen alten
  Stand); ist der Server neuer und lokal nichts geändert, gilt still der Serverstand.
- **Planangaben** (Titel, Art, Anlass, Datum) speichern sich selbst — beim Verlassen eines Feldes, mit Enter,
  bei Art und Datum sofort — über dieselbe Warteschlange, damit die Version nie auseinanderläuft. Sie sind
  nicht Teil von Rückgängig. Die Optionen (§4.2) liegen im Dokument und laufen über Rückgängig und Autosave.
- „Drucken" aus dem Editor speichert vorher; misslingt das, schließt das Druckfenster mit Hinweis.
- Rückgängig/Wiederholen ist ein Client-Stapel von Dokumenten, gültig bis zum Neuladen.
- Alle Änderungen laufen über reine Operationen in `_lib/plan/` (`fuegeUnterstelleEin`,
  `haengeUm`, `loesche`, `fuegeGliederungEin` …), die Diagramm und Gliederung gemeinsam nutzen.

### 6.7 Vorlagen und Duplizieren

Zeilenaktionen der Planliste: unter „Pläne" „Duplizieren", „Als Vorlage speichern", „Archivieren"; unter
„Vorlagen" „Neu aus Vorlage", „Vorlage archivieren"; im Archiv „Wiederherstellen". Löschen gibt es nicht (§8.3).

„Duplizieren" kopiert den Plan, setzt das Datum auf heute (Suite-Zone) und ersetzt das erste Datum im Titel in derselben Schreibweise (sonst „ (Kopie)"). „Als Vorlage speichern" legt
eine Kopie als Vorlage an (Titel gleich, ohne Datum; der Plan bleibt unter „Pläne"); gibt es schon eine Vorlage gleichen Titels, fragt die Liste erst nach („Vorlage öffnen" oder „Trotzdem anlegen"); „Vorlage archivieren" archiviert sie; „Neu aus Vorlage" legt eine Kopie an.

- **Duplizieren:** erkannt werden `TT.MM.JJJJ`, `T.M.JJJJ`, `TT.MM.JJ` und `JJJJ-MM-TT`; ein schon heutiges
  Datum zählt nicht als ersetzt. Die Kopie ist Version 1, keine Vorlage, „Stand" jetzt; danach geht es direkt in
  ihren Editor, wo einmal ein Hinweis sagt, was gesetzt wurde (grün, wenn das Datum im Titel ersetzt wurde,
  sonst eine Warnung), mit „Angaben ändern". Während des Duplizierens ist die Zeile gesperrt (kein zweites
  Duplikat per Doppelklick).
- **Als Vorlage speichern:** Art, Anlass und Inhalt kopiert, Links nicht. Der Hinweis „Vorlage „<Titel>“ angelegt"
  trägt „Vorlage öffnen". Eine Vorlage bearbeitet man wie jeden Plan im Editor.
- **Neu aus Vorlage:** das Formular „Neuer Plan" hat das Feld „Vorlage" (Vorgabe „Leerer Plan"). Die Wahl einer
  Vorlage übernimmt Art und Anlass, setzt das Datum auf heute und — nur bei leerem Titel — deren Titel mit
  ersetztem Datum. Der Server kopiert den Inhalt einer nicht archivierten Vorlage.

## 7. Taktische Zeichen

`@einsatzzeichen/{catalog,core,schema}` (heute 1.5.0 / 3.0.0 / 3.0.0) werden **nur als
`devDependencies`** eingebunden. Befund M1 der Zeichen-Spec (2026-09-02) besteht in 1.5.0 fort:
`catalog/dist/src/fonts.js` ruft `fileURLToPath(new URL(…))` auf Modulebene auf und bricht jeden
Server-Import im Build.

- `scripts/kommplan-zeichen-generat.ts` erzeugt vier eingecheckte Dateien unter
  `kommplan/_lib/zeichen/`: `zeichen.generiert.json` (alle Rezepte mit Schlüssel, Titel, Suchtext und
  fertigem SVG; nur Server), `zeichen-sw.generiert.json` (dieselben im Druckthema, §8.1; nur Server),
  `grundlagen.generiert.json` (Kommunikationspiktogramme für die Sechsecke — `comms.voice-radio-tmo`,
  `…-dmo`, `comms.cable-construction`, `comms.fax-transmission`, `comms.data-transmission` … —, die
  Piktogramme der Kontaktarten und `ARIMO_TEXT_METRICS`; auch Browser, weil der Betrachter selbst
  rechnet) und `schrift.generiert.json` (Arimo als Base64 für den SVG-Export).
- Kontaktpiktogramme: Digitalfunk und Fax kommen aus dem Katalog; Funkrufname (Raute wie in der Vorlage),
  Telefon, Mobil, E-Mail und Sonstiges sind kleine, im Generator festgeschriebene SVGs.
- Im SVG steht jedes Zeichen **einmal** als `<symbol>` in `<defs>` und wird per `<use>`
  referenziert. Das löst M11 (doppelte IDs) ohne Präfixe je Instanz.
- Ein Test erzeugt alle vier Dateien neu und vergleicht sie Byte für Byte: nach einem
  Dependabot-Update ist die CI rot, bis das Generat neu erzeugt ist.
- Arimo per `next/font/local`; ein Test prüft die SHA der Schriftdatei gegen die des Katalogs.
- Wo der Katalog ein Zeichen der Vorlage nicht kennt (Leitstelle), bleibt die Karte ohne Zeichen; der Titel
  trägt die Aussage. Ausnahme: vier Zusatzzeichen (`zusatz:eal`, `zusatz:ea`, `zusatz:stab`,
  `zusatz:oel`), die das Generat aus dem gerenderten Rezept D.1.4 („Einsatzleitung im Einsatz") zusammensetzt,
  nur mit getauschtem Kürzel (EAL, EA, Stab, ÖEL der Vorlagen).

## 8. Ausgabe und Freigabe

### 8.1 Druck und PDF

- Druckrouten rendern jede Seite als Vektor-SVG und rufen beim Öffnen `window.print()` auf
  (Vorbild `feedback/(print)/aushang`). „Als PDF sichern" liefert das PDF.
- A4 quer und A3 quer sind **eigene Routen** (Falle 18: gemischte Seitengrößen verwirft Chromium),
  jede mit benanntem `@page` und ausgeschriebenen Kantenlängen (`297mm 210mm`, `420mm 297mm`). Eine gemeinsame
  Druckseite dient allen vier Druckrouten; am Bildschirm passt die Vorschau in die Fensterbreite und folgt
  Hell/Dunkel, das Blatt bleibt weiß.
- Option Schwarzweiß (`PRINT_MONOCHROME_THEME` als zweites Rezept-Generat): gilt für Ausdruck und SVG-Datei, am Bildschirm bleibt der Plan farbig.
  Die Zeichen tragen dann Grauwerte und Strichmuster der Organisationen, hervorgehobene Kartenköpfe werden grau,
  das Logo bekommt einen Graufilter.
- „SVG herunterladen" je Blatt auf den internen Druckseiten: eigenständige Datei mit Symbolen, Logo und Arimo als `@font-face`; Dateiname aus Titel, Datum, Blatt und Format in ASCII.
  Erreichbar ohne Druckdialog über die Gruppe „SVG-Dateien" im Druckmenü (`?export=svg`); die Schrift lädt erst
  beim Klick. Als Schriftliste steht `Arimo, Arial, "Liberation Sans", Helvetica, sans-serif` (metrisch gleich),
  damit auch Programme ohne `@font-face` gleich breit setzen. Der Token-Druck hat keinen SVG-Export.

### 8.2 Token-Link

- „Teilen" im Editor stellt Links aus: Ablauf 24 h, 7 Tage (Vorgabe), 30 Tage oder unbegrenzt;
  mehrere je Plan, je mit Notiz; einzeln widerrufbar.
- Der Ablauf ist eine Dauer ab dem Ausstellen, kein Kalendertag. Notiz höchstens 200 Zeichen, höchstens
  20 gültige Links je Plan. Abgelaufene und widerrufene Links bleiben im Flyin sichtbar (eingeklappt
  „Abgelaufen und widerrufen"), gelöscht wird keiner. Je gültigem Link zeigt das Flyin Notiz, Ablauf,
  Aussteller, Abrufe und „Link kopieren"; der neue Link steht oben mit dem Fokus auf „Link kopieren".
  Kopieren geht ohne sicheren Kontext über einen Rückfall, und schlägt auch der fehl, steht die URL markiert
  im Eintrag. Widerrufen fragt nach.
- Token: 32 Byte Zufall, base64url (43 Zeichen), **im Klartext** gespeichert, damit sich der Link jederzeit
  wieder kopieren lässt. Wer die Datenbank liest, liest ohnehin die Pläne; ein Hash schützt hier nichts. Die
  Form wird vor jeder Datenbankabfrage geprüft.
- `/m/kommplan/t/[token]`: minimale Hülle, nur lesend, derselbe Betrachter (Zoom, Einklappen), immer
  aktueller Stand, `noindex`, `Cache-Control: no-store`, VS-NfD-Vermerk und „Stand …" sichtbar.
  Muster: `docs/design/feedback-oeffentliche-ansicht.md` — mit einer bewussten Abweichung: Betrachter und
  Druckmenü sind dieselben antd-Inseln wie intern, also Bediendichte 56/72 ohne Hülle und Hover/Fokus in
  Suite-Rot; der Rahmen ist eine eigene Datei im Modul (`_ui/token/TokenRahmen.tsx`).
- Die Token-Ansicht zeigt keine Suite-Hülle, keinen App-Umschalter und keinen Weg zur Anmeldung. Kopf: Kicker
  „KOMMUNIKATIONSPLÄNE" (typneutral, ebenso der Seitentitel „Kommunikationspläne"), Organisation und Logo aus
  dem Briefkopf, Plantitel, Art · Anlass · Datum, Stand und Bearbeitung, der Vermerk und „Drucken". Die Seite ist
  so hoch wie der Schirm, der Betrachter füllt den Rest.
- Unbekannt, abgelaufen, widerrufen oder Plan archiviert → echtes 404; die Prüfung liegt im
  `layout.tsx` oberhalb jeder `loading.tsx` (Falle 23). Alle Fälle zeigen dieselbe eigene Seite „Dieser Link
  gilt nicht (mehr)." mit der Bitte, sich einen neuen Link geben zu lassen — ohne Knopf, ohne Link auf die
  Suite.
- Je Abruf `zuletzt_abgerufen` und `abrufe` (dieselbe Adresse und derselbe Link zählen binnen einer Minute einmal). Ausstellen und Widerrufen gehen ins Audit-Log. Eine Fehlversuchs-Sperre gibt es nicht: ein Token hat 256 Bit, eine Sperre schützte nichts und sperrte gültige Links mit (Abnahme). `X-Robots-Tag`, `Referrer-Policy: no-referrer` und `Cache-Control: no-store` setzt der Proxy.
- **QR auf dem Ausdruck** (Option): hat der Plan einen gültigen Link, trägt jedes Blatt unten rechts
  einen QR-Code „Aktuelle Fassung" (24 mm) — intern auf den Link mit dem spätesten Ablauf (unbegrenzt zuerst), im Token-Druck immer auf den benutzten Link; Plan-Flyin, Teilen-Flyin und Druckseite sagen, auf welchen Link und wie lange. Basis ist die Adresse des Moduls aus der Suite-Konfiguration. Den internen Ausdruck mit QR erhalten nur Bearbeitende: Der Code ist selbst der Link, und wer nur ansehen darf, behielte damit über den Entzug seiner Gruppe hinaus anonymen Zugang. Die Zugangsgruppe druckt intern ohne QR.
- Der Schalter „QR-Code „Aktuelle Fassung“ auf dem Ausdruck" steht im Flyin „Plan und Verbindungen" und im
  Teilen-Flyin (dieselbe Option). Ohne gültigen Link sagt der Editor „Ohne gültigen Link druckt der Plan keinen
  QR-Code." und bietet „Link ausstellen"; ein befristeter Link wird mit seinem Ablauf genannt („danach führt der
  Ausdruck ins Leere"). Ohne Moduladresse ist „Link ausstellen" gesperrt und sagt warum. Gemessen an echten
  Tokens ist der Code Version 8 (57 Module, 0,42 mm je Modul bei 24 mm, Fehlerkorrektur H).

### 8.3 Archiv

Pläne werden archiviert, nicht gelöscht, und sind wiederherstellbar; archiviert sind sie nur lesbar (ansehen, drucken). Ein archivierter Plan macht
seine Token-Links sofort ungültig: Archivieren widerruft sie, Wiederherstellen erweckt keinen wieder.

Archivieren und Wiederherstellen ändern den „Stand" nicht und sind je eine Audit-Zeile; „Rückgängig" im
Hinweis nach dem Archivieren holt den Plan zurück, die Links nicht. Unter `/p/[id]` zeigt ein archivierter Plan
den Betrachter mit „Archiviert am … — nur lesbar" (für Bearbeitende mit „Wiederherstellen"). Im Archiv trägt
eine Vorlage das Kennzeichen „Vorlage" und kehrt beim Wiederherstellen unter „Vorlagen" zurück. Ein im Editor
offener Plan, der anderswo archiviert wird, kann danach nicht mehr gespeichert werden und sagt das.

### 8.4 Persönliche Pläne, Teilen in der Organisation, Einladen

Nachtrag 2026-10-02. Jeder mit Zugang legt eigene Pläne an. **Privat ist die Vorgabe**: Anlegen, Duplizieren,
„Als Vorlage speichern" und Importieren legen einen privaten Plan an, der dem gehört, der ihn anlegt. Die Rechte
stehen an genau einer Stelle (`_lib/rechte.ts`):

| | sehen, drucken, exportieren | bearbeiten | verwalten (teilen, Links, einladen, archivieren) |
|---|---|---|---|
| privat | Eigentümer | Eigentümer | Eigentümer |
| geteilt | alle mit Zugang | Eigentümer, Modul-Admins, Eingeladene | Eigentümer, Modul-Admins |
| Altbestand (ohne Eigentümer, geteilt) | alle mit Zugang | Modul-Admins | Modul-Admins |

- Auch ein Modul-Admin sieht einen fremden privaten Plan nicht. Für jeden anderen ist er ein 404 wie ein Plan,
  den es nicht gibt — in der Liste, unter `/p/[id]`, im Druck, in jeder Action. Bestehende Pläne vor dem Nachtrag
  sind geteilt (Migration 0003).
- **Teilen ist eine Einbahnstraße** (privat → organisation, mit Rückfrage): zurück hieße, allen, die ihn
  inzwischen kennen, still den Plan wegzunehmen; dafür gibt es Archivieren.
- **Veröffentlichen über einen Link** (§8.2) geht auch für einen privaten Plan; ausstellen darf, wer verwaltet.
- **Einladen** gibt einer Person das Bearbeiten eines geteilten Plans. Gespeichert wird die Kennung; einladbar ist,
  wen das Modul (`kommplan_person`) oder das Personenverzeichnis (`core/directory`) kennt. Die Suche liefert ab zwei
  Zeichen höchstens zwanzig Treffer und fragt das Verzeichnis erst nach der Rechteprüfung.
- Bibliothek und Einstellungen bleiben den Modul-Admins; aus der Bibliothek in einen Plan kopieren darf jeder, der
  ihn bearbeitet, „In die Bibliothek übernehmen" nur der Admin.

### 8.5 Austauschformat (`.kommplan.json`)

„Exportieren" (Planliste, Betrachter, Editor nach dem Speichern) legt eine Datei mit genau einem Plan ab:
`format: "iuk-kommplan-plan"`, `version: 1`, `exportiertAm`, `plan` mit Titel, Art, Anlass, Datum, `vorlage` und dem
Inhalt wie in §4.2. Nicht in der Datei: Eigentümer, Sichtbarkeit, Eingeladene, Links, Version und „Stand".
„Importieren" in der Planliste prüft die Datei mit denselben Schemata wie das Speichern und legt immer einen
neuen privaten Plan an, nie ein Überschreiben. Eine neuere Formatversion wird mit Hinweis abgewiesen.

## 9. Aufteilung im Modul

| Ort | Inhalt | Laufzeit |
|---|---|---|
| `_db/` | Schema, Client, Migrationen | Server |
| `_lib/plan/` | zod-Schema, Invarianten, reine Operationen, Einfüge-Parser | beide |
| `_lib/layout/` | reine Layoutfunktion | beide |
| `_lib/zeichen/` | Generat und Zugriff darauf | beide |
| `_lib/zugang.ts`, `_lib/host.ts`, `_lib/tokenZugang.ts` | Zugangs-, Admin-, Host- und Token-Prüfung | Server |
| `_ui/zeichnung/` | SVG-Renderer, rein darstellend, ohne `"use client"` | beide |
| `_ui/betrachter/` | Zoom, Verschieben, Einklappen | Client-Insel |
| `_ui/editor/`, `_ui/gliederung/` | Bearbeitung | Client-Inseln |
| `_ui/druck/` | Druckseite, Druckmenü, SVG-Export | Server, Client-Inseln |
| `_ui/token/` | Rahmen und Kopf der Token-Ansicht | Server, Client-Insel (Druckmenü) |
| `_ui/teilen/` | Links ausstellen und widerrufen | Client-Insel |
| `_ui/bibliothek/`, `_ui/einstellungen/` | Bibliothek, Briefkopf | Client-Inseln |
| `logo/route.ts` | Upload des Logos (§6.1) | Server |
| `_actions/` | Server Actions mit `isModuleAdmin`-Prüfung | Server |

Werte, die Server Components brauchen, liegen in Modulen ohne `"use client"` (Falle 6); Icons in
Server Components nur als Inline-SVG (Falle 7).

## 10. Tests

- **Vitest:**
  - Planoperationen und Invarianten.
  - Layout-Golden-Tests auf Koordinaten: Nachbau der Vorlagen „Einsatz 22.02.2026", „OpenR
    01.07.2022", „Fernmeldeskizze Stab" und eine große Stab-Lage.
  - Eigenschaftstests auf Zufallsbäumen: keine Überlappung, keine Kreuzung, Eltern mittig über der
    Busspanne, Aufteilung deckt jede Stelle genau einmal ab. Einfügen einer Stelle ändert — solange
    dadurch keine Gruppe als Kamm umbricht und Zeilenhöhen und Ebenenlücken gleich bleiben — kein
    y; die früheren Geschwister in ihrer Busgruppe und die früheren Gruppen ihrer Ebene bleiben
    jeweils untereinander starr (gleiche relative Lage). Als Ganzes kann eine Gruppe rücken, weil
    die Elternstelle mittig über ihrer Busspanne steht — eine neue Kanalgruppe zentriert die
    Elternstelle neu, und deren Gruppe rückt gegen die früheren Gruppen. Bricht eine Gruppe als
    Kamm um oder wächst eine Lücke, ordnet sich zu Recht mehr neu.
  - Einfüge-Parser (Gliederung, Einheitenliste, CSV).
  - SVG-Bereinigung und Typprüfung des Logos, auch auf lineare Laufzeit.
  - Generat-Version und Schrift-SHA (§7).
  - DOM-Tests über das Harness `src/app/m/qr/_lib/test-dom.tsx`, dazu ein Render-Zähler, der die
    Gliederung an großen Plänen bindet.
- **e2e** (`e2e/kommplan*.spec.ts`): `kommplan.spec.ts` (Betrachter mit Einklappen und Zoom, Druck A4 mit
  Seitenzahl und ohne leeres Blatt, ohne Anmeldung → Login, ohne Gruppe und unbekannter Plan → 404 auch für
  A3, fremder Suite-Host → 404), `kommplan-editor.spec.ts` (Diagramm,
  Auswahlleiste, Autosave, Konflikt, Drucken), `kommplan-gliederung.spec.ts` (Tasten, Einfügen, Telefon),
  `kommplan-bibliothek.spec.ts`, `kommplan-verwaltung.spec.ts` (Vorlagen, Duplizieren, Archiv, Briefkopf) und
  `kommplan-teilen.spec.ts` (Token-Link 200, nach Widerruf 404, vier gleiche 404, keine Fehlversuchs-Sperre,
  Antwortköpfe, QR, Schwarzweiß, SVG).

## 11. Lieferphasen

Jede Phase war einzeln auslieferbar und hat einen eigenen Umsetzungsplan
(`docs/superpowers/plans/2026-09-30-kommplan-phase-<n>.md`). Alle fünf sind **erledigt**, ebenso die Abnahme
danach.

1. **Erledigt.** Modulrahmen, Datenmodell, Zeichen-Generat, Layout-Engine, Betrachter, Druck A4, Seed,
   Release-Notiz.
2. **Erledigt.** Diagramm-Editor: Griffe, Flyin, Autosave, Rückgängig; gebündeltes Audit (`plan_bearbeitung`).
3. **Erledigt.** Gliederung mit mehrzeiligem Einfügen; Ansicht in der Adresse.
4. **Erledigt.** Bibliothek, Vorlagen, Duplizieren, Archiv, Briefkopf mit Logo-Upload (§4.4); die Griffe
   wanderten hier in die Auswahlleiste.
5. **Erledigt.** Token-Links, QR auf dem Ausdruck, A3, SVG-Export, Schwarzweiß; „Als Vorlage speichern" legt
   seitdem eine Kopie an.
6. **Abnahme erledigt.** Ebenengrenze und Aufwandsbudget der Aufteilung, keine Fehlversuchs-Sperre, Bearbeiter
   nur mit Namen, QR sperrt nur die Ecke, A3 mit A4-Budget, abgesetzte Kanallinie, strengere SVG-Bereinigung,
   gekürzter Anlass im Blattkopf, Fokus nach Flyins.

## 12. Bewusst nicht enthalten

- Frei platzierbare Karten oder manuelle Linienführung (widerspricht A2).
- Echtzeit-Zusammenarbeit mehrerer Bearbeiter.
- Seitenstellen mit eigenen Unterstellen.
- Lesen der Einsatzbuch-Fahrzeuge (kein Modul liest heute die Datenbank eines anderen).
- Import der alten Excel-Blätter (Zeichnungsobjekte ohne Struktur).
- Serverseitige PDF-Erzeugung.
- Löschen von Plänen (nur Archiv) und Löschen von Token-Links (nur Widerruf).
- Eine Fehlversuchs-Sperre der Token-Ansicht (§8.2).
- Eine Bibliothek für Kanäle und ein Weg „Unterstellen als Einheiten übernehmen".
- Ein grauer Bildschirm bei Schwarzweiß (§8.1).
