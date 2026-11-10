"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { useEntwurfMeldung } from "@/core/entwurf/useEntwurfMeldung";
import { TURNSTILE_AKTIONEN } from "@/core/turnstile/aktionen";
import { Turnstile } from "@/core/turnstile/Turnstile";
import { anfrageSendenAction } from "../../_actions/anfrage";
import { tagesstuecke, ueberlappt, vorschlagAmTag, WUNSCHZEIT, type Belegt } from "../../_lib/belegung";
import { istTestanlass, plusMonate, TEST_FRIST_MONATE } from "../../_lib/testanfrage";
import { tagText } from "../../_lib/vermietungText";
import { plusTage, zeitpunkt } from "../../_lib/zeit";
import { BarKalender } from "./BarKalender";
import s from "./bar.module.css";

type Felder = { vonTag: string; vonUhr: string; bisTag: string; bisUhr: string; anlass: string; personen: string; person: string; kontakt: string; hinweis: string; webseite: string };

/** Angemeldet über die Suite: Name und Kontakt vorausgefüllt, sonst `null`. */
export type Vorbelegung = { name: string; kontakt: string } | null;

/**
 * „Bar mieten“ ohne Login: Kalender frei/belegt, Tag antippen zeigt belegte Zeiten, Formular. Nach dem Absenden
 * geht es auf die Statusseite (`/status/<code>?neu=1`, IDA-387) — die Adresse steht dann in der Adresszeile und
 * übersteht Neuladen und Lesezeichen. Die Kollisionsprüfung macht der Server (`_actions/anfrage.ts`); hier steht
 * nur, was die Person vorher sehen kann: die belegten Zeiten der gewählten Tage direkt unter der Zeitwahl.
 */
export function BarAnfrage({ belegt, heute, vorbelegung, anmeldeHref, turnstile = null }: {
  belegt: readonly Belegt[]; heute: string; vorbelegung: Vorbelegung; anmeldeHref: string;
  /** Site-Key, wenn Turnstile aktiv ist (IDA-341, `turnstileSiteKey`). */
  turnstile?: string | null;
}) {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [formOffen, setFormOffen] = useState(false);
  const router = useRouter();
  const leer: Felder = { vonTag: "", vonUhr: WUNSCHZEIT.ab, bisTag: "", bisUhr: WUNSCHZEIT.bis, anlass: "", personen: "", person: vorbelegung?.name ?? "", kontakt: vorbelegung?.kontakt ?? "", hinweis: "", webseite: "" };
  const [f, setF] = useState<Felder>(leer);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [code, setCode] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  // IDA-341: das Token liegt nicht im Entwurf (es gilt nur einmal und fünf Minuten), es wird beim Senden gelesen.
  const token = useRef<string | null>(null);
  const [runde, setRunde] = useState(0);

  /*
   * IDA-358 — DIE ANFRAGE LIEGT AUF DEM GERÄT, bis der Server sie bestätigt (`core/entwurf`): ein Neuladen oder
   * ein gescheitertes Absenden (Netz, Rollout) kostet die Eingaben nicht mehr, und die Sendung wird von selbst
   * wiederholt. Die Sendungs-ID wird die ID der Anfrage (`_lib/vermietung.ts`, `legeAnfrageAn`) — eine
   * Wiederholung bekommt denselben Statuslink, statt eine zweite Anfrage anzulegen.
   */
  const entwurf = useEntwurf<{ f: Felder; formOffen: boolean }, Felder, Awaited<ReturnType<typeof anfrageSendenAction>>>({
    schluessel: "gemeinschaft:bar-anfrage:neu",
    stand: { f, formOffen },
    wiederherstellen: (w) => { setF(w.f); setFormOffen(w.formOffen); },
    senden: (felder, sendung) => anfrageSendenAction({ ...felder, sendung, turnstile: token.current ?? "" }),
    antwort: (r) => {
      if (r.ok) { setCode(r.wert.code); window.scrollTo(0, 0); return true; }
      setFehler(r.fehler);
      setFeldFehler(r.feldFehler ?? {});
      setRunde((n) => n + 1);
      return false;
    },
  });
  const meldung = useEntwurfMeldung(entwurf);
  useEffect(() => { if (code) router.push(`/status/${code}?neu=1`); }, [code, router]);
  const sendet = entwurf.zustand === "sendet";

  const setFeld = (k: keyof Felder) => (ev: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((alt) => ({ ...alt, [k]: ev.target.value }));

  function amTagAnfragen(tag: string) {
    // IDA-387: die Zeit an die freie Zeit des Tages anpassen, statt immer 18–23 Uhr vorzuschlagen.
    const v = vorschlagAmTag(belegt, tag);
    setF((alt) => (v ? { ...alt, ...v } : { ...alt, vonTag: tag, bisTag: tag }));
    setFormOffen(true);
    setTimeout(() => formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 30);
  }

  function absenden(ev: FormEvent) {
    ev.preventDefault();
    if (sendet) return;
    setFehler(null);
    setFeldFehler({});
    entwurf.sende(f);
  }

  if (code) {
    return (
      <section className={s.karte} aria-labelledby="danke-titel">
        <p className={s.danke} id="danke-titel">Danke.</p>
        <a className="go-knopf" href={`/status/${code}?neu=1`}>Zum Stand deiner Anfrage</a>
      </section>
    );
  }

  const stuecke = gewaehlt ? tagesstuecke(belegt, gewaehlt) : [];
  const zeitwahl = belegungDerWahl(belegt, f);
  const ff = (k: keyof Felder) => (feldFehler[k] ? <p className="go-fehler" id={`fehler-${k}`}>{feldFehler[k]}</p> : null);
  const beschr = (k: keyof Felder) => (feldFehler[k] ? { "aria-invalid": true, "aria-describedby": `fehler-${k}` } : {});

  return (
    <div>
      <div className={`${s.karte} ${s.anmeldung}`}>
        {vorbelegung ? (
          <span className="go-meta">Angemeldet als <b>{vorbelegung.name || "Mitglied"}</b>. Name und Kontakt sind ausgefüllt.</span>
        ) : (
          <>
            <span className="go-meta">Du bist Mitglied? Dann füllen wir Name und Kontakt für dich aus.</span>
            <a className="go-knopf go-knopf-leise" href={anmeldeHref}>Anmelden</a>
          </>
        )}
      </div>

      <section className={s.karte} aria-labelledby="frei-titel">
        <h2 className={s.ueberschrift} id="frei-titel">Wann ist die Bar frei?</h2>
        <BarKalender belegt={belegt} heute={heute} gewaehlt={gewaehlt} waehle={setGewaehlt} />
        {gewaehlt ? (
          <div className={s.tagInfo} data-testid="tag-info">
            <strong>{tagText(gewaehlt)}</strong>
            {stuecke.length ? (
              <ul>
                {stuecke.map((z, i) => <li key={i}>belegt {z.ab ?? "ab Vortag"}–{z.bis ?? "Folgetag"}{z.bis ? " Uhr" : ""}</li>)}
              </ul>
            ) : <p className="go-meta" style={{ margin: "6px 0 12px" }}>Den ganzen Tag frei.</p>}
            <button type="button" className={`go-knopf go-knopf-leise ${s.voll}`} onClick={() => amTagAnfragen(gewaehlt)}>An diesem Tag anfragen</button>
          </div>
        ) : null}
      </section>

      {!formOffen ? (
        <div className="go-knopfzeile"><button type="button" className={`go-knopf ${s.voll}`} onClick={() => setFormOffen(true)}>Bar anfragen</button></div>
      ) : (
        <section className={s.karte} ref={formRef} aria-labelledby="anfrage-titel" style={{ scrollMarginTop: 16 }}>
          <h2 className={s.ueberschrift} id="anfrage-titel">Bar anfragen</h2>
          <form className={s.formular} onSubmit={absenden}>
            <fieldset className={s.block}>
              <legend>Zeitraum</legend>
              <div className={s.zeile2}>
                <label><span className="go-label">Beginn</span>
                  <input className="go-feld" type="date" required value={f.vonTag} min={heute} {...beschr("vonTag")}
                    onChange={(ev) => { const v = ev.target.value; setF((alt) => ({ ...alt, vonTag: v, bisTag: alt.bisTag && alt.bisTag >= v ? alt.bisTag : v })); }} />
                </label>
                <label><span className="go-label">Uhrzeit</span>
                  <input className="go-feld" type="time" required step={900} value={f.vonUhr} onChange={setFeld("vonUhr")} {...beschr("vonUhr")} />
                </label>
              </div>
              {ff("vonTag")}{ff("vonUhr")}
              <div className={s.zeile2}>
                <label><span className="go-label">Ende</span>
                  <input className="go-feld" type="date" required value={f.bisTag} min={f.vonTag || heute} onChange={setFeld("bisTag")} {...beschr("bisTag")} />
                </label>
                <label><span className="go-label">Uhrzeit</span>
                  <input className="go-feld" type="time" required step={900} value={f.bisUhr} onChange={setFeld("bisUhr")} {...beschr("bisUhr")} />
                </label>
              </div>
              {ff("bisTag")}{ff("bisUhr")}
              {zeitwahl.tage.length ? (
                <div className={zeitwahl.ueberschneidet ? s.wahlBelegt : s.wahlInfo} data-testid="zeitwahl-belegung" role="status">
                  {zeitwahl.tage.map((t) => (
                    <div key={t.tag}>
                      <b>{tagText(t.tag)}:</b>{" "}
                      {t.stuecke.length ? t.stuecke.map((z) => `belegt ${z.ab ?? "ab Vortag"}–${z.bis ?? "Folgetag"}${z.bis ? " Uhr" : ""}`).join(", ") : "frei"}
                    </div>
                  ))}
                  {zeitwahl.ueberschneidet ? <div>Deine Zeit überschneidet sich mit einer belegten Zeit.</div> : null}
                </div>
              ) : null}
            </fieldset>

            <fieldset className={s.block}>
              <legend>Veranstaltung</legend>
              <label><span className="go-label">Anlass<span className={s.hilfe}>Zum Beispiel Geburtstag, Vereinstreffen, Weihnachtsfeier</span></span>
                <input className="go-feld" required maxLength={120} value={f.anlass} onChange={setFeld("anlass")} {...beschr("anlass")} />
              </label>
              {ff("anlass")}
              {istTestanlass(f.anlass) ? (
                <p className="go-meta" role="status" data-testid="test-hinweis" style={{ margin: 0 }}>
                  Anfragen mit dem Anlass „Test“ löschen wir einen Monat nach dem Absenden automatisch, diese also am {tagText(plusMonate(heute, TEST_FRIST_MONATE), true)}.
                </p>
              ) : null}
              <label><span className="go-label">Wie viele Personen kommen ungefähr?</span>
                <input className={`go-feld ${s.personen}`} type="number" inputMode="numeric" required min={1} max={200} value={f.personen} onChange={setFeld("personen")} {...beschr("personen")} />
              </label>
              {ff("personen")}
            </fieldset>

            <fieldset className={s.block}>
              <legend>Ansprechperson</legend>
              <label><span className="go-label">Name</span>
                <input className="go-feld" required maxLength={120} autoComplete="name" value={f.person} onChange={setFeld("person")} {...beschr("person")} />
              </label>
              {ff("person")}
              <label><span className="go-label">Telefon oder E-Mail<span className={s.hilfe}>Darüber melden wir uns, falls wir Fragen haben</span></span>
                <input className="go-feld" required maxLength={200} autoComplete="email" value={f.kontakt} onChange={setFeld("kontakt")} {...beschr("kontakt")} />
              </label>
              {ff("kontakt")}
              <label><span className="go-label">Möchtest du uns noch etwas sagen?<span className={s.hilfe}>Freiwillig</span></span>
                <textarea className={`go-feld ${s.textfeld}`} maxLength={1000} value={f.hinweis} onChange={setFeld("hinweis")} {...beschr("hinweis")} />
              </label>
              {ff("hinweis")}
              <div className={s.honig} aria-hidden="true">
                <label>Webseite<input tabIndex={-1} autoComplete="off" value={f.webseite} onChange={setFeld("webseite")} name="webseite" /></label>
              </div>
            </fieldset>

            {fehler ? <p className="go-fehler" role="alert">{fehler}</p> : null}
            {!fehler && meldung && meldung.art !== "wiederhergestellt" ? (
              <p className="go-meta" role="status" data-rolle="entwurf-hinweis">{meldung.text}</p>
            ) : null}
            <div>
              {/* Ohne Rückfrage von Cloudflare ist das Widget unsichtbar; in einer eigenen Zelle kostet es dann keinen Rasterabstand. */}
              {turnstile ? <Turnstile siteKey={turnstile} aktion={TURNSTILE_AKTIONEN.bar} runde={runde} beiToken={(t) => { token.current = t; }} /> : null}
              <button className={`go-knopf ${s.voll}`} type="submit" disabled={sendet}>{sendet ? "Wird gesendet …" : "Anfrage senden"}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/**
 * Die belegten Zeiten der gewählten Tage (höchstens die drei, die eine Anfrage dauern darf) und ob die gewählte
 * Zeit sich damit überschneidet — direkt unter der Zeitwahl, nicht erst nach dem Absenden (IDA-387).
 */
function belegungDerWahl(belegt: readonly Belegt[], f: Felder): { tage: { tag: string; stuecke: ReturnType<typeof tagesstuecke> }[]; ueberschneidet: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vonTag)) return { tage: [], ueberschneidet: false };
  const bisTag = /^\d{4}-\d{2}-\d{2}$/.test(f.bisTag) && f.bisTag >= f.vonTag ? f.bisTag : f.vonTag;
  const tage: string[] = [];
  for (let t = f.vonTag; t <= bisTag && tage.length < 3; t = plusTage(t, 1)) tage.push(t);
  const uhrOk = (u: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(u);
  const von = uhrOk(f.vonUhr) ? zeitpunkt(f.vonTag, f.vonUhr) : null;
  const bis = uhrOk(f.bisUhr) ? zeitpunkt(bisTag, f.bisUhr) : null;
  const ueberschneidet = von !== null && bis !== null && bis > von && belegt.some((b) => ueberlappt(b, { von, bis }));
  return { tage: tage.map((tag) => ({ tag, stuecke: tagesstuecke(belegt, tag) })), ueberschneidet };
}
