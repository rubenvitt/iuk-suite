"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import s from "../../f/[slugSecret]/zettel.module.css";
import type { EinwurfErgebnis } from "../../_lib/ehrlich/aktionen";
import { HONIGTOPF_FELD } from "../../_lib/ehrlich/themen";
import { Blatt, Haken } from "../Blatt";
import e from "../ehrlich.module.css";
import { Turnstile } from "../Turnstile";

type Antwortweg = "keine" | "code" | "name";

const TEXT_MAX = 2000;

const FEHLER: Record<Exclude<EinwurfErgebnis, { ok: true }>["fehler"], string> = {
  leer: "Es fehlt noch deine Mitteilung.",
  name: "Für eine Rückmeldung mit Namen fehlt noch dein Name.",
  ratelimit: "Von diesem Netz kamen gerade sehr viele Mitteilungen. Versuch es in ein paar Minuten noch einmal.",
  ungueltig: "Dieser Link gilt nicht mehr.",
  pruefung: "Die Prüfung gegen automatische Einsendungen hat nicht geklappt. Versuch es noch einmal.",
};

/** Die Zusage über dem Knopf. Jeder Halbsatz hat eine Deckung im Code: `_db/schema.ts`, Abschnitt „Ehrlich gesagt". */
function kurzzusage(weg: Antwortweg): string {
  return weg === "name"
    ? "Mit deinem Namen — nur die Vertrauenspersonen sehen ihn. Keine IP, keine Uhrzeit."
    : "Anonym — kein Name, kein Konto, keine IP, keine Uhrzeit.";
}

type EinwurfProps = {
  aktion: (vorher: EinwurfErgebnis | null, fd: FormData) => Promise<EinwurfErgebnis>;
  themen: string[];
  leser: string | null;
  leserOder: string | null;
  schrift: string;
  /** Pfad zum Abholen aus Sicht des aufgerufenen Hosts (`abholenPfad`). */
  abholen: string;
  /** Site-Key, wenn Turnstile aktiv ist (`turnstileSiteKey`). */
  turnstile: string | null;
};

/** „Neue Mitteilung schreiben" baut das Formular frisch auf — samt leerem Ergebnis der Aktion. */
export function Einwurf(props: EinwurfProps) {
  const [runde, setRunde] = useState(0);
  return <EinwurfRunde key={runde} {...props} neu={() => setRunde((r) => r + 1)} />;
}

function EinwurfRunde({ aktion, themen, leser, leserOder, schrift, abholen, turnstile, neu }: EinwurfProps & { neu: () => void }) {
  const [ergebnis, absenden, laeuft] = useActionState(aktion, null);
  const [text, setText] = useState("");
  const [thema, setThema] = useState<string | null>(null);
  const [weg, setWeg] = useState<Antwortweg>("keine");
  const [name, setName] = useState("");
  const [kontakt, setKontakt] = useState("");
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [abgelehnt, setAbgelehnt] = useState(0);
  const [gesehen, setGesehen] = useState(ergebnis);
  // Nach jeder Ablehnung ein frisches Token: ein Turnstile-Token gilt nur einmal.
  if (ergebnis !== gesehen) {
    setGesehen(ergebnis);
    if (ergebnis && !ergebnis.ok) setAbgelehnt((n) => n + 1);
  }

  if (ergebnis?.ok) {
    return (
      <Blatt titel="Danke." gross vorTitel={<Haken />} schrift={schrift}>
        <div className={`${s.zustand} ${s.aufbau}`} style={{ marginTop: 0 }}>
          <p className={s.text}>
            Deine Mitteilung ist angekommen{ergebnis.antwortweg === "name" ? "." : " — anonym."}
          </p>
          {ergebnis.code ? (
            <>
              <div className={e.code} data-testid="abholcode">
                <span className={s.sektionKicker}>Dein Abholcode</span>
                <span className={e.codeWert}>{ergebnis.code}</span>
                <p className={s.hinweis}>Wir können ihn dir nicht noch einmal anzeigen.</p>
                <button
                  type="button"
                  className={`${s.knopf} ${s.knopfUmriss}`}
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(ergebnis.code!).then(
                      () => setKopiert("Kopiert"),
                      () => setKopiert("Bitte abschreiben"),
                    );
                  }}
                >
                  {kopiert ?? "Code kopieren"}
                </button>
              </div>
              <div className={e.fuss}>
                <Link className={e.textlink} href={abholen}>Antwort abholen</Link>
              </div>
            </>
          ) : ergebnis.antwortweg === "name" && leserOder ? (
            <p className={s.text} style={{ marginTop: 12 }}>{leserOder} meldet sich bei dir.</p>
          ) : null}
          <div className={e.fuss}>
            <button type="button" className={e.textlink} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={neu}>
              Neue Mitteilung schreiben
            </button>
          </div>
        </div>
      </Blatt>
    );
  }

  const fehler = ergebnis && !ergebnis.ok ? FEHLER[ergebnis.fehler] : null;
  const rest = TEXT_MAX - text.length;

  return (
    <Blatt
      titel="Was liegt dir auf dem Herzen?"
      schrift={schrift}
      kopf={
        <>
          {leser ? (
            <p className={s.meta} data-testid="leser">
              Es lesen nur: <b>{leser}</b>
            </p>
          ) : null}
          <p className={s.vertrag}>Anonym oder mit Namen</p>
        </>
      }
    >
      <form action={absenden} noValidate>
        <div className={e.honigtopf} aria-hidden="true">
          <label htmlFor={HONIGTOPF_FELD}>Webseite</label>
          <input id={HONIGTOPF_FELD} name={HONIGTOPF_FELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <fieldset className={`${s.sektion} ${s.aufbau}`} style={{ border: 0, padding: 0, marginInline: 0 }}>
          <legend className={s.sektionKicker}>Worum geht es?</legend>
          <div className={e.themen}>
            {themen.map((t, i) => (
              <span className={e.thema} key={t}>
                <input type="radio" name="thema" id={`thema-${i}`} value={t} checked={thema === t} onChange={() => setThema(t)} />
                <label htmlFor={`thema-${i}`}>{t}</label>
              </span>
            ))}
          </div>
        </fieldset>

        <div className={`${s.sektion} ${s.aufbau}`}>
          <label className={s.sektionKicker} htmlFor="mitteilung" style={{ display: "block" }}>
            Deine Mitteilung
          </label>
          <textarea
            id="mitteilung"
            name="text"
            className={`${s.textfeld} ${e.langfeld}`}
            maxLength={TEXT_MAX}
            rows={5}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            autoComplete="off"
            spellCheck
            required
          />
          <span className={s.zaehler} aria-live="polite">
            {rest <= 200 ? (rest === 0 ? "Das Feld ist voll" : `noch ${rest} Zeichen`) : ""}
          </span>
          {weg !== "name" ? (
            <p className={s.hinweis} style={{ marginTop: 0 }}>
              Willst du anonym bleiben, schreib nichts, woran man dich erkennt.
            </p>
          ) : null}
        </div>

        <fieldset className={`${s.sektion} ${s.aufbau}`} style={{ border: 0, padding: 0, marginInline: 0 }}>
          <legend className={s.sektionKicker}>Möchtest du eine Antwort?</legend>
          <div className={e.wahl}>
            <Option wert="keine" weg={weg} setWeg={setWeg} titel="Nein, ich will es nur loswerden." text="Niemand meldet sich." />
            <Option wert="code" weg={weg} setWeg={setWeg} titel="Ja, aber anonym." text="Du bekommst einen Abholcode für die Antwort." />
            <Option wert="name" weg={weg} setWeg={setWeg} titel="Ja, mit meinem Namen." text="Eine Vertrauensperson meldet sich bei dir." />
            {weg === "name" ? (
              <div className={e.felder}>
                <div>
                  <label className={e.feldLabel} htmlFor="name">Dein Name</label>
                  <input id="name" name="name" className={s.textfeld} maxLength={120} autoComplete="name" value={name} onChange={(ev) => setName(ev.target.value)} required />
                </div>
                <div>
                  <label className={e.feldLabel} htmlFor="kontakt">Wie erreicht man dich?</label>
                  <input id="kontakt" name="kontakt" className={s.textfeld} maxLength={200} value={kontakt} onChange={(ev) => setKontakt(ev.target.value)} placeholder="Telefon, E-Mail oder „beim Dienstabend“" />
                </div>
              </div>
            ) : null}
          </div>
        </fieldset>

        <div className={s.aufbau}>
          <p className={s.kurzzusage}>{kurzzusage(weg)}</p>
          {turnstile ? <Turnstile siteKey={turnstile} runde={abgelehnt} /> : null}
          <button className={s.knopf} type="submit" disabled={laeuft} aria-busy={laeuft}>
            {laeuft ? "Wird gesendet…" : "Mitteilung absenden"}
          </button>
          {fehler ? (
            <p className={s.meldung} role="alert">{fehler}</p>
          ) : null}
          <div className={e.fuss}>
            <Link className={e.textlink} href={abholen}>Antwort abholen</Link>
          </div>
        </div>
      </form>
    </Blatt>
  );
}

function Option({
  wert,
  weg,
  setWeg,
  titel,
  text,
}: {
  wert: Antwortweg;
  weg: Antwortweg;
  setWeg: (w: Antwortweg) => void;
  titel: string;
  text: string;
}) {
  return (
    <label className={e.option}>
      <input type="radio" name="antwortweg" value={wert} checked={weg === wert} onChange={() => setWeg(wert)} />
      <span className={e.punkt} aria-hidden="true" />
      <span>
        <span className={e.otitel}>{titel}</span>
        <span className={e.otext}>{text}</span>
      </span>
    </label>
  );
}
