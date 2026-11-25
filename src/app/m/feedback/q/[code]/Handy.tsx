"use client";

// DIE HANDY-ANSICHT DES LIVE-QUIZ (docs/design/feedback-live-quiz.md, Mockup
// docs/design/mockups/live-quiz.html). Der Stand kommt als ganze `HandySicht` aus dem Strom
// (`strom`), Beitritt und Antwort gehen als POST an die Wege daneben. Nur Typen aus `_lib`
// (Falle 6 gilt in die andere Richtung: dieses Modul exportiert nichts an Server Components
// außer der Komponente selbst).
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import s from "./handy.module.css";

/** Pause, bevor ein ganz geschlossener Strom (Server weg, 503) neu verbunden wird. */
const NEU_VERBINDEN_MS = 3000;
/** Takt der Restzeit. Eine Viertelsekunde, damit die volle Sekunde nicht sichtbar springt. */
const TAKT_MS = 250;

/** Farbe und Form je Position, wie am Beamer. Optionen 5 und 6 wiederholen 1 und 2. */
const FARBEN = [s.a, s.b, s.c, s.d];
const FORMEN: { name: string; svg: ReactNode }[] = [
  { name: "dreieck", svg: <path d="M50 8 96 90H4z" /> },
  { name: "kreis", svg: <circle cx="50" cy="50" r="44" /> },
  { name: "quadrat", svg: <rect x="10" y="10" width="80" height="80" rx="4" /> },
  { name: "raute", svg: <path d="M50 2 98 50 50 98 2 50z" /> },
];
const farbe = (i: number) => FARBEN[i % 4];

function Form({ i }: { i: number }) {
  const f = FORMEN[i % 4];
  return (
    <span className={s.form} data-form={f.name} aria-hidden>
      <svg viewBox="0 0 100 100">{f.svg}</svg>
    </span>
  );
}

/** „2 455“: Tausender mit schmalem Leerzeichen, wie im Mockup. */
function zahl(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Der Weg neben der Seite (`/q/ABC234` → `/q/ABC234/strom`), auch hinter dem Host-Rewrite. */
function weg(teil: "strom" | "beitritt" | "antwort"): string {
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

/** Was das Handy zu einer Frage schon weiß, bevor der Strom es bestätigt. */
type Lokal = { frageIndex: number; da: true; gewaehlt?: number[] } | { frageIndex: number; zu: true };

const NICHT_GEKLAPPT = "Das hat nicht geklappt. Tipp noch einmal.";
const BEITRITT_FEHLER: Record<string, string> = {
  spitzname_vergeben: "Den Spitznamen hat schon jemand. Nimm einen anderen.",
  spitzname_fehlt: "Der Spitzname braucht mindestens 2 Zeichen.",
  voll: "Das Quiz ist voll. Schau am Beamer mit.",
  zu_viele: "Gerade wollen viele gleichzeitig hinein. Tipp gleich noch einmal.",
};

export function Handy({ anfang }: { anfang: HandySicht | null }) {
  const [sicht, setSicht] = useState<HandySicht | null>(anfang);
  const [beendet, setBeendet] = useState(anfang === null || anfang.beendet);
  // Versatz Serveruhr − Geräteuhr. Im Server-HTML ~0, beim Hydrieren gegen die Geräteuhr.
  const [versatz, setVersatz] = useState(() => (anfang ? anfang.jetzt - Date.now() : 0));
  const [geraetJetzt, setGeraetJetzt] = useState(() => Date.now());
  const [verbindung, setVerbindung] = useState(0);
  const [lokal, setLokal] = useState<Lokal | null>(null);
  const [auswahl, setAuswahl] = useState<{ frageIndex: number; werte: number[] } | null>(null);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [beigetreten, setBeigetreten] = useState(false);
  const [spitzname, setSpitzname] = useState("");
  const aktiv = useRef(true);

  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
    };
  }, []);

  // DER STROM. Die Teilnahme liest der Server nur beim Verbinden aus dem Cookie: nach dem
  // Beitritt zählt `verbindung` hoch und der Strom verbindet neu. Ein kurzer Netzverlust
  // heilt `EventSource` selbst (CONNECTING); der Server schickt beim Verbinden den vollen Stand.
  useEffect(() => {
    if (beendet) return;
    const quelle = new EventSource(weg("strom"));
    let wecker: ReturnType<typeof setTimeout> | undefined;
    quelle.onmessage = (e: MessageEvent<string>) => {
      let neu: HandySicht;
      try {
        neu = JSON.parse(e.data) as HandySicht;
      } catch {
        return;
      }
      setVersatz(neu.jetzt - Date.now());
      setGeraetJetzt(Date.now());
      setSicht(neu);
      setBeigetreten(false);
      if (neu.beendet) setBeendet(true);
    };
    quelle.addEventListener("ende", () => {
      quelle.close();
      setBeendet(true);
    });
    quelle.onerror = () => {
      // 2 = CLOSED: der Server hat abgelehnt (404 beendet, 503 voll) oder ist weg. Sonst
      // verbindet die EventSource selbst neu.
      if (quelle.readyState !== 2) return;
      wecker = setTimeout(async () => {
        try {
          const r = await fetch(weg("strom"), { headers: { accept: "text/event-stream" }, cache: "no-store" });
          void r.body?.cancel().catch(() => {});
          if (r.status === 404) {
            if (aktiv.current) setBeendet(true);
            return;
          }
        } catch {
          // offline: einfach neu versuchen
        }
        if (aktiv.current) setVerbindung((v) => v + 1);
      }, NEU_VERBINDEN_MS);
    };
    return () => {
      clearTimeout(wecker);
      quelle.close();
    };
  }, [verbindung, beendet]);

  const phase = sicht?.phase;
  const laeuft = phase?.art === "frage" && phase.offen && phase.endetUm !== null;
  useEffect(() => {
    if (!laeuft) return;
    const t = setInterval(() => setGeraetJetzt(Date.now()), TAKT_MS);
    return () => clearInterval(t);
  }, [laeuft]);

  const antworte = useCallback(async (frageIndex: number, gewaehlt: number[]) => {
    setSendet(true);
    setMeldung(null);
    try {
      const r = await fetch(weg("antwort"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frageIndex, gewaehlt }),
      });
      if (r.ok) return setLokal({ frageIndex, da: true, gewaehlt });
      const code = await fehlercode(r);
      if (r.status === 409 && code === "doppelt") return setLokal({ frageIndex, da: true });
      if (r.status === 409) return setLokal({ frageIndex, zu: true });
      if (r.status === 404) return setBeendet(true);
      // Cookie weg oder fremd: neu verbinden, die Sicht sagt dann „nicht dabei“.
      if (r.status === 401) return setVerbindung((v) => v + 1);
      setMeldung(NICHT_GEKLAPPT);
    } catch {
      setMeldung(NICHT_GEKLAPPT);
    } finally {
      setSendet(false);
    }
  }, []);

  async function trittBei(e: FormEvent) {
    e.preventDefault();
    if (!sicht || sendet) return;
    setSendet(true);
    setMeldung(null);
    try {
      const r = await fetch(weg("beitritt"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sicht.modus === "wettbewerb" ? { spitzname } : {}),
      });
      if (r.ok) {
        setBeigetreten(true);
        setVerbindung((v) => v + 1);
        return;
      }
      if (r.status === 404) return setBeendet(true);
      const code = await fehlercode(r);
      setMeldung((code && BEITRITT_FEHLER[code]) ?? NICHT_GEKLAPPT);
    } catch {
      setMeldung(NICHT_GEKLAPPT);
    } finally {
      setSendet(false);
    }
  }

  // ── Was zu zeigen ist ─────────────────────────────────────────────────────
  if (beendet || !sicht || sicht.phase.art === "schluss" || sicht.phase.art === "vorStart") {
    return <Ende sicht={sicht} />;
  }
  const dabei = sicht.dabei || beigetreten;
  const fragePos = sicht.frage ? `Frage ${sicht.frage.index + 1} von ${sicht.fragenAnzahl}` : sicht.titel;
  const eigenerName = sicht.spitzname ? <span className={s.rechts}>{sicht.spitzname}</span> : null;

  if (!dabei) {
    return (
      <Rahmen kopf="Dienstabend">
        <form className={s.formular} onSubmit={trittBei}>
          <span className={s.modus}>{sicht.modus === "wettbewerb" ? "Wettbewerb" : "Lagebild"}</span>
          <h1 className={s.titel}>{sicht.titel}</h1>
          <p className={s.leise}>
            {sicht.fragenAnzahl === 1 ? "1 Frage" : `${sicht.fragenAnzahl} Fragen`}.{" "}
            {sicht.modus === "wettbewerb"
              ? "Für jede richtige Antwort gibt es Punkte, schnelle Antworten bringen mehr."
              : "Am Beamer siehst du, wie die Gruppe geantwortet hat."}
          </p>
          {sicht.modus === "wettbewerb" ? (
            <>
              <label className={s.feldLabel} htmlFor="quiz-spitzname">
                Dein Spitzname
              </label>
              <input
                className={s.feld}
                id="quiz-spitzname"
                name="spitzname"
                value={spitzname}
                onChange={(e) => setSpitzname(e.target.value)}
                maxLength={20}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="go"
                required
              />
              <p className={`${s.leise} ${s.feldHinweis}`}>Steht am Beamer in der Rangliste.</p>
            </>
          ) : (
            <div className={s.zusage}>
              <Icons8Ikone name="lock" groesse={24} />
              Anonym — kein Name, keine Uhrzeit.
            </div>
          )}
          {meldung && (
            <p className={s.meldung} role="status">
              {meldung}
            </p>
          )}
          <button className={`${s.knopf} ${s.unten}`} type="submit" disabled={sendet}>
            Mitmachen
          </button>
        </form>
      </Rahmen>
    );
  }

  if (sicht.phase.art === "lobby" || sicht.phase.art === "rangliste") {
    const zwischen = sicht.phase.art === "rangliste";
    return (
      <Rahmen kopf={sicht.titel} rechts={eigenerName} zentral>
        <Siegel voll>
          <Icons8Ikone name="checkmark" groesse={44} kraeftig />
        </Siegel>
        <h1 className={s.titel}>Du bist dabei.</h1>
        <p className={s.leise}>
          {zwischen
            ? "Die nächste Frage erscheint hier, sobald sie am Beamer steht."
            : "Die Frage erscheint hier, sobald sie am Beamer steht. Lass die Seite offen."}
        </p>
        {zwischen && <Werte sicht={sicht} />}
        <div className={s.wartePunkte} aria-hidden>
          <i />
          <i />
          <i />
        </div>
      </Rahmen>
    );
  }

  const frage = sicht.frage;
  if (!frage) return <Ende sicht={sicht} />;
  const meinLokal = lokal?.frageIndex === frage.index ? lokal : null;
  const eigene = sicht.eigeneAntwort ?? (meinLokal && "da" in meinLokal ? meinLokal.gewaehlt : undefined);
  const da = sicht.eigeneAntwort !== undefined || (meinLokal !== null && "da" in meinLokal);

  if (sicht.phase.art === "aufloesung") {
    return <Ergebnis sicht={sicht} fragePos={fragePos} rechts={eigenerName} eigene={eigene} />;
  }

  // Phase `frage`.
  const { offen, endetUm } = sicht.phase;
  const restMs = endetUm === null ? null : endetUm - (geraetJetzt + versatz);
  const zu = !offen || (restMs !== null && restMs <= 0) || (meinLokal !== null && "zu" in meinLokal);
  const restzeit =
    !zu && restMs !== null ? (
      <span className={s.rechts} suppressHydrationWarning>
        noch {Math.ceil(restMs / 1000)} s
      </span>
    ) : null;

  if (da) {
    return (
      <Rahmen kopf={fragePos} rechts={restzeit} zentral>
        <Siegel voll>
          <Icons8Ikone name="checkmark" groesse={44} kraeftig />
        </Siegel>
        <h1 className={s.titel}>Antwort ist da.</h1>
        {eigene && <Gewaehlt optionen={frage.optionen} indizes={eigene} />}
        <p className={s.leise}>Ob sie stimmt, siehst du nach der Auflösung am Beamer.</p>
      </Rahmen>
    );
  }

  if (zu) {
    return (
      <Rahmen kopf={fragePos} zentral>
        <Siegel>
          <Icons8Ikone name="clock" groesse={44} />
        </Siegel>
        <h1 className={s.titel}>Zeit ist um.</h1>
        <p className={s.leise}>Für diese Frage hast du keine Antwort abgegeben. Die nächste kommt gleich.</p>
      </Rahmen>
    );
  }

  const mehrfach = frage.typ === "mehrfach";
  const gewaehlt = auswahl?.frageIndex === frage.index ? auswahl.werte : [];
  const umschalten = (i: number) =>
    setAuswahl({
      frageIndex: frage.index,
      werte: gewaehlt.includes(i) ? gewaehlt.filter((x) => x !== i) : [...gewaehlt, i].sort((a, b) => a - b),
    });

  return (
    <Rahmen kopf={fragePos} rechts={restzeit}>
      <h1 className={s.frage}>{frage.text}</h1>
      <p className={s.frageMeta}>
        <span>{mehrfach ? "Mehrere richtig, wähle alle" : "Tipp eine Antwort an"}</span>
        {mehrfach && <span>{gewaehlt.length} gewählt</span>}
      </p>
      <div className={`${s.liste} ${mehrfach ? s.kompakt : frage.optionen.length <= 2 ? s.zwei : ""}`}>
        {frage.optionen.map((text, i) => (
          <button
            key={i}
            type="button"
            data-option={i}
            className={`${s.kachel} ${farbe(i)}`}
            aria-pressed={mehrfach ? gewaehlt.includes(i) : undefined}
            disabled={sendet}
            onClick={() => (mehrfach ? umschalten(i) : void antworte(frage.index, [i]))}
          >
            <Form i={i} />
            <span>{text}</span>
            {mehrfach && (
              <span className={s.wahl} aria-hidden>
                <Icons8Ikone name="checkmark" groesse={20} kraeftig />
              </span>
            )}
          </button>
        ))}
      </div>
      {meldung && (
        <p className={s.meldung} role="status">
          {meldung}
        </p>
      )}
      {mehrfach && (
        <button
          className={`${s.knopf} ${s.unten}`}
          type="button"
          disabled={sendet || gewaehlt.length === 0}
          onClick={() => void antworte(frage.index, gewaehlt)}
        >
          Absenden
        </button>
      )}
    </Rahmen>
  );
}

// ── Bausteine ──────────────────────────────────────────────────────────────

function Rahmen({
  kopf,
  rechts,
  zentral = false,
  children,
}: {
  kopf: string;
  rechts?: ReactNode;
  zentral?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={s.seite}>
      <div className={s.handy}>
        <header className={s.kopf}>
          <span className={s.wortzeichen}>IDA</span>
          <span className={s.kopfTitel}>{kopf}</span>
          {rechts}
        </header>
        <main className={`${s.inhalt} ${zentral ? s.zentral : ""}`}>{children}</main>
      </div>
    </div>
  );
}

function Siegel({ voll = false, oben = false, children }: { voll?: boolean; oben?: boolean; children: ReactNode }) {
  return (
    <div className={`${s.siegel} ${voll ? s.siegelVoll : ""} ${oben ? s.siegelOben : ""}`} aria-hidden>
      {children}
    </div>
  );
}

function Gewaehlt({ optionen, indizes }: { optionen: string[]; indizes: number[] }) {
  return (
    <div className={s.gewaehltListe}>
      {indizes
        .filter((i) => i in optionen)
        .map((i) => (
          <div key={i} className={`${s.gewaehlt} ${farbe(i)}`}>
            <Form i={i} />
            {optionen[i]}
          </div>
        ))}
    </div>
  );
}

/** Platz und Punkte — nur im Wettbewerb (`handySicht` setzt sie im Lagebild nie). */
function Werte({ sicht, ende = false }: { sicht: HandySicht | null; ende?: boolean }) {
  if (!sicht || sicht.platz === undefined || sicht.punkteGesamt === undefined) return null;
  return (
    <div className={`${s.werte} ${ende ? s.werteEnde : ""}`}>
      <div>
        <b>{sicht.platz}.</b>
        <span>{sicht.teilnehmende === undefined ? "Platz" : `Platz von ${sicht.teilnehmende}`}</span>
      </div>
      <div>
        <b>{zahl(sicht.punkteGesamt)}</b>
        <span>Punkte gesamt</span>
      </div>
    </div>
  );
}

function Ergebnis({
  sicht,
  fragePos,
  rechts,
  eigene,
}: {
  sicht: HandySicht;
  fragePos: string;
  rechts: ReactNode;
  eigene: number[] | undefined;
}) {
  const optionen = sicht.frage?.optionen ?? [];
  const ergebnis = sicht.eigenesErgebnis;
  const wettbewerb = sicht.modus === "wettbewerb";
  const richtig = ergebnis?.richtig === true;
  return (
    <Rahmen kopf={fragePos} rechts={rechts}>
      <Siegel voll={richtig} oben>
        <Icons8Ikone name={richtig ? "checkmark" : ergebnis ? "minus" : "clock"} groesse={44} kraeftig={!!ergebnis} />
      </Siegel>
      <p className={s.ich}>{richtig ? "Richtig." : ergebnis ? "Daneben." : "Keine Antwort."}</p>
      {wettbewerb && (
        <>
          <div className={`${s.punkteGross} ${richtig ? "" : s.punkteNull}`}>
            {richtig ? `+${zahl(ergebnis.punkte)}` : "0"}
          </div>
          <p className={`${s.leise} ${s.ohneAbstand}`}>Punkte für diese Frage</p>
          <Werte sicht={sicht} />
        </>
      )}
      {!wettbewerb && !ergebnis && (
        <p className={s.leise}>Für diese Frage hast du keine Antwort abgegeben.</p>
      )}
      <div className={`${s.unten} ${s.ergebnisUnten}`}>
        {!richtig && sicht.richtig && (
          <>
            <p className={s.richtigWar}>Richtig war</p>
            <Gewaehlt optionen={optionen} indizes={sicht.richtig} />
          </>
        )}
        {eigene && (
          <>
            <p className={s.richtigWar}>Deine Antwort</p>
            <Gewaehlt optionen={optionen} indizes={eigene} />
          </>
        )}
      </div>
    </Rahmen>
  );
}

function Ende({ sicht }: { sicht: HandySicht | null }) {
  return (
    <Rahmen kopf={sicht?.titel ?? "Live-Quiz"} zentral>
      <h1 className={s.titel}>Das Quiz ist beendet.</h1>
      <Werte sicht={sicht} ende />
      <p className={s.leise}>Danke fürs Mitmachen. Du kannst die Seite jetzt schließen.</p>
    </Rahmen>
  );
}
