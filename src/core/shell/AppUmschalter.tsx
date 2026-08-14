"use client";

import { useMemo, useRef, useState } from "react";
import { AppstoreOutlined, DownOutlined, LinkOutlined, SearchOutlined } from "@ant-design/icons";

import { ICONS } from "@/core/shell/icons";
import { SCHRIFT } from "@/core/theme/schrift";
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
  portalHref,
}: {
  modulTitel: string;
  modulKey: string;
  eintraege: LauncherEintrag[];
  /**
   * Fertiger Link auf die Portal-Startseite (§4 Punkt 4 des Entwurfs), oder
   * `null`, wenn `moduleUrl("portal")` keinen liefert (Prod ohne konfigurierten
   * Host). `AppUmschalter` ist eine Client-Insel und darf `process.env` nicht
   * lesen — `SuiteHeader` reicht den fertigen `href` genauso durch wie bei den
   * Einträgen selbst.
   */
  portalHref: string | null;
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
        {/* Dieselbe Typo-Rolle wie der anonyme Titel-Link in `SuiteHeader` —
            sonst sähe der Modulname angemeldet anders aus als abgemeldet, und
            das wäre weder gewollt noch erklärbar. `SCHRIFT` liegt in einem
            Modul ohne `"use client"`; einen Wert von dort in eine Client-Insel
            zu ziehen ist die unproblematische Richtung — verboten ist die
            umgekehrte (Falle 6). */}
        <strong
          data-testid="module-title"
          style={{ ...SCHRIFT.unterTitel, letterSpacing: "0.07em" }}
        >
          {modulTitel}
        </strong>
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
              // Zwei Zustände, eine Bedingung — und sie sind NICHT dasselbe
              // (Befund 3): eine leere Suche ist keine gescheiterte Suche.
              // Ist `suche` leer, kann `abschnitte` nur leer sein, weil
              // `eintraege` es schon ist (`gefiltert` liefert dann `eintraege`
              // unveraendert zurueck) — der Zweig unten sagt deshalb nie etwas
              // Falsches ueber eine Suche, die nie stattfand.
              suche.trim() ? (
                <p data-testid="app-leer" className={s.umschalterLeer}>
                  Nichts gefunden für „{suche}“.
                </p>
              ) : (
                <p data-testid="app-ohne-eintraege" className={s.umschalterLeer}>
                  Für dich ist noch nichts freigeschaltet.
                </p>
              )
            ) : (
              abschnitte.map(([titel, liste]) => (
                <div key={titel}>
                  {/* Die Rolle als INLINE-STIL, die Polsterung und Farbe als
                      Klasse: `core/theme/schrift.ts` ist die eine Quelle fuer
                      Typografie, und eine zweite Abschrift von `kicker` in
                      `shell.module.css` waere genau die Doppelung, gegen die
                      die Rollen-Datei gebaut ist. `SCHRIFT` liegt in einem
                      Modul ohne `"use client"`; von einer Client-Insel dorthin
                      zu greifen ist die unproblematische Richtung (Falle 6
                      verbietet die umgekehrte). */}
                  <div
                    data-testid="app-abschnitt"
                    className={s.umschalterAbschnitt}
                    style={SCHRIFT.kicker}
                  >
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
                            <img
                              src={e.iconUrl}
                              alt=""
                              className={s.appEintragBild}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                          {/* Die Klasse ist nicht kosmetisch: sie erlaubt dem
                              Textblock, unter seine Inhaltsbreite zu schrumpfen
                              (`min-inline-size: 0`, Begründung an der Regel in
                              `shell.module.css`). Ohne sie schiebt ein langer
                              Dienstname das Panel über den Bildschirmrand
                              hinaus. */}
                          <span className={s.appEintragTexte}>
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

            {/*
             * FUSSZEILE, IN JEDEM ZUSTAND DES PANELS (§4 Punkt 4 des Entwurfs)
             * — mit Treffern, ohne Treffer und ohne Einträge. Deshalb AUSSERHALB
             * der Ternäre oben, nicht als ihr dritter Zweig: sie beantwortet
             * nicht „was zeigt die Liste", sondern „wo geht's weiter", und das
             * gilt unabhängig davon, was die Liste gerade zeigt. Für „Suche ohne
             * Treffer" ist das zugleich der in §6.2 verlangte Weg ins Portal.
             *
             * Kein `href`, keine Fußzeile: `moduleUrl("portal")` liefert `null`,
             * wenn Prod keinen Host für `portal` konfiguriert hat — ein toter
             * Link wäre schlechter als keiner.
             */}
            {portalHref ? (
              <a
                data-testid="app-fusszeile"
                className={s.umschalterFusszeile}
                href={portalHref}
              >
                Alle Apps im Portal
              </a>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
