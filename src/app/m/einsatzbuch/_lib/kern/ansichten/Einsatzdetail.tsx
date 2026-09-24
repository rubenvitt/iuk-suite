"use client";

import type { ReactNode } from "react";
import type { Einsatz } from "../format";
import { einsatzTexte } from "../bericht";
import { zeitpunktText } from "../zeit";
import s from "./ansichten.module.css";

export interface EinsatzdetailProps {
  /** `nummer` ist die Blocknummer; `versiegelt` ist ISO mit Offset wie im Blockkopf und wird hier in `zeitzone` formatiert. */
  block: { nummer: number; hash: string; prev: string; versiegelt: string };
  einsatz: Einsatz;
  zeitzone: string;
  /** Reader: „Gesamt“ (Patienten); Verwaltung: „Dauer“. */
  dritteKennzahl: "gesamt" | "dauer";
  /** Reader: Dauer zusätzlich im Raster unter Beginn und Ende. */
  mitDauerzeile: boolean;
  /** Reader: Objekt auch leer zeigen („—“); Verwaltung: leeres Objekt weglassen. */
  objektImmer: boolean;
  kopfRechts?: ReactNode;
  aktionen?: ReactNode;
}

/**
 * Ein entschlüsselter Einsatz (Reihenfolge der Vorlage `Einsatzbuch Reader.dc.html`, rechte
 * Spalte). Datum, Ende und Dauer folgen denselben Regeln wie das Berichtsblatt
 * (`einsatzTexte`). Die Daten sind vor dem Rendern geprüft — ein ungültiges Datum wirft hier.
 */
export function Einsatzdetail({ block, einsatz: e, zeitzone, dritteKennzahl, mitDauerzeile, objektImmer, kopfRechts, aktionen }: EinsatzdetailProps) {
  const t = einsatzTexte(e, zeitzone);
  const zeigeObjekt = objektImmer || e.objekt !== "";
  return (
    <section aria-label={`Block ${block.nummer}`} className={`${s.wurzel} ${s.karte} ${s.detail}`}>
      <div className={s.detailkopf}>
        <div className={s.kopfzeile} data-kopf="">
          <span className={s.kicker} data-kicker="">{`Block ${block.nummer} · ${e.nummer}`}</span>
          <span className={s.luecke} />
          {kopfRechts}
        </div>
        <h2 className={s.titel}>{e.stichwort}</h2>
        <p className={s.zweit} data-ort="">{t.ort}</p>
        {zeigeObjekt && <p className={s.zweit} data-objekt="">{t.objekt}</p>}
      </div>
      {aktionen && <div className={s.aktionen}>{aktionen}</div>}
      <dl className={s.kennzahlen}>
        <div><dt className={s.kicker}>Vor Ort</dt><dd>{e.vorOrt}</dd></div>
        <div><dt className={s.kicker}>Transport</dt><dd>{e.transport}</dd></div>
        {dritteKennzahl === "gesamt"
          ? <div><dt className={s.kicker}>Gesamt</dt><dd>{e.vorOrt + e.transport}</dd></div>
          : <div><dt className={s.kicker}>Dauer</dt><dd>{t.dauer}</dd></div>}
      </dl>
      <dl className={s.raster}>
        <dt>Beginn</dt><dd>{t.beginn}</dd>
        <dt>Ende</dt><dd>{t.ende}</dd>
        {mitDauerzeile && <><dt>Dauer</dt><dd>{t.dauer}</dd></>}
      </dl>
      <div className={s.abschnitt}>
        <h3 className={s.kicker}>{`Fahrzeuge · ${e.fahrzeuge.length}`}</h3>
        {e.fahrzeuge.length > 0 && (
          <ul className={s.aufzaehlung}>
            {e.fahrzeuge.map((f) => (
              <li key={f.id} className={s.fahrzeug} data-fahrzeug="">
                <span className={s.typ}>{f.typ}</span>
                <span className={s.ruf}>{f.ruf}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={s.abschnitt}>
        <h3 className={s.kicker}>{`Personal · ${e.personal.length}`}</h3>
        {e.personal.length > 0 && (
          <ul className={s.personen}>
            {e.personal.map((p) => (
              <li key={p.id} className={s.person} data-person="">
                {p.name}
                <span className={s.quali}>{p.quali}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {e.notizen.trim() !== "" && (
        <div className={s.abschnitt}>
          <h3 className={s.kicker}>Notizen</h3>
          <p className={s.notizen} data-notizen="">{e.notizen}</p>
        </div>
      )}
      <dl className={s.hashbox}>
        <dt>Fingerabdruck</dt><dd>{block.hash}</dd>
        <dt>Vorgänger</dt><dd>{block.prev}</dd>
        <dt>Versiegelt</dt><dd>{zeitpunktText(block.versiegelt, zeitzone)}</dd>
      </dl>
    </section>
  );
}
