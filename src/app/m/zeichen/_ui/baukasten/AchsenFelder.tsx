"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import { SCHRIFT } from "@/core/theme/schrift";
import { ACHSEN, FELDTITEL, bezeichnung, kandidaten, type Achse } from "./vokabular";
import { LISTENFELDER, ZONEN, type Regelhinweis, type Wertbefund, type Zone } from "./zustand";
import css from "./baukasten.module.css";

/*
 * DIE NEUN BEDIENFELDER. Native `<select>`/`<input>` statt antd-Auswahlfeldern,
 * und das ist begruendet:
 *   - Die Sperrung bildet sich 1:1 auf `<option disabled>` ab, samt Grund im
 *     Optionstext. Ein antd-Select zeigte den Grund gar nicht.
 *   - `FullShell` rendert auch auf dem Telefon; ein natives Feld bekommt dort den
 *     Auswaehler des Betriebssystems — bei 64 Koerpermarken der Unterschied
 *     zwischen bedienbar und nicht.
 *   - Kein Portal, also auch keine zweite Bedienhilfe fuer Tests: `testFelder.ts`
 *     in `aufgaben/_ui` ist ausdruecklich modulprivat.
 * `size` wird nirgends gesetzt (Falle 4); die 44 px stehen als Literal im CSS.
 *
 * ⛔ EIN `<select>` JE ACHSE, NICHT JE SPEC-FELD (Korrektur 3 des Auftrags,
 * Spec §6.1). Die Quellen einer Achse laufen als `<optgroup>` in demselben Feld
 * zusammen; das Wertpraefix `${feld}:${wert}` sagt beim Auswaehlen, welches Feld
 * gemeint war. Drei getrennte Felder fuer die Kopfzone luden dazu ein, zwei davon
 * zu setzen — gemessen erzeugte das bei jedem zweiten Klick `head-zone-conflict`.
 */

export interface AchsenFelderProps {
  spec: SymbolSpec;
  /** Feldname → Wert → Befund, aus `erlaubteWerte`. */
  befunde: Map<string, Map<string, Wertbefund>>;
  /** Kachel-Vorschauen der Grundzeichenarten; `null` heisst „komponiert nackt nicht". */
  miniaturen: Map<string, string | null>;
  setzeFeld: (feld: keyof SymbolSpec, wert: unknown) => void;
  setzeFelder: (paare: readonly (readonly [keyof SymbolSpec, unknown])[]) => void;
  setzeZone: (zone: Zone, text: string) => void;
  /** Regeltexte, die gerade an einem Feld haengen. Schluessel ist der Achsen-Key. */
  hinweise: Map<string, readonly Regelhinweis[]>;
}

const GESPERRT_MAX = 3;

/** Die Felder einer Achse, die Optionen beitragen — Freitext und Zonen tun das nicht. */
function wahlfelder(achse: Achse): readonly (keyof SymbolSpec)[] {
  return achse.felder.filter((f) => f !== "designation" && f !== "labels");
}

function gesperrteZeile(befunde: readonly Wertbefund[], feld: string): string | null {
  const gesperrt = befunde.filter((b) => !b.frei);
  if (gesperrt.length === 0) return null;
  const genannt = gesperrt
    .slice(0, GESPERRT_MAX)
    .map((b) => `${bezeichnung(feld, b.wert)} — ${b.grund}`);
  const rest = gesperrt.length - genannt.length;
  return rest > 0 ? `${genannt.join(" · ")} · und ${rest} weitere` : genannt.join(" · ");
}

/** Der gesetzte Wert einer Achse als `${feld}:${wert}` — oder "" fuer „ohne". */
function gewaehlterWert(spec: SymbolSpec, felder: readonly (keyof SymbolSpec)[]): string {
  for (const feld of felder) {
    const wert = spec[feld];
    if (typeof wert === "string" && wert !== "") return `${feld}:${wert}`;
    if (Array.isArray(wert) && wert.length > 0) return `${feld}:${wert[0] as string}`;
  }
  return "";
}

function OptionenEinesFeldes(props: { feld: keyof SymbolSpec; befunde: Map<string, Wertbefund> }) {
  return (
    <>
      {kandidaten(props.feld).map((wert) => {
        const befund = props.befunde.get(wert);
        const zusatz =
          befund && !befund.frei
            ? befund.sperre === "wert"
              ? " (nicht vermessen)"
              : " (passt hier nicht)"
            : "";
        return (
          <option
            key={wert}
            value={`${props.feld}:${wert}`}
            disabled={befund ? !befund.frei : false}
            title={befund?.grund}
          >
            {bezeichnung(props.feld, wert)}
            {zusatz}
          </option>
        );
      })}
    </>
  );
}

function AchsenWahl(props: {
  achse: Achse;
  spec: SymbolSpec;
  befunde: Map<string, Map<string, Wertbefund>>;
  setzeFelder: AchsenFelderProps["setzeFelder"];
}) {
  const { achse, spec, befunde } = props;
  const felder = wahlfelder(achse);
  const mehrereQuellen = felder.length > 1;

  return (
    <select
      className={css.feld}
      // Bei EINER Quelle traegt das Feld selbst ihren Namen, bei mehreren die
      // `<optgroup>`s — so gibt es fuer „welches Spec-Feld ist das?" genau eine
      // Antwort, egal wie viele Quellen die Achse hat.
      data-feld={mehrereQuellen ? undefined : felder[0]}
      data-achse-wahl={achse.key}
      aria-label={achse.titel}
      value={gewaehlterWert(spec, felder)}
      onChange={(e) => {
        const roh = e.target.value;
        /*
         * Beim Wechsel der Quelle die anderen Felder derselben Achse leeren — sie
         * belegen denselben Platz (head-zone-conflict, chassis-foot-conflict,
         * technical-fill-organization-conflict).
         *
         * ⛔ ALLES IN EINEM SCHRITT. Zwei setzeFeld-Aufrufe im selben Ereignis
         * rechnen beide vom selben Ausgangsstand — das konkurrierende Feld bliebe
         * stehen, und die Buendelung waere wirkungslos.
         *
         * „— ohne —" raeumt nur die WAHLFELDER: der eigene Text unter dem Koerper
         * hat sein eigenes Feld, und ihn hier mit wegzuwischen waere eine
         * Loeschung, die niemand angefordert hat.
         */
        const betroffen = roh === "" ? felder : achse.felder;
        const paare: (readonly [keyof SymbolSpec, unknown])[] = betroffen
          .filter((anderes) => !roh.startsWith(`${anderes}:`))
          .map((anderes) => [anderes, undefined] as const);
        if (roh !== "") {
          const trenner = roh.indexOf(":");
          const feld = roh.slice(0, trenner) as keyof SymbolSpec;
          const wert = roh.slice(trenner + 1);
          paare.push([feld, LISTENFELDER.includes(feld) ? [wert] : wert] as const);
        }
        props.setzeFelder(paare);
      }}
    >
      <option value="">— ohne —</option>
      {felder.map((feld) =>
        mehrereQuellen ? (
          <optgroup key={feld} data-feld={feld} label={FELDTITEL[feld] ?? feld}>
            <OptionenEinesFeldes feld={feld} befunde={befunde.get(feld) ?? new Map()} />
          </optgroup>
        ) : (
          <OptionenEinesFeldes
            key={feld}
            feld={feld}
            befunde={befunde.get(feld) ?? new Map()}
          />
        ),
      )}
    </select>
  );
}

const ZONENNAMEN: Record<Zone, string> = {
  center: "Mitte",
  topLeft: "Oben links",
  bottomLeft: "Unten links",
  bottomCenter: "Unten mittig",
  bottomRight: "Unten rechts",
};

/**
 * Die Koerpermarken: 64 Werte, mehrfach waehlbar. EIN Auswahlfeld zum Hinzufuegen
 * plus eine Liste der gewaehlten mit „Entfernen".
 *
 * ⛔ KEIN SUCHFELD MIT `datalist`. Es waere die naheliegende Bauform, und sie ist
 * gemessen mehrdeutig: „Zwei Wellenlinien über einer Raute" ist der deutsche Name
 * VON ZWEI Kennungen (`circle-two-waves-diamond` und `trailer-water-rescue`) — die
 * Rueckabbildung vom Anzeigetext auf die ID traefe stillschweigend die falsche.
 * Ein `<select>` traegt die ID im `value` und ist damit eindeutig; es zeigt
 * ausserdem die gesperrten Werte mit ihrem Grund, wie jede andere Achse auch, und
 * bekommt auf dem Telefon den Auswaehler des Betriebssystems.
 */
function MarkenFeld(props: {
  gewaehlt: readonly string[];
  befunde: Map<string, Wertbefund>;
  setze: (werte: string[]) => void;
}) {
  return (
    <div>
      <label className={css.beschriftungsfeld} htmlFor="tz-marke-waehlen">
        Körpermarke hinzufügen
        <select
          id="tz-marke-waehlen"
          className={css.feld}
          data-feld="bodyMarks"
          // Das Feld faellt nach jedem Hinzufuegen auf „— auswählen —" zurueck: es
          // waehlt nicht EINEN Wert aus, es fuegt der Liste darunter einen hinzu.
          value=""
          onChange={(e) => {
            const wert = e.target.value;
            if (wert === "" || props.gewaehlt.includes(wert)) return;
            props.setze([...props.gewaehlt, wert]);
          }}
        >
          <option value="">— auswählen —</option>
          <MarkenOptionen befunde={props.befunde} />
        </select>
      </label>

      <ul className={css.markenliste}>
        {props.gewaehlt.map((wert) => (
          <li key={wert} className={css.markenzeile}>
            {bezeichnung("bodyMarks", wert)}
            <button
              type="button"
              className={css.kachel}
              data-testid={`tz-marke-entfernen-${wert}`}
              onClick={() => props.setze(props.gewaehlt.filter((w) => w !== wert))}
            >
              Entfernen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Dieselben Optionen wie ueberall, nur ohne Feldpraefix im `value`: dieses Feld
 * FUEGT HINZU, statt eine Achse zu setzen — sein Wert ist die rohe Kennung.
 */
function MarkenOptionen(props: { befunde: Map<string, Wertbefund> }) {
  return (
    <>
      {kandidaten("bodyMarks").map((wert) => {
        const befund = props.befunde.get(wert);
        const zusatz =
          befund && !befund.frei
            ? befund.sperre === "wert"
              ? " (nicht vermessen)"
              : " (passt hier nicht)"
            : "";
        return (
          <option key={wert} value={wert} disabled={befund ? !befund.frei : false}>
            {bezeichnung("bodyMarks", wert)}
            {zusatz}
          </option>
        );
      })}
    </>
  );
}

export function AchsenFelder(props: AchsenFelderProps) {
  const { spec, befunde, setzeFeld, setzeFelder, setzeZone, hinweise, miniaturen } = props;

  return (
    <>
      {ACHSEN.map((achse) => {
        const achsenHinweise = hinweise.get(achse.key) ?? [];
        return (
          <section key={achse.key} data-achse={achse.key} className={css.abschnitt}>
            <h3 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>{achse.titel}</h3>
            <p style={{ ...SCHRIFT.neben, margin: 0 }}>{achse.hilfe}</p>

            {achse.art === "kacheln" && (
              <div className={css.kachelraster}>
                {kandidaten("kind").map((id) => {
                  const svg = miniaturen.get(id) ?? null;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`tz-kachel-${id}`}
                      className={css.kachel}
                      aria-pressed={spec.kind === id}
                      onClick={() => setzeFeld("kind", id)}
                    >
                      {/*
                        Das Markup stammt aus `renderSvg` im selben Prozess, nicht
                        aus einer Eingabe — dieselbe Lage wie `qr/QrDisplay.tsx:151`.
                        `circle-12` und `reduced-house` komponieren nackt nicht und
                        bekommen einen Platzhalter statt einer erfundenen Zeichnung.
                      */}
                      {svg ? (
                        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
                      ) : (
                        <span aria-hidden="true">▢</span>
                      )}
                      <span>{bezeichnung("kind", id)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(achse.art === "wahl" || achse.art === "fussstreifen") && (
              <AchsenWahl
                achse={achse}
                spec={spec}
                befunde={befunde}
                setzeFelder={setzeFelder}
              />
            )}

            {achse.art === "fussstreifen" && (
              <label className={css.beschriftungsfeld} htmlFor="tz-designation">
                Eigener Text unter dem Körper
                <input
                  id="tz-designation"
                  className={css.feld}
                  value={spec.designation ?? ""}
                  onChange={(e) => {
                    // Kategorie und Text belegen denselben Streifen — in EINEM
                    // Schritt leeren und setzen, aus demselben Grund wie oben.
                    setzeFelder(
                      e.target.value !== ""
                        ? ([
                            ["vehicleCategory", undefined],
                            ["designation", e.target.value],
                          ] as const)
                        : ([["designation", e.target.value]] as const),
                    );
                  }}
                />
              </label>
            )}

            {achse.art === "mehrfach" && (
              <MarkenFeld
                gewaehlt={(spec.bodyMarks as string[] | undefined) ?? []}
                befunde={befunde.get("bodyMarks") ?? new Map()}
                setze={(werte) => setzeFeld("bodyMarks", werte)}
              />
            )}

            {achse.art === "beschriftung" &&
              ZONEN.map((zone) => (
                <label key={zone} className={css.beschriftungsfeld} htmlFor={`tz-zone-${zone}`}>
                  {ZONENNAMEN[zone]}
                  <input
                    id={`tz-zone-${zone}`}
                    className={css.feld}
                    value={spec.labels?.[zone] ?? ""}
                    onChange={(e) => setzeZone(zone, e.target.value)}
                  />
                </label>
              ))}

            {achse.felder.map((feld) => {
              const zeile = gesperrteZeile([...(befunde.get(feld)?.values() ?? [])], feld);
              return zeile ? (
                <p key={feld} className={css.hinweis} data-gesperrt={achse.key}>
                  Nicht möglich: {zeile}
                </p>
              ) : null;
            })}

            {/*
              Der eigene Satz zuerst, die originale Paketmeldung KLEIN darunter
              (Spec §6.3): „Lauf ‚…‘ misst 49.279 mm Tinte" ist die Auskunft, mit
              der eine Rueckfrage beantwortbar wird — aber nicht die, mit der man
              anfaengt.
            */}
            {achsenHinweise.map((h) => (
              <p key={h.titel} className={css.hinweis} data-regel={achse.key}>
                <strong>{h.titel}.</strong> {h.erklaerung}
                {h.meldung ? (
                  <span className={css.meldung} data-testid="tz-regel-meldung">
                    {h.meldung}
                  </span>
                ) : null}
              </p>
            ))}
          </section>
        );
      })}
    </>
  );
}
