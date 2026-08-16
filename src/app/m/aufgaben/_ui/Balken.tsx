import s from "./aufgaben.module.css";

/*
 * DER AUSLASTUNGSBALKEN — EINE MENGE IM VERHAELTNIS ZU EINER KAPAZITAET (Nachtrag „mehr
 * Diversitaet im UI/UX", 2026-08-16).
 *
 * ══ DIESE DATEI IST EINE EXTRAKTION, KEIN NEUBAU (Oberflaechen-Runde 2026-08-16, zweite Haelfte).
 *    Beides stand bis hierhin in `_ui/EinstiegKoordination.tsx` und hatte dort genau einen
 *    Aufrufer. Mit dem Wochenplan bekommt es den zweiten — die fuenf Tagesspalten zeigen dieselbe
 *    Aussage (verplante Zeit gegen Tagesbudget) und zeigten sie bis hierhin als reine Zahl. Das
 *    ist der Massstab, den `docs/design/README.md` fuer eine Extraktion verlangt: ein zweiter,
 *    HEUTE belegbarer Nutzniesser, keine Vermutung ueber kuenftigen Bedarf.
 *
 * ══ KEIN "use client" (Falle 6, Falle 7): beide Aufrufer sind Server Components
 *    (`EinstiegKoordination`, `Wochenplan`). Die Datei importiert nichts ausser dem Stylesheet —
 *    kein Icon, kein antd-Compound, keine Funktion ueber eine RSC-Grenze.
 *
 * ══ EIGENES MARKUP STATT antds `Progress`, und das ist eine Abwaegung gegen die naheliegende
 *    Wahl, ausgeschrieben, weil sie sonst wie ein Versehen aussieht:
 *
 *      1. `Progress` faerbt per Vorgabe mit `colorPrimary`, und das IST Suite-Rot (`#c8000f`) —
 *         ein roter Auslastungsbalken liest sich als Alarm (Falle 3). Man kann das per
 *         `strokeColor`/`trailColor` ueberschreiben, aber dann traegt jede Aufrufstelle zwei
 *         Farbwerte, die nirgends gemessen sind.
 *      2. Die Farben MUESSEN aus `--auf-*` kommen, damit die Hell/Dunkel-Paarigkeit und der
 *         Kontrastriegel in `aufgaben-css.test.ts` sie sehen. Ein `strokeColor="#…"` im TSX faellt
 *         durch jedes Raster dieser Datei.
 *      3. Ein Balken ist eine Spur und eine Fuellung. Der ganze Baustein ist kuerzer als die
 *         Prop-Liste, mit der man `Progress` zaehmen muesste — und er hat keinen Gegenspieler im
 *         Stylesheet (Falle 5).
 *
 * ══ FARBE IST DIE ZWEITE SCHICHT, NIE DIE ERSTE (Modulspec §9.3, „Auslastung ist neutral"): der
 *    Balken ist stahlgrau, SOLANGE die Kapazitaet reicht. Erst eine echte Ueberbuchung faerbt —
 *    und auch dann steht das WORT daneben (die Budgetzeile bzw. „kein Tag ueberbucht"). Ein
 *    Ausdruck in Graustufen verliert nichts; deshalb ist der Balken `aria-hidden` und bekommt
 *    KEINE eigene Textalternative, sonst laese ein Screenreader jede Zahl doppelt vor.
 */

/**
 * DIE MASSE EINES AUSLASTUNGSBALKENS — als reine Funktion, damit sie pruefbar ist.
 *
 * EXPORTIERT AUS GENAU EINEM GRUND: die Skalenwahl unten ist die Stelle, an der diese Grafik STILL
 * falsch wird, und ein Bildschirmabzug zeigt einen falsch skalierten Balken nicht als Fehler — er
 * zeigt einen Balken. `Balken.test.ts` rechnet die Faelle deshalb nach.
 *
 * ══ DIE SKALA IST `max(soll, verplant)`, NICHT `soll`. Mit einer 100%-Spur sind 7,8/7,8 Std. und
 *    9,17/7,8 Std. BEIDE ein voller Balken — die Ueberbuchung, also die einzige Auffaelligkeit der
 *    ganzen Zone, waere die einzige Aussage, die der Balken nicht treffen kann. Mit dieser Skala
 *    ragt sie ueber die Kapazitaetsmarke hinaus, und die Marke sagt, wo „voll" liegt.
 */
export function balkenMasse(
  verplant: number,
  soll: number,
): { ueber: boolean; anteil: number; markeBei: number } {
  const ueber = verplant > soll;
  const skala = Math.max(soll, verplant);
  // `skala <= 0` DECKT BEIDE UNBRAUCHBAREN NENNER IN EINEM: kein Soll UND kein Verplantes (leerer
  // Tag -> leerer Balken), sowie Verplantes ohne Soll (Nicht-Arbeitstag -> voller Achtungsbalken).
  // Ohne den Zweig waere `anteil` `NaN`, CSS verwuerfe die Breite still, und der Streifen saehe aus
  // wie ein freier Tag — also das Gegenteil dessen, was er meint.
  const anteil = skala <= 0 ? (verplant > 0 ? 100 : 0) : (verplant / skala) * 100;
  const markeBei = skala <= 0 ? 100 : (soll / skala) * 100;
  return { ueber, anteil, markeBei };
}

/**
 * EIN AUSLASTUNGSBALKEN.
 *
 * ══ DIE BREITE STEHT INLINE, UND DAS IST HIER RICHTIG: sie ist ein DATENWERT, keine Layoutregel.
 *    Der Kopfkommentar von `AufgabenZeile` verbietet Inline-`style` fuer die ZEILENFORM, weil ein
 *    Inline-Wert jede Medienabfrage schlaegt — eine Prozentzahl aus der Datenbank hat dagegen in
 *    keinem Stylesheet etwas zu suchen.
 *
 * ══ `soll <= 0` IST KEIN GEDACHTER FALL: `arbeitstage` kann einen Tag ausschliessen, und dann ist
 *    das Tagesbudget null. Ohne den Zweig waere die Breite `NaN%` — CSS ignoriert das still, der
 *    Streifen bliebe leer und saehe aus wie ein freier Tag. Verplantes an einem Nicht-Arbeitstag
 *    ist aber das Gegenteil davon, also: volle Fuellung in Achtung.
 */
export function Balken({
  verplant,
  soll,
  ohneMarke = false,
}: {
  verplant: number;
  soll: number;
  /** Die Tagesstreifen der Personenkachel tragen keine Marke — bei 8px waere sie die halbe Grafik. */
  ohneMarke?: boolean;
}) {
  const { ueber, anteil, markeBei } = balkenMasse(verplant, soll);

  return (
    <span className={s.lastBalken} aria-hidden>
      <span
        className={`${s.lastFuellung} ${ueber ? s.lastFuellungUeber : ""}`}
        style={{ width: `${anteil}%` }}
      />
      {!ohneMarke && ueber ? (
        <span className={s.lastMarke} style={{ insetInlineStart: `${markeBei}%` }} />
      ) : null}
    </span>
  );
}
