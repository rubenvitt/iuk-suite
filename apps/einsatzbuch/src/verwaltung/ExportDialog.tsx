/**
 * „Einsätze als Datei speichern“ nach der Vorlage (`exportOffen` und `exportieren` in
 * `docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html`). Texte wörtlich, bis auf die
 * Rundenzahl: der Kern leitet mit 600 000 Runden ab (Spec §10, `EXPORT_ITERATIONEN`).
 *
 * Ablauf (Plan Stufe 6, Entscheidung 7): frische Inhaltsschlüssel nur für die exportierten
 * Blöcke (`schluessel_freigeben` mit Blockliste; „einzeln“ nennt der Suite nur diesen Block),
 * dann der Status frisch aus Rust — `jetzt` als `kopf.erstellt`, der bestätigte Anker, Sitzung
 * und Bereitschaft; der Status der App kann bis zu einer Sitzungslänge alt sein. Dann
 * `baueExport`, dann der Speichern-Dialog der Hülle.
 *
 * Kein CEK überlebt (Review Focus 5): Die CEK-Bytes leben nur als lokale Variable des Laufs und
 * werden in `finally` mit Nullen überschrieben — nach Erfolg, Abbruch im Speichern-Dialog und
 * jedem Fehler. Die Kennwortfelder werden nach jedem Lauf geleert. Wird der Dialog mitten im
 * Lauf entfernt (Sperre), bricht der Lauf vor dem nächsten Schritt ab, statt nach der Sperre
 * noch einen Speichern-Dialog zu öffnen.
 */
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { ausBase64 } from "@kern/bytes";
import { KENNWORT_MINDESTLAENGE } from "@kern/export";
import type { Block } from "@kern/format";

import { Feld } from "../bausteine/Feld";
import { Hinweis } from "../bausteine/Hinweis";
import { Knopf } from "../bausteine/Knopf";
import { Zeichen } from "../bausteine/Symbol";
import { befehle } from "../befehle";
import { baueExport, type Exportumfang } from "../logik/export";

/** Satz der Vorlage für alles, was nicht als Meldung aus Rust kommt (etwa ein Fehler von WebCrypto). */
const NICHT_ERZEUGT = "Die Datei konnte nicht erzeugt werden. Versuch es noch einmal.";

/** Der Dialog wurde mitten im Lauf entfernt; kein Fehler, den jemand sehen müsste. */
class Verworfen extends Error {}

export interface ExportDialogProps {
  /** Die ganze Kette, aufsteigend. */
  bloecke: readonly Block[];
  /** Der Block, den „einzeln“ meint (in der Verwaltung gewählt, sonst der neueste offene). */
  einzeln: { block: number; nummer: string; stichwort: string } | null;
  umfang: Exportumfang;
  /** Nur, falls der frische Status keine Zone trägt (nicht eingerichtet — hier nicht erreichbar). */
  zeitzone: string;
  beiSchliessen: () => void;
}

export function ExportDialog({ bloecke, einzeln, umfang: anfang, zeitzone, beiSchliessen }: ExportDialogProps) {
  const titelId = useId();
  const [umfang, setUmfang] = useState<Exportumfang>(anfang === "einzeln" && einzeln ? "einzeln" : "alle");
  const [kw1, setKw1] = useState("");
  const [kw2, setKw2] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<string | null>(null);
  const lebt = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const erstesFeld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lebt.current = true;
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    erstesFeld.current?.focus();
    return () => {
      lebt.current = false;
      vorher?.focus();
    };
  }, []);

  function schliessen() {
    if (!laeuft) beiSchliessen();
  }

  const taste = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      schliessen();
      return;
    }
    if (ev.key !== "Tab" || !dialog.current) return;
    const ziele = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
    const erstes = ziele[0];
    const letztes = ziele[ziele.length - 1];
    if (!erstes || !letztes) return;
    const aktiv = document.activeElement;
    const drinnen = aktiv instanceof Node && dialog.current.contains(aktiv);
    if (ev.shiftKey && (!drinnen || aktiv === erstes)) {
      ev.preventDefault();
      letztes.focus();
    } else if (!ev.shiftKey && (!drinnen || aktiv === letztes)) {
      ev.preventDefault();
      erstes.focus();
    }
  });

  useEffect(() => {
    const hoere = (ev: KeyboardEvent) => taste(ev);
    window.addEventListener("keydown", hoere);
    return () => window.removeEventListener("keydown", hoere);
  }, []);

  /** Jede Eingabe verwirft das Ergebnis des letzten Laufs (wie `setExp` der Vorlage). */
  function aendere(setzen: () => void) {
    setzen();
    setFertig(null);
    setFehler(null);
  }

  const zuKurz = kw2 !== "" && kw1.length < KENNWORT_MINDESTLAENGE;
  const ungleich = kw2 !== "" && kw1 !== kw2;
  const gesperrt = laeuft || kw1.length < KENNWORT_MINDESTLAENGE || kw1 !== kw2;
  const mitEinzeln = umfang === "einzeln" && einzeln !== null;

  async function speichern() {
    if (gesperrt) return;
    const kennwort = kw1;
    const nummern = mitEinzeln ? [einzeln.block] : bloecke.map((b) => b.kopf.block);
    const ceks = new Map<number, Uint8Array>();
    const pruefe = () => {
      if (!lebt.current) throw new Verworfen();
    };
    setLaeuft(true);
    setFehler(null);
    setFertig(null);
    try {
      const posten = await befehle.schluesselFreigeben(nummern);
      pruefe();
      for (const p of posten) ceks.set(p.block, ausBase64(p.cek));
      const s = await befehle.status();
      pruefe();
      const { datei, dateiname } = await baueExport(
        {
          bloecke,
          umfang: mitEinzeln ? "einzeln" : "alle",
          gewaehlt: mitEinzeln ? einzeln.block : null,
          ceks,
          anker: s.anker,
          exportiertVon: s.sitzung?.name ?? "",
          quelle: s.bereitschaft ?? "",
          erstellt: s.jetzt,
          zeitzone: s.zeitzone ?? zeitzone,
          nummer: mitEinzeln ? einzeln.nummer : null,
        },
        kennwort,
      );
      pruefe();
      const name = await befehle.exportSpeichern(JSON.stringify(datei), dateiname);
      if (name !== null) setFertig(name);
    } catch (e) {
      if (!(e instanceof Verworfen)) setFehler(typeof e === "string" ? e : NICHT_ERZEUGT);
    } finally {
      for (const cek of ceks.values()) cek.fill(0);
      ceks.clear();
      setKw1("");
      setKw2("");
      setLaeuft(false);
    }
  }

  async function imReaderOeffnen() {
    try {
      await befehle.readerOeffnen();
    } catch (e) {
      setFehler(typeof e === "string" ? e : String(e));
    }
  }

  const erste = bloecke[0]?.kopf.block;
  const letzte = bloecke[bloecke.length - 1]?.kopf.block;
  const umfaenge: { id: Exportumfang; titel: string; hilfe: string }[] = [
    {
      id: "alle",
      titel: `Alle ${bloecke.length} ${bloecke.length === 1 ? "Einsatz" : "Einsätze"}`,
      hilfe: `Block ${erste}–${letzte} · der Reader kann die ganze Kette prüfen`,
    },
  ];
  if (einzeln) {
    umfaenge.push({
      id: "einzeln",
      titel: `Nur ${einzeln.nummer} · ${einzeln.stichwort}`,
      hilfe: `Block ${einzeln.block} · Fingerabdruck und Vorgänger werden mitgegeben`,
    });
  }

  return (
    <div
      className="modal-grund"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) schliessen();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titelId} className="modal export-dialog" ref={dialog}>
        <div className="stapel stapel-4">
          <div className="kicker">Herunterladen</div>
          <h2 id={titelId} className="export-titel">
            Einsätze als Datei speichern
          </h2>
        </div>
        <div className="stapel stapel-8">
          {umfaenge.map((u) => (
            <button
              key={u.id}
              type="button"
              className="umfang"
              aria-pressed={umfang === u.id}
              disabled={laeuft}
              onClick={() => aendere(() => setUmfang(u.id))}
            >
              <span className="umfang-punkt" aria-hidden="true">
                <span />
              </span>
              <span className="umfang-text">
                <span className="umfang-titel">{u.titel}</span>
                <span className="umfang-hilfe">{u.hilfe}</span>
              </span>
            </button>
          ))}
        </div>
        <Feld
          ref={erstesFeld}
          label="Kennwort für die Datei"
          type="password"
          name="kennwort"
          autoComplete="new-password"
          hilfe="Mindestens 10 Zeichen. Ohne Kennwort lässt sich die Datei nicht öffnen — es wird nirgends gespeichert."
          fehler={zuKurz ? `Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.` : undefined}
          wert={kw1}
          disabled={laeuft}
          beiAenderung={(w) => aendere(() => setKw1(w))}
        />
        <Feld
          label="Kennwort wiederholen"
          type="password"
          name="kennwort-wiederholen"
          autoComplete="new-password"
          fehler={ungleich ? "Die Kennwörter stimmen nicht überein." : undefined}
          wert={kw2}
          disabled={laeuft}
          beiAenderung={(w) => aendere(() => setKw2(w))}
        />
        <div className="export-hinweise">
          <div className="export-hinweis">
            <Zeichen name="schluessel" />
            <span>AES-256-GCM, Schlüssel aus deinem Kennwort abgeleitet (PBKDF2, 600.000 Runden).</span>
          </div>
          <div className="export-hinweis">
            <Zeichen name="verketten" />
            <span>Fingerabdrücke bleiben erhalten — der Reader prüft die Kette beim Öffnen.</span>
          </div>
        </div>
        {fehler ? <Hinweis ton="warn">{fehler}</Hinweis> : null}
        {fertig ? (
          <div className="export-fertig" role="status">
            <Zeichen name="haken" />
            <span className="export-fertig-text">
              Gespeichert als <strong className="export-dateiname">{fertig}</strong>
            </span>
            <button type="button" className="export-reader" onClick={() => void imReaderOeffnen()}>
              Im Reader öffnen
            </button>
          </div>
        ) : null}
        <div className="modal-knoepfe">
          <Knopf disabled={laeuft} onClick={schliessen}>
            {fertig ? "Fertig" : "Abbrechen"}
          </Knopf>
          <Knopf variante="primaer" zeichen="herunterladen" disabled={gesperrt} onClick={() => void speichern()}>
            {laeuft ? "Verschlüssele …" : "Datei speichern"}
          </Knopf>
        </div>
      </div>
    </div>
  );
}
