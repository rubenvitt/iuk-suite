/**
 * Karte „Einstellungen“ der Verwaltung (Spec §4.5 und §4.7; Stufe 6, Entscheidungen 3, 6 und 12).
 * Die Vorlage hat keine solche Karte. Sie folgt deshalb dem Aufbau der übrigen Karten (`Karte`
 * mit Titel, Zeilen mit Zeichen wie die Leitsätze) und den Ampeltönen von `Hinweis`.
 *
 * - **Sicherung:** der Stand aus dem Status in Worten (`logik/sicherung.ts`) und „Ordner wählen“.
 *   Die Wahl sichert in Rust gleich in den neuen Ordner, bevor der Befehl zurückkehrt. Der
 *   Status, der direkt danach gelesen wird, trägt also schon das Ergebnis, auch ein Scheitern.
 * - **Aus Sicherung wiederherstellen:** nur im Echtbetrieb, bei leerer Kette und mit Sitzung,
 *   erst nach einer Bestätigung. Den Rest prüft Rust (Anker der Suite, Freigabe, Ausstehendes).
 *   Die Meldung steht außerhalb dieser Bedingung, denn nach dem Neulesen ist die Kette nicht mehr leer.
 * - **Autostart:** nur im Echtbetrieb, gelesen und geschaltet über `autostart_status`/`autostart_setzen`.
 * - **Update:** nur ein Hinweis, wenn der Updater (Rust, nur im Release-Build) eine Version
 *   vorgemerkt hat (`status.update`) oder zuletzt gescheitert ist (`status.updateFehler`). Einen
 *   Knopf gibt es nicht: Rust installiert selbst, sobald nichts aussteht, niemand angemeldet ist
 *   und 15 Minuten lang kein Entwurf geändert wurde (Stufe 7, Entscheidung 1). Der Fehler steht
 *   auch ohne Vormerkung da, denn ein gescheitertes Installieren verwirft sie. Ein Release-Build
 *   hat kein Log, das jemand liest; dieser Hinweis ist der einzige Ort, an dem etwa eine
 *   Signatur auffällt, die nicht zum Schlüssel der App passt.
 *
 * Den Status liest die Karte nie selbst. Sie meldet eine Änderung an die App (`beiGeaendert`),
 * die ihn über `laden()` mit Sequenznummer holt (`App.tsx`). Fehler aus Rust kommen als
 * Zeichenkette und stehen wörtlich da.
 */
import { useEffect, useRef, useState } from "react";

import { Bestaetigung } from "../bausteine/Bestaetigung";
import { Hinweis } from "../bausteine/Hinweis";
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";
import { Zeichen } from "../bausteine/Symbol";
import { befehle } from "../befehle";
import { sicherungsanzeige } from "../logik/sicherung";
import type { Sicherungsstand, Status } from "../typen";

export interface EinstellungenProps {
  betrieb: Status["betrieb"];
  sicherung: Sicherungsstand | null;
  /** `status.kette.anzahl === 0`. */
  ketteLeer: boolean;
  mitSitzung: boolean;
  zeitzone: string;
  /** Version eines vorgemerkten Updates (`status.update`), sonst `null`. */
  update: string | null;
  /** Letzter Fehler des Updaters (`status.updateFehler`), sonst `null`. */
  updateFehler: string | null;
  /** Die App liest den Status neu; `ketteNeu` heißt: auch die Verwaltung neu laden. */
  beiGeaendert: (ketteNeu: boolean) => Promise<void>;
}

type Meldung = { ton: "ok" | "warn"; text: string };

/** Tauri liefert Fehler als Zeichenkette (`Result<_, String>`), alles andere wird lesbar gemacht. */
function fehlerText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

const TON: Record<"ok" | "gelb" | "rot", "ok" | "info" | "warn"> = { ok: "ok", gelb: "info", rot: "warn" };

export function Einstellungen(p: EinstellungenProps) {
  const echt = p.betrieb === "echt";
  const [laeuft, setLaeuft] = useState(false);
  const [fragt, setFragt] = useState(false);
  const [sicherungMeldung, setSicherungMeldung] = useState<Meldung | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartLaeuft, setAutostartLaeuft] = useState(false);
  const [autostartFehler, setAutostartFehler] = useState<string | null>(null);
  /** Nach dem Abhängen (Sperre) kommt kein Ergebnis mehr in den Zustand. */
  const lebt = useRef(true);

  useEffect(() => {
    lebt.current = true;
    return () => {
      lebt.current = false;
    };
  }, []);

  useEffect(() => {
    if (!echt) return;
    befehle
      .autostartStatus()
      .then((an) => {
        if (lebt.current) setAutostart(an);
      })
      .catch((e: unknown) => {
        if (lebt.current) setAutostartFehler(fehlerText(e));
      });
  }, [echt]);

  async function schritt(tun: () => Promise<Meldung | null>) {
    if (laeuft) return;
    setLaeuft(true);
    setSicherungMeldung(null);
    try {
      const m = await tun();
      if (lebt.current) setSicherungMeldung(m);
    } catch (e) {
      if (lebt.current) setSicherungMeldung({ ton: "warn", text: fehlerText(e) });
    } finally {
      if (lebt.current) setLaeuft(false);
    }
  }

  const ordnerWaehlen = () =>
    schritt(async () => {
      const ordner = await befehle.sicherungsordnerWaehlen();
      if (ordner !== null) await p.beiGeaendert(false);
      return null;
    });

  const wiederherstellen = () => {
    setFragt(false);
    void schritt(async () => {
      const ergebnis = await befehle.wiederherstellen();
      if (!ergebnis) return null;
      await p.beiGeaendert(true);
      return { ton: "ok", text: `${ergebnis.bloecke} ${ergebnis.bloecke === 1 ? "Block" : "Blöcke"} wiederhergestellt` };
    });
  };

  async function autostartSchalten(an: boolean) {
    setAutostartLaeuft(true);
    setAutostartFehler(null);
    try {
      await befehle.autostartSetzen(an);
      const neu = await befehle.autostartStatus();
      if (lebt.current) setAutostart(neu);
    } catch (e) {
      if (lebt.current) setAutostartFehler(fehlerText(e));
    } finally {
      if (lebt.current) setAutostartLaeuft(false);
    }
  }

  const anzeige = p.sicherung ? sicherungsanzeige(p.sicherung, p.zeitzone) : null;
  const kannWiederherstellen = echt && p.ketteLeer && p.mitSitzung;

  return (
    <Karte titel="Einstellungen">
      <div className="stapel stapel-20">
        <div className="einstellung">
          <div className="leitsatz-zeichen"><Zeichen name="archiv" groesse={20} /></div>
          <div className="stapel stapel-8 einstellung-inhalt">
            <div className="leitsatz-titel">Automatische Sicherung</div>
            {anzeige ? (
              anzeige.ton === "aus" ? (
                <div className="absatz">{anzeige.text}</div>
              ) : (
                <Hinweis ton={TON[anzeige.ton]} rolle="status">
                  <div>{anzeige.text}</div>
                  {anzeige.zusatz ? <div className="hinweis-zusatz">{anzeige.zusatz}</div> : null}
                </Hinweis>
              )
            ) : null}
            {echt && p.sicherung?.ordner ? (
              <div className="neben">
                Ordner: <span className="einstellung-pfad">{p.sicherung.ordner}</span>
              </div>
            ) : null}
            {echt ? (
              <div className="reihe-umbruch">
                <Knopf zeichen="archiv" disabled={laeuft} onClick={() => void ordnerWaehlen()}>
                  Ordner wählen
                </Knopf>
                {kannWiederherstellen ? (
                  <Knopf disabled={laeuft} onClick={() => setFragt(true)}>
                    Aus Sicherung wiederherstellen
                  </Knopf>
                ) : null}
              </div>
            ) : null}
            {kannWiederherstellen ? (
              <div className="neben">
                Auf diesem Rechner ist noch kein Einsatz versiegelt. Eine Sicherung lässt sich übernehmen, wenn ihre Kette zum Anker der Suite passt.
              </div>
            ) : null}
            {sicherungMeldung ? <Hinweis ton={sicherungMeldung.ton}>{sicherungMeldung.text}</Hinweis> : null}
          </div>
        </div>

        {p.update !== null || p.updateFehler !== null ? (
          <div className="einstellung">
            <div className="leitsatz-zeichen"><Zeichen name="herunterladen" groesse={20} /></div>
            <div className="stapel stapel-8 einstellung-inhalt">
              <div className="leitsatz-titel">Update</div>
              {p.update !== null ? (
                <Hinweis ton="info" rolle="status">
                  Update auf {p.update} ist vorgemerkt. Es wird installiert, sobald kein Einsatz aussteht, niemand angemeldet ist und 15 Minuten lang kein Entwurf geändert wurde.
                </Hinweis>
              ) : null}
              {p.updateFehler !== null ? (
                <Hinweis ton="warn" rolle="status">
                  <div>{p.updateFehler}</div>
                  <div className="hinweis-zusatz">Die App versucht es in etwa 15 Minuten erneut.</div>
                </Hinweis>
              ) : null}
            </div>
          </div>
        ) : null}

        {echt ? (
          <div className="einstellung">
            <div className="leitsatz-zeichen"><Zeichen name="anzeige-auto" groesse={20} /></div>
            <div className="stapel stapel-8 einstellung-inhalt">
              <div className="leitsatz-titel">Autostart</div>
              <label className="schalter">
                <input
                  type="checkbox"
                  role="switch"
                  checked={autostart ?? false}
                  disabled={autostart === null || autostartLaeuft}
                  onChange={(e) => void autostartSchalten(e.currentTarget.checked)}
                />
                <span>Beim Anmelden am Rechner starten</span>
              </label>
              {autostartFehler ? <Hinweis ton="warn">{autostartFehler}</Hinweis> : null}
            </div>
          </div>
        ) : null}
      </div>
      {fragt ? (
        <Bestaetigung
          titel="Aus Sicherung wiederherstellen?"
          text="Du wählst gleich eine Sicherungsdatei. Die App prüft ihre Kette und gleicht sie mit dem Anker der Suite ab. Nur wenn beides passt, übernimmt sie die Einsätze auf diesen Rechner."
          bestaetigen="Datei wählen"
          beiBestaetigung={wiederherstellen}
          beiAbbruch={() => setFragt(false)}
        />
      ) : null}
    </Karte>
  );
}
