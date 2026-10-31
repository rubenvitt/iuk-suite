"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Input, Modal, type InputRef } from "antd";

import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { befehle, istPalettenKuerzel, type Befehl } from "@/core/shell/befehle";
import type { LauncherEintrag, SuiteNavItem } from "@/core/shell/types";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "./shell.module.css";

/**
 * DIE BEFEHLSPALETTE (IDA-303): Strg+K, unter macOS ⌘K, auf jeder angemeldeten Seite der Suite —
 * und für Telefon und Maus derselbe Weg über den Lupen-Knopf in der Kopfzeile.
 *
 * Sie zeigt nur Daten, die `SuiteHeader` schon nach Rechten gefiltert hat (Seiten des Moduls, Apps
 * und Dienste), und reicht einen Suchbegriff an die suiteweite Suche des Portals weiter. Sie fragt
 * selbst keinen Server; die Ableitung steht in `befehle.ts`.
 *
 * Navigiert wird per `window.location`, nicht per Router: fast jedes Ziel liegt auf einem anderen
 * Host (anderes Modul), und dort hilft der Client-Router nicht.
 */
const ohneAbo = () => () => {};
const istMac = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/**
 * Das Kürzel, wie es auf diesem Gerät heißt: „⌘K“ am Mac, sonst „Strg+K“. Server und erste
 * Hydration sagen „Strg+K“; erst der Browser weiß, ob es ein Mac ist. Auch das Suchfeld der
 * Portal-Startseite zeigt es an.
 */
export function usePalettenKuerzel(): string {
  return useSyncExternalStore(ohneAbo, istMac, () => false) ? "⌘K" : "Strg+K";
}

export function Befehlspalette({
  nav,
  eintraege,
  suchHref,
}: {
  nav: SuiteNavItem[];
  eintraege: LauncherEintrag[];
  suchHref: string | null;
}) {
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const kuerzel = usePalettenKuerzel();
  const feld = useRef<InputRef>(null);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (!istPalettenKuerzel(e)) return;
      e.preventDefault();
      setEingabe("");
      setAktiv(0);
      setOffen((war) => !war);
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  function oeffnen() {
    setEingabe("");
    setAktiv(0);
    setOffen(true);
  }

  const liste = useMemo(() => befehle({ eingabe, nav, eintraege, suchHref }), [eingabe, nav, eintraege, suchHref]);
  const gewaehlt = Math.min(aktiv, Math.max(liste.length - 1, 0));

  function ausfuehren(b: Befehl | undefined) {
    if (!b) return;
    setOffen(false);
    if (b.extern) window.open(b.href, "_blank", "noopener,noreferrer");
    else window.location.assign(b.href);
  }

  function tasteImFeld(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktiv((gewaehlt + 1) % Math.max(liste.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((gewaehlt - 1 + liste.length) % Math.max(liste.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ausfuehren(liste[gewaehlt]);
    }
  }

  const listenId = "befehlspalette-liste";

  return (
    <>
      <Button
        type="text"
        shape="circle"
        data-testid="befehlspalette-knopf"
        aria-label={`Suchen und springen (${kuerzel})`}
        title={`Suchen und springen (${kuerzel})`}
        icon={<Icons8Ikone name="search" />}
        onClick={oeffnen}
      />
      <Modal
        open={offen}
        onCancel={() => setOffen(false)}
        footer={null}
        closable={false}
        destroyOnHidden
        width={560}
        style={{ top: 72 }}
        styles={{ body: { lineHeight: "normal" } }}
        afterOpenChange={(jetzt) => {
          // Spät, nach der Animation (Falle 24): nur fokussieren, wenn der Fokus nicht schon im Feld ist.
          if (jetzt && document.activeElement !== feld.current?.input) feld.current?.focus();
        }}
        aria-label="Befehlspalette"
      >
        <div data-testid="befehlspalette" style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <Input
            ref={feld}
            autoFocus
            data-testid="befehlspalette-eingabe"
            value={eingabe}
            onChange={(e) => {
              setEingabe(e.target.value);
              setAktiv(0);
            }}
            onKeyDown={tasteImFeld}
            placeholder="Seite, App oder Suchbegriff …"
            aria-label="Seite, App oder Suchbegriff"
            role="combobox"
            aria-expanded
            aria-controls={listenId}
            aria-activedescendant={liste[gewaehlt] ? `befehl-${gewaehlt}` : undefined}
            prefix={<Icons8Ikone name="search" />}
            autoComplete="off"
          />
          {liste.length === 0 ? (
            <p data-testid="befehlspalette-leer" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: 0 }}>
              Nichts passt. Für die Suche in allen Modulen mindestens zwei Zeichen eingeben.
            </p>
          ) : (
            <ul id={listenId} role="listbox" aria-label="Treffer" className={s.paletteListe}>
              {liste.map((b, i) => {
                const kopf = i === 0 || liste[i - 1].gruppe !== b.gruppe ? b.gruppe : null;
                return (
                  <li key={b.key} role="presentation">
                    {kopf ? (
                      <div role="presentation" className={s.paletteGruppe} style={SCHRIFT.kicker}>
                        {kopf}
                      </div>
                    ) : null}
                    <div
                      id={`befehl-${i}`}
                      role="option"
                      aria-selected={i === gewaehlt}
                      data-testid="befehl"
                      data-aktiv={i === gewaehlt ? "" : undefined}
                      className={s.paletteEintrag}
                      onMouseMove={() => i !== gewaehlt && setAktiv(i)}
                      onClick={() => ausfuehren(b)}
                    >
                      <span style={{ minInlineSize: 0, overflowWrap: "anywhere" }}>{b.titel}</span>
                      {b.hinweis ? <span className={s.paletteHinweis}>{b.hinweis}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
