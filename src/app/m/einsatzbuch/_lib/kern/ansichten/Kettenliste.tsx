"use client";

import s from "./ansichten.module.css";
import { kurz, type Listeneintrag } from "./modell";
import { Zeichen } from "./Zeichen";

export interface KettenlisteProps {
  /** Neueste zuerst — die Liste sortiert nicht selbst. */
  eintraege: Listeneintrag[];
  gewaehlt: number | null;
  onWaehle(block: number): void;
  /** Rechts im Kopf, z. B. „neueste oben“. */
  kopfRechts?: string;
  /** Unterstes Glied: „Block 0 · Anfang der Kette“ oder der fehlende Vorgänger. */
  fuss: { text: string };
}

function knopfName(e: Listeneintrag): string {
  if (e.gesperrt) return `Block ${e.block}, verschlüsselt`;
  if (e.fehler) return `Block ${e.block}, ${e.fehler}`;
  return [`Block ${e.block}`, e.nummer, e.stichwort].filter(Boolean).join(", ");
}

function Inhalt({ e }: { e: Listeneintrag }) {
  if (e.gesperrt) {
    return (
      <div className={s.gesperrt}>
        <Zeichen name="schluessel" groesse={14} />
        <span>{e.chiffre ?? "verschlüsselt"}</span>
      </div>
    );
  }
  if (e.fehler) return <div className={s.fehlertext}>{e.fehler}</div>;
  return (
    <>
      <div className={s.titelzeile}>
        <span className={s.stichwort}>{e.stichwort ?? "—"}</span>
        {e.ort && <span className={s.ort}>{e.ort}</span>}
      </div>
      {e.meta && <div className={s.meta}>{e.meta}</div>}
    </>
  );
}

/**
 * Die Einsatzkette als Liste mit Knoten (`Einsatzbuch Reader.dc.html`, „Einsatzkette“; die
 * Verwaltungsform mit `meta` und `gesperrt` aus `Einsatzbuch v2.dc.html`). Jede Zeile ist ein
 * Umschaltknopf; die gewählte trägt `aria-pressed="true"`.
 */
export function Kettenliste({ eintraege, gewaehlt, onWaehle, kopfRechts, fuss }: KettenlisteProps) {
  // Bei doppelter Blocknummer (selbst gebaute Datei) waehlt nur der erste Treffer die Zeile aus —
  // sonst truegen zwei Zeilen gleichzeitig aria-pressed="true".
  const gewaehlterIndex = gewaehlt === null ? -1 : eintraege.findIndex((e) => e.block === gewaehlt);
  return (
    <section aria-label="Einsatzkette" className={`${s.wurzel} ${s.karte} ${s.liste}`}>
      <div className={s.listenkopf} data-kopf="">
        <h2 className={s.kicker}>Einsatzkette</h2>
        {kopfRechts && <span className={s.kopfRechts}>{kopfRechts}</span>}
      </div>
      <ol className={s.kette}>
        {eintraege.map((e, i) => (
          <li key={`${e.block}-${i}`} className={s.glied}>
            <div className={s.spur} aria-hidden="true">
              <div className={s.linie} />
              <div className={s.knoten} data-knoten={e.knoten}>
                {e.knoten === "geprueft" && <Zeichen name="haken" groesse={12} />}
                {e.knoten === "gebrochen" && <Zeichen name="entketten" groesse={12} />}
              </div>
            </div>
            <button
              type="button"
              className={s.zeile}
              data-block={e.block}
              aria-pressed={i === gewaehlterIndex}
              aria-label={knopfName(e)}
              onClick={() => onWaehle(e.block)}
            >
              <div className={s.zeilenkopf}>
                <span className={s.kicker}>Block {e.block}</span>
                {!e.gesperrt && e.nummer && <span className={s.mono}>{e.nummer}</span>}
                <span className={s.luecke} />
                <span className={s.versiegelt}>versiegelt {e.versiegelt}</span>
              </div>
              <Inhalt e={e} />
              <div className={`${s.mono} ${s.hashes}`}>
                <span>#{kurz(e.hash)}</span>
                <Zeichen name="verketten" groesse={12} />
                {/* Das Icon ist rein visuell (aria-hidden); ohne dieses Zeichen klebt der
                    Text/Kopie-Inhalt zu "#hash8#prev8" zusammen. */}
                <span className={s.srOnly}> ⛓ </span>
                <span>#{kurz(e.prev)}</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <div className={s.fuss}>
        <div className={s.spur} aria-hidden="true">
          <div className={s.linie} />
          <div className={s.fussMarke} />
        </div>
        <div className={`${s.kicker} ${s.fussText}`} data-fuss="">{fuss.text}</div>
      </div>
    </section>
  );
}
