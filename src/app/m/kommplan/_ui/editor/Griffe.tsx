"use client";

import { Button, ConfigProvider, Tooltip, type ThemeConfig } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/**
 * GRIFFE DER AUSWAHL (Spec §6.3, Entscheidung 5): eine HTML-Überlagerung in Pixeln über dem SVG —
 * die Knöpfe behalten bei jedem Zoom ihre 44 px und sind echte Buttons mit Namen. Seitlich „+ links"
 * und „+ rechts" (Seitenstelle, mit Tooltip bei Zeigen und Fokus; vorher ein unbeschriftetes „+" mit
 * Anbindungssymbol, Sichtprüfung Phase 2 → Umsetzungsplan Phase 3), unten die Griffleiste
 * „+ Unterstelle", „+ Einheit", „Bearbeiten". Eine Seitenstelle trägt nichts (§4.2): dort nur
 * „+ Einheit" und „Bearbeiten".
 *
 * DIE GRIFFLEISTE steht in Koordinaten der Überlagerung, nicht der Karte, und wird per `clamp()` im
 * `translateX` im Bild gehalten: `-50%` (mittig) zwischen „linke Kante ≥ 8 px" und „rechte Kante ≤
 * Breite − 8 px"; Prozent im `translate` beziehen sich auf die Leiste selbst, gemessen wird also nichts.
 * Ist die Leiste breiter als die Fläche, gewinnt der linke Anschlag, und sie bricht um (`flex-wrap`).
 *
 * KOMPAKT (Review Phase 3): weniger Innenabstand über den Button-Token (Falle 5: Token statt CSS; die
 * Höhe bleibt 44 px, Falle 4) und 4 px Lücke. Die Seitengriffe enden nie unter der Kartenunterkante —
 * eine eingepasste Karte am Telefon ist kaum 30 px hoch, mittig gesetzt lagen sie auf der Griffleiste.
 * Dass die Griffe an der Karte Nachbarkarten berühren, bleibt (Entscheidung 18, offen beim Hauptlauf).
 */
const KOMPAKT: ThemeConfig = { components: { Button: { paddingInline: 10 } } };
/** Höhe eines Griffs (ARBEITSDICHTE, `core/theme/theme.ts`). */
const GRIFF_HOEHE = 44;
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const links = ansicht.x + karte.x * m, oben = ansicht.y + karte.y * m, breite = karte.breite * m, hoehe = karte.hoehe * m;
  const mitte = links + breite / 2;
  const seiteOben = Math.min(hoehe / 2 - GRIFF_HOEHE / 2, hoehe - GRIFF_HOEHE); // Unterkante ≤ Kartenunterkante
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <Button data-griff={seite} className={`kp-griff-seite kp-griff-${seite}`} style={{ top: seiteOben }} aria-label={`Seitenstelle ${seite} von ${titel} anlegen`}
        onClick={() => onSeitenstelle(seite)}>{`+ ${seite}`}</Button>
    </Tooltip>
  );
  return (
    <ConfigProvider theme={KOMPAKT}>
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
    </ConfigProvider>
  );
}
