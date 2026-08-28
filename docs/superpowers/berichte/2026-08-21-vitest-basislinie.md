# Die Grundlinie der Testsuite — gemessen am 2026-08-21

> **Wozu diese Seite.** Das Tor jeder Aufgabe der `radio`-Wege lautet unter anderem „**kein neuer
> Fehlschlag** in einer Datei, die der Diff nicht anfasst". Diese Klausel ist ohne eine datierte
> Grundlinie nicht durchsetzbar — jeder Bauende raet sonst, was vorbestehend rot ist. Hier steht
> die Messung, damit niemand raet.

## Das Ergebnis

```
Test Files  441 passed (441)
     Tests  7991 passed (7991)
  Duration  38.81s
```

**Exit 0. Die Suite ist vollstaendig gruen.** Keine Fehlschlaege, keine uebersprungenen Dateien.

| Wert | Messung |
|---|---|
| Kommando | `NO_COLOR=1 pnpm vitest run` (roh, ohne `rtk`-Filter — der Zaehlwert sollte ungefiltert abgelesen werden) |
| Stand | `main` bei `82741b1`, Arbeitsbaum sauber |
| Datum | 2026-08-21 |
| Node | `v26.7.0` |
| vitest | `4.1.10` (aufgeloest aus `^4.1.5` in `package.json`) |

⚠️ **Rauschen, das kein Fehlschlag ist:** die Ausgabe enthaelt viele Zeilen
`Not implemented: Window's getComputedStyle() method: with pseudo-elements` — eine jsdom-Warnung,
kein roter Test. Wer die Ausgabe mit `tail` liest, sieht sie und darf sie nicht fuer Fehler halten.

⚠️ **`--reporter=basic` gibt es in vitest 4 nicht mehr** — es wirft einen `Startup Error`
(`Failed to load custom Reporter from basic`), der wie ein Suitefehler aussieht und keiner ist.

## Was sich damit gegenueber dem 2026-08-20 geaendert hat

Der Ausfuehrungsplan (`2026-08-18-radio-ausfuehrungsplan.md`) und der Modul-Leitplan
(`2026-08-21-radio-modul-leitplan.md`) fuehren beide einen Absatz, der heute **ueberholt** ist:

> „Der volle `rtk pnpm vitest run` ist vorbestehend rot — am 2026-08-20 gemessen **170
> Fehlschlaege in 9 Dateien** (`m/feedback`, `m/files`, `m/qr`, `components/providers`)."

**Das ist behoben.** Die Ursache war die, die der Absatz als Leitbild nannte —
`TypeError: Cannot read properties of undefined (reading 'clear')` auf `localStorage.clear()`:
Node 26 bringt ein eigenes `localStorage` mit, das jsdoms verdeckt. Gerichtet auf `main` in

* `d085057` — *fix(tests): Node sein eigenes localStorage abschalten — es verdeckte das von jsdom*
* `40981bc` — *fix(tests): offeneDescriptoren() traegt jetzt auch auf macOS*

## Drei Folgen

1. ⛔ **Das Tor „voller `vitest run` gruen" ist wieder erreichbar.** Die Ersatzformel der Plaene
   (typecheck 0 · lint 0 · eigene Dateien gruen · kein neuer Fremdfehlschlag) bleibt gueltig und
   ist die schaerfere Lesart — aber sie ist ab heute **nicht mehr die einzige moegliche**.
2. **Der eigene Auftrag „die 170 richten" ist erledigt** und blockiert nichts mehr. Er stand in
   keinem der fuenf Cutover-Plaene und war vor dem Cutover faellig.
3. ✅ **§3.6 Nr. 1 von Spec 2** („drei gruene Tests vor der ersten Generalprobe") ist nicht mehr
   durch eine rote Suite blockiert.

## Wie diese Zahl zu benutzen ist

Ab jetzt gilt: **jeder** Fehlschlag ist ein neuer Fehlschlag. Wer einen sieht, hat ihn verursacht,
bis die Beiseitelege-Gegenprobe das Gegenteil zeigt (die eigenen Dateien temporaer verschieben,
voll laufen lassen, zuruecklegen).

⚠️ Diese Zahl ist **datiert**. Wer sie in einer spaeteren Sitzung als Grundlage nimmt, misst sie
neu — ein Update von `node`, `vitest` oder `jsdom` genuegt, um sie umzustossen.
