import Link from "next/link";
import { fahrzeugTitel, fahrzeugUnterzeile, pruefungenDerArt, reifenTeil, schlimmstePruefung, schlimmsteZuerst } from "../../_lib/akte/anzeige";
import { datum } from "../../_lib/akte/regeln";
import type { AkteMitStand, PruefArt } from "../../_lib/akte/typen";
import { HallenUhr } from "./HallenUhr";
import { Entfaellt, ohneEintrag, StandZelle, STUFE_KLASSE, StufenChip } from "./teile";
import s from "./akte.module.css";

function Zelle({ x, art }: { x: AkteMitStand; art: PruefArt }) {
  const p = schlimmstePruefung(pruefungenDerArt(x.stand, art));
  if (!p) return <Entfaellt className={s.halleUnter} text={ohneEintrag(art, x.akte.fahrzeug.art === "anhaenger")} />;
  return <StandZelle stufe={p.stufe} text={p.text} unter={p.faelligAm ? datum(p.faelligAm) : undefined} chipKlasse={s.halleChip} unterKlasse={s.halleUnter} />;
}

/**
 * Die Hallentafel (IDA-299): dieselben Stände wie die Fahrzeugtafel, groß und ohne Suite-Rahmen, für
 * einen Bildschirm in der Fahrzeughalle. Schlimmste zuerst. Kein `"use client"` und kein antd — eine
 * schlichte Tabelle; nur Uhr und Takt (`HallenUhr`) laufen im Browser.
 */
export function Hallentafel({ liste }: { liste: AkteMitStand[] }) {
  const zeilen = schlimmsteZuerst(liste);
  return (
    <main className={s.halle}>
      <div className={s.halleKopf}>
        <h1 className={s.halleTitel}>Fahrzeuge · Termine</h1>
        <HallenUhr className={s.uhr} />
      </div>
      {zeilen.length === 0 ? <p className={s.halleLeer}>Noch keine Fahrzeuge.</p> : (
        <div className={s.halleRahmen}>
          <table className={s.halleTabelle}>
            <thead>
              <tr><th scope="col">Fahrzeug</th><th scope="col">HU</th><th scope="col">UVV</th><th scope="col">Service</th><th scope="col">Reifen</th><th scope="col">Als Nächstes</th></tr>
            </thead>
            <tbody>
              {zeilen.map((x) => {
                const f = x.akte.fahrzeug;
                const r = x.stand.reifen;
                const n = x.stand.naechster;
                return (
                  <tr key={f.id} className={STUFE_KLASSE[x.stand.stufe]} data-stufe={x.stand.stufe}>
                    <td>
                      <div className={s.halleFahrzeug}>{fahrzeugTitel(f)}</div>
                      <div className={s.halleUnter}>{fahrzeugUnterzeile(f)}</div>
                    </td>
                    <td><Zelle x={x} art="HU" /></td>
                    <td><Zelle x={x} art="UVV" /></td>
                    <td><Zelle x={x} art="Service" /></td>
                    <td>{r ? <StufenChip stufe={r.stufe} className={s.halleChip}>{reifenTeil(r).kurz}</StufenChip> : <StufenChip stufe="offen" className={s.halleChip} />}</td>
                    <td>
                      {n ? (
                        <div className={s.zelle}>
                          <b>{n.pruefung.name}</b>
                          {n.faelligAm ? <span className={s.halleUnter}>{datum(n.faelligAm)}</span> : null}
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.halleFuss}>
        Ansicht für einen Bildschirm in der Fahrzeughalle · <Link href="/tafel">zurück zur Fahrzeugtafel</Link>
      </p>
    </main>
  );
}
