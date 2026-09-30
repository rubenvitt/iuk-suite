"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "antd";
import { layout } from "../../_lib/layout/layout";
import type { KarteL } from "../../_lib/layout/typen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { FARBE } from "../zeichnung/farben";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { ZeichnungInhalt } from "../zeichnung/Zeichnung";
import { SCHRITT, einpassen, tasteZuAktion, verschiebe, zoome, type Ansicht } from "./ansicht";

/**
 * Der Betrachter (Spec §5.7): dasselbe Layout wie der Druck, mit Zoom, Verschieben und Einklappen.
 * Rechnet das Layout im Browser — `layout()` ist rein und teilt Metriken mit dem Server.
 *
 * KEIN setState IM EFFEKT-RUMPF (`react-hooks/set-state-in-effect` ist aktiv, Vorbild
 * `core/tabelle/useEntprellt.ts`): die eingepasste Ansicht wird beim Rendern aus der gemessenen
 * Flächengröße ABGELEITET; eigener Zustand entsteht erst, wenn jemand zoomt oder verschiebt.
 * „Einpassen" heißt: eigenen Zustand verwerfen. Gemessen wird per ResizeObserver-Rückruf.
 */
export function Betrachter({ inhalt, symbole, titel, schrift }: { inhalt: PlanInhalt; symbole: Symbolsatz; titel: string; schrift: string }) {
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const daten = useMemo(() => layout(inhalt, "bildschirm", { eingeklappt }), [inhalt, eingeklappt]);
  const flaeche = useRef<HTMLDivElement>(null);
  const [groesse, setGroesse] = useState({ b: 0, h: 0 });
  const [eigene, setEigene] = useState<Ansicht | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());

  const basis = einpassen(daten.breite, daten.hoehe, groesse.b, groesse.h);
  const a = eigene ?? basis;
  const basisRef = useRef(basis);
  useEffect(() => { basisRef.current = basis; });

  useEffect(() => {
    const el = flaeche.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom kennt keinen ResizeObserver
    const beobachter = new ResizeObserver(([e]) => setGroesse({ b: e.contentRect.width, h: e.contentRect.height }));
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  // Rad als nicht-passiver Listener, sonst verschiebt der Browser die Seite statt den Plan.
  useEffect(() => {
    const el = flaeche.current;
    if (!el) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setEigene((alt) => {
        const jetzt = alt ?? basisRef.current;
        return e.ctrlKey || e.metaKey ? zoome(jetzt, Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top) : verschiebe(jetzt, -e.deltaX, -e.deltaY);
      });
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  const aendere = (f: (x: Ansicht) => Ansicht) => setEigene((alt) => f(alt ?? basisRef.current));
  const zoomUmMitte = (faktor: number) => {
    const el = flaeche.current;
    aendere((x) => zoome(x, faktor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2));
  };

  const unten = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-umschalter]")) return; // Klick auf einen Umschalter ist kein Ziehen
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    const anderer = [...zeiger.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (anderer) {
      const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y);
      const jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
      const r = e.currentTarget.getBoundingClientRect();
      if (vorher > 0) aendere((x) => zoome(x, jetzt / vorher, (e.clientX + anderer.x) / 2 - r.left, (e.clientY + anderer.y) / 2 - r.top));
    } else {
      aendere((x) => verschiebe(x, e.clientX - alt.x, e.clientY - alt.y));
    }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const los = (e: PointerEvent<HTMLDivElement>) => { zeiger.current.delete(e.pointerId); };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-umschalter]")) return;
    const aktion = tasteZuAktion(e.key);
    if (!aktion) return;
    e.preventDefault();
    if (aktion.art === "einpassen") setEigene(null);
    else if (aktion.art === "zoom") zoomUmMitte(aktion.faktor);
    else aendere((x) => verschiebe(x, aktion.dx, aktion.dy));
  };

  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  const zusatz = (k: KarteL) => !k.einklappbar ? null : (
    <g role="button" tabIndex={0} data-umschalter={k.id} aria-expanded={!k.eingeklappt}
      aria-label={`${k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}: Unterstellen ${k.eingeklappt ? "ausklappen" : "einklappen"}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); umschalten(k.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); umschalten(k.id); } }}>
      <circle cx={k.breite / 2} cy={k.hoehe} r={2.2} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={0.25} />
      <text x={k.breite / 2} y={k.hoehe + 1.1} fontSize={3.2} textAnchor="middle" fill={FARBE.tinte}>{k.eingeklappt ? "+" : "−"}</text>
    </g>
  );

  return (
    <div>
      <div className="kp-werkzeuge">
        <Button onClick={() => zoomUmMitte(1 / SCHRITT)} aria-label="Verkleinern">−</Button>
        <Button onClick={() => zoomUmMitte(SCHRITT)} aria-label="Vergrößern">+</Button>
        <Button onClick={() => setEigene(null)}>Einpassen</Button>
        {eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null}
      </div>
      <div ref={flaeche} className="kp-betrachter" tabIndex={0} role="group"
        aria-label={`${titel} — Pfeiltasten verschieben, Plus und Minus zoomen, 0 passt ein`}
        onPointerDown={unten} onPointerMove={bewegt} onPointerUp={los} onPointerCancel={los} onKeyDown={taste}>
        {daten.karten.length === 0 ? (
          <p style={{ padding: 16 }}>Dieser Plan hat noch keine Stellen.</p>
        ) : (
          <svg role="img" aria-label={titel} style={{ fontFamily: schrift }}>
            <SymbolDefs symbole={symbole} />
            <g data-ansicht="" transform={`translate(${a.x} ${a.y}) scale(${a.massstab})`}>
              <rect width={daten.breite} height={daten.hoehe} fill={FARBE.papier} />
              <ZeichnungInhalt daten={daten} zusatz={zusatz} />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
