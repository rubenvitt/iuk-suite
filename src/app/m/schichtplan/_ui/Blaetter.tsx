/**
 * Die Druckblätter: je Abschnitt oder je Helfer ein A4-Blatt. Reine Darstellung ohne Zustand —
 * die Vorschau unter „Ausgabe“ und die Druckansicht zeigen dasselbe.
 */
import type { PlanHelfer, PlanungDTO } from "../_lib/typen";
import { langDatum, stunden, zeitspanne } from "../_lib/zeit";
import b from "./blatt.module.css";
import { eintraege } from "./export";
import { anforderungText, einheitTitel } from "./teile";

export type Sicht = "abschnitt" | "helfer";

export function Blaetter({ p, helfer, sicht, auswahl, jetzt }: {
  p: PlanungDTO; helfer: readonly PlanHelfer[]; sicht: Sicht; auswahl: string | null; jetzt: number;
}) {
  const liste = eintraege(p, helfer);
  const stand = `Stand ${langDatum(jetzt)}`;
  const kopf = [p.name, p.ort].filter(Boolean).join(" · ");
  if (sicht === "abschnitt") {
    const einheiten = p.einheiten.filter((e) => !auswahl || e.id === auswahl);
    if (einheiten.length === 0) return <p>Noch kein Abschnitt und kein Fahrzeug in dieser Planung.</p>;
    return (
      <div className={b.blaetter}>
        {einheiten.map((e) => {
          const anf = anforderungText(e);
          return (
            <section key={e.id} className={b.papier} aria-label={einheitTitel(e)}>
              <h2 className={b.titel}>{einheitTitel(e)}</h2>
              <div className={b.meta}>{kopf} · Soll {e.soll}{anf ? `, davon ${anf}` : ""}</div>
              <table className={b.tabelle}>
                <thead><tr><th style={{ width: "30%" }}>Schicht</th><th>Eingeteilt</th><th style={{ width: "26%" }}>Qualifikation</th></tr></thead>
                <tbody>
                  {liste.filter((x) => x.e.id === e.id).map((x) => (
                    <tr key={x.s.id}>
                      <td>{zeitspanne(x.s.von, x.s.bis, true)}</td>
                      <td>
                        {x.personen.map((h) => <div key={h.schluessel}>{h.nachname}, {h.vorname}{h.quelle === "temp" ? ` (${h.organisation || "temporär"})` : ""}</div>)}
                        {x.personen.length < e.soll ? <div className={b.offen}>{e.soll - x.personen.length} offen</div> : null}
                      </td>
                      <td>{x.personen.map((h) => <div key={h.schluessel}>{h.qualifikationen.map((q) => q.kurz).join(", ") || "–"}</div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={b.fuss}>{stand}</div>
            </section>
          );
        })}
      </div>
    );
  }
  const personen = helfer
    .filter((h) => liste.some((x) => x.personen.includes(h)))
    .filter((h) => !auswahl || h.schluessel === auswahl)
    .sort((x, y) => x.nachname.localeCompare(y.nachname, "de") || x.vorname.localeCompare(y.vorname, "de"));
  if (personen.length === 0) return <p>Noch niemand eingeteilt.</p>;
  return (
    <div className={b.blaetter}>
      {personen.map((h) => {
        const meine = liste.filter((x) => x.personen.includes(h));
        const summe = meine.reduce((n, x) => n + x.s.bis - x.s.von, 0);
        return (
          <section key={h.schluessel} className={b.papier} aria-label={`${h.vorname} ${h.nachname}`}>
            <h2 className={b.titel}>{h.vorname} {h.nachname}</h2>
            <div className={b.meta}>{kopf} · {meine.length === 1 ? "1 Schicht" : `${meine.length} Schichten`}, {stunden(summe)}{h.telefon ? ` · ${h.telefon}` : ""}</div>
            <table className={b.tabelle}>
              <thead><tr><th style={{ width: "34%" }}>Wann</th><th>Wo</th><th style={{ width: "30%" }}>Mit</th></tr></thead>
              <tbody>
                {meine.map((x) => (
                  <tr key={x.s.id}>
                    <td>{zeitspanne(x.s.von, x.s.bis, true)}</td>
                    <td>{einheitTitel(x.e)}</td>
                    <td>{x.personen.filter((o) => o !== h).map((o) => `${o.vorname} ${o.nachname}`).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={b.fuss}>{stand}</div>
          </section>
        );
      })}
    </div>
  );
}
