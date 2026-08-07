"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import { NETZ_TEXT_BUCHUNG, type HelferErgebnis, type HelferGrund } from "../_lib/actionTypen";
import { fmtVerfall, ampelTon } from "../_lib/format";
import type { Ampel } from "../_lib/domain/verfall";
import s from "./helfer.module.css";

/**
 * DIE ENTNAHME AM REGAL — §7.2.2, §7.3. Nachfolger von `HelferEntnahme.tsx`.
 *
 * ⚠️ SIE HEISST `Entnahme.tsx`, NICHT `HelferEntnahme.tsx`. §2.1 (Zeile 358)
 * fuehrt sie so; teil5.md nennt sie an fuenf Stellen falsch. Das ist ein
 * Schreibfehler in einem Kommentar, keine Planaenderung.
 *
 * ⚠️ DIE ACTION KOMMT ALS PROP. `_actions/buchung.ts` gehoert vollstaendig
 * Teil 5 (Festlegung H7) — alle drei Buchungs-Actions teilen sich dort
 * `fefoAbbuchung` und dieselbe Zod-Basis, deshalb entsteht die Datei EINMAL und
 * dort. Ein Import hier machte diese Datei von einem SPAETER laufenden Plan
 * abhaengig; als Prop ist die Insel vollstaendig, testbar und gruen, und der
 * eine Import liegt in
 * `a/[artikelId]/page.tsx` (T83) — genau eine Stelle, die die Reihenfolge
 * kennt. Dasselbe Muster benutzt Teil 5 fuer `_ui/BarcodeScanner.tsx`.
 */
export type EntnahmeDetail = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
  chargen: {
    id: string;
    chargenNr: string;
    verfall: string;
    rest: number;
    ampel: Ampel;
    text: string;
  }[];
};

/** Genau die Signatur von `bucheEntnahmeHelfer` (Teil 5, T114). */
export type BuchungsAktion = (eingabe: {
  artikelId: string;
  menge: number;
}) => Promise<HelferErgebnis<{ gebucht: number }>>;

type Rueckmeldung = { art: "ok" | "fehler"; text: string; grund?: HelferGrund };

export function Entnahme({ detail, buchen }: { detail: EntnahmeDetail; buchen: BuchungsAktion }) {
  const [menge, setMenge] = useState(1);
  const [rueck, setRueck] = useState<Rueckmeldung | null>(null);
  const [laeuft, start] = useTransition();

  function absenden() {
    const m = Math.min(menge, detail.bestand);
    if (m <= 0) return;
    setRueck(null);
    start(async () => {
      try {
        const r = await buchen({ artikelId: detail.id, menge: m });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          // Das gilt auch fuer den fuenften Grund `"eingabe"`
          // (Betreiberentscheidung B4): er traegt seine Botschaft im `text`,
          // und weil `darfErneuern("eingabe")` false ist, faellt er unten durch
          // die `sitzung`-Bedingung hindurch — kein Weg zurueck aufs Gate.
          setRueck({ art: "fehler", text: r.text, grund: r.grund });
          return;
        }
        const gebucht = r.wert.gebucht;
        setRueck(
          gebucht < m
            ? // §7.3, zweiter Zustand: heute ein GRUENER Chip mit der KLEINEREN
              // Zahl, ohne Hinweis — der Helfer legt fuenf Teile ins Fahrzeug
              // und das Journal kennt drei.
              { art: "ok", text: `${gebucht} von ${m} gebucht; mehr lag nicht im Handlager.` }
            : { art: "ok", text: `Entnahme gebucht: ${gebucht} × ${detail.name}` },
        );
        setMenge(1);
      } catch {
        // FALLE 62: `HelferEntnahme.tsx:22-30` hat KEIN catch — der Wurf
        // schlaegt bis zur Fehlerseite durch, und in Produktion steht dort ein
        // englischer Satz mit `digest` (Falle 66). `"netz"` entsteht
        // ausschliesslich HIER, nie serverseitig.
        setRueck({ art: "fehler", text: NETZ_TEXT_BUCHUNG, grund: "netz" });
        // Die Menge bleibt im Feld, der Knopf wird wieder aktiv (§7.10.3).
      }
    });
  }

  return (
    <>
      <Link className={s.rueckweg} href="/helfer">
        <Ikone name="chevron-links" groesse={15} />
        Zurück
      </Link>

      <div className={s.zeile}>
        <h1 className={s.zeileHaupt} style={{ font: "700 24px var(--lb-display)", lineHeight: 1.12 }}>
          {detail.name}
        </h1>
        <span className={s.fach} data-rolle="fach">
          {detail.fach}
        </span>
      </div>

      <div className={`${s.karte} ${s.kartePad}`}>
        <div className={s.fussnote}>BESTAND HANDLAGER</div>
        <div className={s.bestandsZahl} data-rolle="bestand">
          {detail.bestand} <span style={{ fontSize: 16 }}>{detail.einheit}</span>
        </div>
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Entnahme</div>
        <div className={s.kartePad}>
          <div className={s.zeile} style={{ borderTop: "none", padding: 0 }}>
            <span className={s.zeileHaupt}>Menge</span>
            <Stepper
              wert={menge}
              setWert={setMenge}
              min={1}
              max={Math.max(detail.bestand, 1)}
              beschriftung="Menge"
            />
          </div>

          <button
            className={`${s.knopf} ${s.knopfRot}`}
            type="button"
            disabled={detail.bestand === 0 || laeuft}
            onClick={absenden}
            data-rolle="entnahme-buchen"
          >
            Entnahme buchen
          </button>

          {rueck && (
            <>
              {/* Der mehrzeilige Ergebnissatz braucht die von `.chip` abweichende Form aus `.rueckmeldung`. */}
              <span
                className={`${s.chip} ${rueck.art === "ok" ? s.ok : s.rot} ${s.rueckmeldung}`}
                data-rolle="entnahme-ergebnis"
                role="status"
              >
                {rueck.text}
              </span>
              {/*
                Bei `sitzung` fuehrt der Weg zurueck aufs Gate — MIT `returnTo`,
                damit der Artikel nach dem erneuten Einloesen wieder offen ist.
                Ein Erneuerungsfeld an Ort und Stelle gibt es hier NICHT: anders
                als im Check (§7.4.4) haengt an dieser Seite kein Client-Zustand,
                den ein Seitenwechsel verwuerfe — nur eine Zahl, und die bleibt
                stehen.
              */}
              {rueck.grund === "sitzung" && (
                <Link
                  className={s.rueckweg}
                  href={`/?returnTo=${encodeURIComponent(`/a/${detail.id}`)}`}
                  data-rolle="entnahme-zum-gate"
                >
                  Kärtchen erneut eingeben
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className={s.karte}>
        <div className={s.karteTitel}>Nächste Charge zuerst (FEFO)</div>
        {detail.chargen.map((c) => (
          <div className={s.zeile} key={c.id} data-rolle="charge-zeile">
            <div className={s.zeileHaupt}>
              <div style={{ font: "600 13px var(--lb-mono)" }}>Charge {c.chargenNr}</div>
              <div className={s.zeileMeta}>
                {/* Beide Angaben stehen NEBENEINANDER: der Chip traegt den
                    Status als TEXT (nie allein ueber Farbe), `fmtVerfall` das
                    Datum in der Form „MM/JJ" (Teil 3, T39). */}
                <HelferChip ton={ampelTon(c.ampel)}>{c.text}</HelferChip>
                <span>{fmtVerfall(c.verfall)}</span>
              </div>
            </div>
            <div className={s.mengenChip}>
              {c.rest}
              <small>{detail.einheit}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
