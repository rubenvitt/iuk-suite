/**
 * Die Nutzlast des Fahrzeug-Check-Abschlusses, aus der Komponente gehoben.
 *
 * KEIN "use client": die Typen liest auch `_actions/check.ts` (Teil 4), und ein
 * Wert aus einem Client-Modul kaeme dort als Client-Referenz an (Falle 6).
 *
 * WARUM SIE GEHOBEN WIRD (§12.1, Punkt 1): das Verfallsfeld im Zaehlschritt
 * (`CheckFlow.tsx:281`) und die Live-Vorschau `{n} laufen ab` (`:306`) sind die
 * EINZIGE Absicherung ihrer Fachlichkeit — `actions/check.test.ts:229` beweist
 * nur, dass der Server richtig zaehlt, WENN der Wert ankommt. Ob er ankommt,
 * prueft heute nichts.
 *
 * ⚠️ WAS DIE VORBELEGUNGEN KOSTEN, steht hier, damit es niemand spaeter
 * „entdeckt" (§5.8.1): serverseitig ist „gezaehlt und stimmt" von „nicht
 * gezaehlt" NICHT unterscheidbar. Ein durchgeklickter Check erzeugt einen
 * positiven, plausibel aussehenden Nachweis und — wenn der recorded Bestand
 * abwich — eine Korrekturbuchung in ein Journal, das weder UPDATE noch DELETE
 * kennt. Variante (c) (ein `gezaehlt: boolean` je Position) ist die einzige, die
 * das nachruestet; sie ist BACKLOG, nicht Spec 1 (§15), und sie steht hier, damit
 * sie eine Entscheidung bleibt und nicht als Nebenwirkung stattfindet.
 */
import { verfallStatus, type VerfallSchwellen } from "./domain/verfall";
import { MONAT_REGEX, type Zustand } from "./konstanten";

export type CheckPositionEingabe = { id: string; artikelId: string; soll: number };
export type CheckGeraetEingabe = { id: string };
export type CheckFlascheEingabe = { id: string; nennfuelldruckBar: number };

export type CheckGeraetAntwort = { vorhanden: boolean; zustand: Zustand; bemerkung?: string };

/** `CheckFlow.tsx:25`. 1:1 (§5.15, Punkt 4). */
export const GERAET_VORBELEGUNG: CheckGeraetAntwort = { vorhanden: true, zustand: "In Ordnung" };

export type CheckZaehlung = {
  ist: Record<string, number | undefined>;
  nachfuell: Record<string, number | undefined>;
  geraete: Record<string, CheckGeraetAntwort | undefined>;
  druck: Record<string, number | undefined>;
  /** ⚠️ NUR die GEAENDERTEN. Ein fehlender Eintrag laesst die Angabe
   *  unangetastet; `""`/`null` LOESCHT sie. */
  verfaelle: Record<string, string | null | undefined>;
};

export type CheckNutzlast = {
  fahrzeugId: string;
  positionen: { sollPositionId: string; ist: number; nachfuellMenge: number }[];
  geraete: { geraetId: string; vorhanden: boolean; zustand: Zustand; bemerkung?: string }[];
  flaschen: { flascheId: string; druckBar: number }[];
  verfaelle: { artikelId: string; verfall: string | null }[];
};

/**
 * Baut die Nutzlast aus Zaehlwerten und gemeldeten Verfaellen.
 *
 * DREI LISTEN WERDEN VOLLSTAENDIG GESENDET (Positionen, Geraete, Flaschen), die
 * VIERTE nur teilweise. Das ist kein Versehen: der Server prueft bei Geraeten und
 * Flaschen die ZUGEHOERIGKEIT (`check.ts:128`, `:139`), nicht die
 * Vollstaendigkeit — und bei den Verfaellen heisst ein fehlender Eintrag
 * ausdruecklich „unangetastet" (`check.ts:151-152`).
 *
 * ⚠️ `nachfuellMenge` WIRD HIER NICHT GEKLEMMT. Die Klemmung auf
 * `max(0, soll − ist)` ist serverseitig (`check.ts:95`) und bleibt es. Eine
 * zweite Klemmung hier verdeckte, ob die serverseitige noch da ist.
 */
export function checkNutzlast(args: {
  fahrzeugId: string;
  positionen: CheckPositionEingabe[];
  geraete: CheckGeraetEingabe[];
  flaschen: CheckFlascheEingabe[];
  z: CheckZaehlung;
}): CheckNutzlast {
  const { fahrzeugId, positionen, geraete, flaschen, z } = args;
  return {
    fahrzeugId,
    // `?? p.soll`, NICHT `|| p.soll`: eine gezaehlte 0 ist eine Aussage („Fach
    // leer"), und `||` machte daraus wieder das Soll.
    positionen: positionen.map((p) => ({
      sollPositionId: p.id,
      ist: z.ist[p.id] ?? p.soll,
      nachfuellMenge: z.nachfuell[p.id] ?? 0,
    })),
    geraete: geraete.map((g) => {
      const a = z.geraete[g.id] ?? GERAET_VORBELEGUNG;
      return {
        geraetId: g.id, vorhanden: a.vorhanden, zustand: a.zustand,
        ...(a.bemerkung ? { bemerkung: a.bemerkung } : {}),
      };
    }),
    flaschen: flaschen.map((f) => ({
      flascheId: f.id,
      druckBar: z.druck[f.id] ?? f.nennfuelldruckBar,
    })),
    verfaelle: Object.entries(z.verfaelle)
      // `undefined` = unangetastet und wird GAR NICHT gesendet.
      .filter(([, v]) => v !== undefined)
      // Formal falsche Monate werden AUSGELASSEN statt gesendet: der Server lehnt
      // sie ohnehin ab, und ein Tippfehler soll nicht den GANZEN Check-Abschluss
      // ablehnen — die uebrigen Angaben sind davon unberuehrt.
      .filter(([, v]) => !v || MONAT_REGEX.test(v))
      .map(([artikelId, v]) => ({ artikelId, verfall: v ? v : null })),
  };
}

/**
 * Die Live-Vorschau „{n} laufen ab" (`CheckFlow.tsx:306`): wie viele der GERADE
 * gemeldeten Verfaelle nicht gruen sind.
 *
 * ⚠️ SIE WIRFT NIE. Die Vorschau laeuft bei JEDEM Tastendruck; ein Wurf braeche
 * die Eingabe waehrend des Tippens ab — „2026-1" ist ein Zwischenzustand, kein
 * Fehler.
 */
export function zaehleAblaufende(
  verfaelle: Record<string, string | null | undefined>,
  schwellen: VerfallSchwellen,
  now: Date,
): number {
  let n = 0;
  for (const v of Object.values(verfaelle)) {
    if (!v || !MONAT_REGEX.test(v)) continue;
    if (verfallStatus(v, schwellen, now).ampel !== "gruen") n += 1;
  }
  return n;
}
