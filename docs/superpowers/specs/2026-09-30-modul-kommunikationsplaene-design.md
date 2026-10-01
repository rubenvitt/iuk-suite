# Kommunikationspläne — Entwurf

**Modulschlüssel `kommplan` · ClickUp DRK-500 · 2026-09-30**

Kommunikationspläne und Fernmeldeskizzen zeigen, wer im Einsatz wem untersteht und über welchen
Weg (Funkkanal, Draht, Telefon …) die Stellen einander erreichen. Heute entstehen sie in der
Excel-Vorlage „Vorlage Fernmeldeskizze.xls": je Einsatz oder Tag ein Blatt, jede Karte, jede Linie
und jedes Kanalsechseck ein frei platziertes Zeichnungsobjekt. Das Modul ersetzt das durch Daten
plus ein Layout, das sich **selbst** anordnet.

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
  `scripts/seed-lokal.ts`, Audit-Labels, Release-Notiz (Phase 1).
- **`requiresAuth: false`** in der Registry, weil die Token-Ansicht (§8) ohne Anmeldung erreichbar
  sein muss — dasselbe Muster wie `feedback` und `einsatzbuch`. Den Seitenzugang setzt ein
  `_lib/zugang.ts` im Modul durch; die Arbeitsrouten liegen in einer Routengruppe, deren `layout.tsx`
  die Prüfung **oberhalb** jeder `loading.tsx` macht (Falle 23).
- **Gruppen:** Zugangsgruppe `iuk-kommplan` (ansehen, drucken); Admin-Gruppe
  `iuk-kommplan-bearbeiten` über `isModuleAdmin` (Pläne bearbeiten, Bibliothek pflegen, Token-Links
  ausstellen). Beide per `SUITE_ACCESS_GROUP_KOMMPLAN`/`SUITE_ADMIN_GROUP_KOMMPLAN` überschreibbar.
  `switcherGroupSources: ["access", "admin"]`.
- Nach `core` kommt nichts: kein zweites Modul braucht Layout, Zeichen oder Planmodell.

## 4. Datenmodell

### 4.1 Tabellen

| Tabelle | Spalten |
|---|---|
| `plan` | `id`, `titel`, `typ` (`kommunikationsplan` \| `fernmeldeskizze`), `anlass`, `datum` (Kalendertag), `ist_vorlage`, `archiviert_am`, `version` (int, optimistisches Sperren), `aktualisiert_am`, `aktualisiert_von`, `inhalt` (JSON) |
| `bib_stelle` | `id`, `titel`, `zeichen`, `leiter`, `kontakte` (JSON), `notiz` |
| `bib_einheit` | `id`, `typ`, `rufname`, `zeichen`, `notiz` |
| `bib_verbindung` | `id`, `art`, `bezeichnung`, `notiz` |
| `freigabe` | `id`, `plan_id`, `token` (Klartext, eindeutig), `notiz`, `ablauf`, `widerrufen_am`, `erstellt_am`, `erstellt_von`, `zuletzt_abgerufen`, `abrufe` |

| `briefkopf` | genau eine Zeile (`id` = 1, Primärschlüssel): `organisation` (Text, leer erlaubt), `logo` (Blob, leer erlaubt), `logo_mime`, `logo_sha256`, `aktualisiert_am`, `aktualisiert_von` |

`aktualisiert_am` ist der gedruckte „Stand". Zeiten rechnen über `core/zeit`; `datum` ist ein
Kalendertag (Mitternacht UTC).

### 4.4 Briefkopf (Logo und Organisation)

Logo und Organisationsname stehen **nicht im Code**, sondern werden hochgeladen bzw. eingetragen
(A10). Ohne Eintrag bleibt die Stelle im Kopf leer; es gibt keinen eingebauten Ersatz, auch nicht
im Seed.

- Seite `/m/kommplan/einstellungen`, nur Modul-Admin: Organisationsname, Logo hochladen,
  ersetzen, entfernen; Vorschau des Kopfes.
- Erlaubt: PNG, JPEG, WebP, SVG; höchstens 1 MB. Der Typ wird aus den ersten Bytes bestimmt, nicht
  aus Dateiname oder `Content-Type`. Jede Datei geht durch den Virenscanner (`core/av`, wie
  `aufgaben` — per Pfad über eine Wegwerfdatei auf dem Volume `kommplan_scan`). SVG wird vor dem Speichern bereinigt (kein `script`, `foreignObject`, keine
  `on*`-Attribute, keine externen Verweise, keine `javascript:`-URLs; `<style>` bleibt bereinigt erhalten); was danach nicht mehr gültig ist, wird abgelehnt.
- Eingebettet wird das Logo als `data:`-URI in einem `<image>` der Zeichnung. So braucht weder der
  Druck noch die Token-Ansicht eine eigene Bildroute, und ein SVG-Logo führt dort nie Skript aus.
- Hochladen, Ersetzen und Entfernen gehen ins Audit-Log.

### 4.2 Planinhalt (JSON, zod, `schema: 1`)

Ein Plan ist **ein** Dokument. Duplizieren ist eine Zeilenkopie, Rückgängig ist ein Stapel von
Dokumenten, das Layout bekommt genau ein Objekt, und Umhängen eines Teilbaums ist eine Operation,
die in sich stimmig bleibt.

```ts
type PlanInhalt = {
  schema: 1;
  optionen: { leerzeilen: boolean; vermerkVsNfD: boolean; qrAufDruck: boolean; schwarzweiss: boolean };
  stellen: Stelle[];          // Baum über `eltern`; genau eine Wurzel oder mehrere Wurzeln nebeneinander
  verbindungen: Verbindung[]; // ohne zugeordnete Stelle = „Reserve" in der Legende
};
type Stelle = {
  id: string; eltern: string | null; lage: "unter" | "links" | "rechts"; reihenfolge: number;
  zeichen: string | null;     // Rezeptschlüssel aus dem Zeichen-Generat
  titel: string; leiter: string | null; hervorheben: boolean;
  verbindungId: string | null; // Weg zur Elternstelle
  kontakte: { art: KontaktArt; wert: string }[];
  einheiten: { id: string; typ: string; rufname: string; zeichen: string | null }[];
};
type KontaktArt = "funkrufname" | "digitalfunk" | "telefon" | "mobil" | "fax" | "email" | "sonstiges";
type Verbindung = { id: string; art: VerbindungsArt; bezeichnung: string };
type VerbindungsArt = "tmo" | "dmo" | "analogfunk" | "draht" | "telefon" | "mobil" | "fax" | "daten";
```

**Invarianten** (zod-`superRefine`, geprüft beim Speichern): IDs eindeutig; `eltern` zeigt auf eine
existierende Stelle; kein Zyklus; Seitenstellen (`lage ≠ "unter"`) haben keine Kinder und nie
`eltern = null`; `verbindungId` zeigt auf eine existierende Verbindung.

Die Anzeigereihenfolge der Kontaktarten ist fest (wie die Vorlage) und unabhängig von der
Eingabereihenfolge.

### 4.3 Bibliothek

Einfügen aus der Bibliothek **kopiert** in den Plan. Im Plan gibt es danach keinen Unterschied
zwischen Bibliotheks- und freien Angaben, und ein Plan ändert sich nie still, wenn jemand die
Bibliothek pflegt. Für freie Angaben gibt es „In Bibliothek übernehmen".

## 5. Layout

`layout(inhalt, ziel) → { karten, linien, sechsecke, einheiten, seiten }` ist eine **reine,
synchrone Funktion** in `_lib/layout/`. Server (Druck, Token-Ansicht) und Client (Editor) teilen
sie. Gleiche Daten ergeben immer dasselbe Bild. `ziel` ist `bildschirm` oder ein Papierformat
(`a4-quer`, `a3-quer`).

### 5.1 Karte

- Feste Breite; nur die Höhe wächst.
- Kopf: Zeichen links; rechts Titel (Umbruch bis 3 Zeilen, danach Kürzung mit vollem Text im
  Tooltip bzw. in der Gliederung), darunter Leiter.
- Kontaktzeilen mit Piktogramm, nur belegte — oder alle, wenn `optionen.leerzeilen`.
- Textbreiten aus `ARIMO_TEXT_METRICS` (über das Generat, §7); gerendert wird in Arimo. Keine
  DOM-Messung, damit Server und Client dasselbe rechnen.

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

### 5.3 Seitenstellen

Links oder rechts auf Kopfhöhe der Elternstelle, verbunden über eine waagerechte Linie mit dem
Sechseck in der Mitte. Seitenstellen sind Blätter (§4.2). Ihr Platzbedarf geht in die Kontur des
Teilbaums ein, damit Nachbarn nicht hineinragen.

### 5.4 Einheiten

Spalte kleiner Kästen unter der Karte (Typ + Rufname, optional Zeichen). Ab 10 Einheiten zwei
Spalten.

### 5.5 Breite Ebenen

Überschreitet die Kinderreihe einer Stelle ein Breitenbudget (abgeleitet vom Zielformat), brechen
die Kinder **in mehrere Reihen unter demselben Bus** um (Kamm). Die Regel hängt nur an Kinderzahl
und Budget — keine globale Optimierung, damit eine zusätzliche Stelle das Bild nicht umwirft.

### 5.6 Papier

1. Auf die Seite skalieren, bis zur Mindestschrift von 6 pt.
2. Reicht das nicht: aufteilen. Blatt 1 zeigt die oberen Ebenen; große Teilbäume erscheinen dort
   als Verweiskarte „→ Blatt n". Jeder solche Teilbaum bekommt ein eigenes Blatt, mit seiner
   Elternstelle grau als Anker. Die Aufteilung ist gierig nach Teilbaumgröße und deterministisch.
3. Jedes Blatt trägt Kopf (Titel, Anlass, Datum, Organisation/Logo aus dem Briefkopf §4.4), Fuß (VS-NfD-Vermerk
   abschaltbar, Stand, Bearbeiter, „Blatt x von y") und die Legende der verwendeten
   Verbindungsarten samt Reservekanälen.

### 5.7 Bildschirm

Dasselbe Layout mit Zoom und Verschieben (Maus, Touch, Tastatur). Jede Stelle ist einklappbar und
zeigt dann ein Abzeichen „+n Stellen". Eingeklappt ist Ansichtszustand, nicht Planinhalt.

## 6. Editor

### 6.1 Routen

| Route | Inhalt |
|---|---|
| `/m/kommplan` | Planliste: Titel, Typ, Datum, Stand; Neu / Aus Vorlage / Duplizieren; Archiv; Vorlagen getrennt |
| `/m/kommplan/[id]` | Editor (Admin) bzw. Betrachter (Zugangsgruppe) |
| `/m/kommplan/[id]/druck/a4`, `…/a3` | Druckrouten (§8) |
| `/m/kommplan/bibliothek` | Stellen, Einheiten, Verbindungen |
| `/m/kommplan/einstellungen` | Briefkopf: Organisation und Logo (§4.4) |
| `/m/kommplan/archiv` | Archiv: archivierte Pläne, nur lesbar; Wiederherstellen (Bearbeitende) |
| `/m/kommplan/t/[token]` | Token-Ansicht (§8.2); Druck unter `…/druck/a4` und `…/druck/a3` |

Die Plan-ID wird in jeder Server Action und jeder Seite aus der Datenbank aufgelöst (IDOR, `CLAUDE.md`).

### 6.2 Rahmen

Kopfleiste: Titel, Umschalter **Diagramm | Gliederung**, Rückgängig/Wiederholen, Teilen, Drucken (A4 quer; über den Pfeil A3 quer und SVG-Dateien),
Speicherstatus. Arbeitsfläche füllt den Rest; bearbeitet wird im Flyin rechts (`flyinBreite()`).

### 6.3 Diagramm-Ansicht

- Die ausgewählte Karte trägt einen Auswahlrahmen; ihre Griffe („Bearbeiten", „+ Unterstelle", „+ Einheit", „+ links", „+ rechts")
  stehen in einer Auswahlleiste oben in der Fläche, die eingepasst über keinem Planelement liegt (an der Karte verdeckten 44-px-Griffe Nachbarn).
- Neues Element wird sofort gesetzt, ausgewählt, Fokus im Titelfeld. Das Layout gleitet an die neue
  Position (kurze Animation, ohne bei `prefers-reduced-motion`).
- Tastatur: Pfeile wandern durch den Baum, Enter öffnet das Flyin, `N` neue Unterstelle, Entf
  löscht (Rückgängig statt Nachfrage).
- Kein Ziehen von Karten: angeordnet wird immer automatisch (A2).

### 6.4 Flyin einer Stelle

- **Zeichen:** Suche über den Katalog-Index, oben die zuletzt genutzten.
- **Titel, Leiter, Hervorheben.**
- **Untersteht / Lage:** Auswahl; darüber läuft das Umhängen.
- **Verbindung zur Elternstelle:** vorhandene wählen oder neu eintippen (Bezeichnung + Art).
- **Kontakte:** Zeilen Art + Wert.
- **Einheiten:** Suche in der Bibliothek plus **„Liste einfügen"** — je Zeile erstes Wort = Typ,
  Rest = Rufname („RTW RK UE 40-83-5").
- **„Aus Bibliothek"** füllt die Stelle; **„In Bibliothek übernehmen"** legt sie dort an.

### 6.5 Gliederungs-Ansicht

- Eingerückte Baumliste; Titel, Verbindung und Einheitenzahl inline bearbeitbar.
- Enter = Geschwister, Tab/Shift+Tab = Ebene, Alt+↑/↓ = verschieben.
- **Mehrzeiliges Einfügen** mit Einrückung (Tabs oder je zwei Leerzeichen) legt einen Teilbaum an.
- Am Telefon öffnet der Editor in der Gliederung; das Diagramm bleibt über den Umschalter für kleine Korrekturen erreichbar.

### 6.6 Speichern und Rückgängig

- Autosave etwa 1 s nach der letzten Änderung über eine Server Action mit `version`-Prüfung.
- Konflikt → Hinweis mit „Neu laden" oder „Meine Fassung behalten". Keine Echtzeit-Zusammenarbeit.
- Rückgängig/Wiederholen ist ein Client-Stapel von Dokumenten, gültig bis zum Neuladen.
- Alle Änderungen laufen über reine Operationen in `_lib/plan/` (`fuegeUnterstelleEin`,
  `haengeUm`, `loesche`, `fuegeGliederungEin` …), die Diagramm und Gliederung gemeinsam nutzen.

### 6.7 Vorlagen und Duplizieren

„Duplizieren" kopiert den Plan, setzt das Datum auf heute (Suite-Zone) und ersetzt das erste Datum im Titel in derselben Schreibweise (sonst „ (Kopie)"). „Als Vorlage speichern" legt
eine Kopie als Vorlage an (Titel gleich, ohne Datum; der Plan bleibt unter „Pläne"); gibt es schon eine Vorlage gleichen Titels, fragt die Liste erst nach („Vorlage öffnen" oder „Trotzdem anlegen"); „Vorlage archivieren" archiviert sie; „Neu aus Vorlage" legt eine Kopie an.

## 7. Taktische Zeichen

`@einsatzzeichen/{catalog,core,schema}` (heute 1.5.0 / 3.0.0 / 3.0.0) werden **nur als
`devDependencies`** eingebunden. Befund M1 der Zeichen-Spec (2026-09-02) besteht in 1.5.0 fort:
`catalog/dist/src/fonts.js` ruft `fileURLToPath(new URL(…))` auf Modulebene auf und bricht jeden
Server-Import im Build.

- `scripts/kommplan-zeichen-generat.ts` erzeugt eine eingecheckte Datei unter
  `kommplan/_lib/zeichen/` mit: allen Rezepten (Schlüssel, Titel, Suchtext, fertiges SVG), den
  Kommunikationspiktogrammen für die Sechsecke (`comms.voice-radio-tmo`, `…-dmo`,
  `comms.cable-construction`, `comms.fax-transmission`, `comms.data-transmission` …), den
  Piktogrammen der Kontaktarten und `ARIMO_TEXT_METRICS`.
- Im SVG steht jedes Zeichen **einmal** als `<symbol>` in `<defs>` und wird per `<use>`
  referenziert. Das löst M11 (doppelte IDs) ohne Präfixe je Instanz.
- Ein Test vergleicht die im Generat vermerkte Paketversion mit der installierten: nach einem
  Dependabot-Update ist die CI rot, bis das Generat neu erzeugt ist.
- Arimo per `next/font/local`; ein Test prüft die SHA der Schriftdatei gegen die des Katalogs.
- Wo der Katalog ein Zeichen der Vorlage nicht kennt, bleibt die Karte ohne Zeichen; der Titel
  trägt die Aussage.

## 8. Ausgabe und Freigabe

### 8.1 Druck und PDF

- Druckrouten rendern jede Seite als Vektor-SVG und rufen beim Öffnen `window.print()` auf
  (Vorbild `feedback/(print)/aushang`). „Als PDF sichern" liefert das PDF.
- A4 quer und A3 quer sind **eigene Routen** (Falle 18: gemischte Seitengrößen verwirft Chromium),
  jede mit benanntem `@page` und ausgeschriebenen Kantenlängen (`297mm 210mm`, `420mm 297mm`).
- Option Schwarzweiß (`PRINT_MONOCHROME_THEME` als zweites Rezept-Generat): gilt für Ausdruck und SVG-Datei, am Bildschirm bleibt der Plan farbig.
- „SVG herunterladen" je Blatt auf den internen Druckseiten: eigenständige Datei mit Symbolen, Logo und Arimo als `@font-face`; Dateiname aus Titel, Datum, Blatt und Format in ASCII.

### 8.2 Token-Link

- „Teilen" im Editor stellt Links aus: Ablauf 24 h, 7 Tage (Vorgabe), 30 Tage oder unbegrenzt;
  mehrere je Plan, je mit Notiz; einzeln widerrufbar.
- Token: 32 Byte Zufall, base64url, **im Klartext** gespeichert, damit sich der Link jederzeit wieder
  kopieren lässt. Wer die Datenbank liest, liest ohnehin die Pläne; ein Hash schützt hier nichts.
- `/m/kommplan/t/[token]`: minimale Hülle, nur lesend, derselbe Betrachter (Zoom, Einklappen), immer
  aktueller Stand, `noindex`, `Cache-Control: no-store`, VS-NfD-Vermerk und „Stand …" sichtbar.
  Muster: `docs/design/feedback-oeffentliche-ansicht.md`.
- Unbekannt, abgelaufen, widerrufen oder Plan archiviert → echtes 404; die Prüfung liegt im
  `layout.tsx` oberhalb jeder `loading.tsx` (Falle 23).
- Je Abruf `zuletzt_abgerufen` und `abrufe` (dieselbe Adresse und derselbe Link zählen binnen einer Minute einmal). Ausstellen und Widerrufen gehen ins Audit-Log. Dreißig Fehlversuche je Minute und Adresse sperren die Adresse (404 ohne Datenbankabfrage). `X-Robots-Tag`, `Referrer-Policy: no-referrer` und `Cache-Control: no-store` setzt der Proxy.
- **QR auf dem Ausdruck** (Option): hat der Plan einen gültigen Link, trägt jedes Blatt unten rechts
  einen QR-Code „Aktuelle Fassung" (24 mm) — intern auf den Link mit dem spätesten Ablauf (unbegrenzt zuerst), im Token-Druck immer auf den benutzten Link; Plan-Flyin, Teilen-Flyin und Druckseite sagen, auf welchen Link und wie lange. Basis ist die Adresse des Moduls aus der Suite-Konfiguration. Den internen Ausdruck mit QR erhalten nur Bearbeitende: Der Code ist selbst der Link, und wer nur ansehen darf, behielte damit über den Entzug seiner Gruppe hinaus anonymen Zugang. Die Zugangsgruppe druckt intern ohne QR.

### 8.3 Archiv

Pläne werden archiviert, nicht gelöscht, und sind wiederherstellbar; archiviert sind sie nur lesbar (ansehen, drucken). Ein archivierter Plan macht
seine Token-Links sofort ungültig: Archivieren widerruft sie, Wiederherstellen erweckt keinen wieder.

## 9. Aufteilung im Modul

| Ort | Inhalt | Laufzeit |
|---|---|---|
| `_db/` | Schema, Client, Migrationen | Server |
| `_lib/plan/` | zod-Schema, Invarianten, reine Operationen, Einfüge-Parser | beide |
| `_lib/layout/` | reine Layoutfunktion | beide |
| `_lib/zeichen/` | Generat und Zugriff darauf | beide |
| `_lib/zugang.ts` | Zugangs- und Admin-Prüfung | Server |
| `_ui/zeichnung/` | SVG-Renderer, rein darstellend, ohne `"use client"` | beide |
| `_ui/betrachter/` | Zoom, Verschieben, Einklappen | Client-Insel |
| `_ui/editor/`, `_ui/gliederung/` | Bearbeitung | Client-Inseln |
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
  - Einfüge-Parser (Gliederung, Einheitenliste).
  - Generat-Version und Schrift-SHA (§7).
  - DOM-Tests über das Harness `src/app/m/qr/_lib/test-dom.tsx`.
- **e2e:** anlegen → Stelle hinzufügen → Gliederung einfügen → Druckroute (Seitenzahl, kein leeres
  Blatt) → Token-Link (200, nach Widerruf 404); Zugang ohne Gruppe → 404.

## 11. Lieferphasen

Jede Phase ist einzeln auslieferbar und bekommt einen eigenen Umsetzungsplan.

1. Modulrahmen, Datenmodell, Zeichen-Generat, Layout-Engine, Betrachter, Druck A4, Seed,
   Release-Notiz.
2. Diagramm-Editor: Griffe, Flyin, Autosave, Rückgängig.
3. Gliederung mit mehrzeiligem Einfügen.
4. Bibliothek, Vorlagen, Duplizieren, Archiv, Briefkopf mit Logo-Upload (§4.4).
5. Token-Links, QR auf dem Ausdruck, A3, SVG-Export, Schwarzweiß.

## 12. Bewusst nicht enthalten

- Frei platzierbare Karten oder manuelle Linienführung (widerspricht A2).
- Echtzeit-Zusammenarbeit mehrerer Bearbeiter.
- Seitenstellen mit eigenen Unterstellen.
- Lesen der Einsatzbuch-Fahrzeuge (kein Modul liest heute die Datenbank eines anderen).
- Import der alten Excel-Blätter (Zeichnungsobjekte ohne Struktur).
- Serverseitige PDF-Erzeugung.
