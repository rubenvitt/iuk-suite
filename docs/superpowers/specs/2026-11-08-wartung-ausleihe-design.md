# Gerätewartung: Kisten als Einheit, Entnehmen und Zurücklegen — Konzept

- **Datum:** 2026-11-08
- **Status:** Entwurf
- **Modul:** `src/app/m/wartung`
- **Anlass:** Der erste Import des I&K-Lagers (Racks, Richtfunk-Kisten, Zubehörkisten) hat gezeigt, dass das
  Modell nicht zu Behältern passt. Er wurde zurückgenommen (15 Akten ausgemustert); Gerätearten, eine Prüfart
  und Unterlagen hängen noch daran, weil es kein endgültiges Löschen gibt.

## 1. Worum es geht

Das Material der Fachgruppen liegt fast nur in Kisten: Kabel, Blitzschutz, Switches, Netzteile, Richtfunk-Sätze.
Ehrenamtliche prüfen selten, und benutzt wird das Material selten. Deshalb soll die Prüfung dann passieren, wenn
man das Material ohnehin in der Hand hat: beim Durchgehen der Kiste und beim Zurücklegen nach einem Einsatz.

Der Moment, um den es geht: Jemand steht im Lager vor einer Kiste und scannt den QR-Code — entweder, um sie
durchzugehen („ist alles da, funktioniert alles noch?“), oder um Material für einen Einsatz herauszunehmen bzw.
es danach zurückzulegen.

## 2. Entschieden (vom Gruppenführer)

1. **Die Kiste ist die Einheit.** Was in einer Kiste liegt, bekommt keine eigene Akte und keinen eigenen
   Prüfplan. Racks und Richtfunk-Kisten sind ebenfalls Kisten.
2. **Das Etikett zeigt, was drin ist.** Gibt es schon (`(druck)/etiketten/kisten`, A6 mit QR, Standort,
   Soll-Inhalt) — bleibt so.
3. **Jede Kiste hat ihre eigene Prüfanleitung.** Weil jede Kiste anders gepackt ist, hängt sie an der Kiste, nicht
   an der Geräteart. Inhalt etwa: „Kabel auf Knicke und Stecker ansehen, Blitzschutz auf Sichtschäden, alles zählen,
   wieder hinein.“ Die Anleitungen schreibt die Gruppe selbst.
4. **Entnehmen** per Scan: einzelne Positionen mit Anzahl abhaken **oder** „ganze Kiste mitnehmen“. Optional ein
   Zweck („Übung Stadtfest“).
5. **Gespeichert wird, wer entnommen hat.**
6. **Solange etwas draußen ist**, steht an der Kiste sichtbar, was unterwegs ist, und die Übersicht der Gruppe
   zeigt alle Kisten und Geräte, aus denen etwas fehlt.
7. **Zurücklegen** per Scan: die Prüfanleitung kurz durchgehen und Position für Position bestätigen, was wieder
   drin ist. Was nicht zurückkommt, wird ein Fehlt-Mangel (wie heute beim Durchzählen); Kaputtes meldet man
   direkt als Mangel. Das ist der Check „nach Benutzung“.
8. **Beim Entnehmen** genügt ein kurzer Blick; keine Pflicht-Checkliste „vor Verwendung“.
9. **Einzelne Geräte** außerhalb von Kisten (Server, Monitor, später Starlink, Einsatz-PC) funktionieren genauso:
   entnehmen, zurücklegen mit Check nach Benutzung. Die Elektroprüfung (DGUV) bleibt einmal im Jahr am
   Elektro-Termin.
10. **Elektrische Teile in einer Kiste** (PoE-Injektoren, Netzteile): Die Kiste bekommt die DGUV-Prüfart; die
    Elektrofachkraft prüft den Kisteninhalt am Stück.

## 3. Ziele

- Kisten-Akte mit eigener Prüfanleitung (Freitext), gepflegt in der Verwaltung, sichtbar am Telefon beim
  Durchzählen und beim Zurücklegen.
- Entnehmen und Zurücklegen am Telefon (`/g/[id]`), für Kisten (Teile oder ganz) und für einzelne Geräte.
- Sichtbarer Stand „unterwegs“ an der Akte, am Telefon und in einer Übersicht der Gruppe.
- Endgültiges Löschen unbenutzter Akten, damit der zurückgenommene Import restlos verschwindet.
- MCP: Prüfanleitung setzen, Unterwegs-Stand lesen (ohne Namen), unbenutzte Akte löschen.

## 4. Nicht-Ziele

- **Geräte in Kisten verschachteln** (Gerät mit eigener Akte liegt in einer Kiste). Ersetzt durch Entscheidung 2.1.
- **Checklisten je Prüfart.** Mit der Prüfanleitung je Kiste nicht mehr nötig. Geräte behalten die Checkliste
  ihrer Art für die interne Prüfart.
- **Prüfarten „vor Verwendung“ / „nach Benutzung“ im Katalog.** Der Katalog bleibt für Fristen; der Check nach
  Benutzung hängt am Zurücklegen (siehe 6.3).
- **Entnehmen und Zurücklegen über MCP.** Das ist eine Handlung am Material.
- **Wer was von wem übernimmt** (Weitergabe draußen), Reservierungen für geplante Einsätze, Fälligkeitsdaten
  für die Rückgabe.
- **Verbrauchsmaterial und das Modul `lagerbuch`.** Dessen Buchungen sind für Artikel und Lagerorte gebaut; hier
  geht es um Akten der Gerätewartung. Kein Zusammenlegen.
- **Neuimport des I&K-Lagers.** Kommt danach, mit dem neuen Modell, als eigener Schritt.

## 5. Randbedingungen

- Stack und Muster des Moduls: Next.js, drizzle, SQLite, Migrationen unter `_db/migrations` (zuletzt `0006`),
  Schreibfunktionen in `_lib/schreiben.ts`, Lesefunktionen in `_lib/daten.ts`, Telefon-Seiten unter
  `(geraet)/g/[id]/…`, MCP-Werkzeuge in `_mcp/werkzeuge.ts`.
- `pruefart` und `eintrag` bleiben unverändert (CHECK-Constraints auf Intervall und `typ`; ein Umbau hieße in
  SQLite Tabellen neu bauen).
- **Personenbezug:** Der MCP-Server sagt zu: „Personenbezogene Daten … gibt es hier nicht.“ Werkzeuge liefern
  deshalb beim Unterwegs-Stand keine Namen, nur „unterwegs seit …, Zweck …“. In der App sieht die Gruppe, wer
  entnommen hat, wie heute bei `mangel.gemeldetVon`.
- Wer entnimmt, ist die angemeldete Person (`Kontext.wer`, wie `eintrag.wer`); nichts zum Abtippen.
- Ausmustern bleibt, wie es ist (Verlauf bleibt). Endgültig löschen nur, wo es keinen Verlauf gibt.
- Oberflächentexte deutsch mit echten Umlauten, Bezeichner ASCII.

## 6. Das Wie, soweit festgelegt

### 6.1 Prüfanleitung

Neue Spalte `geraet.pruefanleitung` (Text, Default `""`). Gilt für Kisten und Geräte. Gepflegt in der Akte
(`GeraetAkte.tsx`), gezeigt am Telefon über dem Durchzählen und über dem Zurücklegen, mit Absätzen
(einfacher Text, Zeilenumbrüche bleiben). Leer = Abschnitt fehlt. *(Meine Entscheidung: Freitext statt eigener
Checkpunkte je Kiste — die Gruppe soll in eigenen Worten schreiben; `inhalt.bemerkung` bleibt der Hinweis je
Position.)* Nicht aufs Etikett.

### 6.2 Entnahme

Zwei neue Tabellen:

- `entnahme`: `id`, `geraet_id` (FK, cascade), `nutzer` (OIDC-`sub` über `nutzerAus(viewer)`; `Kontext` bekommt
  dafür ein Feld), `wer` (Anzeigename zum Zeitpunkt, wie `eintrag.wer`), `zweck` (Text, Default `""`), `ganz`
  (boolean: ganze Kiste bzw. ganzes Gerät), `entnommen_am` (Millisekunden wie alle Zeitspalten des Moduls,
  `kontext().jetzt`), `zurueck_am` (null = offen), `zurueck_wer`.
- `entnahme_position`: `entnahme_id` (FK, cascade), `inhalt_id` (FK, `set null`), `text` (Positionsname zum
  Zeitpunkt), `menge` (≥ 1), `zurueck` (Menge, die bisher zurückgekommen ist, Default 0), `fehlt` (boolean:
  der Rest ist als fehlend gemeldet).

Für ein Gerät ohne Inhaltsliste ist jede Entnahme `ganz` und hat keine Positionen. Mehrere offene Entnahmen an
einer Kiste sind erlaubt (zwei Leute nehmen verschiedene Teile). „Ganze Kiste“ geht nur, wenn keine
Teil-Entnahme offen ist, und schließt weitere Entnahmen aus, bis sie zurück ist. Mehr entnehmen als
Soll − unterwegs geht nicht.

**Unterwegs** einer Position = Summe `menge − zurueck` über Positionen offener Entnahmen ohne `fehlt`, bzw. der
ganze Soll bei offener ganzer Entnahme.

**Wer darf:** Entnehmen und Zurücklegen darf, wer heute am Gerät prüfen und Mängel melden darf (`zugang`). Jeder
mit diesem Zugang darf auch fremde Entnahmen zurücklegen. *(Meine Entscheidung.)*

### 6.3 Zurücklegen

Telefon: „Zurücklegen“ zeigt die Prüfanleitung und darunter alle unterwegs befindlichen Positionen der Kiste,
gruppiert nach Entnahme (mit Zweck, wer, seit wann). Je Position eine Menge „wieder da“ und für den Rest die
Wahl „noch draußen“ (Default) oder „fehlt“. Dazu „Mangel melden“ wie heute. Bei einem Gerät: „in Ordnung“ oder
„Mangel melden“.

- „wieder da“ erhöht `zurueck`; Nachreichen später geht. *(Meine Entscheidung.)*
- „fehlt“ setzt `fehlt` und meldet einen Fehlt-Mangel an der Position über denselben Weg wie das Durchzählen
  (`mangel.fehlt`, `inhaltId`, höchstens ein offener je Position). Er ist **einsatzbereit** (kein Sofort-Push);
  herabgestuft wird er wie heute, wenn eine spätere Zählung die Position weiter fehlend findet.
- Kommt eine Position vollständig zurück, löst das einen offenen Fehlt-Mangel derselben Position auf, wie beim
  Durchzählen.
- Eine Entnahme ist geschlossen (`zurueck_am`), wenn jede Position vollständig zurück oder als `fehlt` markiert
  ist; bei ganzen Entnahmen mit dem Zurücklegen selbst.
- „Mangel melden“ läuft über `mangelMelden` und schreibt damit wie heute einen `eintrag` vom Typ `mangel`.
  Sonst entsteht beim Zurücklegen kein `eintrag`; der Verlauf der Akte liest Entnahmen zusätzlich aus `entnahme`
  und zeigt sie neben den Einträgen.

**Ganze Kiste zurück:** Das Zurücklegen ist ein vollständiges Durchzählen aller Positionen und läuft über
`pruefungAbschliessen` (Kisten-Zweig in `PruefungAmGeraet`) mit der internen Prüfart der Kiste. Es schreibt
also einen `eintrag` vom Typ `pruefung` mit Ergebnis und setzt damit die Frist neu. Danach ist die Entnahme
geschlossen. Das gilt nur für die interne Prüfart (das Durchzählen); DGUV und Fachfirma bleiben davon unberührt.
Teil-Rückgaben setzen keine Frist. *(Entschieden am 08.11.2026.)*

### 6.4 Durchzählen, während etwas unterwegs ist

Das bestehende Durchzählen (`PruefungAmGeraet` mit `kiste`, `g/[id]/pruefung`, `pruefungAbschliessen`, ebenso
`wartung_pruefung_abschliessen`) erwartet je Position **Soll − unterwegs** und zeigt „davon n unterwegs“.
Unterwegs erzeugt keinen Fehlt-Mangel und stuft die Kiste nicht herab. Der Unterwegs-Stand gehört in den
Abgleich auf veraltete Daten: Hat sich zwischen Öffnen und Senden etwas am Unterwegs-Stand geändert, wird die
Zählung wie heute als veraltet abgelehnt. Ist die ganze Kiste unterwegs, ist Durchzählen gesperrt („Kiste ist
unterwegs seit …“); die Frist läuft weiter.

Eine Entnahme macht eine Kiste nie „nicht einsatzbereit“ und löst keinen Sofort-Push aus.

**Inhaltsliste ändern, während etwas unterwegs ist** (`inhaltSpeichern`, auch über MCP): Eine Position mit
Unterwegs-Menge darf nicht gelöscht und ihr Soll nicht unter die Unterwegs-Menge gesenkt werden; Fehler mit
Grund. Umbenennen geht (die Entnahme hat den Text zum Zeitpunkt).

**Ausmustern** mit offener Entnahme ist gesperrt („erst zurücklegen“).

### 6.5 Sichtbar unterwegs

- Telefon `/g/[id]`: oben ein Hinweis „Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz — seit 07.11., Übung
  Stadtfest, Name“ und die Knöpfe „Entnehmen“ / „Zurücklegen“. Die Seite ist ohne Anmeldung offen: Ohne
  Anmeldung steht nur „Unterwegs: … seit …“, ohne Name und Zweck (wie die Mängeltexte, IDA-337).
- Akte in der Verwaltung: derselbe Hinweis, plus Entnahmen im Verlauf.
- Übersicht: In der Geräteliste der Verwaltung ein Filter bzw. Abschnitt „Unterwegs“ mit allen Akten, aus denen
  gerade etwas draußen ist.

### 6.6 Endgültig löschen

`geraetLoeschen(db, id)`: nur für **ausgemusterte** Akten ohne `eintrag`, ohne `mangel` und ohne `entnahme`.
Löscht Inhalt, Prüfplan-Abweichungen und Unterlagen samt Dateien unter `DATA_DIR/wartung/unterlagen/`.
Sonst Fehler mit Grund („hat einen Verlauf — bitte ausgemustert lassen“). Darf, wer die Akte verwalten darf
(Verwalter der Gruppe). In der Akte ein Knopf „Akte endgültig löschen“ mit Bestätigung, nur sichtbar, wenn
erlaubt.

### 6.7 MCP

- `wartung_geraet_aendern` nimmt `pruefanleitung` an; `wartung_geraet` liefert sie.
- `wartung_geraet` und `wartung_geraete` liefern `unterwegs` (Positionen, Mengen, seit, Zweck — ohne Namen).
- `wartung_pruefung_abschliessen` und `wartung_inhalt_speichern` halten die Regeln aus 6.4 ein.
- Neu: `wartung_geraet_loeschen` mit denselben Regeln wie 6.6.

### 6.8 Aufräumen danach

Nach dem Ausrollen, über MCP:

1. Die 15 ausgemusterten Akten des zurückgenommenen Imports endgültig löschen. Hat eine doch Verlauf, bleibt sie
   ausgemustert, und ihre Art bleibt stehen; die Regel wird dafür nicht gelockert.
2. Die Gerätearten Netzwerktechnik, Richtfunk und WLAN, Elektro-Zubehörkisten löschen (`wartung_art_loeschen`).
3. Erst danach die Prüfart „Jährliche Durchsicht“ (`wartung_pruefart_loeschen`); vorher lehnt die Regel „eine
   selbst erledigte Prüfart je Kiste“ das ab.

## 7. Dem Bauenden überlassen

Schnitt der Komponenten, Server-Actions vs. Routen nach Muster des Moduls, Migrationsname, Tests (je neue
Schreibfunktion mindestens ein Test in `schreiben.test.ts`-Art, Durchzählen mit Unterwegs, Teil-Rückgabe mit
Nachreichen, Löschen mit und ohne Verlauf), Wortlaut der Knöpfe innerhalb des Tons der bestehenden
Telefon-Seiten.

## 8. Offen

Nichts.

## 9. Nachtrag 08.11.2026: Abgleich mit Prüfungen vor/nach dem Einsatz (#524)

Mit main kam #524 (IDA-369): Prüfarten auf Anlass („Vor Verwendung“, „Nach Benutzung“), die Vermerke `einsatz` und
`rueckkehr` in `eintrag`, der Knopf „Wird eingesetzt“/„Zurück“ und `imEinsatz`. Entschieden vom Gruppenführer:

1. **Kisten:** Entnehmen und Zurücklegen bleiben und speisen den Mechanismus aus #524.
   - Wird eine Kiste unterwegs (erste offene Entnahme, Teil oder ganz), schreibt `entnehmen` in derselben
     Transaktion den Vermerk `einsatz`, über dieselbe Funktion wie „Wird eingesetzt“; ein doppelter schreibt nichts.
   - Ist danach keine Entnahme mehr offen (über `zuruecklegen` oder die Rückgabe der ganzen Kiste), wird in derselben
     Transaktion `rueckkehr` geschrieben. Damit wird die Prüfart „nach Benutzung“ der Art fällig.
   - Nach dem Zurücklegen am Telefon: ist jetzt eine Prüfung „nach Benutzung“ fällig, geht die Seite direkt dorthin
     (`/g/[id]/pruefung?art=<Prüfart>`), sonst zurück zum Steckbrief.
   - Die Rückgabe der ganzen Kiste (`?rueckgabe=`) bindet sich an die selbst erledigte Prüfart **nach Frist** und zählt
     als deren Prüfung (Frist neu), nie an eine Prüfart auf Anlass. Sie schreibt `rueckkehr`; wird damit „nach
     Benutzung“ fällig, erfüllt dieselbe Zählung auch sie: ein zweiter `eintrag` vom Typ `pruefung` für diese Prüfart
     (dieselben Antworten, dasselbe Ergebnis, eigene Kennung, Mängel nur am ersten), kein zweites Durchzählen.
     *(Nachentscheidung 08.11.2026: bei einer Kiste ist „nach Benutzung“ dasselbe Durchzählen.)*
   - Steckbrief und Akte einer Kiste zeigen keinen „Wird eingesetzt“/„Zurück“; auch der Vermerk über MCP lehnt Kisten ab.
     Es gibt je Kiste genau einen Weg.
   - Folge der Bindung: „Ganze Kiste mitnehmen“ geht nur, wenn die Kiste eine Prüfart nach Frist hat, die man selbst
     erledigt; sonst käme sie nie zurück. Solange die ganze Kiste unterwegs ist, lässt sich diese Prüfart weder aus ihrem
     Prüfplan noch aus ihrer Art entfernen („Erst zurücklegen: …“).
   - Eine Kisten-Art und der Prüfplan einer Kiste haben keine Prüfart „vor Verwendung“ (2.8: beim Entnehmen genügt ein
     kurzer Blick; sonst wäre sie an jeder Kiste unterwegs überfällig). *(Nachentscheidung 08.11.2026.)*
2. **Einzelne Geräte:** „Wird eingesetzt“/„Zurück“ aus #524 gilt; Entnehmen und Zurücklegen gibt es für Geräte nicht
   mehr („Geräte meldest du mit „Wird eingesetzt“.“). Ist ein Gerät im Einsatz, zeigen Steckbrief und Akte
   „Im Einsatz seit TT.MM., Name“ aus dem `einsatz`-Eintrag; ohne Anmeldung ohne Namen, der MCP-Server ohne Namen.
   Sperren bleiben wie in #524 (`imEinsatz` sperrt nichts).
3. **Prüfanleitung:** bleibt und steht über der Checkliste bei jeder Prüfung am Gerät, auch vor Verwendung und nach
   Benutzung, und über dem Zurücklegen.

**Überholt** durch Entscheidung 2: 2.9 (einzelne Geräte entnehmen und zurücklegen), in 6.2 der Satz „Für ein Gerät
ohne Inhaltsliste ist jede Entnahme `ganz` und hat keine Positionen.“ und in 6.3 der Gerät-Zweig („Bei einem Gerät:
„in Ordnung“ oder „Mangel melden“.“), dazu in 3 „… und für einzelne Geräte“ und in 2.6 „… und Geräte, aus denen
etwas fehlt“ (unterwegs ist nur noch eine Kiste). Ebenso der Nicht-Ziel-Punkt in 4 zu Prüfarten „vor Verwendung“/„nach
Benutzung“: sie kamen mit #524, und das Zurücklegen macht „nach Benutzung“ fällig, statt sie zu ersetzen. Durch
Entscheidung 1 überholt ist in 6.3 „Sonst entsteht beim Zurücklegen kein `eintrag`“: Entnehmen und Zurücklegen
schreiben jetzt die Vermerke `einsatz` und `rueckkehr`, und der Verlauf der Akte zeigt sie neben den Entnahmen.
