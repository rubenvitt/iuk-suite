/**
 * Ablauf der Erfassung: Willkommen → Formular → Frist → Versiegelt, dazu „nicht eingerichtet“ und
 * die Startfehlerseite. Welche Seite gilt, leitet `phaseAus` (`logik/ablauf.ts`) aus dem Status von
 * Rust und dem lokalen Zustand ab; entschieden wird mit der Uhr in Rust, die Oberfläche zählt nur
 * lokal herunter und fragt nach (alle 5 s `status`, bei 0 sofort `frist_pruefen`).
 *
 * Der Entwurf gehört dieser Komponente. Änderungen gehen 500 ms verzögert per `entwurfSpeichern`
 * an Rust; bis dahin gilt er als ungespeichert. Das zählt, wenn die Frist während einer Bearbeitung
 * abläuft: Rust meldet `verfallen`, sobald eine gespeicherte Bearbeitung existierte, die Oberfläche
 * ergänzt den Fall, dass die letzte Änderung noch gar nicht gespeichert war.
 *
 * Refs spiegeln Zustand, den asynchrone Schritte lesen (Polling, Speicher-Timer): Sie würden sonst
 * mit dem Wert aus dem Render arbeiten, in dem sie gestartet wurden.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { Bestaetigung } from "./bausteine/Bestaetigung";
import { Hinweis } from "./bausteine/Hinweis";
import { Kopf } from "./bausteine/Kopf";
import { Testband } from "./bausteine/Testband";
import { befehle } from "./befehle";
import { phaseAus, restSekunden, restText, type Lokal } from "./logik/ablauf";
import { fehlendeAngaben, leererEntwurf } from "./logik/formular";
import { Formular } from "./seiten/Formular";
import { Frist } from "./seiten/Frist";
import { NichtEingerichtet } from "./seiten/NichtEingerichtet";
import { Startfehler } from "./seiten/Startfehler";
import { Versiegelt } from "./seiten/Versiegelt";
import { Willkommen } from "./seiten/Willkommen";
import { useThema } from "./stil/thema";
import type { Entwurf, Stammdatenpaket, Status, Versiegelung } from "./typen";

const START: Lokal = { phase: "start", bearbeiten: false };
const SPEICHER_VERZOEGERUNG_MS = 500;
const TAKT_MS = 250;
const ABFRAGE_MS = 5000;
const FRIST_NACHFRAGE_MS = 1000;

/** Tauri liefert Fehler als Zeichenkette (`Result<_, String>` in `befehle.rs`), alles andere wird lesbar gemacht. */
function fehlerText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function App() {
  const thema = useThema();
  const [status, setStatus] = useState<Status | null>(null);
  const [paket, setPaket] = useState<Stammdatenpaket | null>(null);
  const [lokal, setLokal] = useState<Lokal>(START);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [verfallenLokal, setVerfallenLokal] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState(false);
  /** `jetzt`: lokale Uhr beim letzten Takt; `versatz`: Uhr in Rust minus lokale Uhr, beim letzten Status gemessen. */
  const [uhr, setUhr] = useState({ jetzt: 0, versatz: 0 });

  const lokalRef = useRef<Lokal>(START);
  const entwurfRef = useRef<Entwurf | null>(null);
  /** Der Entwurf stammt unverändert aus `leererEntwurf`: Beim Öffnen bekommt er dann einen frischen Beginn. */
  const frischRef = useRef(false);
  const ungespeichertRef = useRef(false);
  const aenderungenRef = useRef(0);
  const speicherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speichertRef = useRef<Promise<void> | null>(null);
  const laeuftRef = useRef(false);

  const zeitzone = status?.zeitzone ?? paket?.zeitzone ?? null;

  function setzeLokal(l: Lokal) {
    lokalRef.current = l;
    setLokal(l);
  }

  function setzeEntwurf(e: Entwurf | null, frisch = false) {
    entwurfRef.current = e;
    frischRef.current = frisch;
    setEntwurf(e);
  }

  function stoppeSpeicherTimer() {
    if (speicherTimerRef.current !== null) clearTimeout(speicherTimerRef.current);
    speicherTimerRef.current = null;
  }

  /** Kein Speichern mehr anstoßen und ein laufendes abwarten, bevor ein Schritt den Entwurf in Rust ersetzt. */
  async function stoppeSpeichern() {
    stoppeSpeicherTimer();
    const laufend = speichertRef.current;
    if (laufend) await laufend;
  }

  async function speichere() {
    speicherTimerRef.current = null;
    const e = entwurfRef.current;
    if (!e) return;
    const stand = aenderungenRef.current;
    const laufend = befehle.entwurfSpeichern(e, lokalRef.current.bearbeiten).then(
      () => {
        if (aenderungenRef.current === stand) ungespeichertRef.current = false;
      },
      (err: unknown) => setFehler(fehlerText(err)),
    );
    speichertRef.current = laufend;
    await laufend;
    if (speichertRef.current === laufend) speichertRef.current = null;
  }

  function aendere(e: Entwurf) {
    setzeEntwurf(e);
    ungespeichertRef.current = true;
    aenderungenRef.current += 1;
    stoppeSpeicherTimer();
    speicherTimerRef.current = setTimeout(() => void speichere(), SPEICHER_VERZOEGERUNG_MS);
  }

  /**
   * Übernimmt einen Status. Beim Wechsel nach „versiegelt“ wird festgehalten, ob gerade eine
   * Bearbeitung mit ungespeicherter Änderung lief, und der Speicher-Timer gestoppt: Ein Speichern
   * nach dem Versiegeln brächte den versiegelten Klartext als nächsten Entwurf zurück.
   */
  function uebernehme(s: Status, ersterStart = false) {
    const jetzt = Date.now();
    setStatus(s);
    setUhr({ jetzt, versatz: s.jetztMs - jetzt });
    const vorher = lokalRef.current;
    // Neustart mitten in einer Bearbeitung: Rust hält Ausstehendes und Entwurf, also dort weiter.
    const neustartInBearbeitung = ersterStart && s.eingerichtet && !s.startfehler && !s.versiegelung && s.ausstehend && s.entwurf;
    const neu: Lokal = neustartInBearbeitung ? { phase: "form", bearbeiten: true } : phaseAus(s, vorher);
    if (neu.phase === "versiegelt" && vorher.phase !== "versiegelt") {
      stoppeSpeicherTimer();
      setVerfallenLokal(vorher.bearbeiten && ungespeichertRef.current);
      ungespeichertRef.current = false;
    }
    setzeLokal(neu);
  }

  async function laden(): Promise<Status> {
    const s = await befehle.status();
    uebernehme(s);
    return s;
  }

  /** Ein Bedienschritt zur Zeit; sein Fehler landet im Hinweis über dem Inhalt. */
  async function fuehreAus(schritt: () => Promise<void>) {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    try {
      await schritt();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      laeuftRef.current = false;
    }
  }

  /** Erster Status nach dem Start, dann einmal die Stammdaten und der Entwurf. */
  const gestartet = useEffectEvent(async (s: Status, istAktiv: () => boolean) => {
    uebernehme(s, true);
    if (s.startfehler || !s.eingerichtet) return;
    const p = await befehle.stammdaten();
    if (!istAktiv()) return;
    setPaket(p);
    if (!s.ausstehend) setzeEntwurf(s.entwurf ?? leererEntwurf(new Date(), s.zeitzone ?? p.zeitzone), !s.entwurf);
    else if (s.entwurf) setzeEntwurf(s.entwurf);
  });

  useEffect(() => {
    let aktiv = true;
    const istAktiv = () => aktiv;
    befehle
      .status()
      .then((s) => (aktiv ? gestartet(s, istAktiv) : undefined))
      .catch((e: unknown) => {
        if (aktiv) setFehler(fehlerText(e));
      });
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    const timer = speicherTimerRef;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  // Frist: lokaler Takt für Restzeit und Balken, Status alle 5 s. Auch während einer Bearbeitung,
  // denn die Frist läuft weiter und der Hinweis im Formular zeigt die Restzeit.
  const ausstehend = status?.ausstehend ?? null;
  const fristLaeuft = ausstehend !== null && !status?.versiegelung && (lokal.phase === "frist" || (lokal.phase === "form" && lokal.bearbeiten));
  const rest = ausstehend ? restSekunden(ausstehend.fristBisMs, uhr.jetzt + uhr.versatz) : 0;
  const abgelaufen = fristLaeuft && rest === 0;

  const frage = useEffectEvent(async () => {
    if (laeuftRef.current) return;
    try {
      await laden();
    } catch (e) {
      setFehler(fehlerText(e));
    }
  });

  useEffect(() => {
    if (!fristLaeuft) return;
    const takt = setInterval(() => setUhr((u) => ({ ...u, jetzt: Date.now() })), TAKT_MS);
    const abfrage = setInterval(() => void frage(), ABFRAGE_MS);
    return () => {
      clearInterval(takt);
      clearInterval(abfrage);
    };
  }, [fristLaeuft]);

  const geprueft = useEffectEvent(async (v: Versiegelung | null) => {
    if (v) await laden();
  });

  // Lokal abgelaufen: sofort nachfragen, und jede Sekunde wieder, solange Rust (eigene Uhr) noch
  // nichts versiegelt hat.
  useEffect(() => {
    if (!abgelaufen) return;
    const pruefe = () => {
      if (laeuftRef.current) return;
      befehle
        .fristPruefen()
        .then((v) => geprueft(v))
        .catch((e: unknown) => setFehler(fehlerText(e)));
    };
    pruefe();
    const wieder = setInterval(pruefe, FRIST_NACHFRAGE_MS);
    return () => clearInterval(wieder);
  }, [abgelaufen]);

  function oeffnen() {
    if ((frischRef.current || !entwurfRef.current) && zeitzone) setzeEntwurf(leererEntwurf(new Date(), zeitzone), true);
    setzeLokal({ phase: "form", bearbeiten: false });
  }

  const taste = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    // Ein anderer Knopf (etwa „Testbetrieb beenden“) behält seine eigene Taste.
    if (ev.target instanceof Element && ev.target.closest("button, input, textarea, select, a, [role='dialog']")) return;
    ev.preventDefault();
    oeffnen();
  });

  const startTasten = status !== null && lokal.phase === "start" && !bestaetigen;
  useEffect(() => {
    if (!startTasten) return;
    const hoere = (ev: KeyboardEvent) => taste(ev);
    window.addEventListener("keydown", hoere);
    return () => window.removeEventListener("keydown", hoere);
  }, [startTasten]);

  /** „Änderungen verwerfen“ und „Zurück zur Frist“: Bearbeitung in Rust löschen, zurück zur Frist. */
  const zurFrist = () =>
    fuehreAus(async () => {
      await stoppeSpeichern();
      await befehle.entwurfVerwerfen();
      ungespeichertRef.current = false;
      setzeLokal({ phase: "frist", bearbeiten: false });
      await laden();
    });

  const zurueck = () => {
    if (lokalRef.current.bearbeiten) void zurFrist();
    else setzeLokal(START);
  };

  const absenden = () =>
    fuehreAus(async () => {
      const e = entwurfRef.current;
      if (!e || fehlendeAngaben(e).length > 0) return;
      await stoppeSpeichern();
      if (lokalRef.current.bearbeiten) {
        // Die Frist kann inzwischen abgelaufen sein. Ein Absenden danach legte die Bearbeitung
        // als neuen Einsatz mit neuer Frist an, statt sie zu verwerfen.
        const s = await befehle.status();
        if (!s.ausstehend || s.versiegelung) {
          uebernehme(s);
          return;
        }
      }
      await befehle.absenden(e, lokalRef.current.bearbeiten);
      ungespeichertRef.current = false;
      setzeLokal({ phase: "frist", bearbeiten: false });
      await laden();
      window.scrollTo({ top: 0 });
    });

  const aendern = () => {
    if (!ausstehend) return;
    setzeEntwurf(ausstehend.entwurf);
    ungespeichertRef.current = false;
    setzeLokal({ phase: "form", bearbeiten: true });
  };

  const versiegeln = () =>
    fuehreAus(async () => {
      await befehle.jetztVersiegeln();
      await laden();
    });

  /**
   * „Neuen Einsatz erfassen“: erst quittieren, dann den Status lesen. Sonst meldeten `status` und
   * `frist_pruefen` dieselbe Versiegelung erneut. Hat ein Speichern die Versiegelung überholt, liegt
   * danach ein Entwurf ohne Ausstehendes in Rust; der wäre der versiegelte Stand und wird verworfen.
   */
  const fertig = () =>
    fuehreAus(async () => {
      await stoppeSpeichern();
      await befehle.versiegelungQuittieren();
      let s = await befehle.status();
      if (s.entwurf && !s.ausstehend) {
        await befehle.entwurfVerwerfen();
        s = { ...s, entwurf: null };
      }
      const zone = s.zeitzone ?? zeitzone;
      setzeEntwurf(zone ? leererEntwurf(new Date(), zone) : null, true);
      setVerfallenLokal(false);
      setzeLokal(START);
      uebernehme(s);
    });

  const testEnde = () =>
    fuehreAus(async () => {
      setBestaetigen(false);
      await stoppeSpeichern();
      try {
        await befehle.testbetriebBeenden();
      } catch (e) {
        // Ist danach ein Startfehler gesetzt, soll ihn die Oberfläche zeigen.
        await laden().catch(() => undefined);
        throw e;
      }
      setPaket(null);
      setzeEntwurf(null);
      setVerfallenLokal(false);
      setzeLokal(START);
      await laden();
    });

  const einrichten = (quelle: "vektor" | "datei", fristMinuten: number | null) =>
    fuehreAus(async () => {
      let spkiPfad: string | null = null;
      if (quelle === "datei") {
        const wahl = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Schlüssel", extensions: ["pem", "txt", "der", "b64"] }],
        });
        if (typeof wahl !== "string") return;
        spkiPfad = wahl;
      }
      await befehle.entwicklungEinrichten({ spkiPfad, fristMinuten });
      setzeLokal(START);
      const s = await laden();
      if (!s.eingerichtet || s.startfehler) return;
      const p = await befehle.stammdaten();
      setPaket(p);
      setzeEntwurf(leererEntwurf(new Date(), s.zeitzone ?? p.zeitzone), true);
    });

  const test = status?.betrieb === "test";
  const fristMinuten = status?.fristMinuten ?? paket?.fristMinuten ?? null;
  const restProzent = fristMinuten ? Math.min(100, (rest / (fristMinuten * 60)) * 100) : 0;

  let inhalt: ReactNode = null;
  if (status) {
    switch (lokal.phase) {
      case "startfehler":
        inhalt = <Startfehler fehler={status.startfehler ?? ""} />;
        break;
      case "nicht-eingerichtet":
        inhalt = <NichtEingerichtet entwicklung={status.entwicklung} beiEinrichten={(q, f) => void einrichten(q, f)} />;
        break;
      case "start":
        inhalt = (
          <Willkommen
            bereitschaft={status.bereitschaft ?? paket?.bereitschaft ?? null}
            test={test}
            beiOeffnen={oeffnen}
            beiTestEnde={() => setBestaetigen(true)}
          />
        );
        break;
      case "form":
        inhalt =
          entwurf && paket ? (
            <Formular
              entwurf={entwurf}
              paket={paket}
              bearbeiten={lokal.bearbeiten}
              restText={restText(rest)}
              beiAenderung={aendere}
              beiZurueck={zurueck}
              beiVerwerfen={() => void zurFrist()}
              beiAbsenden={() => void absenden()}
            />
          ) : null;
        break;
      case "frist":
        inhalt =
          ausstehend && paket ? (
            <Frist
              ausstehend={ausstehend}
              paket={paket}
              restText={restText(rest)}
              restProzent={restProzent}
              beiAendern={aendern}
              beiVersiegeln={() => void versiegeln()}
            />
          ) : null;
        break;
      case "versiegelt":
        inhalt = status.versiegelung ? (
          <Versiegelt
            versiegelung={status.versiegelung}
            zeitzone={zeitzone}
            verfallen={status.versiegelung.verfallen || verfallenLokal}
            beiFertig={() => void fertig()}
          />
        ) : null;
        break;
    }
  }

  const mitKopf = status === null || lokal.phase !== "start";

  return (
    <div className="app">
      {test || mitKopf ? (
        <div className="oben">
          {test ? <Testband /> : null}
          {mitKopf ? <Kopf thema={thema.wahl} beiThemaWechsel={thema.wechsle} /> : null}
        </div>
      ) : null}
      {fehler ? (
        <div className="fehlerleiste">
          <Hinweis ton="warn">{fehler}</Hinweis>
        </div>
      ) : null}
      {inhalt}
      {bestaetigen ? (
        <Bestaetigung
          titel="Testbetrieb beenden?"
          text="Die lokale Testdatenbank mit allen Testeinsätzen wird gelöscht. Das lässt sich nicht rückgängig machen."
          bestaetigen="Testdatenbank löschen"
          beiBestaetigung={() => void testEnde()}
          beiAbbruch={() => setBestaetigen(false)}
        />
      ) : null}
    </div>
  );
}
