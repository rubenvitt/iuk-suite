/**
 * ERKLAERTEXTE ZU DEN REGELN, DIE EIN ANWENDER TATSAECHLICH ZU SEHEN BEKOMMT.
 *
 * Die Wertesperrung (§6.2) ist der Hauptweg: was nicht zusammenpasst, laesst sich
 * gar nicht erst waehlen. Uebrig bleiben die Regeln, die sie strukturell nicht
 * abfangen kann, weil der Text FREI ist — eine zu breite Beschriftung faellt erst
 * beim Tippen auf —, und die wenigen Konflikte zwischen zwei bereits gesetzten
 * Feldern.
 *
 * Die Paketmeldung wird NICHT roh gezeigt: vier der Meldungen sind englisch, und
 * „Die Verwaltungsstufe ‚kreis‘ besitzt keinen aufgeloesten gemessenen Kopf aus
 * D.3/D.4" sagt einem Helfer nichts. Der eigene Satz kommt zuerst, die
 * Paketmeldung darunter klein (`error.issues`, nicht `error.message` — die ist
 * fuers Log).
 *
 * KEIN "use client" UND KEIN @einsatzzeichen-IMPORT: die Texte sind Daten. Ein
 * Wertimport hier waere ein dritter Katalogimporteur und braeche `pnpm build`
 * (M1, `_lib/naht.test.ts`).
 */
export interface Regeltext {
  /** Eine Aussage, kein Etikett. Steht fett am Feld. */
  readonly titel: string;
  /** Was zu tun ist. Ein bis zwei Saetze, Du-Form. */
  readonly erklaerung: string;
  /**
   * Der Achsenschluessel, an dem der Text erscheint (`_ui/baukasten/vokabular.ts`).
   * Steht HIER und nicht in einer zweiten Tabelle: wer eine Regel ergaenzt, muss
   * im selben Atemzug sagen, wo ihre Erklaerung hingehoert.
   */
  readonly achse: string;
}

/**
 * Die sechs Kennungen, die `compose()` in `assertTextRunsFit` selbst baut
 * (Praefix `label`/`designation`/`function-role-run` mal `-too-wide`/
 * `-unknown-glyph`). Sie stehen in KEINER Liste des Pakets — `VALIDATION_RULE_IDS`
 * zaehlt 72, `compose()` kann gemessen 78 werfen. `regeltexte.test.ts` prueft
 * gegen beide Mengen.
 */
export const TEXTLAUF_REGELN: readonly string[] = [
  "label-too-wide",
  "label-unknown-glyph",
  "designation-too-wide",
  "designation-unknown-glyph",
  "function-role-run-too-wide",
  "function-role-run-unknown-glyph",
];

export const REGELTEXTE: Record<string, Regeltext> = {
  "label-too-wide": {
    achse: "beschriftung",
    titel: "Die Beschriftung ist zu breit",
    erklaerung:
      "Der Text passt nicht in seine Zone im Körper. Kürze ihn oder setze ihn in eine andere Zone.",
  },
  "label-unknown-glyph": {
    achse: "beschriftung",
    titel: "Ein Zeichen der Beschriftung ist nicht vermessen",
    erklaerung:
      "Für dieses Schriftzeichen gibt es keine gemessene Breite. Buchstaben, Ziffern, " +
      "Bindestrich und Schrägstrich sind sicher.",
  },
  "designation-too-wide": {
    achse: "fussstreifen",
    titel: "Der Text unter dem Körper ist zu breit",
    erklaerung: "Der Streifen unter dem Körper ist schmal. Ein Kürzel passt, ein Satz nicht.",
  },
  "designation-unknown-glyph": {
    achse: "fussstreifen",
    titel: "Ein Zeichen im Text unter dem Körper ist nicht vermessen",
    erklaerung:
      "Für dieses Schriftzeichen gibt es keine gemessene Breite. Buchstaben, Ziffern, " +
      "Bindestrich und Schrägstrich sind sicher.",
  },
  "function-role-run-too-wide": {
    achse: "funktion",
    titel: "Die Funktionsbezeichnung ist zu breit",
    erklaerung:
      "Die gewählte Funktion bringt ihren eigenen Schriftzug mit, und der passt an diesem " +
      "Körper nicht. Eine andere Grundzeichenart oder Körperform schafft Platz.",
  },
  "function-role-run-unknown-glyph": {
    achse: "funktion",
    titel: "Ein Zeichen der Funktionsbezeichnung ist nicht vermessen",
    erklaerung: "Der Schriftzug der Funktion enthält ein Zeichen ohne gemessene Breite.",
  },
  "head-zone-conflict": {
    achse: "kopfzone",
    titel: "Die Kopfzone ist schon belegt",
    erklaerung:
      "Stärke, Verwaltungsstufe und technische Kopfmarke teilen sich den Platz über dem " +
      "Körper. Es geht immer nur eines davon.",
  },
  "technical-fill-organization-conflict": {
    achse: "zugehoerigkeit",
    titel: "Farbe und Organisation zugleich",
    erklaerung:
      "Die Organisation färbt den Körper bereits. Eine zusätzliche technische Füllung " +
      "würde diese Farbe überschreiben.",
  },
  "chassis-foot-conflict": {
    achse: "fussstreifen",
    titel: "Unter dem Körper ist schon etwas",
    erklaerung:
      "Fahrzeugkategorie und eigener Text belegen denselben Streifen unter dem Körper. " +
      "Nimm eines von beidem heraus.",
  },
  "body-variant-foot-conflict": {
    achse: "koerperform",
    titel: "Die Körperform belegt den Fußstreifen",
    erklaerung:
      "Die gewählte Körperform zeichnet unten selbst. Ein Text oder eine Fahrzeugkategorie " +
      "kämen an dieselbe Stelle.",
  },
  "surface-label-foot-conflict": {
    achse: "beschriftung",
    titel: "Beschriftung auf der Fläche und Fußstreifen zugleich",
    erklaerung:
      "Diese Beschriftungszone liegt auf dem Fußstreifen. Entweder die Zone oder der " +
      "Streifen darunter.",
  },
  "strength-requires-unit": {
    achse: "kopfzone",
    titel: "Eine Stärke gibt es nur an Einheiten",
    erklaerung:
      "Trupp, Staffel, Gruppe und Zug stehen an einer taktischen Formation oder an einer " +
      "Person — nicht an einem Fahrzeug, Gebäude oder Ereignis.",
  },
  "administrative-level-not-measured": {
    achse: "kopfzone",
    titel: "Diese Verwaltungsstufe steht nicht allein",
    erklaerung:
      "Sie ist nur zusammen mit einer Funktion vermessen. Wähle zuerst eine Funktion, " +
      "dann steht die Stufe zur Verfügung.",
  },
  "foot-band-head-requires-measured-strength": {
    achse: "kopfzone",
    titel: "Diese Kopfzone ist mit dem Fußband nicht vermessen",
    erklaerung:
      "Zu dieser Körperform gibt es keine Quelle mit dieser Kopfzone. Eine andere Stärke " +
      "oder eine andere Körperform trägt.",
  },
  "plain-wheel-pair-chassis-conflict": {
    achse: "koerperform",
    titel: "Radpaar und Fahrzeugkategorie zugleich",
    erklaerung: "Die gewählte Körperform bringt die Räder schon mit.",
  },
};

/**
 * Die Achse, an der eine Regel erscheint.
 *
 * ⛔ RUECKFALL AUF DIE BESCHRIFTUNG, NICHT AUF „nirgends". Die Beschriftung ist
 * die einzige Achse, die IMMER gerendert wird (sie haengt an keinem Wertevorrat).
 * Eine unbekannte Regel — also genau die, die ein Upgrade neu einfuehrt — verlaere
 * sonst ihren Text still, und der Anwender saehe eine Vorschau, die nicht kommt,
 * ohne jede Erklaerung dazu.
 */
export function regelAchse(id: string): string {
  return REGELTEXTE[id]?.achse ?? "beschriftung";
}

/**
 * Der Text zu einer Regel — mit RUECKFALL. Ein Wurf waere hier falsch: die Regel,
 * die kein Text erklaert, ist genau die, die ein Upgrade neu eingefuehrt hat, und
 * dann soll am Feld ein brauchbarer Satz stehen und nicht die Seite abbrechen.
 * Die rohe Kennung steht in Klammern dabei, damit eine Rueckfrage beantwortbar ist.
 */
export function regeltext(id: string): Regeltext {
  return (
    REGELTEXTE[id] ?? {
      achse: "beschriftung",
      titel: "Diese Zusammenstellung trägt nicht",
      erklaerung: `Der Katalog lehnt sie ab (Regel ${id}).`,
    }
  );
}
