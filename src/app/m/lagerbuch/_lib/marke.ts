/**
 * Die Wortmarke des Moduls — §10.2, drei Alt-Env-Variablen (APP_NAME, APP_ORG,
 * APP_TAGLINE, `lagerbuch/src/lib/config.ts:30-32`).
 *
 * ZWEI SIND KONSTANTEN, EINE IST KONFIGURATION. Marke und Unterzeile sind
 * Gestaltung und bleiben im Quelltext. Der ORGANISATIONSNAME ist es nicht: er
 * ist das einzige an dieser Datei, was von Betreiber zu Betreiber verschieden
 * ist (Annahme A-T3-4 hielt ihn fuer eine Runbook-Eingabe und damit fuer einen
 * Ein-Zeilen-Commit — die Betreiberentscheidung ist stattdessen ein Regler).
 * Er liest deshalb `LAGERBUCH_ORGANISATION`, in derselben Form wie die sechs
 * Zahlen in `_lib/grenzen.ts`.
 *
 * ⚠️ DER ZUGRIFF IST EINE FUNKTION, KEINE KONSTANTE, und das ist der ganze
 * Punkt: gelesen wird BEI JEDEM AUFRUF, nicht beim Import (`grenzen.ts`,
 * §10.8 Eigenschaft 3). Ein `export const … = process.env.…` waere beim
 * Modulimport festgelegt — in einem Route Handler also zur Bauzeit des
 * Bundles und nicht zur Anfragezeit, und der Regler stuende still auf dem
 * Wert, den der Build gesehen hat.
 *
 * ⚠️ NUR AUF DEM SERVER AUFRUFEN — die teure Falle dieser Datei, und sie ist
 * IN DER ENTWICKLUNG UNSICHTBAR. Gemessen mit einem direkten
 * `process.env.LAGERBUCH_ORGANISATION` im Gate:
 *
 *   `next dev`               vor UND nach der Hydration der richtige Name.
 *                            Der Wert wird NICHT ins Bundle inlined (auch der
 *                            Bauzeit-Wert steht in keinem `.next/static`-Chunk
 *                            — nachgesehen); er bleibt eine Laufzeitabfrage,
 *                            und der erste Anstrich kommt ohnehin per SSR, wo
 *                            die Prozessumgebung da IST.
 *   `next build`/`start`     SSR-HTML traegt den Laufzeitwert („LAUFZEIT"),
 *                            NACH DER HYDRATION steht „DRK Bereitschaft
 *                            Musterstadt" da — der Browser hat kein
 *                            `process.env` (nur `NEXT_PUBLIC_*` wird inlined),
 *                            der `??`-Zweig greift, und React ersetzt den
 *                            Textknoten.
 *
 * Also: gruen in der Entwicklung, gruen im ersten Byte des Produktionsabrufs,
 * falsch ab der Hydration. Deshalb ist das Gate (`"use client"` wegen
 * `useActionState`) NICHT der Leser — es bekommt den fertigen String als Prop
 * von `page.tsx`; ein String ist serialisierbar und darf die RSC-Grenze queren.
 *
 * ⚠️ DAS TOR IST DER QUELLTEXT-SCAN, NICHT DER E2E-TEST. `marke.test.ts` prueft,
 * dass keine `"use client"`-Datei des Moduls diese Funktion nennt — und das ist
 * die einzige Stelle, die die Rueckkehr zur bequemen Direktimport-Form faengt:
 * `e2e/lagerbuch-organisation.spec.ts` faehrt gegen `next dev` und war mit
 * genau dieser Mutation GRUEN (gemessen).
 *
 * KEINE CLIENT-DIREKTIVE IN DIESER DATEI. Die PWA-Route (§7.10.2) ist
 * Server-Code; ein Wert aus einem Client-Modul kaeme dort als Client-Referenz
 * an, HTTP 500 fuer die ganze Seite (Falle 6).
 *
 * ⚠️ DIE VORGABE WIRD NICHT EXPORTIERT. Ein exportierter Vorgabewert waere der
 * bequeme Weg an der Funktion vorbei — importierbar auch aus einer
 * Client-Insel, und dort dann dauerhaft „DRK Bereitschaft Musterstadt". Die
 * erwartete Zeichenkette fuehrt `marke.test.ts` als eigene Erwartung; ein Test,
 * der seinen Erwartungswert aus der Implementierung zieht, ist eine Tautologie
 * (dieselbe Begruendung wie bei `ZAHL_NAMEN` in `grenzen.ts`).
 */

/** Wie in `core/hosts.ts` und `_lib/grenzen.ts`: „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/** Alt: APP_NAME. Erscheint in der Kopfzeile des Gates und im PWA-Manifest. */
export const LAGERBUCH_MARKE = "Lagerbuch";

/** Alt: APP_TAGLINE. Die Unterzeile am Gate und die `description` des Manifests. */
export const LAGERBUCH_ZEILE = "Bestand, Fahrzeuge, Geräte";

/**
 * Der Wert, mit dem das Modul ohne gesetzte Variable arbeitet. Er ist die
 * Vorbelegung aus der Alt-Anwendung und steht hier, damit `pnpm build` und die
 * lokale Entwicklung ohne Konfiguration durchlaufen — wie bei allen sechs Zahlen
 * in `grenzen.ts`.
 */
const VORGABE = "DRK Bereitschaft Musterstadt";

/**
 * Alt: APP_ORG. Erscheint am Gate und als `name` des PWA-Manifests.
 *
 * LEER GESETZT GILT WIE NICHT GESETZT — `LAGERBUCH_ORGANISATION=` ist der
 * haeufigere Fall als die fehlende Zeile (jemand raeumt eine .env auf), und die
 * leere Zeichenkette ergaebe ein Manifest namens „Lagerbuch · " und eine
 * Gate-Unterzeile, die mit einem Trennpunkt beginnt. Dieselbe Regel wie
 * `zahl()` in `grenzen.ts`.
 *
 * ⚠️ KEINE BOOT-PRUEFUNG, und das ist Absicht: es gibt keinen ungueltigen
 * Organisationsnamen. Jeder nichtleere String ist eine gueltige Antwort, ein
 * falscher faellt auf dem Gate sofort auf, und ein Abbruch beim Start naehme die
 * GANZE Suite mit (`grenzenFehler`, §10.5) — fuer eine Beschriftung.
 */
export function lagerbuchOrganisation(env: EnvLike = process.env): string {
  const roh = env.LAGERBUCH_ORGANISATION?.trim();
  return roh === undefined || roh === "" ? VORGABE : roh;
}
