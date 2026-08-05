"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { normalisiereBarcode } from "../_lib/barcode";
import s from "./helfer.module.css";

/**
 * DIE KAMERA-INSEL — §7.6, portiert aus
 * `lagerbuch/src/components/BarcodeScanner.tsx` mit den Aenderungen aus §7.6.3.
 *
 * ⚠️ SIE STEHT NICHT AUF DEM HELFER-WEG (§7.2.1): der `@zxing`-Scanner hat dort
 * NULL Aufrufer. Beide QR-Einstiege (`/t/<code>`, `/a/<id>`) werden mit der
 * SYSTEMKAMERA gescannt. Ihre zwei Aufrufer sind
 * `/verwaltung/geraete/scan` und `/verwaltung/bz/scan` (Teil 5, T138).
 *
 * ⚠️ SIE RENDERT DESHALB AUF BEIDEN ANSICHTSKLASSEN. Traegerelement ist dort
 * `.modul` aus `verwaltung.module.css`, hier `.rahmen`. Beide fuehren denselben
 * `--lb-*`-Satz (§3.3) — DIESE DATEI GREIFT AUSSCHLIESSLICH AUF `--lb-*`
 * ZURUECK und auf keine Klasse des fremden Stylesheets. Ein
 * `var(--ant-color-primary)` waere ein Knopf OHNE Hintergrundfarbe, still, weil
 * eine nicht aufloesbare CSS-Variable gueltiges CSS ist (Falle 2, §7.6.4).
 *
 * DIE SIEBEN POSSIBLE_FORMATS BLEIBEN ZEICHENGLEICH (§7.6.2, 1:1-Pflicht). EAN
 * und ITF sind reine Handels- und Herstellercodierungen; sie stehen auf keinem
 * lagerbuch-Etikett, sondern VOM HERSTELLER GEDRUCKT am Geraet. Ein Format zu
 * entfernen macht jeden bereits erfassten Hersteller-Barcode unlesbar, und die
 * Gegenstaende sind physisch vorhanden.
 */

/** §7.6.3 — vier Zustaende statt einem. Die HANDLUNG unterscheidet sich je Ursache. */
const KEIN_SICHERER_KONTEXT =
  "Die Kamera braucht eine verschlüsselte Verbindung. " +
  "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.";

/**
 * ⚠️ AUF MODULEBENE UND NICHT ALS VORGABEWERT IN DER ZERLEGUNG. Ein
 * `nichtGefunden = (code) => …` im Parameterkopf erzeugt bei JEDEM Rendern eine
 * neue Funktion; `pruefeCode` bekaeme jedes Mal eine neue Identitaet, und der
 * Kamera-Effekt haengt daran. Folge waere: bei jedem Zeichen im Tippfeld wird
 * die Kamera gestoppt und neu erlaubt — Ruckeln, auf iOS ein erneuter
 * Freigabedialog. Ein Test in dieser Datei haelt das fest.
 */
const NICHT_GEFUNDEN = (code: string) => `Kein Gerät mit dem Barcode „${code}“ gefunden.`;

function kameraText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite " +
           "freigeben — oder den Barcode unten eintippen.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Keine Rückkamera gefunden. Barcode bitte unten eintippen.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Die Kamera wird gerade von einer anderen App benutzt. " +
           "Diese schließen oder den Barcode unten eintippen.";
  }
  // Unbekannt: der Satz des Bestands, aber ohne die falsche Behauptung
  // „Zugriff abgelehnt" — die drei Faelle darueber decken das ab.
  return "Die Kamera ist nicht verfügbar. Barcode bitte unten eintippen.";
}

export function BarcodeScanner({
  zuBarcode,
  zielPfad,
  nichtGefunden = NICHT_GEFUNDEN,
}: {
  zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
  /** AEUSSERER Pfad (`/verwaltung/geraete/<id>`). Ein innerer wuerde doppelt praefixiert. */
  zielPfad: (id: string) => string;
  /**
   * Optional mit Vorgabe — NICHT Pflicht: der Zwei-Prop-Aufruf steht in
   * Teil 5, T138 bereits geschrieben (`BarcodeScanner({ zuBarcode, zielPfad })`).
   * Ein dritter Pflicht-Prop braeche beide Verwaltungsseiten.
   */
  nichtGefunden?: (code: string) => string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  /** 1:1: verhindert parallele Lookups — zxing feuert denselben Code viele Male pro Sekunde. */
  const busyRef = useRef(false);
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sucht, setSucht] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manuell, setManuell] = useState("");

  const pruefeCode = useCallback(
    async (roh: string) => {
      // Die EINE Normalisierung (T62) — hier UND am Kamerarueckgabewert. Ein
      // aus einem QR getippter Deep-Link findet sein Geraet nur so.
      const code = normalisiereBarcode(roh);
      if (busyRef.current || !code) return;
      busyRef.current = true;
      setSucht(true);
      setMeldung(null);
      try {
        const treffer = await zuBarcode(code);
        if (treffer) {
          controlsRef.current?.stop();
          // Volle Navigation statt router.push: Soft-Navigation direkt nach
          // einer Server Action wird (vor allem im Dev-Modus) gern abgebrochen,
          // und nach einem Scan ist ein frischer Seitenaufbau ohnehin gewollt.
          window.location.assign(zielPfad(treffer.id));
          return;   // busy bleibt gesetzt, sonst navigiert ein Folge-Scan doppelt
        }
        setMeldung(nichtGefunden(code));
      } catch {
        setMeldung("Suche fehlgeschlagen – bitte erneut versuchen.");
      } finally {
        setSucht(false);
      }
      // Kurze Sperre, damit derselbe (unbekannte) Code nicht im Dauerfeuer nervt.
      setTimeout(() => { busyRef.current = false; }, 2000);
    },
    [zuBarcode, zielPfad, nichtGefunden],
  );

  useEffect(() => {
    let beendet = false;

    void (async () => {
      /**
       * DER SICHERE KONTEXT WIRD VOR DEM DYNAMISCHEN IMPORT GEPRUEFT (§7.6.3) —
       * sonst laedt das Geraet zwei zxing-Buendel, um danach festzustellen, dass
       * es sie nicht benutzen kann. Zugleich der Beruehrungspunkt mit §3.5.2:
       * ueber den DIREKTEN Weg (http://<ip>:<port>) ist `getUserMedia` GAR NICHT
       * verfuegbar; der Scanner ist dort strukturell unbenutzbar.
       *
       * ⚠️ ER STEHT IN DER ASYNCHRONEN HUELLE UND NICHT DAVOR, obwohl er nichts
       * erwartet: `react-hooks/set-state-in-effect` ist in dieser Suite ein
       * FEHLER (nicht Warnung) und bricht `pnpm lint`, wenn ein `setState`
       * unmittelbar im Effektkoerper steht. An der Reihenfolge aendert das
       * nichts — bis zum ersten `await` laeuft dieser Block synchron, und der
       * Import steht dahinter.
       */
      if (!window.isSecureContext || !navigator.mediaDevices) {
        setKameraFehler(KEIN_SICHERER_KONTEXT);
        return;
      }
      try {
        // Dynamischer Doppelimport: die zxing-Buendel laden erst beim Betreten
        // der Seite. Ein statischer WERT-Import zoege sie in jedes Bundle, das
        // diese Datei erwaehnt.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        if (beendet || !videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => { if (result) void pruefeCode(result.getText()); },
        );
        if (beendet) controlsRef.current?.stop();
      } catch (err) {
        // §7.6.3: der Fehler wird AUSGEWERTET. Ein einziger Satz fuer vier
        // Ursachen ist fuer jemanden in einer Fahrzeughalle die falsche
        // Auskunft — die Handlung unterscheidet sich je Ursache.
        if (!beendet) setKameraFehler(kameraText(err));
      }
    })();

    return () => {
      beendet = true;
      // Ohne diesen Halt laeuft die Kamera nach dem Verlassen weiter — sichtbar
      // an der Geraete-Leuchte, und auf iOS blockiert sie dann jede weitere App.
      controlsRef.current?.stop();
    };
  }, [pruefeCode]);

  function torchToggle() {
    const c = controlsRef.current;
    // Optional geprueft (1:1): nicht jedes Geraet und nicht jeder Browser kann
    // es, und ein Wurf beim Antippen waere ein Absturz mitten im Scannen.
    if (!c?.switchTorch) return;
    const an = !torch;
    void c.switchTorch(an);
    setTorch(an);
  }

  return (
    <>
      {kameraFehler ? (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="scan-fehler">{kameraFehler}</div>
      ) : (
        <div className={s.scanKarte}>
          <video ref={videoRef} muted playsInline className={s.scanVideo} />
          <div className={s.scanStrich} />
          <button
            type="button"
            className={torch ? `${s.lampe} ${s.lampeAn}` : s.lampe}
            aria-label="Taschenlampe"
            aria-pressed={torch}
            onClick={torchToggle}
          >
            {/* Lokales Inline-SVG (E3); Teil 5, T101 hebt es. */}
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 2h10l-1 6H8L7 2zm1 8h8v4l-3 8h-2l-3-8v-4z" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}

      {meldung && (
        <div className={`${s.karte} ${s.kartePad} ${s.gateFehler}`} data-rolle="scan-meldung">
          {meldung}
        </div>
      )}

      {/*
        1:1-PFLICHT: DAS MANUELLE FELD STEHT IMMER (§7.6.3), unabhaengig vom
        Kamerazustand — heute unbedingt gerendert, nur der Videobereich wird
        durch die Fehlerkarte ersetzt. Ein manuelles Feld, das sich hinter einem
        Kamerafehler versteckt, ist kein Rueckfall.
      */}
      <div className={`${s.karte} ${s.kartePad}`}>
        <form
          className={s.feldZeile}
          data-rolle="scan-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Der Mensch am Feld ist nicht das Dauerfeuer, gegen das die Sperre
            // gebaut ist (1:1).
            busyRef.current = false;
            void pruefeCode(manuell);
          }}
        >
          <input
            className={s.feld}
            aria-label="Barcode manuell eingeben"
            placeholder="Seriennummer / Barcode"
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            autoComplete="off"
            data-rolle="scan-manuell"
          />
          <button
            className={`${s.knopf} ${s.knopfTinte}`}
            type="submit"
            disabled={sucht || manuell.trim() === ""}
          >
            Suchen
          </button>
        </form>
      </div>
    </>
  );
}
