import { Tag } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { Auswertung } from "../_lib/quiz/auswertung";
import { MODUS_TEXT } from "../_lib/quiz/formular";
import { T } from "./typo";

/**
 * DIE QUIZ-AUSWERTUNG EINER RUNDE. Server Component, kein antd-Compound (Falle 1): nur `Tag`,
 * sonst natives Markup mit den `--fb-*`-Variablen (Falle 2). Die Balken sind eigene `div`s —
 * ein waagerechter Balken je Option ist hier einfacher als ein Diagramm, und die Tinte statt
 * Rot trägt die richtige Option (Falle 3). „richtig" steht als Wort daneben, nie nur als Farbe.
 *
 * Lagebild: `auswertung()` liefert dort keine Rangliste und keine Namen; hier gibt es keinen
 * Zweig, der sie zeigen könnte.
 */

const prozent = (x: number) => `${Math.round(x * 100)} %`;

export function QuizAuswertung({ daten, datum }: { daten: Auswertung; datum: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xl }}>
      <section
        data-testid="quiz-kopf"
        style={{ display: "flex", flexWrap: "wrap", gap: SPACE.xl, alignItems: "baseline" }}
      >
        <Kennzahl titel="TEILNEHMENDE" wert={String(daten.teilnehmende)} />
        <Kennzahl
          titel="ANTEIL RICHTIG"
          wert={daten.anteilRichtig === null ? "—" : prozent(daten.anteilRichtig)}
        />
        <Kennzahl titel="MODUS" wert={MODUS_TEXT[daten.modus]} />
        <Kennzahl titel="DATUM" wert={datum} />
        {!daten.beendet && (
          <Tag variant="filled" style={T.meta}>
            läuft noch
          </Tag>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
        <h2 style={{ ...T.lead, margin: 0 }}>Fragen</h2>
        {daten.fragen.length === 0 && <p style={{ ...T.body, margin: 0 }}>Diese Runde hat keine Fragen.</p>}
        {daten.fragen.map((f) => (
          <article key={f.index} data-testid="quiz-frage" style={{ maxWidth: "68ch" }}>
            <p style={{ ...T.body, fontWeight: 600, margin: 0 }}>
              {f.index + 1}. {f.text}
            </p>
            <p style={{ ...T.meta, margin: `${SPACE.xs}px 0 ${SPACE.sm}px` }}>
              {f.antworten === 0
                ? "Keine Antworten"
                : `${f.antworten} ${f.antworten === 1 ? "Antwort" : "Antworten"} · ${prozent(f.anteilRichtig ?? 0)} richtig`}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE.xs }}>
              {f.optionen.map((o, i) => {
                const richtig = f.richtig.includes(i);
                const anteil = f.antworten === 0 ? 0 : f.verteilung[i] / f.antworten;
                return (
                  <li key={i} data-testid="quiz-option" data-richtig={richtig ? "1" : "0"}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: SPACE.md }}>
                      <span style={{ ...T.body, fontWeight: richtig ? 600 : 400 }}>
                        {o}
                        {richtig && <span style={{ ...T.meta, marginLeft: SPACE.sm }}>richtig</span>}
                      </span>
                      <span style={{ ...T.meta, whiteSpace: "nowrap" }}>
                        {f.verteilung[i]} · {prozent(anteil)}
                      </span>
                    </div>
                    <div
                      role="presentation"
                      style={{ height: 6, borderRadius: 3, background: "var(--fb-fill)", overflow: "hidden" }}
                    >
                      <div
                        data-testid="quiz-balken"
                        style={{
                          width: `${Math.round(anteil * 100)}%`,
                          height: "100%",
                          background: richtig ? "var(--fb-ink)" : "var(--fb-muted)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {f.erklaerung !== undefined && (
              <p style={{ ...T.meta, margin: `${SPACE.sm}px 0 0` }}>{f.erklaerung}</p>
            )}
          </article>
        ))}
      </section>

      {daten.rangliste && (
        <section data-testid="quiz-rangliste" style={{ display: "flex", flexDirection: "column", gap: SPACE.md, maxWidth: "68ch" }}>
          <h2 style={{ ...T.lead, margin: 0 }}>{daten.beendet ? "Rangliste" : "Rangliste bisher"}</h2>
          {daten.rangliste.length === 0 ? (
            <p style={{ ...T.body, margin: 0 }}>Niemand ist beigetreten.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...T.kicker, textAlign: "right", width: 64, padding: SPACE.sm }}>PLATZ</th>
                  <th style={{ ...T.kicker, textAlign: "left", padding: SPACE.sm }}>SPITZNAME</th>
                  <th style={{ ...T.kicker, textAlign: "right", padding: SPACE.sm }}>PUNKTE</th>
                </tr>
              </thead>
              <tbody>
                {daten.rangliste.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--fb-split)" }}>
                    <td style={{ ...T.body, textAlign: "right", padding: SPACE.sm }}>{r.platz}</td>
                    <td style={{ ...T.body, padding: SPACE.sm }}>{r.spitzname}</td>
                    <td style={{ ...T.body, textAlign: "right", padding: SPACE.sm }}>{r.punkte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function Kennzahl({ titel, wert }: { titel: string; wert: string }) {
  return (
    <div>
      <p style={{ ...T.kicker, margin: 0 }}>{titel}</p>
      <p style={{ ...T.zahl, margin: `${SPACE.xs}px 0 0` }}>{wert}</p>
    </div>
  );
}
