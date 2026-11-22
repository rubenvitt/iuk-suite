# Lagerbuch: Einheit in der Verwaltung zählen und einrichten („Verwaltungscheck") — Entwurf

- **Datum:** 2026-11-22
- **Status:** freigegeben im Gespräch (Weg C), Einzelheiten unten als Festlegungen markiert
- **Modul:** `src/app/m/lagerbuch`
- **Zunder:** https://zunder.rubeen.dev/#/aufgabe/jlwtf3ski7fqv1nx8a5v0w4l (IDA-413)

## 1. Worum es geht

Eine Einheit (Fahrzeug, Tasche …) zählt heute nur der Helfer-Check auf `/helfer/check`: eine Schrittfolge fürs
Telefon (Plomben → Zählen → Nachfüllen → Geräte → Sauerstoff), eine Position pro Zeile, große Tippziele. Admins
nutzen ihn auch für die **Erstbestückung** einer Einheit und für **Korrekturen** — auf Smartphone und Tablet an der
Einheit. Dafür passt er nicht: kein Fach-Filter, keine Tabelle auf dem Tablet, nichts einrichten (Plomben, Geräte,
Flaschen anlegen oder verknüpfen), und Bewegungen außer „aus dem Handlager nachfüllen" gibt es nicht.

Gewünscht: eine **Zählseite in der Verwaltung**, die zählt, ausgleicht und einrichtet, und die **als Check gilt**.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
1. Neue Seite unter Verwaltung → Fahrzeuge → Einheit → „Zählen", nur für Lagerbuch-Admins, nur an aktiven Einheiten.
2. Bestand zählen: Ist je Soll-Position, Verfall je Fach. Tablet: Tabelle; Telefon: Karten mit Fach-Filter.
3. Ausgleichen: je Artikel mit Abweichung oder abgelaufenem Fach bewusst Aussondern, Zurücklegen, Auffüllen.
4. Plomben anlegen und Nummern setzen; Geräte (Zustand, fehlt, verknüpfen, anlegen, umsetzen); Sauerstoff
   (Druck, verknüpfen, anlegen).
5. Abschluss bucht Zählung und Bewegungen **in einem Durchgang**; schlägt ein Teil fehl, wird nichts gebucht.
6. Der Abschluss ist eine `checks`-Zeile mit Art **„verwaltung"**: „Letzter Check", Check-Liste und -Detail,
   Abdeckung der Kurzcheck-Stichprobe.

**Nicht-Ziele**
- Der Helfer-Check (Kurz-/Vollcheck) ändert sich für Helfer nicht, weder Ablauf noch Buchung.
- Keine chargengenaue Zählung an Einheiten (Einheiten führen Verfall je Fach, die Charge wird bei einer Korrektur
  geraten — bewusster Kompromiss, `_lib/schreibpfade/korrektur.ts`).
- Kein automatisches Nachfüllen oder Zurückbuchen.
- Die Inventur (Handlager/Schränke) wird nicht umgebaut.

**Anti-Ziele** (würde es scheitern lassen, auch wenn es technisch läuft)
- Zwei Wege, die einen Check **verschieden buchen** (das war die Sorge hinter DRK-305).
- Ein Abschluss, der halb gebucht stehen bleibt.
- Aussonderungen, die in der Statistik als Verbrauch auftauchen.
- Kurzcheck-Abdeckung, die Positionen als gezählt meldet, die niemand gezählt hat.

## 3. Rahmenbedingungen aus dem Bestand

- DRK-305 legte „genau eine Check-Oberfläche" fest (`fahrzeuge/CheckDurchfuehrenKnopf.tsx`). **Bewusst umgedeutet:**
  die eine Wahrheit liegt ab jetzt im **Schreibweg**, nicht in der Oberfläche. Der Kommentar dort wird nachgezogen.
- `checks` hat keine `art`-Spalte; die Art steht im `ergebnis`-JSON (`CheckErgebnisV2.art`). Keine Migration nötig.
  `parseCheckErgebnis` lässt heute nur `kurz|voll` durch, `checkArtUndPlomben` macht aus allem anderen `voll` —
  beides plus Typen und Beschriftungen müssen `verwaltung` kennen.
- Kurzcheck-Abdeckung (`lesepfade/kurzcheck.ts`, `letzteZaehlungJePosition`) liest `ergebnis.positionen[]` aller
  Checks unabhängig von der Art. Deshalb: **nur tatsächlich gezählte Positionen** dort hineinschreiben.
- Ein Artikel wird ganz oder gar nicht gezählt (IDA-222): alle seine Fächer, sonst Absage.
- Riegel 5 des Checks: Einheit existiert, `typ = "fahrzeug"`, `aktiv`. Gilt auch hier.
- Admin-Actions: `requireLagerbuchAdmin` als erste Anweisung, `withAuditContext({ actor: auditActor(viewer) })`,
  Quelle `{ quelleTyp: "oidc", quelleId: viewer.sub }`, Ergebnis `ActionErgebnis<T>`.
- Quelltext-Wächter: `_actions/guards.test.ts` (Zählung der Actions), `_lib/revalidierung.test.ts` (exakte Liste
  der Bestandsschreiber; Schreiber rufen `revalidiereBestand`), `_lib/vorgang.test.ts` (Präfixe nur über
  `_lib/vorgang.ts`), `_actions/check.test.ts` „Bauform" (z. B. `scope_lagerort_id`-Kommentar bleibt in `check.ts`).
- UI-Fallen aus `CLAUDE.md`, besonders 1, 4, 6, 9, 13, 14–17, 23, 24.

## 4. Wege (Approaches)

| Weg | Kurz | Abwägung |
| --- | --- | --- |
| A | Verwaltungsmodus in `/helfer/check` | eine Fläche, aber Telefon-Schrittfolge bleibt; Einrichten mitten in der Helfer-Sitzung |
| B | Inventur für Einheiten öffnen | Tabelle fertig, aber Chargen-/Handlagermodell gegen Fach-Verfall; schreibt Inventur-Verlauf statt Check |
| **C** | **eigene Zählseite am Fahrzeugblatt, gemeinsamer Schreibweg mit `checkAbschluss`** | **gewählt** — Bedienung passt zu Admins, Buchungsregeln an einer Stelle; meister neuer Code |

Gewählt vom Gruppenführer: **C**, ergänzt um Plomben/Geräte/Sauerstoff (anlegen/verknüpfen) und Ausgleichen.

## 5. Entschieden (im Gespräch)

1. Weg C.
2. Gilt als Check (Art „verwaltung").
3. Plomben, Geräte und Sauerstoff gehören dazu, jeweils **anlegen oder verknüpfen** möglich.
4. Erst zählen, dann ausgleichen. Das Gezählte ist die Wahrheit; Bewegungen sind bewusste Einzelentscheidungen je
   Zeile: Fehlmenge → **Auffüllen**, Überschuss → **Zurücklegen**, Abgelaufen → **Aussondern** (danach optional
   Auffüllen).
5. Zählung und Bewegungen werden erst beim **Abschluss** gebucht, zusammen.
6. Kein Nachfüllen-Automatismus. Nur Lagerbuch-Admins.
7. Läuft auf Smartphone und Tablet.

## 6. Entwurf

### 6.1 Einstieg und Route

- Route: `verwaltung/(arbeit)/fahrzeuge/[id]/zaehlen/page.tsx`. Erbt Zugriff (`(arbeit)/layout.tsx`: Admin) und
  `notFound` für unbekannte Einheiten (`[id]/layout.tsx`, Falle 23). Eine **inaktive** Einheit zeigt einen
  Leerzustand mit Link zurück (kein `notFound` in der Seite, Falle 23).
- `_lib/verwaltungPfad.ts`: `Unterseite` um `"zaehlen"` erweitern.
- Fahrzeugblatt-Kopf (nur aktive Einheit): neuer Knopf **„Zählen"** (neutral, nicht primär) neben „Check
  durchführen" (bleibt primär). *Festlegung des Bauenden.*

### 6.2 Seitenaufbau

`SeitenKopf` „Zählen und einrichten" mit Einheit, `zurueck` aufs Fahrzeugblatt. Darunter **eine Client-Insel**
`VerwaltungsZaehlung` mit antd-`Tabs` (Telefon und Tablet gleich):

| Reiter | Inhalt |
| --- | --- |
| Bestand | Zählen je Soll-Position + Verfall je Fach |
| Ausgleichen | Artikel mit Abweichung / abgelaufenem Fach, je Zeile Aussondern · Zurücklegen · Auffüllen |
| Plomben | aktive Plomben, Nummer setzen; „Plombe anlegen" |
| Geräte | Geräte an der Einheit: Zustand, fehlt, Bemerkung, „an anderen Ort"; „Gerät verknüpfen", „Gerät anlegen" |
| Sauerstoff | Flaschen an der Einheit: Druck; „Flasche verknüpfen", „Flasche anlegen" |

Reiterbeschriftungen tragen einen Zähler (z. B. „Bestand 12/40", „Ausgleichen 3").
Unten eine **klebende Abschlussleiste** (Muster `inventur/Abschlussleiste.tsx`, `TabellenVollhoehe rand`,
Falle 16): „x von y Positionen gezählt · n Abweichungen · Geräte a/b · Flaschen c/d", Kommentarfeld, Knopf
**„Abschließen"** (primär; einzige Primäraktion der Insel).

Der Zählstand liegt in `useEntwurf` (`@/core/entwurf/useEntwurf`) unter `lagerbuch:verwaltungscheck:<einheitId>` —
er überlebt Neuladen und `router.refresh()`, und er liefert die `sendungId`, die zur Check-Id wird (Idempotenz wie
`checkAbschluss`, IDA-358). Nach erfolgreichem Abschluss: Entwurf leeren, Ergebnis anzeigen (`Result`) mit Links
„Zum Check" (Check-Detail) und „Zurück zur Einheit".

### 6.3 Reiter „Bestand"

- Zeile = **Soll-Position** (ohne Grabsteine): Fach, Artikel, Soll (bzw. „Soll–SollMax"), Ist, Verfall (Monat).
- Buchstand: je Artikel (nicht je Fach) als Nebenzeile „im Lagerbuch: n"; bei Artikeln mit mehreren Fächern
  „in m Fächern zusammen".
- Ist-Zelle wie `InventurZellen.IstZelle` (±, `InputNumber`, keine Vorgabe). Knopf **„Stimmt"** setzt Ist = Soll.
- Verfall: `MonatsFeld`; Vorgabe `fachVerfall[sollPositionId] ?? verfall[artikelId]`. Wird gemeint als **Verfall
  nach dem Ausgleich** (Hinweis im Spaltenkopf/Kartentext).
- Filter: Suche, Fach (Spaltenkopf auf dem Tablet, `Schmalfilter` mit `kategorien=[]` auf dem Telefon),
  Alle/Offen. Darstellung über `core/tabelle`: `Schmalkarten` + `TabellenVollhoehe` + `Datentabelle` (Falle 14–17).
- **Teilzählung erlaubt** (Korrektur eines Fachs). Regel: ein angefangener Artikel muss in allen seinen Fächern
  gezählt sein. Die Leiste nennt fehlende Fächer („Verbandpäckchen: auch in Fach 3 zählen") und sperrt
  „Abschließen", solange so ein Artikel offen ist. Server weist dasselbe ab.
- Neue Dateien unter `fahrzeuge/[id]/zaehlen/`, nach dem Vorbild der Inventur-Zellen; die Inventur selbst wird nicht
  verallgemeinert. *Festlegung des Bauenden* (CLAUDE.md: nach `core` nur mit zweitem Abnehmer).

### 6.4 Reiter „Ausgleichen"

Abgeleitet aus dem Zählstand, je **Artikel** (Summe über seine Fächer), nur gezählte Artikel:
- Fehlmenge: Ist < Soll-Summe → Vorschlag **Auffüllen** (Soll − Ist).
- Überschuss: Ist > Obergrenze (`obergrenze`/`ueberschuss` aus `_lib/domain/sollBereich`) → Vorschlag
  **Zurücklegen** (Ist − Obergrenze).
- Abgelaufen: ein Fach des Artikels hat (vor der Neueingabe) einen abgelaufenen Verfall oder der eingegebene ist
  abgelaufen (`verfallStatus`) → **Aussondern** angeboten.

Jede Zeile: Artikel, Soll, Ist, Abweichung; drei Knöpfe, die je einen kleinen Dialog öffnen (`Modal`, keine
`Drawer` — Falle 13/24 vermeiden). Eine erfasste Absicht steht danach als Chip in der Zeile, änderbar/entfernbar.
„Nach dem Ausgleich: n" als Vorschau (Ist − Aussondern − Zurücklegen + Auffüllen).

Absichten (je Artikel höchstens eine je Art):
- **Aussondern** `{ menge, grund? }` — Menge ≤ Ist. Grund optional, Vorgabe „Beim Zählen ausgesondert".
- **Zurücklegen** `{ menge, zielLagerortId, chargeId? }` — Menge ≤ Ist − Aussondern. Ziel: Handlager-Schränke aus
  `zugangsZiele` **oder** die Entnahmebox (wenn aktiv). In einen Schrank ist die **Charge Pflicht** (DRK-366: im
  Handlager trägt die Charge den Verfall); gewählt aus den Chargen an der Einheit. In die Entnahmebox ist sie
  optional (FEFO, wie `bucheInEntnahmebox` und der Helfer-Check).
- **Auffüllen** `{ menge, herkunft }` mit `herkunft`:
  - `{ art: "handlager" }` — **Vorgabe**: FEFO aus dem Handlager-Bereich (wie der Helfer-Nachfüllschritt).
  - `{ art: "ort", vonLagerortId, chargeId }` — bestimmter Ort (Schrank, andere Einheit, Entnahmebox) + Charge
    (wie `AufladenDialog`).
  - `{ art: "neu", charge: { art: "vorhanden", chargeId } | { art: "neu", chargenNr?, verfall } }` — neu geliefert.
  Die Felder werden aus `AufladenDialog` in eine wiederverwendbare Komponente gezogen; der Dialog am Fahrzeugblatt
  bucht weiter sofort.

**Regel bei Unterdeckung:** jede Bewegung **weist ab statt zu kappen** (wie Aufladen/Rücklauf; anders als der
Helfer-Nachfüllschritt, der still kappt). Der Abschluss scheitert dann ganz und nennt den Artikel.

### 6.5 Reiter „Plomben"

- Aktive Plomben der Einheit (`plombenFuerLagerort`): Bezeichnung, Fach, aktuelle Nummer/„steht nicht"; Eingabe
  **neue Nummer** (leer = unverändert). Wird beim Abschluss gesetzt (wie Vollcheck: `nummer`, `gesetztAt = jetzt`).
- „Plombe anlegen" (Bezeichnung, Fach aus den Fächern des Solls) → sofort `plombeAnlegen`, dann `router.refresh()`.

### 6.6 Reiter „Geräte"

- Geräte mit `lagerortId = Einheit` (aktiv): Zustand-Auswahl (`ZUSTAENDE` wie im Check), **„fehlt"** (=`vorhanden:
  false`), Bemerkung, Selbsttest bei Geräten mit Flag. Unbeantwortete Geräte werden nicht gemeldet und nicht ins
  Ergebnis geschrieben.
- Auffällig (fehlt / Defekt / Selbsttest nicht bestanden) → beim Abschluss Mangel wie im Check
  (`legeMangelAn`, falls kein offener Mangel zum Gerät).
- **Sofort wirkende Einrichtung** (nicht Teil des Abschlusses — Stammdaten, kein Zählergebnis; *Festlegung des
  Bauenden*):
  - „Gerät verknüpfen": Scan (`_ui/BarcodeScanner` mit neuer Prop `onTreffer(id)` statt Navigation) oder Auswahl
    aus aktiven Geräten an anderen Orten → neue Admin-Action **`geraetUmsetzen({ geraetId, lagerortId })`**
    (schmales Update nur von `lagerortId`; nicht `geraetSpeichern`, das den ganzen Datensatz überschreibt).
  - „Gerät anlegen": `NeuGeraet` mit neuen Props `vorgabeLagerortId`, neutralem Auslöser und eigenem
    Entwurfsschlüssel je Einheit.
  - Je Zeile „An anderen Ort": `geraetUmsetzen` auf einen gewählten Ort (für Geräte, die gar nicht hierher gehören).

### 6.7 Reiter „Sauerstoff"

- Flaschen mit `lagerortId = Einheit` (aktiv): Druck in bar (Prüfung `druckZuHoch` im Client und im Server), Status
  aus `o2Status`. Nicht abgelesene Flaschen werden nicht geschrieben.
- „Flasche verknüpfen": Auswahl (Flaschen haben keinen Barcode) → neue Admin-Action
  **`flascheUmsetzen({ flascheId, lagerortId })`**. „Flasche anlegen": `NeuFlasche` mit `vorgabeLagerortId`,
  neutralem Auslöser, eigenem Entwurfsschlüssel.

### 6.8 Abschluss — Schreibweg

Neue Datei `_actions/verwaltungscheck.ts`, eine Export-Action:

```
verwaltungscheckAbschluss(eingabe: unknown, db = getDb()): Promise<ActionErgebnis<VerwaltungscheckWert>>
```

Nutzlast (zod, `.strict()`):
```
{ fahrzeugId, sendungId (uuid), kommentar?,
  positionen: [{ sollPositionId, ist }],                 // nur gezählte
  verfaelle:  [{ sollPositionId, verfall: "YYYY-MM" | null }],
  ausgleich:  [{ artikelId,
                 aussondern?:  { menge, grund? },
                 zuruecklegen?: { menge, zielLagerortId, chargeId? },
                 auffuellen?:  { menge, herkunft, mitgezaehlt? } }],
  plomben:    [{ plombeId, nummer }],                    // nur neu gesetzte
  geraete:    [{ geraetId, vorhanden, zustand?, bemerkung?, selbsttest? }],
  flaschen:   [{ flascheId, druckBar }] }
```

Ablauf:
1. `requireLagerbuchAdmin()` (erste Anweisung), `withAuditContext`, zod (`ok:false` bei Fehler), `sendungId`-
   Wiederholung → Ergebnis von damals.
2. Riegel 5 (Einheit aktiv). Entnahmebox aktiv, falls ein Zurücklegen dorthin zielt. `druckZuHoch`.
3. **Eine** `db.transaction`. Jede fachliche Absage **wirft** `BuchungAbgewiesen` (nie `return` in der
   Transaktion — das würde committen); außerhalb wird sie zu `{ ok:false, fehler }`.
   Reihenfolge:
   1. Zählung: je gezähltem Artikel `korrekturAufLagerort(…, istSumme, referenz "check:<id>")`
      (Vollständigkeitsregel je Artikel).
   2. Aussondern: FEFO-Abbuchung `typ "korrektur"` an der Einheit, `referenz AUSSONDERN_PRAEFIX + einheit` — damit
      Aussonderungen nicht als Verbrauch zählen. Menge ≤ Bestand, sonst Absage.
   3. Zurücklegen: `umlagerungVonOrt` von der Einheit, Ziel Schrank (`RUECKLAUF_PRAEFIX`) oder Entnahmebox
      (`ENTNAHMEBOX_PRAEFIX`); `umgelagert < menge` → Absage. Verfallsbegleitung wie in den Actions
      (`verfallFolgtDemMaterial` bei der Box, `raeumeVerfallAmLeerenOrt` beim Schrank).
   4. Auffüllen: Handlager → `umlagerungAusBereich` mit Deckungsprüfung vorab (Absage statt Kappen); Ort →
      wie `bucheAufladen` (Charge gehört zum Artikel, Deckung an der Quelle, `AUFLADEN_PRAEFIX`); neu →
      `zugangAnEinheitBuchen`. Die Prüf- und Buchungslogik von Aufladen/Rücklauf wird dafür in tx-Funktionen
      (werfend) unter `_lib/schreibpfade/` gezogen und von den bestehenden Actions mitbenutzt — eine Regel, zwei
      Aufrufer.
   5. Verfall je Fach: `setzeFachVerfaelle` **zuletzt**, damit die Eingabe gilt und nicht von
      `verfallFolgtDemMaterial` überschrieben wird.
   6. Plomben: nur aktive der Einheit; Nummer setzen.
   7. Geräte, Flaschen: wie im Check (Mängel, `o2Messungen` mit Quelle, Kommentar mit `check:<id>`).
   8. `checks`-Zeile: `{ id: sendungId, fahrzeugId, quelleTyp:"oidc", quelleId, startedAt, completedAt, ergebnis }`
      mit `ergebnis = { version: 2, art: "verwaltung", positionen (nur gezählte), artikel, geraete, flaschen, verfall,
      plomben, kommentar?, abschluss }`. `artikel[]` bekommt optional `ausgesondert`, `zurueckgelegt`,
      `aufgefuellt` (und `nachfuellGebucht: 0`); `abschluss` zusätzlich Zähler `ausgesondert`, `zurueckgelegt`,
      `aufgefuellt`.
4. Nach der Transaktion `revalidiereBestand()` + Pfade `checks`, `sauerstoff`, Fahrzeugblatt; bei Mängeln
   `maengel`/`geraete`.

**Gemeinsamer Kern mit `checkAbschluss`:** Zählung→Korrektur (inkl. Vollständigkeitsregel), Plomben setzen,
Geräte/Mängel, Flaschen/Messungen, Fach-Verfall und das Schreiben der `checks`-Zeile ziehen in tx-Funktionen unter
`_lib/schreibpfade/check.ts`; `checkAbschluss` ruft sie auf und verhält sich danach **unverändert** (bestehende
Tests bleiben grün, unverändert). Riegel und Ergebnisform bleiben je Action eigen.

### 6.9 Lesen und Anzeigen der neuen Art

- `CheckErgebnisV2.art`, `parseCheckErgebnis`, `checkArtUndPlomben`, `CheckHistorieZeile.art`, `CheckDetail.art`:
  `"kurz" | "voll" | "verwaltung"`.
- Check-Liste: Chip „Verwaltung"; der Chip „aus Handlager nachgefüllt" bleibt nur für `nachfuellGebucht`; neue Chips
  für ausgesondert/zurückgelegt/aufgefüllt, wenn > 0.
- Check-Detail: Titel „Verwaltungscheck"; Spalten/Zeilen für die drei Bewegungen; Kommentar.
- `letzterCheckZeitpunkt`, Fahrzeugliste, Kurzcheck-Abdeckung: unverändert (art-unabhängig).

### 6.10 Release Note

Neue Notiz `portal/_lib/neuigkeiten/notizen/lagerbuch/<Rollout-Tag>-zaehlen.ts` + Zeile in `register.ts`
(Du-Form, Wörter vom Bildschirm, 1–3 Sätze).

### 6.11 Tests

- Vitest: `_actions/verwaltungscheck.test.ts` (Zählung, jede Bewegung, Absage rollt alles zurück, Idempotenz,
  Teilzählung, Art im Ergebnis, Aussondern nicht als Verbrauch), Tests für die neuen tx-Funktionen und die
  Umsetzen-Actions, `checkErgebnis`-Tests für `verwaltung`, DOM-Tests der Insel mit `qr/_lib/test-dom.tsx`.
- Wächter nachziehen: `guards.test.ts`, `revalidierung.test.ts`.
- e2e: `e2e/lagerbuch-verwaltungscheck.spec.ts` — Admin zählt am Fahrzeugblatt, sondert aus, füllt auf, schließt
  ab; Check erscheint in der Liste mit „Verwaltung"; Telefonbreite zeigt Karten mit Fach-Filter.

### 6.12 Festlegungen nach dem Prüferlauf (Calls des Bauenden, zum Gegenlesen)

1. **Zurücklegen braucht im Schrank eine Charge** (siehe 6.4). Die gemeinsame Rücklauf-tx-Funktion nimmt
   `chargeId` Pflicht; der Box-Weg nutzt den vorhandenen Box-Schreibweg mit optionaler Charge.
2. **Verfall:** gesendet werden nur **geänderte** Fächer und nur Fächer **gezählter** Positionen (nicht gezählte
   Fächer: Feld gesperrt). Sondert jemand bei einem Artikel aus und steht in einem seiner Fächer danach noch ein
   abgelaufener Verfall, sperrt die Leiste „Abschließen" mit dem Hinweis, den Verfall nachzutragen oder zu leeren.
   Server schreibt die gesendeten Werte zuletzt; keine weitere Absage.
3. **Plombennummer nur auf gezähltem Fach:** eine neue Nummer an einer Plombe mit `fachLabel` verlangt, dass **alle**
   Positionen dieses Fachs in diesem Abschluss gezählt sind (UI sperrt das Feld mit Hinweis; Server weist ab).
   Plomben ohne Fach decken nichts ab (`plombeDecktAb`) und sind frei. Zählen ohne neue Nummer lässt die Plombe
   wie im Vollcheck unberührt.
4. **„Offen" nach dem Ausgleich:** `offenJeArtikel` (`_lib/domain/check.ts`) wird um optionale Felder erweitert —
   `ausgesondert` und `zurueckgelegt` erhöhen, `aufgefuellt` senkt die Fehlmenge. Auffüllen **aus dem Handlager**
   zählt in `nachfuellGebucht` (der Chip „aus Handlager nachgefüllt" bleibt richtig), alle anderen Herkünfte in
   `aufgefuellt`. Alte Checks haben die Felder nicht → unverändert. Tests dazu.
5. **Schon eingeräumt?** Im Auffüllen-Dialog gibt es die Wahl **„Schon eingeräumt und mitgezählt"**. Dann bucht
   der Abschluss die Korrektur auf `Ist − menge` und lagert `menge` von der Herkunft um, Endstand = Ist. So passen
   beide Reihenfolgen der Erstbestückung (erst zählen, dann einräumen — oder umgekehrt), ohne dass Material aus dem
   Nichts entsteht. Ein Plus ohne Herkunft (Ist > Buchstand und kein Auffüllen) markiert die Ausgleichen-Zeile mit
   „Mehr als im Lagerbuch — woher?" (kein Sperren: Altbestand ohne Herkunft ist ein legitimer Fall).
6. **Abschluss ohne gezählte Position** ist erlaubt (nur Geräte, Flaschen oder Plomben) und gilt als Check; er
   schreibt `positionen: []` und berührt die Kurzcheck-Abdeckung nicht. Ganz leer (nichts erfasst) → „Abschließen"
   gesperrt.

## 7. Dem Bauenden überlassen

- Genaue Komponenten- und Dateischnitte, Texte im Rahmen von `docs/design/wortliste.md`.
- Ob die Reiter-Zähler und die Leiste Kennzahlen zusammenfassen.
- Wie viel von `AufladenDialog` in die gemeinsame Herkunfts-Komponente wandert.
