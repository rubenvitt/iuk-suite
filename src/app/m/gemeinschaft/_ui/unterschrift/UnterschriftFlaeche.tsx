"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import s from "./unterschrift.module.css";

export type Unterschriftflaeche = { alsPng: () => string | null; leeren: () => void };

/**
 * Zeichenfläche für Finger, Stift oder Maus (IDA-343, IDA-354): auf der Statusseite, auf der Ausfüllseite der Leitung
 * und für die Unterschrift vor Ort. Schwarze Tinte auf hellem Grund, auch im Dunkelmodus.
 */
export function UnterschriftFlaeche({ ref, beschriftetVon, onLeer, testId = "unterschrift-flaeche" }: {
  ref: React.Ref<Unterschriftflaeche>; beschriftetVon: string; onLeer: (leer: boolean) => void; testId?: string;
}) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const letzter = useRef<{ x: number; y: number } | null>(null);
  const striche = useRef(0);

  useEffect(() => {
    const c = leinwand.current;
    if (!c) return;
    const groesse = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width === Math.round(r.width * dpr)) return;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d");
      if (ctx) { ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.4; ctx.strokeStyle = "#111"; }
      striche.current = 0;
      onLeer(true);
    };
    groesse();
    const ro = new ResizeObserver(groesse);
    ro.observe(c);
    return () => ro.disconnect();
  }, [onLeer]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    alsPng: () => (striche.current > 0 && leinwand.current ? leinwand.current.toDataURL("image/png") : null),
    leeren: () => {
      const c = leinwand.current;
      const ctx = c?.getContext("2d");
      if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
      striche.current = 0;
      onLeer(true);
    },
  }), [onLeer]);

  return (
    <canvas ref={leinwand} className={s.flaeche} role="img" aria-labelledby={beschriftetVon} data-testid={testId}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); letzter.current = pos(e); }}
      onPointerMove={(e) => {
        const von = letzter.current;
        const ctx = leinwand.current?.getContext("2d");
        if (!von || !ctx) return;
        const nach = pos(e);
        ctx.beginPath(); ctx.moveTo(von.x, von.y); ctx.lineTo(nach.x, nach.y); ctx.stroke();
        letzter.current = nach;
        // Ausgeschrieben statt `striche.current++ === 0`: der React Compiler übersetzt das Postfix auf einer Ref als
        // Vergleich NACH dem Hochzählen (gemessen im gebauten Stand), und die Fläche bliebe „leer“.
        const vorher = striche.current;
        striche.current = vorher + 1;
        if (vorher === 0) onLeer(false);
      }}
      onPointerUp={() => { letzter.current = null; }}
      onPointerCancel={() => { letzter.current = null; }} />
  );
}
