// src/app/m/radio/_lib/geraeteDiff.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): `FeldDiff` ist ein WERT, den
// die Schreib-Actions und ihre Tests lesen; eine Direktive machte daraus eine Modulreferenz.
// Der Scan, der das fuer `_lib/` und `_db/` modulweit durchsetzt, steht in
// `src/app/m/radio/riegel.test.ts:1064-1117`.
import type { Geraet } from "../_db/schema";

/**
 * Eine Feldaenderung, wie sie als Ereigniszeile in `device_events` landet.
 *
 * Die drei Namen sind die deutsche Entsprechung von `FieldDiff`
 * (`radio-admin/shared/src/schemas.ts`, gelesen ueber
 * `radio-admin/shared/src/diff-device.ts:20-24`): `field`/`oldValue`/`newValue`. Die
 * SPALTEN der Zieltabelle heissen weiter wie in der Quelle (`_db/schema.ts:130-132`) — nur
 * dieser Zwischenwert ist deutsch benannt, weil er keine Zuordnung des Importers traegt.
 */
export type FeldDiff = { feld: string; alt: string | null; neu: string | null };

/**
 * Stringifiziert einen gespeicherten Geraetewert fuer das Ereignisprotokoll;
 * `null`/`undefined` bleiben `null`.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/diff-device.ts:4-6` (`toEventValue`), samt der
 * Doppelpruefung auf `null` UND `undefined`: die Zielspalten `old_value`/`new_value` sind
 * `text` (`_db/schema.ts:131-132`), und `String(null)` ergaebe die Zeichenkette `"null"` —
 * ein Wert, den kein Leser mehr von einem echten Text „null" unterscheiden kann.
 *
 * ⚠️ ABWEICHUNG IN DER SCHREIBWEISE, NICHT IM VERHALTEN: die Quelle schreibt `v == null`.
 * Die ausgeschriebene Form ist zeichenweise dasselbe Praedikat und kommt ohne den lockeren
 * Vergleich aus, den ein spaeter eingeschaltetes `eqeqeq` verboete.
 */
function zuEreignisWert(wert: unknown): string | null {
  return wert === null || wert === undefined ? null : String(wert);
}

/**
 * Vergleicht ein bestehendes Geraet mit einem (bereits feldgefilterten) Patch.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/diff-device.ts:14-27` (`diffDevice`). Vier Regeln, und
 * jede ist im Alt-Code eine eigene Zeile:
 *
 * 1. ⛔ ITERIERT NUR DIE SCHLUESSEL DES PATCHES (`diff-device.ts:16`), nicht die des Geraets.
 *    Ueber das Geraet zu laufen kaeme mit dem `undefined`-Ausstieg unten auf dieselbe MENGE,
 *    aber in der Reihenfolge der Tabellenspalten statt in der des Patches — und die
 *    Ereigniszeilen einer Aenderung stuenden fuer immer in einer anderen Ordnung als die
 *    Felder, die die bedienende Person angefasst hat.
 * 2. ⛔ EIN FELD MIT DEM WERT `undefined` IST KEINE AENDERUNG (`:18`). Der Rollenfilter
 *    erzeugt diese Form real, sobald jemand ihn ueber seine Allowlist laufen laesst statt
 *    ueber den Patch — `_lib/rollen.ts:91-95` schreibt genau das aus. Ohne diesen Ausstieg
 *    truege jedes nicht gepatchte Feld eine Ereigniszeile nach `null`.
 * 3. ⛔ ROHER IDENTITAETSVERGLEICH ALS AUSSTIEG (`:19`, woertlich
 *    `if (existing[field] === next) continue;`) — keine Normalisierung, keine Falschheits-
 *    pruefung. Ein `"0"` gegen ein `0` ist damit eine Aenderung, und das ist gewollt: die
 *    siebzehn Datenspalten zwischen `_db/schema.ts:21` und `:49` sind `text` (nur
 *    `alamosIntegrated`, `:50`, und `loanable`, `:55`, sind es nicht) — zwei Werte, die
 *    verschieden aussehen, SIND verschieden.
 * 4. ⛔ ALT UND NEU WERDEN STRINGIFIZIERT, `null` BLEIBT `null` (`:22-23`, siehe
 *    `zuEreignisWert` oben).
 *
 * ⛔ UND DIE FOLGE, DIE DER AUFRUFER TRAEGT, NICHT DIESE FUNKTION: eine Aenderung ohne echten
 * Wertunterschied erzeugt KEIN Ereignis. Der fruehe Ausstieg steht zweimal im Bestand —
 * `if (diffs.length === 0)` in `radio-admin/server/src/routes/devices.ts:139-142` und
 * `if (diffs.length === 0) return;` in `radio-admin/server/src/repos/deviceRepo.ts:229`.
 * Kein Ereignis, kein `updatedAt`, kein `revalidatePath`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1251-1257`). Eigentuemer ist Aufgabe V10;
 * diese Funktion liefert dafuer die leere Liste, und `geraeteDiff.test.ts` haelt fest, dass
 * sie sie wirklich liefert.
 */
export function diffGeraet(bestehend: Geraet, patch: Partial<Geraet>): FeldDiff[] {
  const diffs: FeldDiff[] = [];
  for (const feld of Object.keys(patch) as (keyof Geraet)[]) {
    const neu = patch[feld];
    if (neu === undefined) continue;
    if (bestehend[feld] === neu) continue;
    diffs.push({
      feld: feld as string,
      alt: zuEreignisWert(bestehend[feld]),
      neu: zuEreignisWert(neu),
    });
  }
  return diffs;
}
