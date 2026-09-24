"use client";

import type { Berichtsdaten } from "../bericht";
import b from "./bericht.module.css";

/**
 * Das Berichtsblatt (`docs/design/einsatzbuch-v2/vorlage/Einsatzbericht.dc.html`) aus
 * `bericht()`. Papier bleibt immer hell — deshalb ohne `.wurzel` und ohne Dunkelzweig.
 * Druckt auf der benannten Seite `einsatzbericht` (A4, `bericht.module.css`). `unveraendert` sagt,
 * ob die Kettenprüfung diesen Block bestätigt hat — nur dann titelt der Siegelkasten
 * „Unverändert seit der Versiegelung“; gedruckt werden darf auch ein Block aus gebrochener Kette.
 */
export function Berichtsblatt({ daten: d, bereitschaft, unveraendert }: { daten: Berichtsdaten; bereitschaft: string; unveraendert: boolean }) {
  return (
    <article className={b.blatt} data-bericht="">
      <header className={b.kopf}>
        <div className={b.balken} />
        <div className={b.kopfzeile}>
          <div>
            <div className={b.wortmarke}>EINSATZ<span>BUCH</span></div>
            <div className={b.bereitschaft}>{bereitschaft}</div>
          </div>
          {d.test && <div className={b.testdaten} data-testdaten="">TESTDATEN</div>}
          <div className={b.nummerblock}>
            <div className={b.kicker}>Einsatzbericht</div>
            <div className={b.nummer}>{d.nummer}</div>
          </div>
        </div>
      </header>

      <section className={b.titel}>
        <h1>{d.stichwort}</h1>
        <p>{d.ort}</p>
      </section>

      <dl className={b.raster}>
        <div><dt className={b.kicker}>Beginn</dt><dd>{d.beginn}</dd></div>
        <div><dt className={b.kicker}>Ende</dt><dd>{d.ende}</dd></div>
        <div><dt className={b.kicker}>Dauer</dt><dd>{d.dauer}</dd></div>
        <div className={b.breit}><dt className={b.kicker}>Objekt, Lage vor Ort</dt><dd>{d.objekt}</dd></div>
      </dl>

      <dl className={b.zahlen}>
        <div><dt className={b.kicker}>Vor Ort behandelt</dt><dd>{d.vorOrt}</dd></div>
        <div><dt className={b.kicker}>Mit Transport</dt><dd>{d.transport}</dd></div>
        <div><dt className={b.kicker}>Patienten gesamt</dt><dd>{d.gesamt}</dd></div>
      </dl>

      <section className={b.abschnitt}>
        <h2 className={b.kicker}>{`Fahrzeuge · ${d.fahrzeuge.length}`}</h2>
        {d.fahrzeuge.length > 0 ? (
          <table className={b.tabelle}>
            <thead>
              <tr><th scope="col">Typ</th><th scope="col">Funkrufname</th><th scope="col">Besatzung</th></tr>
            </thead>
            <tbody>
              {d.fahrzeuge.map((f, i) => (
                <tr key={i}>
                  <td className={b.fzTyp}>{f.typ}</td>
                  <td className={b.fzRuf}>{f.ruf}</td>
                  <td>{f.besatzung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={b.leer}>Keine Fahrzeuge angegeben.</p>
        )}
      </section>

      <section className={b.abschnitt}>
        <h2 className={b.kicker}>{`Eingesetztes Personal · ${d.personal.length}`}</h2>
        {d.personal.length > 0 ? (
          <ul className={b.personal}>
            {d.personal.map((p, i) => (
              <li key={i}>
                <span>{p.name}</span>
                <span className={b.quali}>{p.quali}</span>
                <span className={b.pFahrzeug}>{p.fahrzeug}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={b.leer}>Kein Personal angegeben.</p>
        )}
      </section>

      {d.notizen.trim() !== "" && (
        <section className={b.abschnitt}>
          <h2 className={b.kicker}>Notizen</h2>
          <p className={b.notizen} data-notizen="">{d.notizen}</p>
        </section>
      )}

      <div className={b.fueller} />
      <section className={b.siegel}>
        <h2 className={b.kicker}>{unveraendert ? "Unverändert seit der Versiegelung" : "Unveränderlichkeit nicht bestätigt"}</h2>
        <dl>
          <dt>Block</dt><dd>{`${d.block} · versiegelt ${d.versiegelt}`}</dd>
          <dt>Fingerabdruck</dt><dd className={b.hash}>{d.hash}</dd>
          <dt>Vorgänger</dt><dd className={b.hash}>{d.prev}</dd>
          <dt>Kettenprüfung</dt><dd>{d.pruefung}</dd>
        </dl>
      </section>
      <footer className={b.fuss}>
        <span>{`Erzeugt ${d.erzeugt} · ${d.quelle}`}</span>
        <span>Vertraulich — nur für den Dienstgebrauch</span>
      </footer>
    </article>
  );
}
