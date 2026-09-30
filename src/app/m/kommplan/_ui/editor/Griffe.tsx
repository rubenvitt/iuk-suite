"use client";

import { Button, Tooltip } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/** Eine waagerechte Anbindung mit Kästchen — zeigt Sehenden, dass „+" hier eine SEITENstelle ist, keine Stelle am Bus (Kritik). */
function SeitenSymbol({ seite }: { seite: "links" | "rechts" }) {
  return (
    <svg aria-hidden="true" width={16} height={12} viewBox="0 0 16 12" style={seite === "links" ? { transform: "scaleX(-1)" } : undefined}>
      <line x1={0} y1={6} x2={8} y2={6} stroke="currentColor" strokeWidth={1.5} />
      <rect x={8.75} y={2.75} width={6.5} height={6.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * GRIFFE DER AUSWAHL (Spec §6.3, Entscheidung 5): eine HTML-Überlagerung in Pixeln über dem SVG —
 * die Knöpfe behalten bei jedem Zoom ihre 44 px und sind echte Buttons mit Namen. Seitlich „+"
 * (Seitenstelle links/rechts, mit Tooltip bei Zeigen und Fokus und Symbol), unten die Griffleiste
 * „+ Unterstelle", „+ Einheit", „Bearbeiten". Eine Seitenstelle trägt nichts (§4.2): dort nur
 * „+ Einheit" und „Bearbeiten".
 *
 * DIE GRIFFLEISTE steht in Koordinaten der Überlagerung, nicht der Karte, und wird per `clamp()` im
 * `translateX` im Bild gehalten: `-50%` (mittig) zwischen „linke Kante ≥ 8 px" und „rechte Kante ≤
 * Breite − 8 px"; Prozent im `translate` beziehen sich auf die Leiste selbst, gemessen wird also nichts.
 * Ist die Leiste breiter als die Fläche, gewinnt der linke Anschlag, und sie bricht um (`flex-wrap`).
 */
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const links = ansicht.x + karte.x * m, oben = ansicht.y + karte.y * m, breite = karte.breite * m, hoehe = karte.hoehe * m;
  const mitte = links + breite / 2;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <Button data-griff={seite} className={`kp-griff-seite kp-griff-${seite}`} aria-label={`Seitenstelle ${seite} von ${titel} anlegen`}
        onClick={() => onSeitenstelle(seite)}>
        {seite === "links" ? <><span aria-hidden="true">+</span><SeitenSymbol seite="links" /></> : <><SeitenSymbol seite="rechts" /><span aria-hidden="true">+</span></>}
      </Button>
    </Tooltip>
  );
  return (
    <div className="kp-griffe" data-griffe={karte.id}>
      <div className="kp-griffe-karte" style={{ left: links, top: oben, width: breite, height: hoehe }}>
        <div className="kp-auswahlrahmen" aria-hidden="true" />
        {seitenstelle ? null : <>{seitlich("links")}{seitlich("rechts")}</>}
      </div>
      <div className="kp-griffleiste" role="toolbar" aria-label={`Auswahl: ${titel}`}
        style={{
          left: mitte, top: oben + hoehe + 8, maxWidth: Math.max(0, flaeche.breite - 16),
          transform: `translateX(clamp(${8 - mitte}px, -50%, calc(${flaeche.breite - mitte - 8}px - 100%)))`,
        }}>
        {seitenstelle ? null : <Button data-griff="unter" onClick={onUnterstelle}>+ Unterstelle</Button>}
        <Button data-griff="einheit" onClick={onEinheit}>+ Einheit</Button>
        <Button data-griff="bearbeiten" onClick={onBearbeiten}>Bearbeiten</Button>
      </div>
    </div>
  );
}
