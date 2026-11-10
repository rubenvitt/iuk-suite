import { gliederungsZeilen } from "../../_lib/plan/gliederung";
import { KONTAKT_NAME, kontaktZeilen } from "../../_lib/plan/kontakte";
import { kontaktLink } from "../../_lib/plan/kontaktlink";
import { ART_NAME, type PlanInhalt, type Verbindung } from "../../_lib/plan/schema";

/**
 * DER PLAN ALS LISTE, NUR LESEND (IDA-390) — die Startansicht der Token-Ansicht am Telefon. Das Diagramm, auf
 * 320 px eingepasst, beginnt mit 5-px-Schrift; hier steht dieselbe Folge wie in Diagramm und Gliederung
 * (`gliederungsZeilen`) in Lesegröße, Nummern antippbar.
 *
 * WARUM NICHT DIE GLIEDERUNG DES EDITORS: sie ist ein Eingabewerkzeug — jede Zeile ein Titelfeld, Zeichenknopf,
 * Verbindungswahl, Tastenbefehle, alles an `aendere` gebunden. Ohne Bearbeiten bliebe von ihr die Zeilenfolge,
 * und die kommt hier aus derselben reinen Funktion.
 *
 * KEINE NEUEN DATEN: nur was der Betrachter derselben Seite ohnehin zeichnet — Titel, Leitung, Verbindung zur
 * Elternstelle, Kanäle, Kontakte, Einheiten. Kein Verweis auf andere Pläne (die Token-Ansicht öffnet keine).
 * Ohne "use client": rendert in der Insel `TokenFlaeche` mit.
 */
export function Gliederungsliste({ inhalt }: { inhalt: PlanInhalt }) {
  const zeilen = gliederungsZeilen(inhalt);
  if (zeilen.length === 0) return <p className="kp-tl-leer">Dieser Plan hat noch keine Stellen.</p>;
  const verbindungen = new Map(inhalt.verbindungen.map((v) => [v.id, v]));
  const name = (v: Verbindung) => (v.bezeichnung.trim() === "" ? ART_NAME[v.art] : `${ART_NAME[v.art]} · ${v.bezeichnung.trim()}`);
  return (
    <ul className="kp-tl" aria-label="Stellen">
      {zeilen.map(({ stelle: s, ebene }) => {
        const verbindung = s.verbindungId === null ? undefined : verbindungen.get(s.verbindungId);
        const kanaele = s.kanaele.map((k) => verbindungen.get(k)).filter((v): v is Verbindung => v !== undefined);
        const kontakte = kontaktZeilen(s.kontakte, false);
        const einheiten = s.einheiten.map((e) => [e.typ.trim(), e.rufname.trim()].filter(Boolean).join(" ")).filter(Boolean);
        return (
          <li key={s.id} className="kp-tl-zeile" style={{ "--ebene": ebene } as React.CSSProperties} data-stelle={s.id}>
            <p className="kp-tl-titel">{s.titel.trim() || "Ohne Titel"}</p>
            {s.leiter?.trim() ? <p className="kp-tl-leiter">{s.leiter.trim()}</p> : null}
            {verbindung || kanaele.length > 0 || kontakte.length > 0 ? (
              <dl className="kp-tl-angaben">
                {verbindung ? <div><dt>Verbindung</dt><dd>{name(verbindung)}</dd></div> : null}
                {kanaele.length > 0 ? <div><dt>Kanäle</dt><dd>{kanaele.map(name).join(", ")}</dd></div> : null}
                {kontakte.map((k, i) => {
                  const href = kontaktLink(k.art, k.wert);
                  return (
                    <div key={i}>
                      <dt>{KONTAKT_NAME[k.art]}</dt>
                      <dd>{href ? <a href={href}>{k.wert}</a> : k.wert}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            {einheiten.length > 0 ? (
              <ul className="kp-tl-einheiten" aria-label={`Einheiten von ${s.titel.trim() || "Ohne Titel"}`}>
                {einheiten.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
