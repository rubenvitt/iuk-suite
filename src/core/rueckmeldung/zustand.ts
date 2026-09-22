/**
 * HAT DIESER BROWSER DEN RÜCKMELDEKNOPF SCHON ERLEDIGT?
 *
 * Der schwebende Knopf soll verschwinden, sobald jemand ihn benutzt oder
 * wegklickt — genau einmal fragen, nicht auf jeder Seite wieder. Diese Datei
 * ist der winzige Speicher dahinter, gebaut wie `navZustand.ts` nebenan und aus
 * denselben Gründen.
 *
 * ⚠️ „ERLEDIGT" HEISST „DER KNOPF WURDE BENUTZT", NICHT „DAS FORMULAR WURDE
 * ABGESCHICKT" — und der Unterschied ist ausgeschrieben, damit ihn niemand für
 * ein Versehen hält. Das Formular liegt bei einem fremden Anbieter und meldet
 * uns nichts zurück; ob aus dem Klick eine Rückmeldung wurde, erfahren wir
 * grundsätzlich nicht. Der Klick ist der ehrlichste verfügbare Näherungswert,
 * und wer den Knopf gar nicht erst will, hat daneben das Schließkreuz. Beide
 * Wege führen hierher, weil beide dasselbe bedeuten: dieser Knopf hat seine
 * Aufgabe erfüllt.
 *
 * ⚠️ DER PREIS STEHT DAZU: `localStorage` ist an EINEN Browser gebunden. Auf
 * einem zweiten Gerät steht der Knopf wieder da. Die Alternative wäre eine
 * Zeile je Person in der Portal-Datenbank gewesen — erreichbar von jedem
 * Modulhost aus (`launcherEintraege` tut das bereits), aber ein Schreibpfad,
 * eine Migration und eine Server-Runde für einen Zustand, der genau ein Bit
 * trägt und dessen Verlust einen Knopf zu viel kostet. Was den Weg zur
 * Rückmeldung trägt, sind ohnehin Nutzermenü und Portal-Kachel; die bleiben
 * immer stehen.
 *
 * KEIN "use client": diese Datei enthält keine Komponente und keinen Hook, nur
 * Funktionen. Sie wird ausschliesslich von einer Client-Komponente gerufen —
 * ein `"use client"` hier würde nichts verbessern und den Wert für eine
 * künftige Server-Lesung unbrauchbar machen (Falle 6).
 *
 * ⚠️ `localStorage` KANN WERFEN UND KANN LEER ZURÜCKKOMMEN — im privaten
 * Fenster, bei gesperrten Website-Daten, in einer Vorschau. Jeder Zugriff hier
 * steht deshalb in `try`/`catch`, und der Ausfall ist harmlos: ohne
 * gespeicherten Stand steht der Knopf da, also genau das Bild für jemanden, der
 * ihn noch nicht gesehen hat.
 */

const SCHLUESSEL = "iuk-rueckmeldung";

/**
 * ⚠️ DIE SCHNAPPSCHÜSSE SIND ZEICHENKETTEN, KEINE BOOLEANS ODER OBJEKTE.
 * `useSyncExternalStore` vergleicht mit `Object.is` und liefe mit einem je
 * Aufruf frisch gebauten Objekt in eine Endlosschleife. Zwei gleiche
 * Zeichenketten sind `Object.is`-gleich. (Dieselbe Bauform wie
 * `KEINE_ZUGEKLAPPT` in `navZustand.ts`.)
 */
export const OFFEN = "offen";
export const ERLEDIGT = "erledigt";

export type RueckmeldungStand = typeof OFFEN | typeof ERLEDIGT;

/**
 * ⚠️ DER SERVER SIEHT IMMER „ERLEDIGT", UND DAS IST DER GANZE TRICK GEGEN EINEN
 * HYDRATION-MISMATCH. Der Server kennt `localStorage` nicht und kann die Frage
 * nicht beantworten; würde er „offen" raten, stünde der Knopf im
 * Server-HTML — und bei jedem, der ihn längst erledigt hat, verschwände er nach
 * der Hydration wieder. Ein Knopf, der aufblitzt und geht, ist schlimmer als
 * keiner. Mit „erledigt" als Server-Schnappschuss entsteht er serverseitig gar
 * nicht und kommt beim Hydrieren dazu, wenn er darf.
 *
 * Der Nebeneffekt ist erwünscht: der Knopf ist nie das Erste, was aufbaut.
 */
export const SERVER_STAND: RueckmeldungStand = ERLEDIGT;

const hoerer = new Set<() => void>();

/**
 * Der zuletzt gelesene Stand. Ohne ihn läse `useSyncExternalStore` bei JEDEM
 * Render aus `localStorage` — synchron, und damit auf dem Hauptfaden.
 */
let zwischenspeicher: RueckmeldungStand | null = null;

/** Der Stand dieses Browsers — nie ein Wurf, nie `null`. */
export function liesRueckmeldungStand(): RueckmeldungStand {
  if (zwischenspeicher !== null) return zwischenspeicher;
  let stand: RueckmeldungStand = OFFEN;
  try {
    // Jeder gespeicherte Wert ausser `ERLEDIGT` gilt als offen — ein von Hand
    // verbogener Eintrag darf den Knopf nicht dauerhaft wegnehmen.
    stand = globalThis.localStorage?.getItem(SCHLUESSEL) === ERLEDIGT ? ERLEDIGT : OFFEN;
  } catch {
    stand = OFFEN;
  }
  zwischenspeicher = stand;
  return stand;
}

/** Benutzt oder weggeklickt — ab jetzt bleibt der Knopf weg. */
export function merkeRueckmeldungErledigt(): void {
  if (zwischenspeicher === ERLEDIGT) return;
  zwischenspeicher = ERLEDIGT;
  try {
    globalThis.localStorage?.setItem(SCHLUESSEL, ERLEDIGT);
  } catch {
    // Kein Speicher, kein Drama: der Stand hält für diese Sitzung im
    // Zwischenspeicher und ist nach dem nächsten Laden wieder offen.
  }
  // ⚠️ EIGENE BENACHRICHTIGUNG, weil `storage` im SCHREIBENDEN Tab NICHT feuert
  // (HTML Standard, §storage event). Ohne diese Schleife bliebe der Knopf nach
  // dem eigenen Klick stehen, bis irgendetwas anderes ein Rendern auslöst —
  // also scheinbar für immer.
  for (const rueckruf of [...hoerer]) rueckruf();
}

/**
 * ⚠️ MODULEBENE UND NICHT IN DER KOMPONENTE: `useSyncExternalStore` meldet sich
 * bei jeder neuen `subscribe`-Referenz ab und wieder an. Eine bei jedem Render
 * erzeugte Funktion ergäbe eine Endlosschleife von An- und Abmeldungen.
 */
export function abonniereRueckmeldung(rueckruf: () => void): () => void {
  hoerer.add(rueckruf);
  const ausAnderemTab = (ereignis: StorageEvent) => {
    // `key === null` heisst „alles geleert" (`localStorage.clear()`).
    if (ereignis.key === null || ereignis.key === SCHLUESSEL) {
      zwischenspeicher = null;
      rueckruf();
    }
  };
  globalThis.addEventListener?.("storage", ausAnderemTab);
  return () => {
    hoerer.delete(rueckruf);
    globalThis.removeEventListener?.("storage", ausAnderemTab);
  };
}

/** Nur für Tests: den Prozesszustand zurücksetzen. */
export function vergissRueckmeldungStand(): void {
  zwischenspeicher = null;
}
