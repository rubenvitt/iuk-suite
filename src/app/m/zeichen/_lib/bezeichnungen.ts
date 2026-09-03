/**
 * Deutsche Namen der Koerperformen. Das Paket exportiert dafuer NICHTS (gemessen:
 * 0 Exporte fuer bodyVariant), waehrend es fuer Grundformen und Organisationen
 * `symbolKindLabel` bzw. `ORGANIZATION_LABELS` mitbringt. Diese Liste ist deshalb
 * modul-eigen — und `katalog.test.ts` haelt sie gegen die tatsaechlich vorkommenden
 * Werte, damit sie nicht still unvollstaendig wird.
 *
 * Eine `bodyVariant` ist KEINE zweite Grundzeichenart, sondern eine zweite, in der
 * Quelle belegte Zeichnung DESSELBEN Grundzeichens. Die Namen beschreiben deshalb die
 * sichtbare Differenz, nicht die Fachbedeutung — genau wie die Kennungen im Paket
 * selbst (`@einsatzzeichen/schema`, `taxonomy.d.ts`, Typ `BodyVariantId`), aus dessen
 * Beschreibungen sie stammen. Was eine Form fachlich bezeichnet, sagt die Quelle
 * teilweise gar nicht; ein erfundener Fachname waere hier schlimmer als ein
 * beschreibender.
 *
 * Die zehn Werte sind gegen `BodyVariantId` des installierten Pakets 1.1.0 gemessen
 * und decken sich mit den zehn, die in den 232 Hauptrezepten tatsaechlich vorkommen.
 */
export const BODY_VARIANT_NAMEN: Record<string, string> = {
  /** Angehobene Rumpfform, am Wasser- wie am Luftfahrzeug je separat vermessen. */
  "raised-hull": "Angehobener Rumpf",
  /** Eingesenkter unterer Halbkreis der Wasserfahrzeuge aus Anhang I. */
  "inset-hull": "Eingesenkter Rumpf",
  /** Ausschliesslich ein schwarzes 3-mm-Fussband. */
  "foot-band": "Fussband",
  /** Die zwei schlichten Radringe der F.2-Landdarstellungen — ohne Kategoriebedeutung. */
  "plain-wheel-pair": "Radpaar ohne Zusatz",
  /** Der F.3-Kreis mit separat vermessenem Giebel. */
  "raised-gable": "Kreis mit Giebel",
  /** Umgekehrter Rumpf auf Kette (N.1.1). */
  "inverted-hull-track": "Umgekehrter Rumpf mit Kette",
  /** Starrfluegelrumpf der Flugzeuge aus Anhang N. */
  "fixed-wing-hull": "Starrfluegelrumpf",
  /** Um 1 mm angehobener Kreis (N.2.3). */
  "raised-circle-1mm": "Um 1 mm angehobener Kreis",
  /** Die kompakte 26-mm-Personenraute aus I.5. */
  "compact-person-diamond-26mm": "Kompakte Personenraute 26 mm",
  /** Dieselbe Raute, ausschliesslich 2 mm tiefer liegend. */
  "compact-person-diamond-26mm-lowered-2mm": "Kompakte Personenraute 26 mm, 2 mm tiefer",
};

/** Rueckfall, damit nie eine englische ID auf dem Bildschirm landet. */
export const koerperformName = (id: string): string => BODY_VARIANT_NAMEN[id] ?? id;
