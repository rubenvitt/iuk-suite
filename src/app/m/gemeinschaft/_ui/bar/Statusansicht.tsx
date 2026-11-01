"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anfrageZurueckziehenAction } from "../../_actions/anfrage";
import type { StatusDTO } from "../../_lib/vermietungTypen";
import { zeitraumText, ZUSTAND_TEXT } from "../../_lib/vermietungText";
import s from "./bar.module.css";

const SATZ: Record<StatusDTO["status"], string> = {
  angefragt: "Wir schauen uns deine Anfrage an. Der Stand ändert sich hier, sobald wir entschieden haben.",
  zugesagt: "Die Bar ist für dich eingetragen. Wenn wir Fragen haben, melden wir uns bei dir.",
  abgelehnt: "Leider klappt es diesmal nicht.",
  zurueckgezogen: "Du hast diese Anfrage zurückgezogen.",
};

/** Die Statusseite einer Anfrage: Stand, Begründung einer Absage, die eigenen Angaben, Zurückziehen mit Rückfrage. */
export function Statusansicht({ code, a }: { code: string; a: StatusDTO }) {
  const router = useRouter();
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function zurueckziehen() {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await anfrageZurueckziehenAction(code);
      if (!r.ok) { setFehler(r.fehler); return; }
      setFrage(false);
      router.refresh();
    } catch {
      setFehler("Das hat gerade nicht geklappt. Versuch es bitte noch einmal.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className={s.karte} aria-labelledby="status-titel">
      <h2 className={s.ueberschrift} id="status-titel">Deine Anfrage</h2>
      <span className={`${s.plakette} ${s[a.status] ?? ""}`} data-testid="status-stand">{ZUSTAND_TEXT[a.status]}</span>
      <p className="go-text" style={{ marginTop: 12 }}>{SATZ[a.status]}</p>
      {a.status === "abgelehnt" && a.begruendung ? <p className={s.begruendung} data-testid="status-begruendung">{a.begruendung}</p> : null}
      <dl className={s.angaben}>
        <dt>Wann</dt><dd>{zeitraumText(a.von, a.bis)}</dd>
        <dt>Anlass</dt><dd>{a.anlass}</dd>
        <dt>Personen</dt><dd>{a.personen}</dd>
        <dt>Name</dt><dd>{a.person}</dd>
        <dt>Kontakt</dt><dd>{a.kontakt}</dd>
      </dl>
      {a.status === "angefragt" || a.status === "zugesagt" ? (
        <div style={{ marginTop: 20 }}>
          {!frage ? (
            <button type="button" className={`go-knopf go-knopf-leise ${s.voll}`} onClick={() => setFrage(true)}>Anfrage zurückziehen</button>
          ) : (
            <div className={s.rueckfrage} role="group" aria-label="Rückfrage">
              <span>Wirklich zurückziehen? Die Bar ist dann für andere wieder frei.</span>
              <div className="go-knopfzeile" style={{ marginTop: 0 }}>
                <button type="button" className="go-knopf" disabled={laeuft} onClick={zurueckziehen}>Ja, zurückziehen</button>
                <button type="button" className="go-knopf go-knopf-leise" onClick={() => setFrage(false)}>Nein</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {fehler ? <p className="go-fehler" role="alert">{fehler}</p> : null}
      <p className="go-meta" style={{ marginTop: 20 }}><a href="/bar">Zum Kalender der Bar</a></p>
    </section>
  );
}
