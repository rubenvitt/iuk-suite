"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import s from "./telefon.module.css";

/**
 * Die Kamera am Telefon: liest EAN von der Packung oder den QR des Ortsetiketts und meldet den Text.
 * Gebaut nach `lagerbuch/_ui/BarcodeScanner.tsx` (sicherer Kontext vor dem Import, zxing erst beim Öffnen,
 * Fehler je Ursache, Kamera beim Verlassen stoppen). Nicht geteilt, weil jener Scanner selbst sucht und
 * navigiert und seine Tests am Quelltext hängen; hier entscheidet der Aufrufer, was ein Code bedeutet.
 */

export type Lesart = "ean" | "qr";

function kameraText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Kamera nicht freigegeben.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Keine Rückkamera gefunden.";
  if (name === "NotReadableError" || name === "AbortError") return "Die Kamera ist gerade belegt.";
  return "Die Kamera ist nicht verfügbar.";
}

export function Kamera({ lesart, onCode, hoehe = 190 }: { lesart: Lesart; onCode: (text: string) => void; hoehe?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const meldeRef = useRef(onCode);
  const zuletzt = useRef<{ text: string; am: number } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [lampe, setLampe] = useState(false);

  useEffect(() => { meldeRef.current = onCode; }, [onCode]);

  useEffect(() => {
    let beendet = false;
    void (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices) {
        setFehler("Die Kamera braucht eine verschlüsselte Verbindung.");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, lesart === "qr"
          ? [BarcodeFormat.QR_CODE]
          : [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF]);
        const reader = new BrowserMultiFormatReader(hints);
        if (beendet || !videoRef.current) return;
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result) return;
            const text = result.getText();
            const jetzt = Date.now();
            // zxing meldet denselben Code viele Male je Sekunde: einmal reicht, bis 2 s vergangen sind.
            if (zuletzt.current && zuletzt.current.text === text && jetzt - zuletzt.current.am < 2000) return;
            zuletzt.current = { text, am: jetzt };
            meldeRef.current(text);
          },
        );
        if (beendet) controlsRef.current?.stop();
      } catch (err) {
        if (!beendet) setFehler(kameraText(err));
      }
    })();
    return () => {
      beendet = true;
      controlsRef.current?.stop();
    };
  }, [lesart]);

  if (fehler) return <div className={`${s.karte} ${s.pad} ${s.fussnote}`} data-rolle="kamera-fehler">{fehler}</div>;
  return (
    <div className={s.scankarte} style={{ height: hoehe }}>
      <video ref={videoRef} muted playsInline className={s.scanVideo} />
      <div className={s.scanrahmen} />
      <div className={s.scanstrich} />
      <button
        type="button"
        className={s.lampe}
        aria-label="Taschenlampe"
        aria-pressed={lampe}
        onClick={() => {
          const c = controlsRef.current;
          if (!c?.switchTorch) return;
          void c.switchTorch(!lampe);
          setLampe(!lampe);
        }}
      >
        <Icons8Ikone name="flashlight" groesse={20} />
      </button>
    </div>
  );
}
