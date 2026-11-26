"use client";

// DIE BEAMER-ANSICHT DES LIVE-QUIZ (docs/design/feedback-live-quiz.md, Mockup
// docs/design/mockups/live-quiz.html, Abschnitt „Beamer“). Der Stand kommt als ganze
// `BeamerSicht` aus dem Strom (`strom`); gesteuert wird mit „gehe zu Schritt n“ (`schritt`, §5.3),
// beendet mit `beenden`. Zwei Bedienwege:
//
// - ALLEIN IM BROWSER: „Lobby öffnen“, Tastatur (→ / Bild ab / Leertaste vor, ← / Bild auf
//   zurück) und zwei kleine Knöpfe in der Ecke.
// - IM IFRAME (Slidev, `docs/slidev/LiveQuiz.vue`): nur `postMessage` vom Parent, keine Tastatur,
//   keine Knöpfe außer „Quiz beenden“ im Schluss. Das iframe holt sich nie selbst den Fokus,
//   sonst fängt es die Pfeiltasten ab und Slidev blättert nicht mehr (§5.5).
//
// Nur Typen aus `_lib` (Falle 6 gilt in die andere Richtung: dieses Modul exportiert nichts an
// Server Components außer der Komponente selbst).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import type { BeamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { QuizForm, quizFarbe, quizZahl } from "@/app/m/feedback/_quiz/QuizForm";
import z from "@/app/m/feedback/_quiz/zeichen.module.css";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { laengenStufe } from "./groessen";
import s from "./beamer.module.css";

/** Pause, bevor ein ganz geschlossener Strom (Server weg, 503) neu verbunden wird. */
const NEU_VERBINDEN_MS = 3000;
/** Takt des Countdowns. Eine Viertelsekunde, damit die volle Sekunde nicht sichtbar springt. */
const TAKT_MS = 250;
/** So lange steht „Neue Runde gestartet“ (§5.3: ein Schritt nach dem Beenden legt eine neue an). */
const HINWEIS_MS = 6000;
/** Plätze in der Zwischenrangliste (Mockup: fünf). */
const RANGLISTE_PLAETZE = 5;
/** So lange wartet „Wirklich beenden?“ auf den zweiten Tipp. */
const BESTAETIGEN_MS = 4000;
/** Umfang des Countdown-Rings (r = 44 im viewBox 100). */
const RING_UMFANG = 2 * Math.PI * 44;

const ABGESAGT = "Der Dienstabend heute ist abgesagt. Das Quiz kann nicht starten.";
const UNGUELTIG = "Das Quiz hat noch keine gültigen Fragen. Bearbeite es in der Verwaltung.";
const ADRESSE_WEG = "Diese Beamer-Adresse gilt nicht mehr. Hol die neue aus der Verwaltung.";
const NICHT_GEKLAPPT = "Das hat nicht geklappt. Versuch es noch einmal.";

/** Der Weg neben der Seite (`/beamer/<secret>` → `/beamer/<secret>/strom`), auch hinter dem Host-Rewrite. */
function weg(teil: "strom" | "schritt" | "beenden"): string {
  return `${window.location.pathname.replace(/\/+$/, "")}/${teil}`;
}

async function fehlercode(r: Response): Promise<string | null> {
  try {
    const body: unknown = await r.json();
    return typeof body === "object" && body !== null && "fehler" in body ? String(body.fehler) : null;
  } catch {
    return null;
  }
}

const imIframeJetzt = () => window.parent !== window;
/** Ob die Seite im iframe steht, ändert sich nie: kein Abo nötig. */
const ohneAbo = () => () => {};

/** Steuernachricht des Parents (Slidev): `{ typ: "iuk-quiz", schritt: n }`, n ganz und ≥ 0. */
function steuerSchritt(daten: unknown): number | null {
  if (typeof daten !== "object" || daten === null) return null;
  const d = daten as { typ?: unknown; schritt?: unknown };
  if (d.typ !== "iuk-quiz" || typeof d.schritt !== "number") return null;
  return Number.isInteger(d.schritt) && d.schritt >= 0 ? d.schritt : null;
}

const fragen = (n: number) => (n === 1 ? "1 Frage" : `${n} Fragen`);
const prozent = (anteil: number) => Math.round(anteil * 100);

export function Beamer({ anfang, beitrittAdresse }: { anfang: BeamerSicht; beitrittAdresse: string }) {
  const [sicht, setSicht] = useState(anfang);
  // Versatz Serveruhr − Geräteuhr: der Countdown rechnet gegen die Serveruhr (`jetzt`).
  const [versatz, setVersatz] = useState(() => anfang.jetzt - Date.now());
  const [geraetJetzt, setGeraetJetzt] = useState(() => Date.now());
  // `null` im Server-HTML: dort steht keine Bedienung, die im iframe gleich wieder verschwände.
  const imIframe = useSyncExternalStore(ohneAbo, imIframeJetzt, () => null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [verbindung, setVerbindung] = useState(0);

  const sichtRef = useRef(anfang);
  // Der zuletzt gesendete oder bestätigte Schritt. Vor dem Start (`vorStart`) gibt es keinen —
  // dort trägt die Sicht `schritt: 0`, ohne dass Schritt 0 schon gesendet wäre.
  const letzter = useRef<number | null>(anfang.phase.art === "vorStart" ? null : anfang.schritt);
  const anfrageNr = useRef(0);
  const ausstehend = useRef(0);
  const hinweisWecker = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Strom und POST-Antwort kommen auf zwei Wegen und überholen sich: beim schnellen Blättern kann
  // ein Strom-Ereignis, gelesen VOR dem letzten Schreiben, NACH dessen Antwort ankommen. Die
  // Serverzeit der Sicht (`jetzt`) ordnet beide; eine ältere Sicht ersetzt nie eine neuere.
  const uebernimm = useCallback((neu: BeamerSicht) => {
    if (neu.jetzt < sichtRef.current.jetzt) return;
    sichtRef.current = neu;
    // Solange ein Schritt unterwegs ist, bleibt er der letzte: sonst zählte das nächste „Weiter“
    // vom Stand davor und schickte denselben Schritt noch einmal.
    if (neu.phase.art !== "vorStart" && ausstehend.current === 0) letzter.current = neu.schritt;
    setVersatz(neu.jetzt - Date.now());
    setGeraetJetzt(Date.now());
    setSicht(neu);
  }, []);

  useEffect(() => () => clearTimeout(hinweisWecker.current), []);

  // DER STROM. Ein kurzer Netzverlust heilt `EventSource` selbst (CONNECTING); der Server schickt
  // beim Verbinden den vollen Stand. `ende`: das Secret wurde rotiert oder das Quiz gelöscht.
  useEffect(() => {
    const quelle = new EventSource(weg("strom"));
    let wecker: ReturnType<typeof setTimeout> | undefined;
    quelle.onmessage = (e: MessageEvent<string>) => {
      try {
        uebernimm(JSON.parse(e.data) as BeamerSicht);
      } catch {
        // kaputtes Ereignis: den nächsten Stand abwarten
      }
    };
    quelle.addEventListener("ende", () => {
      quelle.close();
      setMeldung(ADRESSE_WEG);
    });
    quelle.onerror = () => {
      if (quelle.readyState !== 2) return;
      wecker = setTimeout(() => setVerbindung((v) => v + 1), NEU_VERBINDEN_MS);
    };
    return () => {
      clearTimeout(wecker);
      quelle.close();
    };
  }, [verbindung, uebernimm]);

  const zeigeHinweis = useCallback((text: string) => {
    clearTimeout(hinweisWecker.current);
    setHinweis(text);
    hinweisWecker.current = setTimeout(() => setHinweis(null), HINWEIS_MS);
  }, []);

  /** „Gehe zu Schritt n“. Derselbe Schritt wie zuletzt gesendet oder bestätigt geht nicht noch einmal hinaus. */
  const geheZu = useCallback(
    async (schritt: number) => {
      if (schritt === letzter.current) return;
      letzter.current = schritt;
      const nr = ++anfrageNr.current;
      const warBeendet = sichtRef.current.beendet;
      ausstehend.current++;
      let r: Response;
      let neu: BeamerSicht | null = null;
      try {
        r = await fetch(weg("schritt"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ schritt }),
        });
        if (r.ok) neu = (await r.json()) as BeamerSicht;
      } catch {
        if (nr !== anfrageNr.current) return;
        letzter.current = null;
        setMeldung(NICHT_GEKLAPPT);
        return;
      } finally {
        ausstehend.current--;
      }
      // Eine überholte Antwort (schnelles Blättern) — Erfolg wie Fehler — überschreibt den neueren
      // Stand nicht und gibt dessen Schritt auch nicht wieder frei.
      if (nr !== anfrageNr.current) return;
      if (neu) {
        setMeldung(null);
        uebernimm(neu);
        if (warBeendet && !neu.beendet) zeigeHinweis("Neue Runde gestartet. Der Code ist neu.");
        return;
      }
      const code = await fehlercode(r);
      if (nr !== anfrageNr.current) return;
      if (r.status === 409 && code === "tag_belegt") return setMeldung(ABGESAGT);
      if (r.status === 409 && code === "fragen_ungueltig") return setMeldung(UNGUELTIG);
      if (r.status === 404) return setMeldung(ADRESSE_WEG);
      // 429 und alles andere: derselbe Schritt darf noch einmal versucht werden.
      letzter.current = null;
      setMeldung(NICHT_GEKLAPPT);
    },
    [uebernimm, zeigeHinweis],
  );

  /** Ein Schritt vor oder zurück, gezählt vom zuletzt gesendeten (schnelles Drücken geht nicht verloren). */
  const blaettere = useCallback(
    (richtung: 1 | -1) => {
      const jetzt = sichtRef.current;
      const basis = jetzt.phase.art === "vorStart" ? -1 : (letzter.current ?? jetzt.schritt);
      const ziel = basis + richtung;
      if (ziel < 0 || ziel > jetzt.schrittAnzahl - 1) return;
      void geheZu(ziel);
    },
    [geheZu],
  );

  // IFRAME (Slidev): Steuerung nur per `postMessage`, und nur, wenn es einen Parent gibt.
  useEffect(() => {
    const hoere = (e: MessageEvent) => {
      // Nur der eigene Parent steuert, kein anderes Fenster (Popup, Nachbar-iframe).
      if (!imIframeJetzt() || e.source !== window.parent) return;
      const schritt = steuerSchritt(e.data);
      if (schritt === null) return;
      // Über den letzten Schritt hinaus klemmt auch der Server; so bleiben leere Slidev-Klicks still.
      void geheZu(Math.min(schritt, Math.max(0, sichtRef.current.schrittAnzahl - 1)));
    };
    window.addEventListener("message", hoere);
    return () => window.removeEventListener("message", hoere);
  }, [geheZu]);

  // Dem Parent den Stand melden. targetOrigin "*": die Nachricht trägt nur Schrittzahlen, nie das
  // Secret (das steht in der URL, die der Parent ohnehin eingebettet hat) — eine fremde Herkunft
  // erfährt daraus nichts. Den Ursprung des Parents kennt das iframe nicht verlässlich.
  useEffect(() => {
    if (!imIframe) return;
    window.parent.postMessage({ typ: "iuk-quiz-stand", schritt: sicht.schritt, schrittAnzahl: sicht.schrittAnzahl }, "*");
  }, [imIframe, sicht.schritt, sicht.schrittAnzahl]);

  // TASTATUR, nur allein im Browser. Auf einem Knopf bleiben Leertaste und Enter beim Knopf (sonst
  // klickte er UND blätterte); Pfeile und Bild auf/ab blättern auch dort — nach einem Klick auf
  // „Weiter“ hat der Knopf den Fokus, und ein Presenter-Klicker sendet genau diese Tasten.
  useEffect(() => {
    if (imIframe !== false) return;
    const taste = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel?.closest?.("input, textarea, select")) return;
      if ((e.key === " " || e.key === "Enter") && ziel?.closest?.("button, a")) return;
      const richtung =
        e.key === "ArrowRight" || e.key === "PageDown" || e.key === " " ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
      if (richtung === 0) return;
      e.preventDefault();
      blaettere(richtung);
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [imIframe, blaettere]);

  // Countdown: nur, solange eine Frage mit Zeitlimit offen ist.
  const phase = sicht.phase;
  const laeuft = phase.art === "frage" && phase.offen && phase.endetUm !== null;
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => setGeraetJetzt(Date.now()), TAKT_MS);
    return () => clearInterval(t);
  }, [laeuft]);

  // „QUIZ BEENDEN“ IN ZWEI TIPPS: der erste wird zu „Wirklich beenden?“, erst der zweite beendet
  // (macht den Code ungültig). Kein Dialog: der stähle im iframe den Fokus.
  const [bestaetigen, setBestaetigen] = useState(false);
  const bestaetigenWecker = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(bestaetigenWecker.current), []);

  async function beende(e: MouseEvent<HTMLButtonElement>) {
    // Im iframe den Fokus gleich wieder abgeben, sonst blättert Slidev nicht mehr.
    e.currentTarget.blur();
    if (imIframeJetzt()) {
      try {
        window.parent.focus();
      } catch {
        // fremde Herkunft ohne Fokusrecht: dann bleibt es beim blur
      }
    }
    clearTimeout(bestaetigenWecker.current);
    if (!bestaetigen) {
      setBestaetigen(true);
      bestaetigenWecker.current = setTimeout(() => setBestaetigen(false), BESTAETIGEN_MS);
      return;
    }
    setBestaetigen(false);
    try {
      const r = await fetch(weg("beenden"), { method: "POST" });
      if (!r.ok) setMeldung(r.status === 404 ? ADRESSE_WEG : NICHT_GEKLAPPT);
    } catch {
      setMeldung(NICHT_GEKLAPPT);
    }
  }

  const allein = imIframe === false;
  const jetztServer = geraetJetzt + versatz;

  return (
    <div className={`${z.zeichen} ${s.seite}`}>
      <div className={s.buehne}>
        <Bild
          sicht={sicht}
          jetzt={jetztServer}
          beitrittAdresse={beitrittAdresse}
          allein={allein}
          onLobby={() => void geheZu(0)}
        />
        {(meldung || hinweis) && (
          <p className={s.meldung} role="status">
            {meldung ?? hinweis}
          </p>
        )}
        {allein && (
          <div className={s.steuerung}>
            <button type="button" className={s.steuerKnopf} aria-label="Zurück" onClick={() => blaettere(-1)}>
              <Icons8Ikone name="arrow-left" className={s.steuerZeichen} />
            </button>
            <button type="button" className={s.steuerKnopf} aria-label="Weiter" onClick={() => blaettere(1)}>
              <Icons8Ikone name="arrow-right" className={s.steuerZeichen} />
            </button>
          </div>
        )}
        {imIframe !== null && phase.art === "schluss" && !sicht.beendet && (
          <button type="button" className={s.beenden} onClick={(e) => void beende(e)} aria-live="polite">
            {bestaetigen ? "Wirklich beenden?" : "Quiz beenden"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Die Bilder ─────────────────────────────────────────────────────────────

function Kopf({ links, rechts }: { links: string; rechts?: ReactNode }) {
  return (
    <header className={s.kopf}>
      <span className={s.wortzeichen}>IDA</span>
      <span className={s.kopfLinks}>{links}</span>
      {rechts !== undefined && <span className={s.rechts}>{rechts}</span>}
    </header>
  );
}

function Bild({
  sicht,
  jetzt,
  beitrittAdresse,
  allein,
  onLobby,
}: {
  sicht: BeamerSicht;
  jetzt: number;
  beitrittAdresse: string;
  allein: boolean;
  onLobby: () => void;
}) {
  const { phase } = sicht;
  const modus = sicht.modus === "wettbewerb" ? "Wettbewerb" : "Lagebild";

  if (phase.art === "vorStart") {
    return (
      <div className={s.innen}>
        <Kopf links="Dienstabend" />
        <div className={s.vorstart}>
          <h1 className={s.vorstartTitel} data-stufe={laengenStufe("titel", sicht.titel)}>
            {sicht.titel}
          </h1>
          <p className={s.vorstartText}>
            {modus}, {fragen(sicht.fragenAnzahl)}.{allein && " Mit der Lobby bekommt das Quiz seinen Code."}
          </p>
          {allein && (
            <button type="button" className={s.lobbyKnopf} onClick={onLobby}>
              Lobby öffnen
            </button>
          )}
        </div>
      </div>
    );
  }

  if (sicht.beendet && phase.art !== "schluss") {
    return (
      <div className={s.innen}>
        <Kopf links="Dienstabend" rechts={sicht.titel} />
        <div className={s.vorstart}>
          <h1 className={s.vorstartTitel}>Das Quiz ist beendet.</h1>
          <p className={s.vorstartText}>Der nächste Schritt startet eine neue Runde mit neuem Code.</p>
        </div>
      </div>
    );
  }

  if (phase.art === "lobby") return <Lobby sicht={sicht} beitrittAdresse={beitrittAdresse} />;

  if (phase.art === "frage" && sicht.frage) {
    return <Frage sicht={sicht} frage={sicht.frage} phase={phase} jetzt={jetzt} beitrittAdresse={beitrittAdresse} />;
  }

  if (phase.art === "aufloesung" && sicht.frage) return <Aufloesung frage={sicht.frage} />;

  if (phase.art === "rangliste") {
    const liste = (sicht.rangliste ?? []).slice(0, RANGLISTE_PLAETZE);
    return (
      <div className={s.innen}>
        <Kopf links={`Nach Frage ${phase.nachIndex + 1} von ${sicht.fragenAnzahl}`} rechts={`${sicht.teilnehmende} dabei`} />
        <h1 className={s.grossTitel}>Zwischenstand</h1>
        {liste.length === 0 ? (
          <p className={s.leer}>Noch niemand in der Rangliste.</p>
        ) : (
          <ol className={s.rang}>
            {liste.map((r, i) => (
              <li key={r.spitzname}>
                <span className={s.platz}>{i + 1}</span>
                <span className={s.rangName}>{r.spitzname}</span>
                <Bewegung wert={r.bewegung} />
                <span className={s.rangPunkte}>{quizZahl(r.punkte)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  if (phase.art === "schluss") {
    return sicht.modus === "wettbewerb" ? <Podest sicht={sicht} /> : <Lagebild sicht={sicht} />;
  }

  // Eine Phase ohne passende Daten (sollte die Sicht nie liefern): wenigstens der Titel.
  return (
    <div className={s.innen}>
      <Kopf links="Dienstabend" rechts={sicht.titel} />
    </div>
  );
}

function Lobby({ sicht, beitrittAdresse }: { sicht: BeamerSicht; beitrittAdresse: string }) {
  const code = sicht.beitrittCode ?? "";
  return (
    <div className={s.innen}>
      <Kopf links="Dienstabend" rechts={sicht.titel} />
      <div className={s.lobby}>
        <div className={s.qr}>
          {/* Relativ zur Seite: `/beamer/<secret>` → `/q/<code>/qr.svg`, auch ohne Host-Rewrite.
              Ein neuer Code (neue Runde) wechselt nur das `src`. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- ein SVG vom eigenen Weg, nichts zu optimieren */}
          {code && <img src={`../q/${encodeURIComponent(code)}/qr.svg`} alt={`QR-Code für ${beitrittAdresse}/${code}`} />}
        </div>
        <div>
          <h1 className={s.lobbyTitel}>Mach mit</h1>
          <p className={s.lobbyHinweis}>
            QR scannen oder Code auf <b>{beitrittAdresse}</b> eingeben
          </p>
          <div className={s.code} aria-label={`Code ${code.split("").join(" ")}`} role="img">
            {code.split("").map((c, i) => (
              <span key={i} data-code-zeichen aria-hidden>
                {c}
              </span>
            ))}
          </div>
          <div className={s.dabei}>
            <span className={s.puls} aria-hidden />
            <span className={s.dabeiZahl}>{sicht.teilnehmende}</span>
            <span>dabei</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const TYP_HINWEIS: Record<NonNullable<BeamerSicht["frage"]>["typ"], string> = {
  einfach: "Eine Antwort ist richtig",
  mehrfach: "Mehrere Antworten können richtig sein",
  wahrfalsch: "Wahr oder falsch",
};

function Frage({
  sicht,
  frage,
  phase,
  jetzt,
  beitrittAdresse,
}: {
  sicht: BeamerSicht;
  frage: NonNullable<BeamerSicht["frage"]>;
  phase: Extract<BeamerSicht["phase"], { art: "frage" }>;
  jetzt: number;
  beitrittAdresse: string;
}) {
  const restMs = phase.endetUm === null ? null : Math.max(0, phase.endetUm - jetzt);
  const offen = phase.offen && (restMs === null || restMs > 0);
  const gesamtMs = (frage.zeitS ?? 0) * 1000;
  const sekunden = restMs === null ? 0 : Math.ceil(restMs / 1000);
  const viele = frage.optionen.length > 4;
  return (
    <div className={`${s.innen} ${offen ? "" : s.zu}`}>
      <Kopf
        links={`Frage ${frage.index + 1} von ${frage.anzahl}`}
        rechts={
          sicht.beitrittCode ? (
            <>
              {sicht.beitrittCode} <small>auf {beitrittAdresse}</small>
            </>
          ) : undefined
        }
      />
      <div className={s.frageKopf}>
        <h1 className={s.frageText} data-stufe={laengenStufe("frage", frage.text)}>
          {frage.text}
        </h1>
        {phase.endetUm !== null && (
          <div
            className={`${s.ring} ${offen ? "" : s.ringAus}`}
            role="timer"
            aria-label={offen ? `noch ${sekunden} Sekunden` : "Zeit ist um"}
            suppressHydrationWarning
          >
            <svg viewBox="0 0 100 100" aria-hidden>
              <circle className={s.spur} cx="50" cy="50" r="44" fill="none" strokeWidth="9" />
              {offen && (
                <circle
                  className={s.rest}
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  strokeWidth="9"
                  strokeDasharray={RING_UMFANG}
                  strokeDashoffset={gesamtMs > 0 ? RING_UMFANG * (1 - Math.min(1, (restMs ?? 0) / gesamtMs)) : 0}
                />
              )}
            </svg>
            <b suppressHydrationWarning>
              {offen ? (
                sekunden
              ) : (
                <>
                  Zeit
                  <br />
                  um
                </>
              )}
            </b>
          </div>
        )}
      </div>
      <div
        className={`${s.kacheln} ${viele ? s.kachelnViele : ""}`}
        data-kacheln
        data-stufe={laengenStufe("kachel", ...frage.optionen)}
      >
        {frage.optionen.map((text, i) => (
          <div key={i} className={`${s.kachel} ${quizFarbe(i)}`} data-option={i}>
            <QuizForm i={i} className={s.form} />
            <span className={s.kachelText}>{text}</span>
          </div>
        ))}
      </div>
      <div className={s.fuss}>
        {offen ? (
          <>
            <span>
              <b>{frage.antworten}</b> Antworten von {sicht.teilnehmende}
            </span>
            <span>{TYP_HINWEIS[frage.typ]}</span>
          </>
        ) : (
          <>
            <span className={s.zuSchild}>
              <Icons8Ikone name="lock" className={s.zuZeichen} />
              Abstimmung geschlossen
            </span>
            <span>
              <b>{frage.antworten}</b> {frage.antworten === 1 ? "Antwort" : "Antworten"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Aufloesung({ frage }: { frage: NonNullable<BeamerSicht["frage"]> }) {
  const verteilung = frage.verteilung ?? frage.optionen.map(() => 0);
  const richtig = new Set(frage.richtig ?? []);
  const anteil = frage.anteilRichtig ?? 0;
  const richtige = Math.round(anteil * frage.antworten);
  return (
    <div className={s.innen}>
      <Kopf links={`Frage ${frage.index + 1} von ${frage.anzahl}`} rechts="Auflösung" />
      <div className={s.aufl}>
        <div className={s.auflLinks}>
          <h1 className={s.auflFrage} data-stufe={laengenStufe("aufloesung", frage.text)}>
            {frage.text}
          </h1>
          <div
            className={`${s.balken} ${frage.optionen.length > 4 ? s.balkenViele : ""}`}
            data-balken
            data-stufe={laengenStufe("option", ...frage.optionen)}
          >
            {frage.optionen.map((text, i) => {
              const ist = richtig.has(i);
              const breite = frage.antworten === 0 ? 0 : (verteilung[i] ?? 0) / frage.antworten;
              return (
                <div
                  key={i}
                  className={`${s.balkenZeile} ${quizFarbe(i)} ${ist ? s.richtig : ""}`}
                  data-option={i}
                  data-richtig={ist ? "" : undefined}
                >
                  <QuizForm i={i} className={s.form} />
                  <span className={s.opt}>
                    {ist && (
                      <span className={s.haken} aria-label="richtig" role="img">
                        <Icons8Ikone name="checkmark" kraeftig className={s.hakenZeichen} />
                      </span>
                    )}
                    <span className={s.optText}>{text}</span>
                  </span>
                  <span className={s.anz}>{verteilung[i] ?? 0}</span>
                  <div className={s.balkenSpur}>
                    <i style={{ width: `${Math.round(breite * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className={s.seiteRechts}>
          <div className={s.gross}>
            {prozent(anteil)}
            <small>%</small>
          </div>
          <div className={s.unter}>
            {frage.antworten === 0 ? "keine Antworten" : `richtig, ${richtige} von ${frage.antworten}`}
          </div>
          {frage.erklaerung && (
            <p className={s.erkl} data-erklaerung data-stufe={laengenStufe("erklaerung", frage.erklaerung)}>
              <strong>Warum</strong>
              {frage.erklaerung}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Bewegung({ wert }: { wert: number | "neu" | undefined }) {
  if (wert === undefined) return <span className={s.zug} />;
  if (wert === "neu") {
    return (
      <span className={s.zug} data-bewegung role="img" aria-label="neu">
        <span aria-hidden>neu</span>
      </span>
    );
  }
  const n = Math.abs(wert);
  const plaetze = n === 1 ? "1 Platz" : `${n} Plätze`;
  const [name, label] =
    wert > 0
      ? (["arrow-up", `${plaetze} hoch`] as const)
      : wert < 0
        ? (["arrow-down", `${plaetze} runter`] as const)
        : (["minus", "gleich"] as const);
  return (
    <span className={s.zug} data-bewegung role="img" aria-label={label}>
      <Icons8Ikone name={name} kraeftig className={s.zugZeichen} />
      {wert !== 0 && <span aria-hidden>{n}</span>}
    </span>
  );
}

function Podest({ sicht }: { sicht: BeamerSicht }) {
  const liste = sicht.rangliste ?? [];
  const stufen = [1, 0, 2].filter((i) => i < liste.length);
  const klasse = [s.s1, s.s2, s.s3];
  return (
    <div className={s.innen}>
      <Kopf links={sicht.titel} rechts={`${fragen(sicht.fragenAnzahl)}, ${sicht.teilnehmende} dabei`} />
      {liste.length === 0 ? (
        <p className={s.leer}>Niemand hat Punkte.</p>
      ) : (
        <>
          <div className={s.podestBuehne}>
            {stufen.map((i) => (
              <div key={i} className={`${s.stufe} ${klasse[i]}`} data-podest={i + 1}>
                <div className={s.stufeName} data-stufe={laengenStufe("name", liste[i].spitzname)}>
                  {liste[i].spitzname}
                </div>
                <div className={s.stufePunkte}>{quizZahl(liste[i].punkte)} Punkte</div>
                <div className={s.sockel}>{i + 1}</div>
              </div>
            ))}
          </div>
          <div className={s.boden} />
          <div className={s.danach}>
            {liste.slice(3, 5).map((r, i) => (
              <span key={r.spitzname}>
                <b>{i + 4}</b> {r.spitzname}, {quizZahl(r.punkte)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Lagebild({ sicht }: { sicht: BeamerSicht }) {
  const g = sicht.gesamt;
  return (
    <div className={s.innen}>
      <Kopf links={sicht.titel} rechts="Lagebild, anonym" />
      <h1 className={s.lageTitel}>So steht die Gruppe</h1>
      <p className={s.lageUnter}>
        {fragen(sicht.fragenAnzahl)}, {g?.antworten ?? 0} {g?.antworten === 1 ? "Antwort" : "Antworten"}
      </p>
      <div className={s.lage}>
        <div className={s.kennzahl}>
          <div className={s.gross}>{g?.teilnehmende ?? sicht.teilnehmende}</div>
          <div className={s.unter}>haben mitgemacht</div>
        </div>
        <div className={s.kennzahl}>
          <div className={s.gross}>
            {prozent(g?.anteilRichtig ?? 0)}
            <small>%</small>
          </div>
          <div className={s.unter}>der Antworten richtig</div>
        </div>
        {g?.schwersteFrage && (
          <div className={`${s.kennzahl} ${s.schwer}`}>
            <div className={`${s.unter} ${s.unterOben}`}>Schwerste Frage</div>
            <p className={s.frageZit} data-stufe={laengenStufe("aufloesung", g.schwersteFrage.text)}>
              Frage {g.schwersteFrage.index + 1}: {g.schwersteFrage.text}
            </p>
            <p className={s.meta}>
              <b>{prozent(g.schwersteFrage.anteilRichtig)} %</b> richtig
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
