"use client";

import { useEffect, useRef, useState } from "react";
import { payloadToSvg } from "@/app/m/qr/_lib/qr";

/**
 * Anzeige plus die vier Einsatz-Funktionen aus easy-qr: Vollbild, Invertieren
 * per Long-Press (600 ms), PNG-Download (1024×1024), Teilen.
 *
 * Invertieren ist reines CSS `filter: invert(1)` — manche Scanner tun sich mit
 * dunklen Displays leichter. Long-Press statt Button, damit die Oberfläche im
 * Einsatz nicht mit Knöpfen zugestellt ist.
 *
 * Zum `dangerouslySetInnerHTML` weiter unten: das Markup stammt nicht vom
 * Nutzer, sondern aus dem SVG-Serializer von `qrcode`. Der Payload landet als
 * Modul-Koordinaten in einem `d`-Attribut, nie als Text im Markup — geprüft mit
 * `</svg><script>`-Eingabe, Ergebnis enthält ausschließlich `<svg>` und
 * `<path>`. Ein Sanitizer wäre hier also nur Ballast.
 */
export function QrDisplay({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Das Zurücksetzen des Fehlers hängt am Ergebnis, nicht am Effekt-Start:
    // ein synchrones setState im Effekt-Rumpf erzwingt einen zweiten
    // Render-Durchlauf und ist unter react-hooks/set-state-in-effect ein Fehler.
    payloadToSvg(text)
      .then((s) => {
        if (!cancelled) {
          setSvg(s);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  // Überlappende Pointer (Zwei-Finger-Berührung mit Handschuhen, Pinch-Zoom)
  // dürfen sich nicht auf zwei Timer aufteilen: sonst bleibt der erste
  // unreferenziert stehen, während endPress nur den zweiten löscht, und der
  // Code invertiert 600 ms nach dem ersten Tippen, obwohl längst niemand mehr
  // das Display berührt.
  const startPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setInverted((v) => !v), 600);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  async function downloadPng() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      // Bewusst ein aufgelöstes `false` statt eines Rejects: `downloadPng` hängt
      // direkt am onClick, eine Rejection käme als unbehandelte Promise-Ablehnung
      // in der Konsole an, ohne dass sie jemand auffängt.
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (!loaded) return;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);
      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = `${label || "qr"}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share() {
    // Teilt bewusst den Payload-TEXT, nicht das Bild — so kann der Empfänger
    // den Inhalt direkt nutzen (Link öffnen, Nummer wählen).
    if (!navigator.share) return;
    try {
      await navigator.share({ title: label, text });
    } catch {
      // Bricht der Nutzer das System-Dialogfeld ab, lehnt navigator.share mit
      // AbortError ab. Das ist kein Fehler, den man ihm zeigen müsste.
    }
  }

  function toggleFullscreen() {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  if (error) {
    return (
      <p data-testid="qr-error" className="text-[var(--color-rot)]">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={boxRef}
        data-testid="qr-display"
        // Das erzeugte SVG bringt nur eine viewBox mit, keine Breite/Höhe. Ohne
        // die explizite Größe fällt es auf die Ersatzgröße des Browsers zurück
        // statt die Box zu füllen — easy-qr setzt dieselbe Regel.
        className="w-full max-w-md bg-white p-4 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        style={inverted ? { filter: "invert(1)" } : undefined}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onDoubleClick={toggleFullscreen}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={downloadPng}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          PNG speichern
        </button>
        <button
          type="button"
          onClick={share}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          Teilen
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          Vollbild
        </button>
      </div>
    </div>
  );
}
