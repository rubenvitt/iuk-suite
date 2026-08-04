# Modul `lagerbuch` — Entscheidungsprotokoll

**Entschieden am 04.08.2026.** Alle dreizehn Punkte beantwortet: neun Empfehlungen bestätigt, vier
Abweichungen. Dieses Dokument ist ab jetzt das **Protokoll**, nicht mehr die Vorlage — die
ausführliche Begründung je Punkt steht in dem Plan, der ihn umsetzt.

**Kein Punkt blockiert noch etwas.** Die zwei, die vor einem Bauabschnitt fällig waren (D1, D2),
sind entschieden; der Bau kann in voller Länge laufen.

---

## Die vier Abweichungen — und was sie geändert haben

Diese vier sind der eigentliche Inhalt des Protokolls. Zwei davon ändern die Sicherheitslage, nicht
nur einen Wert.

### D3 — Der Gruppenname, den es nicht gab

**Entschieden: `SUITE_ADMIN_GROUP_LAGERBUCH = lagerbuch_nutzer`.**

⚠️ **Der Befund hinter der Entscheidung ist wichtiger als die Entscheidung.** Der Vorgabewert der
Alt-Anwendung heißt `lagerbuch-admin` — **mit Bindestrich** (`lagerbuch/src/lib/config.ts:46`). Eine
Gruppe dieses Namens gibt es in Pocket ID **nicht**: die Verzeichnisabfrage liefert zehn Gruppen,
deren Schlüssel durchweg Unterstriche benutzen, und genau **eine** davon ist lagerbuch-eigen —
`lagerbuch_nutzer` mit vier Mitgliedern. Der Alt-Vorgabewert kann also nie gegriffen haben; die
laufende Instanz muss `OIDC_ADMIN_GROUP` explizit gesetzt haben.

`lagerbuch_nutzer` ist die einzige plausible Wahl: das Modul kennt genau **eine** Zugriffsstufe, und
der Helfer-Weg braucht gar kein Konto — „Lagerbuch Nutzer" sind damit genau die Personen, die die
Verwaltung bedienen.

**Geändert:** 50 Fundstellen über fünf Pläne, plus die Begründung im Registry-Eintrag (Teil 1, T2).
Die Gruppenliste liegt ungetrackt unter `.betrieb-lokal/pocketid-gruppen.md`.

⚠️ **Vor dem Umschwenken des Routers einmal echt einloggen.** Die Boot-Prüfung fängt den **leeren**,
nicht den **falschen** Wert, und für dieses Modul gibt es bewusst keine Suite-Admin-Rückfallebene.
Ein falscher Wert ist ein stummes 404 für alle vier Personen.

### D6 — Der direkte Weg bleibt offen

**Entschieden: an der Infrastruktur wird nichts geändert.**

Damit ist die Restlücke kein hypothetischer Zweig mehr, sondern der **Ist-Zustand**: wer den
Container direkt erreicht, setzt `cf-connecting-ip` selbst und rotiert ihn nach Belieben. **Der
Per-Absender-Eimer ist deshalb keine Abwehr, sondern eine Bequemlichkeitsgrenze gegen Tippfehler.**
Was trägt, sind die **beiden modulweiten Zähler** — ihr Schlüssel ist konstant und als einziger
nicht rotierbar.

**Folge, die daran hängt:** `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` ist ab jetzt die
tragende Zahl, nicht die zweite Verteidigungslinie. Damit entscheidet **D5** (wie viele Codes
produktiv aktiv sind) unmittelbar über die Belastbarkeit: bei 100 aktiven Codes und 300 Versuchen
pro Stunde liegt der erwartete erste Treffer bei rund **1,4 Tagen**.

**Geändert:** Teil 2, §3.5 — die Lücke ist ausgeschrieben statt bedingt formuliert, samt der
Kopplung an D5. Sie gehört in die Cutover-Übergabe; kein Test kann sie sehen, weil kein Test die
Netztopologie kennt.

### D12 — Das Icon existiert, der Plan lag falsch

**Entschieden: das vorhandene Zeichen wird wiederverwendet.**

⚠️ **Die Planannahme war ein Messfehler.** Teil 4 schrieb: „das Manifest verweist auf `/icon.svg` —
und diese Datei existiert nicht", belegt mit `ls ../lagerbuch/public/`. **Im falschen Verzeichnis
gesucht.** Die Datei liegt unter `src/app/icon.svg` und wird über Nexts Dateikonvention im
App-Verzeichnis unter `/icon.svg` ausgeliefert. Der Manifest-Eintrag zeigt nicht ins Leere.

Das Zeichen ist ein abgerundetes Quadrat auf `#1a1d20` mit **einer roten und zwei weißen**
Regalmarken — 385 Bytes. Die frühere Beschreibung („Suite-Rot mit drei weißen Marken") beschrieb
eines, das es nicht gibt.

**Geändert:** Teil 4, E7 und T65 — das SVG wird byte-exakt portiert und per SHA-256 festgenagelt,
wie die drei PNGs es schon waren.

⚠️ **Ein Verlust bleibt und gehört ins Cutover-Anschreiben:** `apple-icon.png` und `favicon.ico`
wandern **nicht** mit. Beide sind Nexts Dateikonvention und lösen im Suite-Baum auf einem Pfad auf,
den der Host-Rewrite nie trifft — das Lesezeichen-Symbol der Lagerbuch-Domain wird das der Suite.
Die Nachrüstung wäre eine Suite-Frage (ein Symbol je Host), keine Modulfrage.

### D1 und D8 — zwei Wünsche, die größer sind als dieses Modul

**D1 (Backup): weder Modul-Timer noch Host-Cron als Zielbild, sondern ein Sidecar im Deployment.**
**D8 (Reportformat): Tabellenkalkulation bestätigt — und Excel als Standard für alle Module.**

Beide sind **nicht** in der Portierung umgesetzt, und beide haben einen eigenen Posten bekommen:

| | ClickUp | Warum getrennt |
|---|---|---|
| Backup-Sidecar statt Host-Cron | **DRK-185** | Betrifft den ganzen Stack, nicht ein Modul |
| Excel als Reportformat über alle Module | **DRK-186** | Ein Port reproduziert; eine Formatentscheidung für vier fremde Module darf keine Nebenwirkung einer Modul-Spec sein |

✅ **Bei D1 entsteht dadurch keine Lücke.** `scripts/backup.sh:29` sammelt bereits `$DATA_DIR/*.db`
ein — `lagerbuch.db` ist ab dem ersten Boot im Tarball. ⚠️ Das Skript läuft allerdings als
**Host-Cron, nicht im Container**, und genau diese Abhängigkeit soll das Sidecar ablösen. Preis der
heutigen Lösung, benannt: Tarball-Körnung statt Einzeldateien, `KEEP`-Generationen statt Tage.

⚠️ **Unabhängig davon gilt weiter:** das Verzeichnis `backups/` im Volume `lagerbuch_data` **vor**
dem Abbau des Alt-Stacks wegsichern — es ist die einzige historische Tiefe vor dem
Cutover-Snapshot.

Bei D8 bleibt es bis zur Umstellung bei **beidem** wie im Bestand: `bestellvorschlag.csv` mit
Formel-Neutralisierung **und** `bestand-JJJJ-MM-TT.xlsx`.

---

## Die neun bestätigten Empfehlungen

Ihre Annahmen sind damit zu **Festlegungen** hochgestuft; an den Plänen ändert sich nichts.

| # | Punkt | Festlegung |
|---|---|---|
| D2 | Schriftwahl | Verwaltung auf Geist, Helfer-Weg behält Barlow Condensed |
| D4 | Alt-Host zeichengleich? | Vor dem Freeze ablesen; weicht er ab, gehört „alle Helfer müssen einmal neu scannen" in die Cutover-Kommunikation |
| D5 | Aktive Zugangs-Codes | Vor dem Cutover abfragen; oberhalb von ~60 den Stundenwert senken. ⚠️ **Durch D6 aufgewertet** — siehe oben |
| D7 | Organisationszeile | Vor dem ersten Etikettendruck ablesen; sie wird Konstante, nicht Env |
| D9 | Etiketten-Probebogen | Erste und letzte Zeile, 15 cm, zwei Telefone; QR bleibt Level H |
| D10 | Host-Reihenfolge | Einfrieren, `lagerbuch.iuk-ue.de` auf Index 0 |
| D11 | Codes nur noch sperrbar | Ankündigen, mit dem Grund |
| D13 | Fahrzeugbindung | Bleibt Vorauswahl, kein Riegel |

---

## Was vor dem Cutover noch abzulesen oder zu tun ist

Keine Entscheidungen mehr — Handgriffe. Sie gehören ins Cutover-Runbook.

- [ ] `OIDC_ADMIN_GROUP` der laufenden Instanz gegen `lagerbuch_nutzer` gegenprüfen — **und einmal
      echt einloggen**, bevor der Router umschwenkt (D3)
- [ ] `APP_BASE_URL` der laufenden Instanz ablesen und gegen `SUITE_HOST_LAGERBUCH` halten (D4)
- [ ] `select count(*) from tokens where aktiv = 1` — bei mehr als ~60 den Stundenwert senken (D5)
- [ ] `APP_ORG` ablesen und in `_lib/marke.ts` eintragen (D7)
- [ ] Etiketten-Probebogen drucken und mit zwei Telefonen gegenscannen (D9)
- [ ] `backups/` aus dem Volume `lagerbuch_data` wegsichern, **vor** dem Abbau (D1)
- [ ] Cutover-Anschreiben: Codes nur noch sperrbar (D11) · Lesezeichen-Symbol wird das der Suite
      (D12) · ggf. „Kärtchen neu scannen" (D4)
- [ ] Restlücke aus D6 in die Cutover-Übergabe schreiben, nicht in eine Fußnote
- [ ] Import in `tokens`: Spalten immer namentlich nennen, nie `SELECT *` — Alt-Schema und
      regeneriertes Schema tragen ab Position 4 eine andere Spaltenreihenfolge (B1, b6b5a96); die
      still gefährlichste Variante ist ohnehin keine `SELECT *`, sondern eine von Hand geschriebene,
      aber falsch sortierte Spaltenliste

⚠️ **Bauauflage an Teil 2, kein Cutover-Handgriff — `tokens.aktiv` bleibt Drizzle-Lesung.** Die
Entwarnung zu B1 (verwürfelte `SELECT *`-Spalten reaktivieren keine gesperrten Codes) gilt **nur**,
solange `tokens.aktiv` über Drizzle gelesen wird (`eq(tokens.aktiv, true)`, das intern
`Number(value) === 1` mappt). Baut `_lib/zugang.ts` (Teil 2, §3) den Test stattdessen als rohes
`WHERE aktiv` statt `eq(aktiv, true)` bzw. `= 1`, kippt die Prüfung auf die SQL-Ebene, und bestimmte
`sub`-Werte reaktivieren dann gesperrte Zugangs-Codes. Ein Quelltext-Scan sieht das nicht, weil beide
Formen gültiges Drizzle sind. Gemessen, nicht vermutet: `"1"`, `"1.0"`, `" 1 "`, `"1e0"`, `"+1"` werden
als INTEGER 1 gespeichert und reaktivieren; UUID, `"42"`, `"007"`, `"0"`, `"true"` bleiben gesperrt.
Die Prüffrage für den Betreiber ist deshalb NICHT „sind meine subs numerisch?" (`"42"` und `"007"`
bleiben gesperrt), sondern wörtlich aus der Messung: „gibt es einen sub, dessen SQLite-INTEGER-
Konversion exakt 1 ergibt?" — und die Entwarnung selbst ist an Drizzles `mapFromDriverValue`
(`Number(value) === 1`) geliehen, nicht an einer allgemeinen Eigenschaft von SQLite.

---

## Anhang — vier Befunde ohne Entscheidungsbedarf

Sie stehen in den Plänen und brauchen von dir nichts.

1. **Fast jede `users`-Zeile des Altbestands ist auf eine Zufalls-UUID geschlüsselt.** Bis zum
   29.07.2026 schrieb die Alt-App bei jeder Anmeldung eine neue Waisenzeile. **Das Journal selbst
   ist heil** — dort stand immer die echte Kennung. Verseucht ist nur die Namens-Nachschlagetabelle.
   Folge: `select count(*) from users` ist **keine** Personenzahl.
   ⚠️ Für Personen, die sich seit dem 29.07. nicht mehr angemeldet haben, steht der Klarname **nur**
   in der Zeile, die der Import aussortiert — die brauchen eine Bereinigung über die Klarnamen. Der
   teuerste verbleibende Posten, gehört zu Spec 2.
2. **Dieselbe Altlast steht laut deinem `feedback`-Befund auch in der Suite selbst noch
   unbereinigt.** Der Bereinigungsentwurf wird deshalb **einmal** gemacht und auf **beide** Bestände
   angewandt — zweimal entworfen ergäbe zwei Verfahren, die dieselben Personen unterschiedlich
   zuordnen.
3. **`BESTELL_FAKTOR` hat nie etwas bewirkt.** Deklariert und gemappt, aber von keinem Produktivpfad
   gelesen. Ein produktiv gesetzter Wert ist **kein** Beleg dafür, dass jemand ein anderes Verhalten
   erwartet — er hat nie eines erzeugt. Die Variable wandert nicht mit.
4. **`deployment.md` der Alt-Anwendung widerspricht dem Code.** Dort steht „der Container schreibt
   aktuell keine Backups von selbst"; der Code tut es. Gehört beim Abbau korrigiert oder archiviert.
