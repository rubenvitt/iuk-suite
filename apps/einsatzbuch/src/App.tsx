/**
 * Ablauf der Erfassung: Willkommen → Formular → Frist → Versiegelt, dazu „nicht eingerichtet“ und
 * die Startfehlerseite. Welche Seite gilt, leitet `phaseAus` (`logik/ablauf.ts`) aus dem Status von
 * Rust und dem lokalen Zustand ab; entschieden wird mit der Uhr in Rust, die Oberfläche zählt nur
 * lokal herunter und fragt nach (`ablauf/fristUhr.ts`).
 *
 * Der Entwurf gehört dieser Komponente. Änderungen gehen 500 ms verzögert an Rust
 * (`ablauf/entwurfSpeicher.ts`); bis dahin gilt er als ungespeichert. Das zählt, wenn die Frist
 * während einer Bearbeitung abläuft: Rust meldet `verfallen`, sobald eine gespeicherte Bearbeitung
 * existierte, die Oberfläche ergänzt den Fall, dass die letzte Änderung noch gar nicht gespeichert
 * war. Nach Fristende lehnt Rust jede Bearbeitung ab (`FristAbgelaufen`); die Oberfläche fragt dann
 * `frist_pruefen` und zeigt die Versiegelung mit dem Hinweis, dass die Änderungen verfallen sind.
 *
 * Refs spiegeln Zustand, den asynchrone Schritte lesen (Polling, Speicher-Timer): Sie würden sonst
 * mit dem Wert aus dem Render arbeiten, in dem sie gestartet wurden.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { useEntwurfSpeicher } from "./ablauf/entwurfSpeicher";
import { useFristUhr, type FristStand } from "./ablauf/fristUhr";
import { Bestaetigung } from "./bausteine/Bestaetigung";
import { Hinweis } from "./bausteine/Hinweis";
import { Kopf } from "./bausteine/Kopf";
import { Testband } from "./bausteine/Testband";
import { befehle } from "./befehle";
import { phaseAus, restSekunden, restText, type Lokal } from "./logik/ablauf";
import { kannAbsenden, leererEntwurf } from "./logik/formular";
import { Formular } from "./seiten/Formular";
import { Frist } from "./seiten/Frist";
import { NichtEingerichtet } from "./seiten/NichtEingerichtet";
import { Startfehler } from "./seiten/Startfehler";
import { Versiegelt } from "./seiten/Versiegelt";
import { Willkommen } from "./seiten/Willkommen";
import { useThema } from "./stil/thema";
import type { Entwurf, Stammdatenpaket, Status } from "./typen";

const START: Lokal = { phase: "start", bearbeiten: false };

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
  const [fristStand, setFristStand] = useState<FristStand | null>(null);

  const statusRef = useRef<Status | null>(null);
  const versatzRef = useRef(0);
  const lokalRef = useRef<Lokal>(START);
  const entwurfRef = useRef<Entwurf | null>(null);
  /** Der Entwurf stammt unverändert aus `leererEntwurf`: Beim Öffnen bekommt er dann einen frischen Beginn. */
  const frischRef = useRef(false);
  const laeuftRef = useRef(false);
  /** Der angezeigte Fehler stammt aus einer Abfrage im Hintergrund und verschwindet mit der nächsten, die gelingt. */
  const fehlerAusAbfrageRef = useRef(false);

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

  function zeigeFehler(e: unknown, ausAbfrage: boolean) {
    fehlerAusAbfrageRef.current = ausAbfrage;
    setFehler(fehlerText(e));
  }

  /** Nach einer gelungenen Abfrage oder Frist-Prüfung: Ein Fehler aus dem Hintergrund ist überholt. */
  function loescheAbfrageFehler() {
    if (!fehlerAusAbfrageRef.current) return;
    fehlerAusAbfrageRef.current = false;
    setFehler(null);
  }

  /** Restzeit jetzt, außerhalb des Renders gerechnet (für den Speicher-Timer). */
  function restJetzt(): number {
    const a = statusRef.current?.ausstehend;
    return a ? restSekunden(a.fristBisMs, Date.now() + versatzRef.current) : 0;
  }

  const speicher = useEntwurfSpeicher({
    darfSpeichern: (bearbeitung) => {
      const l = lokalRef.current;
      if (l.phase !== "form" || l.bearbeiten !== bearbeitung || laeuftRef.current) return false;
      return !bearbeitung || restJetzt() > 0;
    },
    beiFehler: (f, bearbeitung) => {
      void (async () => {
        if (bearbeitung && (await versiegeltNachAblehnung().catch(() => false))) return;
        zeigeFehler(f, false);
      })();
    },
  });

  /**
   * Übernimmt einen Status. Beim Wechsel nach „versiegelt“ wird festgehalten, ob gerade eine
   * Bearbeitung mit ungespeicherter Änderung lief, und kein Speichern mehr angestoßen.
   */
  function uebernehme(s: Status, ersterStart = false) {
    const jetzt = Date.now();
    statusRef.current = s;
    versatzRef.current = s.jetztMs - jetzt;
    setStatus(s);
    setFristStand(s.ausstehend ? { fristBisMs: s.ausstehend.fristBisMs, versatz: s.jetztMs - jetzt, gemessenAm: jetzt } : null);
    const vorher = lokalRef.current;
    // Neustart mitten in einer Bearbeitung: Rust hält Ausstehendes und Entwurf, also dort weiter.
    const neustartInBearbeitung = ersterStart && s.eingerichtet && !s.startfehler && !s.versiegelung && s.ausstehend && s.entwurf;
    const neu: Lokal = neustartInBearbeitung ? { phase: "form", bearbeiten: true } : phaseAus(s, vorher);
    if (neu.phase === "versiegelt" && vorher.phase !== "versiegelt") {
      void speicher.stoppe();
      setVerfallenLokal(vorher.bearbeiten && speicher.ungespeichert());
      speicher.setzeUngespeichert(false);
    }
    setzeLokal(neu);
  }

  async function laden(): Promise<Status> {
    const s = await befehle.status();
    uebernehme(s);
    return s;
  }

  /**
   * Rust hat eine Bearbeitung abgelehnt oder die Frist ist nach Rusts Uhr um: `frist_pruefen`
   * versiegelt den zuletzt abgesendeten Stand, und weil die Änderungen nicht übernommen wurden,
   * zeigt die Versiegelung sie als verfallen. `false`, wenn nichts versiegelt wurde.
   */
  async function versiegeltNachAblehnung(): Promise<boolean> {
    const v = await befehle.fristPruefen();
    if (!v) return false;
    speicher.setzeUngespeichert(true);
    await laden();
    return true;
  }

  /** Ein Bedienschritt zur Zeit; sein Fehler landet im Hinweis über dem Inhalt. */
  async function fuehreAus(schritt: () => Promise<void>) {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    fehlerAusAbfrageRef.current = false;
    setFehler(null);
    try {
      await schritt();
    } catch (e) {
      zeigeFehler(e, false);
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

  const startFehler = useEffectEvent((e: unknown) => zeigeFehler(e, false));

  useEffect(() => {
    let aktiv = true;
    const istAktiv = () => aktiv;
    befehle
      .status()
      .then((s) => (aktiv ? gestartet(s, istAktiv) : undefined))
      .catch((e: unknown) => {
        if (aktiv) startFehler(e);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  // Frist: auch während einer Bearbeitung, denn die Frist läuft weiter und der Hinweis im
  // Formular zeigt die Restzeit.
  const ausstehend = status?.ausstehend ?? null;
  const fristLaeuft = ausstehend !== null && !status?.versiegelung && (lokal.phase === "frist" || (lokal.phase === "form" && lokal.bearbeiten));

  const rest = useFristUhr({
    stand: fristStand,
    aktiv: fristLaeuft,
    frage: async () => {
      if (laeuftRef.current) return;
      try {
        await laden();
        loescheAbfrageFehler();
      } catch (e) {
        zeigeFehler(e, true);
      }
    },
    // Bei 0 erst das Speichern anhalten: Eine Bearbeitung, die jetzt noch in Rust ankäme, würde
    // ohnehin abgelehnt, und die Versiegelung nimmt den zuletzt abgesendeten Stand.
    pruefe: async () => {
      if (laeuftRef.current) return;
      try {
        await speicher.stoppe();
        const v = await befehle.fristPruefen();
        if (v) await laden();
        loescheAbfrageFehler();
      } catch (e) {
        zeigeFehler(e, true);
      }
    },
  });

  function aendere(e: Entwurf) {
    setzeEntwurf(e);
    // Während ein Schritt läuft (Absenden, Verwerfen), plant eine Eingabe kein Speichern: Der
    // Schritt ersetzt den Entwurf in Rust ohnehin.
    if (!laeuftRef.current) speicher.plane(e, lokalRef.current.bearbeiten);
  }

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
      await speicher.stoppe();
      await befehle.entwurfVerwerfen();
      speicher.setzeUngespeichert(false);
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
      if (!e || !kannAbsenden(e)) return;
      const bearbeitung = lokalRef.current.bearbeiten;
      await speicher.stoppe();
      if (bearbeitung) {
        // Ist die Frist nach Rusts Uhr schon um, gar nicht erst absenden: Rust lehnte ab, und
        // versiegelt wird der zuletzt abgesendete Stand.
        const s = await befehle.status();
        const vorbei = !s.ausstehend || s.versiegelung !== null || s.jetztMs >= s.ausstehend.fristBisMs;
        if (vorbei) {
          if (!(await versiegeltNachAblehnung())) uebernehme(s);
          return;
        }
      }
      try {
        await befehle.absenden(e, bearbeitung);
      } catch (f) {
        if (bearbeitung && (await versiegeltNachAblehnung())) return;
        throw f;
      }
      speicher.setzeUngespeichert(false);
      setzeLokal({ phase: "frist", bearbeiten: false });
      await laden();
      window.scrollTo({ top: 0 });
    });

  const aendern = () => {
    if (!ausstehend) return;
    setzeEntwurf(ausstehend.entwurf);
    speicher.setzeUngespeichert(false);
    setzeLokal({ phase: "form", bearbeiten: true });
  };

  const versiegeln = () =>
    fuehreAus(async () => {
      await befehle.jetztVersiegeln();
      await laden();
    });

  /**
   * „Neuen Einsatz erfassen“: erst quittieren, dann den Status lesen. Sonst meldeten `status` und
   * `frist_pruefen` dieselbe Versiegelung erneut. Liegt danach ein Entwurf ohne Ausstehendes in
   * Rust, stammt er aus der versiegelten Bearbeitung und wird verworfen.
   */
  const fertig = () =>
    fuehreAus(async () => {
      await speicher.stoppe();
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
      await speicher.stoppe();
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
