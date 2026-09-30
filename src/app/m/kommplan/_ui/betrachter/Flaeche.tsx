"use client";

import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import { Button } from "antd";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE } from "../zeichnung/farben";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { ZeichnungInhalt } from "../zeichnung/Zeichnung";
import { GRENZEN, SCHRITT, einpassen, nachziehen, tasteZuAktion, untergrenze, verdeckterTeil, verschiebe, zoome, type Ansicht } from "./ansicht";

/**
 * DIE ZEICHENFLÄCHE von Betrachter und Editor (Spec §5.7, §6.3): Zoom, Verschieben, Pinch, Rad,
 * Tastatur, dazu Klick auf eine Karte. Aus `Betrachter.tsx` herausgelöst; dessen Kopfkommentar gilt
 * weiter — insbesondere: kein setState im Effekt-Rumpf, die eingepasste Ansicht wird abgeleitet.
 *
 * KLICK: Pointer-Capture lenkt `pointerup`, `click` und `dblclick` auf die Fläche um, die Karte unter
 * dem Finger ginge verloren. Deshalb merkt sich `pointerdown` die Karte, und ein `pointerup` ohne
 * Bewegung über `KLICK_TOLERANZ` ist der Klick; zwei Klicks auf dieselbe Karte binnen `DOPPEL_MS`
 * sind ein Doppelklick.
 *
 * EINGEPASST BLEIBT EINGEPASST (Umsetzungsplan Phase 2, Entscheidung 18): `eigene === null` heißt
 * „eingepasst", und die Ansicht folgt jedem neuen Layout — gedeckelt auf `maxMassstab`, mit
 * `platzUnten` für die Griffleiste und ohne den Teil, den ein offenes Flyin verdeckt (`flyinGrund`,
 * dieselbe `min(…)`-Regel wie `flyinBreite()`). Erst Zoom, Verschieben, Rad oder Pinch der Nutzerin
 * machen eine eigene Ansicht daraus (`auto: false`); `zeige()` verschiebt automatisch (`auto: true`).
 * Automatische Wechsel gleiten im Editor (`kp-gleitet` am `[data-ansicht]`), eigene nie — sonst
 * hinkte die Zeichnung beim Ziehen dem Finger hinterher.
 */
export interface FlaecheGriff {
  /** Fokus auf die Fläche (Entscheidung 17): nach Flyin-Schließen, Löschen, „Erste Stelle anlegen". */
  fokus(): void;
  /** `rand`: Pixel Luft oben, seitlich und unten — der Editor gibt seitlich und unten mehr, damit auch die Griffe im Bild sind. */
  zeige(k: { x: number; y: number; breite: number; hoehe: number }, rand?: { oben: number; seite: number; unten: number }): void;
}
const KLICK_TOLERANZ = 5;
const DOPPEL_MS = 400;
const SICHTRAND = { oben: 24, seite: 24, unten: 24 };

export function Flaeche({
  daten, symbole, titel, schrift, bedienhinweis, leer, zusatz, ueberlagerung, meldung, onTaste, onKarteKlick,
  gleitend = false, linienSchluessel, griff, werkzeuge, maxMassstab = GRENZEN.max, platzSeite, platzUnten, flyinGrund = null,
}: {
  daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift: string; bedienhinweis: string; leer: ReactNode;
  zusatz?: (k: KarteL) => ReactNode; ueberlagerung?: (a: Ansicht, flaeche: { breite: number; hoehe: number }) => ReactNode;
  meldung?: ReactNode;
  onTaste?: (e: KeyboardEvent<HTMLDivElement>) => boolean; onKarteKlick?: (id: string | null, doppelt: boolean) => void;
  gleitend?: boolean; linienSchluessel?: string; griff?: Ref<FlaecheGriff>; werkzeuge?: ReactNode;
  maxMassstab?: number; platzSeite?: number; platzUnten?: number; flyinGrund?: number | null;
}) {
  const flaeche = useRef<HTMLDivElement>(null);
  // Größe, linke Kante und Fensterbreite aus dem ResizeObserver-Rückruf (kein Messen im Rendern).
  const [groesse, setGroesse] = useState({ b: 0, h: 0, links: 0, fenster: 0 });
  const [eigene, setEigene] = useState<{ a: Ansicht; auto: boolean } | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; karte: string | null; bewegt: boolean } | null>(null);
  const letzterKlick = useRef<{ karte: string | null; zeit: number } | null>(null);

  // Vom Flyin verdeckter Teil der Fläche, rechts (0 ohne Flyin oder ohne Messung).
  const verdeckt = verdeckterTeil(groesse.links + groesse.b, groesse.b, groesse.fenster, flyinGrund);
  const basis = einpassen(daten.breite, daten.hoehe, groesse.b - verdeckt, groesse.h, { max: maxMassstab, seite: platzSeite, unten: platzUnten });
  const a = eigene?.a ?? basis;
  const automatisch = eigene === null || eigene.auto;
  const lage = useRef({ basis, flyinGrund });
  const untergrenzeJetzt = untergrenze(basis);
  useEffect(() => { lage.current = { basis, flyinGrund }; });

  useImperativeHandle(griff, () => ({
    fokus: () => flaeche.current?.focus({ preventScroll: true }),
    zeige: (k, rand = SICHTRAND) => setEigene((alt) => {
      // Eingepasst zeigt schon alles samt Griffrand (`platzSeite`/`platzUnten`): nichts zu tun, und die
      // Ansicht bleibt eingepasst (Entscheidung 18) — durch Bauart, nicht durch Nachrechnen.
      if (alt === null) return alt;
      const el = flaeche.current;
      if (!el || el.clientWidth === 0) return alt;
      // Verdeckter Teil LIVE gemessen: `verdeckt` aus dem Rendern hinkt dem Resize nach, den das Öffnen
      // eines Flyins auslöst (der Editor hält dessen Breite frei), und zöge sonst doppelt ab.
      const r = el.getBoundingClientRect();
      const frei = el.clientWidth - verdeckterTeil(r.right, r.width, window.innerWidth, lage.current.flyinGrund);
      const { dx, dy } = nachziehen(alt.a, k, frei, el.clientHeight, rand);
      if (dx === 0 && dy === 0) return alt;
      return { a: verschiebe(alt.a, dx, dy), auto: true };
    }),
  }), []);

  useEffect(() => {
    const el = flaeche.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom kennt keinen ResizeObserver
    const beobachter = new ResizeObserver(([e]) => setGroesse({
      b: e.contentRect.width, h: e.contentRect.height, links: el.getBoundingClientRect().left, fenster: window.innerWidth,
    }));
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
        const jetzt = alt?.a ?? lage.current.basis;
        return {
          a: e.ctrlKey || e.metaKey
            ? zoome(jetzt, Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top, untergrenze(lage.current.basis))
            : verschiebe(jetzt, -e.deltaX, -e.deltaY),
          auto: false,
        };
      });
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  /** Eigene Ansicht der Nutzerin (Zoom, Verschieben): gleitet nie. */
  const aendere = (f: (x: Ansicht) => Ansicht) => setEigene((alt) => ({ a: f(alt?.a ?? lage.current.basis), auto: false }));
  const zoomUmMitte = (faktor: number) => {
    const el = flaeche.current;
    aendere((x) => zoome(x, faktor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2, untergrenzeJetzt));
  };
  // Bedienelemente IN der Fläche (Umschalter, Griffe, Hinweise, „Erste Stelle anlegen") fangen den
  // Zeiger nicht: Pointer-Capture lenkte sonst das `click` vom Knopf auf die Fläche um.
  const ausgenommen = (ziel: EventTarget) => (ziel as Element).closest("[data-umschalter], [data-griff], [data-meldung], button, a, input, textarea") !== null;

  const unten = (e: PointerEvent<HTMLDivElement>) => {
    if (ausgenommen(e.target)) return; // Umschalter, Griffe und Meldung beginnen kein Ziehen und keinen Klick
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = zeiger.current.size === 1
      ? { x: e.clientX, y: e.clientY, karte: (e.target as Element).closest("[data-karte]")?.getAttribute("data-karte") ?? null, bewegt: false }
      : null; // zweiter Finger: kein Klick
  };
  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    const s = start.current;
    const warKlick = s !== null && !s.bewegt;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > KLICK_TOLERANZ) s.bewegt = true;
    const anderer = [...zeiger.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (anderer) {
      const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y);
      const jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
      const r = e.currentTarget.getBoundingClientRect();
      if (vorher > 0) aendere((x) => zoome(x, jetzt / vorher, (e.clientX + anderer.x) / 2 - r.left, (e.clientY + anderer.y) / 2 - r.top, untergrenzeJetzt));
    } else if (s === null || s.bewegt) {
      // Unter KLICK_TOLERANZ ist es noch ein Klick: die Ansicht bleibt (eingepasst bleibt eingepasst,
      // Entscheidung 18). Beim Überschreiten zählt die GANZE Strecke ab dem Druck — verschoben wird
      // also genau um die Zeigerbewegung (Betrachter.test.tsx, „um genau die Zeigerbewegung").
      const von = warKlick ? s! : alt;
      aendere((x) => verschiebe(x, e.clientX - von.x, e.clientY - von.y));
    }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const los = (e: PointerEvent<HTMLDivElement>) => {
    zeiger.current.delete(e.pointerId);
    const s = start.current;
    start.current = null;
    if (!s || s.bewegt || e.type !== "pointerup" || !onKarteKlick) return;
    const l = letzterKlick.current;
    const doppelt = l !== null && s.karte !== null && l.karte === s.karte && e.timeStamp - l.zeit < DOPPEL_MS;
    letzterKlick.current = doppelt ? null : { karte: s.karte, zeit: e.timeStamp };
    onKarteKlick(s.karte, doppelt);
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (ausgenommen(e.target)) return;
    if (onTaste?.(e)) return;
    const aktion = tasteZuAktion(e.key);
    if (!aktion) return;
    e.preventDefault();
    if (aktion.art === "einpassen") setEigene(null);
    else if (aktion.art === "zoom") zoomUmMitte(aktion.faktor);
    else aendere((x) => verschiebe(x, aktion.dx, aktion.dy));
  };

  const transform = `translate(${a.x} ${a.y}) scale(${a.massstab})`;
  return (
    <div>
      <svg aria-hidden="true" width={0} height={0} style={{ position: "absolute" }}>
        <SymbolDefs symbole={symbole} />
      </svg>
      <div className="kp-werkzeuge">
        <Button onClick={() => zoomUmMitte(1 / SCHRITT)} aria-label="Verkleinern">−</Button>
        <Button onClick={() => zoomUmMitte(SCHRITT)} aria-label="Vergrößern">+</Button>
        <Button onClick={() => setEigene(null)}>Einpassen</Button>
        {werkzeuge}
      </div>
      <div ref={flaeche} className="kp-betrachter" tabIndex={0} role="group" aria-label={`${titel} — ${bedienhinweis}`}
        data-eingepasst={eigene === null ? "true" : "false"}
        onPointerDown={unten} onPointerMove={bewegt} onPointerUp={los} onPointerCancel={los} onKeyDown={taste}>
        {daten.karten.length === 0 ? leer : (
          <svg role="img" aria-label={titel} style={{ fontFamily: schrift }}>
            {/* Das Attribut bleibt (Phase-1-Tests und e2e lesen es); im Editor setzt der CSS-Transform
                denselben Wert, damit automatische Wechsel per `transition` gleiten können. */}
            <g data-ansicht="" transform={transform}
              style={gleitend ? { transform: `translate(${a.x}px, ${a.y}px) scale(${a.massstab})` } : undefined}
              className={gleitend && automatisch ? "kp-gleitet" : undefined}>
              <rect width={daten.breite} height={daten.hoehe} fill={FARBE.papier} />
              <ZeichnungInhalt daten={daten} zusatz={zusatz} gleitend={gleitend} linienSchluessel={linienSchluessel} />
            </g>
          </svg>
        )}
        {ueberlagerung && daten.karten.length > 0
          ? <div className="kp-ueberlagerung">{ueberlagerung(a, { breite: groesse.b - verdeckt, hoehe: groesse.h })}</div>
          : null}
        {meldung ? <div className="kp-meldungsplatz" data-meldung="">{meldung}</div> : null}
      </div>
    </div>
  );
}
