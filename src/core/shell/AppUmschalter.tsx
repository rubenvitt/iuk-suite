"use client";

import { useMemo, useRef, useState } from "react";
import { AppstoreOutlined, DownOutlined, LinkOutlined, SearchOutlined } from "@ant-design/icons";

import { ICONS } from "@/core/shell/icons";
import type { LauncherEintrag } from "@/core/shell/types";
import s from "./shell.module.css";

/**
 * DER APP-UMSCHALTER — der Modultitel IST der Auslöser.
 *
 * Die Kopfzeile trug bis hierher jedes sichtbare Modul als eigenen Knopf. Bei
 * zwei Modulen war das eine Liste, bei acht eine Wand; und der Entwurf von
 * 2026-07-27 hatte das vorhergesehen, ohne es zu lösen.
 *
 * DIE ICON-AUFLÖSUNG FINDET NUR HIER STATT. `@ant-design/icons` in einer Server
 * Component ergibt HTTP 500 SCHON BEIM IMPORT, den weder `typecheck` noch
 * `build` noch Vitest sieht (`docs/design/README.md`, Falle 7). `SuiteHeader`
 * bleibt Server Component und übergibt nur NAMEN.
 *
 * DAS PANEL ENTSTEHT NUR, WENN ES OFFEN IST — und das ist keine Sparmaßnahme:
 * ein serverseitig aufgebautes Portal-Element hat kein `document` ("Portal only
 * work in client side"), und der folgende Hydration-Mismatch hat auf diesem
 * Zweig schon einmal die anonymen QR-Formulare unbenutzbar gemacht. Hier
 * entsteht geschlossen nur der Knopf. Deshalb auch kein antd `Dropdown`: der
 * Zustand muss ohnehin selbst gehalten werden, damit `aria-expanded` am
 * Auslöser stehen kann.
 *
 * DIE EINTRÄGE TRAGEN EINE EIGENE KLASSE (`.appEintrag`), NICHT `.navLink`.
 * Auf einer Unterseite markieren Modulnavigation und Panel gleichzeitig; beides
 * ist wahr, aber `.navLink[aria-current]` trägt die Unterstreichung der
 * Navigation, und ein Playwright-Locator auf `[aria-current]` fände sonst zwei
 * Knoten (Strict-Mode-Verletzung, dieselbe Falle wie bei theme-toggle).
 *
 * BEWUSST OHNE MENÜROLLEN (`role="menu"` / `role="menuitem"`). Das Panel trägt
 * ein Suchfeld, und ein Textfeld ist im ARIA-Menümodell gar nicht vorgesehen:
 * Screenreader schalten bei `role="menu"` aus dem gewohnten Lesemodus in eine
 * Menüsteuerung, in der Tippen Befehle auslöst statt Text einzugeben — dazu
 * verlangt die Rolle ein Tastaturmodell (Pfeiltasten zwischen Einträgen,
 * Home/End, Typeahead, `tabindex="-1"` an den Einträgen), das hier nicht
 * nachgebaut wird. Eine deklarierte Rolle ohne das passende Tastaturmodell ist
 * irreführender als gar keine Rolle. Stattdessen ist das Panel eine schlichte
 * aufklappbare Gruppe aus Suchfeld und Links: `<a href>` bringt die Rolle
 * „link“ von selbst mit, `aria-haspopup="true"` sagt nur „hier klappt etwas
 * auf“ an, und die Bedienung trägt die normale Tab-Reihenfolge.
 */
export function AppUmschalter({
  modulTitel,
  modulKey,
  eintraege,
}: {
  modulTitel: string;
  modulKey: string;
  eintraege: LauncherEintrag[];
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const ausloeser = useRef<HTMLButtonElement>(null);

  const gefiltert = useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    if (!nadel) return eintraege;
    return eintraege.filter(
      (e) =>
        e.title.toLowerCase().includes(nadel) ||
        (e.beschreibung?.toLowerCase().includes(nadel) ?? false),
    );
  }, [eintraege, suche]);

  // Reihenfolge der Abschnitte = Reihenfolge des ersten Auftretens. Sie kommt
  // aus `mischeEintraege` und wird hier nur nachgezeichnet, nicht neu erfunden.
  const abschnitte = useMemo(() => {
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of gefiltert) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [gefiltert]);

  function schliessen() {
    setOffen(false);
    setSuche("");
    ausloeser.current?.focus();
  }

  return (
    <div
      className={s.umschalter}
      onKeyDown={(e) => {
        if (e.key === "Escape" && offen) schliessen();
      }}
    >
      <button
        ref={ausloeser}
        type="button"
        data-testid="app-umschalter"
        className={s.umschalterAusloeser}
        aria-haspopup="true"
        aria-expanded={offen}
        onClick={() => setOffen((v) => !v)}
      >
        <strong data-testid="module-title">{modulTitel}</strong>
        <DownOutlined className={s.umschalterPfeil} aria-hidden="true" />
      </button>

      {offen ? (
        <>
          {/* Fangfläche zum Schließen per Klick daneben. `aria-hidden`, weil
              der Weg für die Tastatur `Escape` ist — ein fokussierbarer
              Knoten hier wäre eine Station ohne Bedeutung. */}
          <div className={s.umschalterFang} aria-hidden="true" onClick={schliessen} />
          <div data-testid="app-panel" className={s.umschalterPanel}>
            <label className={s.umschalterSuchfeld}>
              <SearchOutlined aria-hidden="true" />
              <input
                data-testid="app-suche"
                type="search"
                value={suche}
                autoFocus
                placeholder="Apps und Dienste durchsuchen"
                aria-label="Apps und Dienste durchsuchen"
                onChange={(e) => setSuche(e.target.value)}
              />
            </label>

            {abschnitte.length === 0 ? (
              <p data-testid="app-leer" className={s.umschalterLeer}>
                Nichts gefunden für „{suche}“.
              </p>
            ) : (
              abschnitte.map(([titel, liste]) => (
                <div key={titel}>
                  <div data-testid="app-abschnitt" className={s.umschalterAbschnitt}>
                    {titel}
                  </div>
                  <div className={s.umschalterListe}>
                    {liste.map((e) => {
                      const Icon = e.icon ? (ICONS[e.icon] ?? AppstoreOutlined) : LinkOutlined;
                      return (
                        <a
                          key={e.key}
                          data-testid="app-eintrag"
                          className={s.appEintrag}
                          href={e.href}
                          target={e.extern ? "_blank" : undefined}
                          rel={e.extern ? "noopener noreferrer" : undefined}
                          aria-current={e.key === modulKey ? "true" : undefined}
                        >
                          {e.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.iconUrl} alt="" className={s.appEintragBild} />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                          <span>
                            <span className={s.appEintragTitel}>{e.title}</span>
                            {e.beschreibung ? (
                              <span className={s.appEintragText}>{e.beschreibung}</span>
                            ) : null}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
