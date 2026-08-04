/**
 * Die Werte, die Server Components lesen muessen — §4.15.
 *
 * KEIN "use client" und KEIN Icon-Import in dieser Datei. Die beiden Fallen sind
 * GEGENLAEUFIG und duerfen nicht zusammengelegt werden: ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an (Falle 6, HTTP 500), und
 * `@ant-design/icons` in RSC wirft schon beim Import (Falle 7). Wer "use client"
 * setzt, um Falle 7 zu „loesen", verwandelt sie in Falle 6: HTTP 200 mit leerer
 * Map und still falschem Wert. Laut ist besser als still.
 *
 * ZUSTAENDE stand bis zum Port in CheckFlow.tsx:22 — einer Client-Datei.
 */

/** Die feste Lagerort-Zeile. 75 Fundstellen im Alt-Repo; jede Entnahme, Inventurkorrektur,
 *  Aussonderung und Nachfuellung bucht gegen genau diese ID. */
export const HANDLAGER_ID = "handlager";

/** Kodiert „kein Verfall". Auf NULL umgestellt kippen Ampel, Verfall-Liste und die
 *  FEFO-Sortierung (fefo.ts sortiert ueber den String) fuer jede so angelegte Charge. */
export const PSEUDO_VERFALL = "2099-12";
export const istOhneVerfall = (verfall: string): boolean => verfall === PSEUDO_VERFALL;

/** Herkunftshinweise in chargen.chargen_nr — NICHT Bedeutungstraeger. Die Bedeutung
 *  „ohne Verfall" haengt am Verfallswert (§5.3.2). */
export const CHARGE_KORREKTUR = "Korrektur";
export const CHARGE_INVENTUR = "Inventur";
export const CHARGE_OHNE_VERFALL = "ohne Verfall";

/** Entscheidung 2 (b): kein Backfill der Altdaten, aber ab jetzt z.enum() beim Schreiben.
 *  Beim Schreiben streng, beim Anzeigen tolerant (§5.8.2). */
export const ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"] as const;
export type Zustand = (typeof ZUSTAENDE)[number];
/** Der Vertrag der serverseitigen Auswertung an drei Stellen. Ein unbekannter Altwert
 *  zaehlt NICHT als auffaellig. */
export const ZUSTAND_DEFEKT: Zustand = "Defekt";

/** Entscheidung 6 (a): der EINZIGE Monatsvalidator des Moduls. Der laxe Ausdruck
 *  /^\d{4}-\d{2}$/ aus buchung.ts:17 und bz.ts:83 faellt ersatzlos weg. */
export const MONAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Form der zwei Tagesfelder (geraete.mtk_faellig, geraete.ablaufdatum). Die Form allein
 *  genuegt nicht — "2026-02-31" ist formgerecht und kein Kalendertag. */
export const TAG_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form UND ueberrollfreier Kalendertag. Portiert aus `parseTag`
 * (lagerbuch/src/lib/domain/geraet.ts:16-25): die Alt-App hat am Eingang gar keinen
 * Validator, die Robustheit sitzt im Leser, und `null` bedeutet dort grau statt rot
 * („damit frisch angelegte Geraete keinen Fehlalarm ausloesen"). Diese Toleranz wandert
 * 1:1 mit; ergaenzt wird sie hier um dieselbe Pruefung am EINGANG, damit neue Zeilen
 * den Fall nicht mehr erzeugen. Altzeilen bleiben unberuehrt.
 */
export function istEchterKalendertag(s: string): boolean {
  if (!TAG_REGEX.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/**
 * Die Enum-Listen fuer die Zod-Seite. Die Drizzle-Seite steht in `_db/schema.ts` —
 * §4.15 fuehrt bewusst beide Orte: der Drizzle-Enum ist ein 1:1-Port des Bestands,
 * diese Listen sind der Eingangsvalidator. `_lib/konstanten.test.ts` behauptet die
 * Mengengleichheit, damit sie nicht auseinanderlaufen. Die REIHENFOLGE darf abweichen
 * — SQLite-`text({enum})` erzeugt keinen CHECK, sie ist im SQL unsichtbar.
 */
export const BUCHUNGSTYPEN = ["zugang", "entnahme", "korrektur", "umlagerung"] as const;
export const QUELLE_TYPEN = ["token", "oidc", "system"] as const;
export const LAGERORT_TYPEN = ["lager", "fahrzeug"] as const;
export const GERAETE_TYPEN = ["medizin", "objekt"] as const;
export const TOKEN_ZIEL_TYPEN = ["fahrzeug", "artikel"] as const;
