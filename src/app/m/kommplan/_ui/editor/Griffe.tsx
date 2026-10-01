"use client";

import { Button, ConfigProvider, Tooltip, type ThemeConfig } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/**
 * Lage der Auswahlleiste: `abstand` px vom oberen und linken Rand der Fläche, `hoehe` = 44 px Knopf
 * (FullShell, Falle 4) + 2 × (5 px Innenabstand + 1 px Rand). Die Leiste bricht nie um — nur so ist ihre
 * Höhe fest, und der Editor kann sie beim Einpassen freihalten (`GRIFF_RAND.oben`).
 */
export const AUSWAHLLEISTE = { abstand: 8, hoehe: 56 } as const;
/** Kompakt über den Button-Token (Falle 5: Token statt CSS; die Höhe bleibt 44 px) — die Leiste ist so am Telefon kürzer. */
const KOMPAKT: ThemeConfig = { components: { Button: { paddingInline: 10 } } };

/**
 * GRIFFE DER AUSWAHL (Spec §6.3; Phase 3, Entscheidung 18 — vom Hauptlauf bestätigt; Phase 4, Entscheidung 15).
 * An der Karte steht nur der Auswahlrahmen; er liegt im Abstand zwischen den Karten. Alle Griffe stehen in der
 * AUSWAHLLEISTE oben links in der Fläche: an der Karte gibt es geometrisch keinen Platz für 44-px-Ziele, ohne
 * Nachbarkarten, Einheiten oder Kanalsechsecke zu verdecken (am Tablet sind zwei Karten ≈ 15 px auseinander).
 * Eingepasst hält die Fläche den Streifen der Leiste frei (`platzOben`); gezoomt holt `zeige()` die gewählte
 * Karte unter die Leiste. Seitengriffe „+ links"/„+ rechts" mit Tooltip bei Zeigen und Fokus; eine
 * Seitenstelle trägt nichts (§4.2): dort nur „Bearbeiten" und „+ Einheit". „Bearbeiten" steht VORN: am Telefon
 * liegt das Ende der Leiste außerhalb des Bildes, und dort ist das Diagramm für kleine Korrekturen da (§6.5).
 * `role="group"`, nicht „toolbar": jeder Knopf ist ein eigener Tabstopp, Pfeiltasten tun nichts — eine Toolbar
 * verspräche Screenreadern ein Bedienmuster, das hier nicht gebaut ist.
 */
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <Button data-griff={seite} aria-label={`Seitenstelle ${seite} von ${titel} anlegen`} onClick={() => onSeitenstelle(seite)}>{`+ ${seite}`}</Button>
    </Tooltip>
  );
  return (
    <ConfigProvider theme={KOMPAKT}>
      <div className="kp-griffe" data-griffe={karte.id}>
        <div className="kp-griffe-karte" style={{ left: ansicht.x + karte.x * m, top: ansicht.y + karte.y * m, width: karte.breite * m, height: karte.hoehe * m }}>
          <div className="kp-auswahlrahmen" aria-hidden="true" />
        </div>
        <div className="kp-auswahlleiste" data-auswahlleiste="" role="group" aria-label={`Auswahl: ${titel}`}
          style={{ maxWidth: Math.max(0, flaeche.breite - 2 * AUSWAHLLEISTE.abstand) }}>
          <span className="kp-auswahl-name" title={titel}>{titel}</span>
          <Button data-griff="bearbeiten" onClick={onBearbeiten}>Bearbeiten</Button>
          {seitenstelle ? null : <Button data-griff="unter" onClick={onUnterstelle}>+ Unterstelle</Button>}
          <Button data-griff="einheit" onClick={onEinheit}>+ Einheit</Button>
          {seitenstelle ? null : <>{seitlich("links")}{seitlich("rechts")}</>}
        </div>
      </div>
    </ConfigProvider>
  );
}
