"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import {
  ANMELDUNG_TEXT, NETZ_TEXT_BUCHUNG, type HelferErgebnis, type HelferGrund,
} from "../_lib/actionTypen";
import { einheitMeta, inDerEinheit, type Einheitenart } from "../_lib/konstanten";
import { fmtVerfall, ampelTon } from "../_lib/format";
// NUR DER TYP, und er liegt in einem Modul OHNE "use client" (Falle 6):
// dieselbe Form liest die Server Component, die ihn befuellt.
import type { BoxPosten } from "../_lib/lesepfade/entnahmebox";
import s from "./helfer.module.css";

/**
 * „IN DIE BOX LEGEN" AM FAHRZEUG — DRK-314.
 *
 * Die Gegenrichtung zu `_ui/Entnahme.tsx`: dort wandert Material aus dem
 * Handlager an die Einheit, hier von der Einheit in die Kiste in der Halle.
 *
 * ⚠️ KEIN antd UND KEIN `@ant-design/icons` (Fallen 1 und 7). Der Helfer-Weg ist
 * bewusst antd-frei; er rendert auf einem privaten Telefon in einer Sitzung ohne
 * Konto, und seine Bediendichte ist 56/72, nicht die der Verwaltung.
 * `_lib/bauform.test.ts` riegelt das fuer den ganzen Ast ab.
 *
 * ⚠️ DIE ACTION KOMMT ALS PROP, wie bei `Entnahme.tsx`: die Insel bleibt damit
 * ohne Server-Import testbar, und der eine Import liegt in `helfer/box/page.tsx`.
 *
 * ── EINE SEITE STATT ZWEIER ────────────────────────────────────────────────
 *
 * ⚠️ DIE MENGENEINGABE KLAPPT IN DER ZEILE AUF, statt auf einen zweiten Schirm
 * zu fuehren. Der Grund ist der Handgriff, nicht der Geschmack: wer eine Kiste
 * ausraeumt, legt selten ein Teil hinein, sondern drei oder vier
 * nacheinander — und jeder Schirmwechsel kostet auf dem Telefon den Ueberblick
 * ueber die Liste, aus der man gerade waehlt. Die Entnahme am Regal hat den
 * umgekehrten Fall (ein Artikel, den man am Etikett gescannt hat) und deshalb
 * zu Recht eine eigene Seite.
 *
 * ⚠️ ES IST IMMER HOECHSTENS EINE ZEILE OFFEN. Zwei halb ausgefuellte
 * Mengenfelder untereinander sind zwei Absichten, von denen der Knopf nur eine
 * ausfuehrt; welche, waere aus der Anzeige nicht zu erkennen.
 */

/** Genau die Signatur von `bucheInEntnahmebox` (`_actions/entnahmebox.ts`). */
export type BoxAktion = (eingabe: {
  fahrzeugId: string;
  artikelId: string;
  menge: number;
  chargeId: string | null;
}) => Promise<HelferErgebnis<{ gebucht: number }>>;

export type BoxEinheit = {
  id: string;
  name: string;
  kennung: string | null;
  einheitenart: Einheitenart | null;
};

type Rueckmeldung = { art: "ok" | "fehler"; text: string; grund?: HelferGrund };

/**
 * DIE CHARGENWAHL IST EIN EIGENER ZUSTAND MIT DREI WERTEN, nicht zwei.
 *
 * `null` heisst „keine Charge gewaehlt — die aelteste nehmen" und ist die
 * Vorgabe; eine Id heisst „genau diese". Der Unterschied ist fachlich: FEFO ist
 * eine ENTNAHME-Regel, beim Umraeumen traegt man DIE Packung, die man in der
 * Hand hat (`_lib/schreibpfade/umlagerung.ts`). Wer die Nummer nicht lesen kann
 * oder wem sie egal ist, laesst die Vorgabe stehen.
 */
type Wahl = { artikelId: string; menge: number; chargeId: string | null };

export function BoxAbgabe({
  einheit,
  posten,
  buchen,
  kontoZugang,
}: {
  einheit: BoxEinheit;
  posten: BoxPosten[];
  buchen: BoxAktion;
  /**
   * DIE HERKUNFT DES ZUGANGS — `true` heisst „angemeldetes Konto, kein
   * Kaertchen" (DRK-305).
   *
   * ⚠️ SIE ENTSCHEIDET DEN RUECKWEG, und ohne sie ist er eine Sackgasse: faellt
   * der Zugang aus, gibt der Server den Kaertchen-Grund `sitzung` zurueck — er
   * kann die Herkunft nicht unterscheiden (`_lib/helferZugang.ts`) —, und der
   * Weg darunter fuehrte aufs Gate, wo ein Code verlangt wird, den eine
   * angemeldete Person nicht hat.
   *
   * PFLICHT-PROP: ein vergessenes `kontoZugang?` waere still `undefined` und
   * damit „Kaertchen", also genau der Defekt.
   */
  kontoZugang: boolean;
}) {
  const [wahl, setWahl] = useState<Wahl | null>(null);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  function oeffnen(p: BoxPosten): void {
    setRueck(null);
    // ⚠️ EIN ZWEITER TIPP AUF DIESELBE ZEILE SCHLIESST SIE. Ohne diesen Zweig
    // gaebe es keinen Weg zurueck aus einer versehentlich geoeffneten Zeile
    // ausser dem Absenden — und genau das waere die Buchung, die niemand wollte.
    setWahl((vorher) =>
      vorher?.artikelId === p.artikelId
        ? null
        : { artikelId: p.artikelId, menge: 1, chargeId: null },
    );
  }

  function absenden(p: BoxPosten): void {
    if (!wahl || wahl.artikelId !== p.artikelId) return;
    /*
     * ⚠️ DIE OBERGRENZE IST DIE CHARGE, SOBALD EINE GEWAEHLT IST — nicht der
     * Bestand des Artikels an der Einheit. Ohne diese Zeile boete der Stepper
     * die volle Artikelmenge an, waehrend der Server die gewaehlte Charge
     * pruefen wuerde: die Buchung fiele mit „Von dieser Charge liegen hier nur
     * …" ab, und zwar erst nach dem Tippen.
     */
    const grenze = wahl.chargeId
      ? (p.chargen.find((c) => c.id === wahl.chargeId)?.rest ?? 0)
      : p.menge;
    const menge = Math.min(wahl.menge, grenze);
    if (menge <= 0) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await buchen({
          fahrzeugId: einheit.id,
          artikelId: p.artikelId,
          menge,
          chargeId: wahl.chargeId,
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          setRueck({ art: "fehler", text: r.text, grund: r.grund });
          return;
        }
        setRueck({
          art: "ok",
          text: `In die Entnahmebox gelegt: ${r.wert.gebucht} × ${p.artikelName}`,
        });
        // Die Zeile schliesst nach dem Erfolg. Sie offen zu lassen hiesse, ein
        // gefuelltes Mengenfeld ueber einer Liste stehen zu lassen, deren Zahlen
        // der naechste Serverstand gerade aendert — ein zweiter Tipp buchte
        // dann gegen einen Bestand, der nicht mehr auf dem Schirm steht.
        setWahl(null);
      } catch {
        // FALLE 62: ohne `catch` schlaegt der Wurf bis zur Fehlerseite durch,
        // und in Produktion steht dort ein englischer Satz mit `digest`
        // (Falle 66). `"netz"` entsteht ausschliesslich HIER, nie serverseitig.
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG, grund: "netz" });
      }
    });
  }

  return (
    <div className={s.lesebahn}>
      <Link className={s.rueckweg} href="/helfer/box">
        <Ikone name="chevron-links" groesse={15} />
        Andere Einheit
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {einheit.name}
        </h1>
      </div>
      {/*
        DIE ART STEHT UNTER DEM NAMEN, NICHT IM NAMEN (DRK-309): zwei Einheiten
        duerfen gleich heissen, und eine Tasche traegt kein Kennzeichen — ohne
        die Art stuende hier fuer sie gar nichts.
      */}
      <p className={s.fussnote} data-rolle="box-einheit-meta">{einheitMeta(einheit)}</p>

      <p className={s.fussnote}>
        Was du herausnimmst, kommt in die Entnahmebox in der Halle. Eingeräumt
        wird es später — das Material bleibt so lange im Buch.
      </p>

      {rueck && (
        <>
          <span
            className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
            data-rolle="box-ergebnis"
            role="status"
          >
            {/*
              DRK-305: `RIEGEL_TEXTE.sitzung` lautet woertlich „Scanne das
              Kaertchen erneut". Fuer eine angemeldete Person ist das falsch, und
              der Server kann es nicht wissen — die Seite schon.
            */}
            {kontoZugang && rueck.grund === "sitzung" ? ANMELDUNG_TEXT : rueck.text}
          </span>
          {rueck.grund === "sitzung" && !kontoZugang && (
            <Link
              className={s.rueckweg}
              href={`/?returnTo=${encodeURIComponent(`/helfer/box?fz=${einheit.id}`)}`}
              data-rolle="box-zum-gate"
            >
              Kärtchen erneut eingeben
            </Link>
          )}
          {rueck.grund === "sitzung" && kontoZugang && (
            <Link className={s.rueckweg} href="/verwaltung" data-rolle="box-zur-anmeldung">
              Erneut anmelden
            </Link>
          )}
        </>
      )}

      <div className={s.karte}>
        {/*
          ART-BEWUSST, NICHT NEUTRAL (DRK-309): hier steht die Art FEST — es ist
          der Schirm genau dieser Einheit —, und die Regel lautet, dass sie
          dort auch dasteht, wo sie bekannt ist. „Liegt in der Einheit" waere
          die Ausnahme von der eigenen Regel.
        */}
        <div className={s.karteTitel} data-rolle="box-liste-titel">
          Liegt {inDerEinheit(einheit.einheitenart)}
        </div>
        {posten.map((p) => {
          const offen = wahl?.artikelId === p.artikelId;
          return (
            <div key={p.artikelId} data-rolle="box-posten">
              <button
                type="button"
                className={`${s.zeile} ${s.zeileKnopf}`}
                onClick={() => oeffnen(p)}
                aria-expanded={offen}
                data-rolle="box-posten-knopf"
              >
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{p.artikelName}</div>
                  <div className={s.zeileMeta}>
                    {p.chargen.map((c) => (
                      <HelferChip key={c.id} ton={ampelTon(c.ampel)}>
                        {fmtVerfall(c.verfall)}
                      </HelferChip>
                    ))}
                  </div>
                </div>
                <div className={s.mengenChip}>
                  {p.menge}
                  <small>{p.einheit}</small>
                </div>
                <Ikone name={offen ? "zuklappen" : "aufklappen"} />
              </button>

              {offen && wahl && (
                <div className={s.kartePad} data-rolle="box-eingabe">
                  {/*
                    DIE CHARGENWAHL ERSCHEINT NUR, WENN ES ETWAS ZU WAEHLEN GIBT.
                    Bei genau einer Charge ist die Frage beantwortet, bevor sie
                    gestellt wird — und eine Radiogruppe mit einem Knopf ist eine
                    Bedienung ohne Wirkung.
                  */}
                  {p.chargen.length > 1 && (
                    <fieldset
                      style={{ border: "none", padding: 0, margin: "0 0 10px" }}
                      data-rolle="box-chargenwahl"
                    >
                      <legend className={s.fussnote} style={{ padding: 0 }}>
                        Welche Charge? Ohne Angabe wird die zuerst ablaufende genommen.
                      </legend>
                      <label className={`${s.zeile} ${s.zeileWahl}`}>
                        <input
                          type="radio"
                          name={`charge-${p.artikelId}`}
                          className={s.wahlKnopf}
                          checked={wahl.chargeId === null}
                          onChange={() => setWahl({ ...wahl, chargeId: null })}
                        />
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>Zuerst ablaufende</div>
                        </div>
                      </label>
                      {p.chargen.map((c) => (
                        <label key={c.id} className={`${s.zeile} ${s.zeileWahl}`}>
                          <input
                            type="radio"
                            name={`charge-${p.artikelId}`}
                            className={s.wahlKnopf}
                            checked={wahl.chargeId === c.id}
                            onChange={() => setWahl({ ...wahl, chargeId: c.id, menge: Math.min(wahl.menge, c.rest) })}
                          />
                          <div className={s.zeileHaupt}>
                            <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
                            <div className={s.zeileMeta}>
                              <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                              <span>{c.rest} {p.einheit}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </fieldset>
                  )}

                  <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
                    <span className={s.zeileHaupt}>Menge</span>
                    <Stepper
                      wert={wahl.menge}
                      setWert={(m) => setWahl({ ...wahl, menge: m })}
                      min={1}
                      max={Math.max(
                        wahl.chargeId
                          ? (p.chargen.find((c) => c.id === wahl.chargeId)?.rest ?? 1)
                          : p.menge,
                        1,
                      )}
                      beschriftung={`Menge ${p.artikelName}`}
                    />
                  </div>

                  <button
                    className={`${s.knopf} ${s.knopfRot} ${s.knopfBreit}`}
                    type="button"
                    disabled={laeuft}
                    onClick={() => absenden(p)}
                    data-rolle="box-buchen"
                    style={{ marginTop: 10 }}
                  >
                    In die Entnahmebox legen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
