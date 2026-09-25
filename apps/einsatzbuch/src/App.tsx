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
 *
 * Die Verwaltung (`seiten/Verwaltung.tsx`) entschlüsselt nur, solange Rust eine Sitzung hält und
 * sie offen ist (`verwaltung/useVerwaltung.ts`). Die Sperre (`verwaltung/useSperre.ts`) wacht
 * app-weit über jede Sitzung, auch während der Erfassung, denn die Sitzung überdauert den Wechsel.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { useEntwurfSpeicher } from "./ablauf/entwurfSpeicher";
import { useFristUhr, type FristStand } from "./ablauf/fristUhr";
import { Bestaetigung } from "./bausteine/Bestaetigung";
import { Hinweis } from "./bausteine/Hinweis";
import { Karte } from "./bausteine/Karte";
import { Knopf } from "./bausteine/Knopf";
import { Kopf } from "./bausteine/Kopf";
import { Testband } from "./bausteine/Testband";
import { befehle } from "./befehle";
import { phaseAus, restSekunden, restText, type Lokal } from "./logik/ablauf";
import { kannAbsenden, leererEntwurf } from "./logik/formular";
import { Anmelden, Wartebildschirm } from "./seiten/Anmelden";
import { Einrichtungsfrage } from "./seiten/Einrichtungsfrage";
import { Formular } from "./seiten/Formular";
import { Frist } from "./seiten/Frist";
import { Startfehler } from "./seiten/Startfehler";
import { Verwaltung } from "./seiten/Verwaltung";
import { Versiegelt } from "./seiten/Versiegelt";
import { Willkommen } from "./seiten/Willkommen";
import { useThema } from "./stil/thema";
import type { Entwurf, Stammdatenpaket, Status } from "./typen";
import { useSperre } from "./verwaltung/useSperre";
import { useVerwaltung } from "./verwaltung/useVerwaltung";

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
  /**
   * `einrichten`/`anmelden`/`neu_einrichten` warten bis zu 5 min auf den Loopback-Rückruf; Rust
   * setzt `status.anmeldungLaeuft` schon vor dem Ausgang auf `false`, die
   * Oberfläche sperrt ihre Knöpfe deshalb an diesem eigenen Zustand, nicht am Status-Feld.
   */
  const [wartetAuf, setWartetAuf] = useState<"einrichten" | "anmelden" | "neuEinrichten" | null>(null);
  /** Uhr von Rust minus Uhr hier, für den Tokenablauf (`useSperre`); als Zustand, weil der Render ihn liest. */
  const [versatz, setVersatz] = useState(0);
  /** Nach einer Sperre aus der Verwaltung: Hinweis mit „Entsperren“ auf der Startseite. */
  const [gesperrtHinweis, setGesperrtHinweis] = useState(false);

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
    setVersatz(s.jetztMs - jetzt);
    setStatus(s);
    setFristStand(s.ausstehend ? { fristBisMs: s.ausstehend.fristBisMs, versatz: s.jetztMs - jetzt, gemessenAm: jetzt } : null);
    const vorher = lokalRef.current;
    // Neustart mitten in einer Bearbeitung: Rust hält Ausstehendes und Entwurf, also dort weiter.
    const neustartInBearbeitung = ersterStart && s.eingerichtet && !s.startfehler && !s.versiegelung && s.ausstehend && s.entwurf;
    let neu: Lokal = neustartInBearbeitung ? { phase: "form", bearbeiten: true } : phaseAus(s, vorher);
    // Rust hält keine Sitzung mehr (abgelaufen, von der Suite verworfen): Die Verwaltung ist dann
    // gesperrt, wie nach „Sitzung sperren“ — nicht eine Seite, die ewig auf Schlüssel wartet.
    if (neu.phase === "verwaltung" && !s.sitzung) {
      neu = phaseAus(s, START);
      setGesperrtHinweis(neu.phase === "start");
    }
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
    setGesperrtHinweis(false);
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

  const entwicklungEinrichtenJetzt = (quelle: "vektor" | "datei", fristMinuten: number | null) =>
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

  /** „Mit Pocket ID anmelden und einrichten“ auf der Einrichtungsfrage. */
  const richteEin = (art: "echt" | "test", name: string, suiteUrl: string) =>
    fuehreAus(async () => {
      setWartetAuf("einrichten");
      try {
        await befehle.einrichten({ art, name, suiteUrl });
      } finally {
        setWartetAuf(null);
      }
      await laden();
    });

  /** „Mit Pocket ID anmelden“ auf der Anmeldekarte: danach direkt zur Verwaltung. */
  const meldeAn = () =>
    fuehreAus(async () => {
      setWartetAuf("anmelden");
      try {
        await befehle.anmelden();
      } finally {
        setWartetAuf(null);
      }
      const s = await laden();
      if (s.sitzung) {
        setGesperrtHinweis(false);
        setzeLokal({ phase: "verwaltung", bearbeiten: false });
      }
    });

  /** „Neu einrichten“ im Widerrufs-Hinweis (nur echt, nur nach Widerruf). */
  const neuEinrichtenJetzt = () =>
    fuehreAus(async () => {
      setWartetAuf("neuEinrichten");
      try {
        await befehle.neuEinrichten();
      } finally {
        setWartetAuf(null);
      }
      await laden();
    });

  /** Synchron: Der laufende `einrichten`/`anmelden`/`neu_einrichten` endet danach mit „Anmeldung abgebrochen.“ */
  const anmeldungAbbrechen = () => void befehle.anmeldungAbbrechen();

  const oeffneAnmeldung = () => {
    setGesperrtHinweis(false);
    setzeLokal({ phase: "anmelden", bearbeiten: false });
  };

  /** Verlässt die Anmeldekarte wieder dorthin, wo der Status ohne sie hinführen würde. */
  const zurueckVonAnmeldung = () => {
    const s = statusRef.current;
    setzeLokal(s ? phaseAus(s, { phase: "start", bearbeiten: false }) : START);
  };

  const zurVerwaltung = () => setzeLokal({ phase: "verwaltung", bearbeiten: false });

  const verwaltung = useVerwaltung(status?.sitzung != null && lokal.phase === "verwaltung");

  /**
   * „Sitzung sperren“, 10 min ohne Eingabe oder Tokenablauf: heißt abmelden (Spec §4.4,
   * Plan Stufe 5, Entscheidung 9). Bewusst NICHT über `fuehreAus` — dessen Ein-Schritt-Wächter
   * ließe eine Sperre fallen, während ein anderer Schritt läuft. Erst synchron Klartext und CEKs
   * verwerfen, dann Rust abmelden. Wer gerade erfasst, bleibt in der Erfassung; aus Verwaltung und
   * Anmeldung geht es zur Startseite mit dem Hinweis.
   */
  async function sperren() {
    verwaltung.verwerfen();
    const phase = lokalRef.current.phase;
    if (phase === "verwaltung" || phase === "anmelden") {
      const s = statusRef.current;
      const ziel = s ? phaseAus(s, START) : START;
      // Der Hinweis gehört zur Startseite; führt die Sperre zur Frist, käme er sonst viel später.
      setGesperrtHinweis(ziel.phase === "start");
      setzeLokal(ziel);
    }
    try {
      await befehle.abmelden();
      await laden();
    } catch (e) {
      zeigeFehler(e, false);
    }
  }

  useSperre({
    aktiv: status?.sitzung != null,
    ablaufMs: status?.sitzung?.ablaufMs ?? null,
    jetztVersatz: versatz,
    sperre: () => void sperren(),
  });

  /** Lokal prüfen und gegen den Anker; danach den Status neu lesen (Widerruf, Abweichung). */
  async function kettePruefen() {
    await verwaltung.kettePruefen();
    await laden().catch((e: unknown) => zeigeFehler(e, true));
  }

  const test = status?.betrieb === "test";
  const fristMinuten = status?.fristMinuten ?? paket?.fristMinuten ?? null;
  const restProzent = fristMinuten ? Math.min(100, (rest / (fristMinuten * 60)) * 100) : 0;

  // Widerruf (Spec §8): auf Start- und Verwaltungsseite, mit dem passenden Weg zurück in die
  // Einrichtung. Ein Testrechner kennt kein `neu_einrichten` (nur echt, Plan Stufe 5,
  // Entscheidung 12) — dort beendet derselbe Bestätigungsdialog wie im Fuß der Startseite den Test.
  const widerrufBanner =
    status?.widerrufen && (lokal.phase === "start" || lokal.phase === "verwaltung") ? (
      <div className="fehlerleiste">
        <div className="stapel stapel-8">
          <Hinweis ton="warn">Rechner muss neu eingerichtet werden.</Hinweis>
          {test ? (
            <Knopf variante="gefahr" onClick={() => setBestaetigen(true)}>
              Testbetrieb beenden und neu einrichten
            </Knopf>
          ) : (
            <Knopf variante="gefahr" onClick={() => void neuEinrichtenJetzt()}>
              Neu einrichten
            </Knopf>
          )}
        </div>
      </div>
    ) : null;

  let inhalt: ReactNode = null;
  if (wartetAuf) {
    // Einrichten, Anmelden und Neu-Einrichten warten alle auf denselben Loopback-Rückruf und
    // zeigen deshalb denselben Wartebildschirm, unabhängig davon, von welcher Seite aus gestartet.
    inhalt = <Wartebildschirm beiAbbrechen={anmeldungAbbrechen} />;
  } else if (status) {
    switch (lokal.phase) {
      case "startfehler":
        inhalt = <Startfehler fehler={status.startfehler ?? ""} />;
        break;
      case "einrichtung":
        inhalt = (
          <Einrichtungsfrage
            suiteVorgabe={status.suiteVorgabe}
            entwicklung={status.entwicklung}
            beiEinrichten={(art, name, suiteUrl) => void richteEin(art, name, suiteUrl)}
            beiEntwicklungEinrichten={(q, f) => void entwicklungEinrichtenJetzt(q, f)}
          />
        );
        break;
      case "anmelden":
        inhalt = <Anmelden beiAnmelden={() => void meldeAn()} beiZurueck={zurueckVonAnmeldung} />;
        break;
      case "verwaltung":
        inhalt = zeitzone ? (
          <Verwaltung
            zustand={verwaltung.zustand}
            zeitzone={zeitzone}
            bereitschaft={status.bereitschaft ?? paket?.bereitschaft ?? null}
            sitzung={status.sitzung}
            eingerichtetAm={status.eingerichtetAm}
            eingerichtetVon={status.eingerichtetVon}
            stammdatenVom={status.stammdatenVom}
            ankerBestaetigtBis={status.ankerBestaetigtBis}
            ankerAbweichung={status.ankerAbweichung}
            beiKettePruefen={kettePruefen}
            beiSperren={() => void sperren()}
          />
        ) : null;
        break;
      case "start":
        inhalt = (
          <Willkommen
            bereitschaft={status.bereitschaft ?? paket?.bereitschaft ?? null}
            test={test}
            eingerichtet={status.eingerichtet}
            sitzung={status.sitzung}
            beiOeffnen={oeffnen}
            beiTestEnde={() => setBestaetigen(true)}
            beiAnmeldenKlick={oeffneAnmeldung}
            beiVerwaltungKlick={zurVerwaltung}
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
          {mitKopf ? (
            <Kopf
              thema={thema.wahl}
              beiThemaWechsel={thema.wechsle}
              eingerichtet={status?.eingerichtet ?? false}
              sitzung={status?.sitzung ?? null}
              beiAnmeldenKlick={oeffneAnmeldung}
              beiVerwaltungKlick={zurVerwaltung}
              mitSperren={lokal.phase !== "verwaltung"}
              beiSperren={() => void sperren()}
            />
          ) : null}
        </div>
      ) : null}
      {fehler ? (
        <div className="fehlerleiste">
          <Hinweis ton="warn">{fehler}</Hinweis>
        </div>
      ) : null}
      {widerrufBanner}
      {gesperrtHinweis && lokal.phase === "start" ? (
        <div className="fehlerleiste">
          <Karte>
            <div className="gesperrt-karte">
              <Hinweis ton="info">Sitzung gesperrt. Die Einsätze liegen nur noch verschlüsselt vor.</Hinweis>
              <Knopf variante="primaer" zeichen="schluessel" onClick={oeffneAnmeldung}>
                Entsperren
              </Knopf>
            </div>
          </Karte>
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
