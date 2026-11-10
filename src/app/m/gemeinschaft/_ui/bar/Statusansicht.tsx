"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { anfrageZurueckziehenAction } from "../../_actions/anfrage";
import { istTestanlass, testLoeschtag } from "../../_lib/testanfrage";
import type { StatusDTO } from "../../_lib/vermietungTypen";
import { tagText, zeitraumText, ZUSTAND_TEXT } from "../../_lib/vermietungText";
import { Vertragsbereich } from "./Vertragsbereich";
import s from "./bar.module.css";

const SATZ: Record<StatusDTO["status"], string> = {
  angefragt: "Wir schauen uns deine Anfrage an. Der Stand ändert sich hier, sobald wir entschieden haben.",
  zugesagt: "Die Bar ist für dich eingetragen. Wenn wir Fragen haben, melden wir uns bei dir.",
  abgelehnt: "Leider klappt es diesmal nicht.",
  zurueckgezogen: "Du hast diese Anfrage zurückgezogen.",
};

/**
 * Die Statusseite einer Anfrage: Stand, Begründung einer Absage, die eigenen Angaben, Zurückziehen mit Rückfrage.
 * `neu`: gerade abgeschickt (`?neu=1` vom Formular, IDA-387) — dann oben der Link zum Sichern.
 */
export function Statusansicht({ code, a, neu = false }: { code: string; a: StatusDTO; neu?: boolean }) {
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
    <>
    {neu ? <Gesichert code={code} /> : null}
    <section className={s.karte} aria-labelledby="status-titel">
      <h2 className={s.ueberschrift} id="status-titel">Deine Anfrage</h2>
      <span className={`${s.plakette} ${s[a.status] ?? ""}`} data-testid="status-stand">{ZUSTAND_TEXT[a.status]}</span>
      <p className="go-text" style={{ marginTop: 12 }}>{SATZ[a.status]}</p>
      {istTestanlass(a.anlass) ? (
        <p className="go-meta" data-testid="test-hinweis">
          Das ist eine Testanfrage. Wir löschen sie am {tagText(testLoeschtag(a.eingegangenAm), true)} automatisch, danach führt dieser Link ins Leere.
        </p>
      ) : null}
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
    {a.status === "zugesagt" && a.vertrag ? <Vertragsbereich code={code} person={a.person} v={a.vertrag} /> : null}
    </>
  );
}

/**
 * Nach dem Absenden (IDA-387): Danke und der Link, mit Kopieren, Teilen (wo das Gerät es kann) und „Per E-Mail an
 * mich“ über das eigene Mailprogramm — die Suite verschickt keine E-Mail. `?neu=1` kommt sofort aus der Adresse,
 * damit ein Lesezeichen oder ein geteilter Link nicht wieder „Danke“ zeigt.
 */
function Gesichert({ code }: { code: string }) {
  const pfad = `/status/${code}`;
  const [link, setLink] = useState(pfad);
  const [teilbar, setTeilbar] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  useEffect(() => {
    const voll = `${window.location.origin}${pfad}`;
    window.history.replaceState(window.history.state, "", pfad);
    // Erst nach dem Mounten: Server und erster Client-Lauf rendern gleich (kein Hydration-Unterschied).
    queueMicrotask(() => { setLink(voll); setTeilbar(typeof navigator.share === "function"); });
  }, [pfad]);
  const betreff = "Meine Anfrage für die Bar";
  return (
    <section className={s.karte} aria-labelledby="danke-titel" data-testid="gesichert">
      <p className={s.danke} id="danke-titel">Danke.</p>
      <p className="go-text">Speicher dir diesen Link, eine E-Mail kommt nicht.</p>
      <div className={s.statuslink}>
        <code data-testid="statuslink">{link}</code>
        <button type="button" className="go-knopf go-knopf-leise" onClick={() => {
          navigator.clipboard?.writeText(link).then(() => setKopiert(true), () => setKopiert(false));
        }}>{kopiert ? "Kopiert" : "Kopieren"}</button>
      </div>
      <div className="go-knopfzeile">
        {teilbar ? (
          <button type="button" className="go-knopf" onClick={() => { navigator.share({ title: betreff, url: link }).catch(() => {}); }}>Teilen</button>
        ) : null}
        <a className={`go-knopf ${teilbar ? "go-knopf-leise" : ""}`} href={`mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(link)}`}>Per E-Mail an mich</a>
      </div>
    </section>
  );
}
