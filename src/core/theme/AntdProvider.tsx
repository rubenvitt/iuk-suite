"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { App, ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import { buildTheme, type ThemeMode, type ThemePreference } from "@/core/theme/theme";
import {
  resolveThemeMode,
  themePreferenceCookieString,
  themeSystemCookieString,
} from "@/core/theme/mode";

interface ThemeModeApi {
  /** Der AUFGELÖSTE Modus. Nie `auto` — daran hängt `buildTheme` und jedes
   *  Modul-CSS über `[data-theme]`. */
  mode: ThemeMode;
  /** Was die Person gewählt hat. Nur der Umschalter braucht das. */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemeModeContext = createContext<ThemeModeApi>({
  mode: "light",
  preference: "auto",
  setPreference: () => {},
});

export function useThemeMode(): ThemeModeApi {
  return useContext(ThemeModeContext);
}

const SYSTEM_ABFRAGE = "(prefers-color-scheme: dark)";

/**
 * Der Provider bekommt den MODUS, nicht die fertige ThemeConfig. Das ist keine
 * Geschmacksfrage: `buildTheme` steckt eine Algorithmus-FUNKTION in die Config,
 * und Funktionen überleben die Server-zu-Client-Grenze nicht. Ein Server-Layout
 * könnte die Config also gar nicht durchreichen.
 *
 * Er bekommt ZUSÄTZLICH die Präferenz, weil der Modus allein die Frage „folgt
 * das dem Gerät?" nicht beantwortet — und genau die entscheidet, ob ein
 * OS-Wechsel während der Sitzung nachgezogen wird.
 *
 * `<App>` ist Pflicht, nicht Zierde: statische Aufrufe von `message`,
 * `notification` und `Modal.confirm` rendern in einen eigenen DOM-Knoten und
 * verlieren dabei Theme und Locale. Innerhalb von `<App>` holt man sich die
 * Instanzen über `App.useApp()` und behält beides.
 */
export function AntdProvider({
  initialMode,
  initialPreference,
  cookieDomain,
  children,
}: {
  initialMode: ThemeMode;
  initialPreference: ThemePreference;
  cookieDomain?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  /**
   * Der aufgelöste Modus, an drei Stellen zugleich — und keine davon ist
   * verzichtbar:
   *   - React-State, weil antd seinen Algorithmus daraus wählt;
   *   - `style.colorScheme`, weil Scrollbalken und native Bedienelemente sonst
   *     nicht mitziehen;
   *   - `dataset.theme`, weil jedes CSS-Modul der Suite daran hängt. Ohne die
   *     letzte Zeile wechselte antd sofort und jede eigene Fläche erst bei der
   *     nächsten Navigation — der Umschalter wäre für sie sichtbar wirkungslos.
   */
  const stempeln = useCallback((next: ThemeMode) => {
    setModeState(next);
    document.documentElement.style.colorScheme = next;
    document.documentElement.dataset.theme = next;
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      document.cookie = themePreferenceCookieString(next, cookieDomain);
      const system: ThemeMode = window.matchMedia(SYSTEM_ABFRAGE).matches ? "dark" : "light";
      stempeln(resolveThemeMode(next, system));
    },
    [cookieDomain, stempeln],
  );

  /**
   * Die Live-Hälfte des Auto-Modus. Das Inline-Script im `<head>` kann sie
   * nicht übernehmen: es läuft einmal beim Laden und sieht keinen Wechsel
   * während der Sitzung.
   *
   * Das Cookie wird IMMER fortgeschrieben, auch bei ausdrücklicher Wahl —
   * sonst gälte beim späteren Zurückschalten auf Auto ein veralteter Wert.
   * Gestempelt wird über `resolveThemeMode`, nicht nur bei `auto`: bei
   * ausdrücklicher Wahl liefert die Funktion die Wahl selbst zurück und der
   * Systemwert bleibt wirkungslos — der Aufruf ist dann ein Leerlauf-Stempel
   * auf den bereits geltenden Modus. Der lohnt sich trotzdem, weil der Effekt
   * schon beim ERSTEN Mount läuft: ohne ihn bliebe `dataset.theme` bis zur
   * nächsten Wahl unangetastet und verließe sich stillschweigend darauf, dass
   * das Server-Markup es schon richtig gesetzt hat. So hält die Komponente
   * ihre eigene Invariante selbst, auch ohne SSR-Vorleistung — und im
   * Auto-Fall ist der Mount-Stempel echt tragend: der Server hatte beim
   * ersten Besuch noch kein Systemwert-Cookie und lieferte `light`.
   *
   * `preference` steht in den Abhängigkeiten (statt in einem Ref): der Effekt
   * hängt sich dann bei jeder Wahl neu ein. Das ist einmal pro Klick und
   * spart die Ref-Synchronisation, bei der man leicht den veralteten Wert
   * liest.
   */
  useEffect(() => {
    const mq = window.matchMedia(SYSTEM_ABFRAGE);
    const nachziehen = () => {
      const system: ThemeMode = mq.matches ? "dark" : "light";
      document.cookie = themeSystemCookieString(system, cookieDomain);
      stempeln(resolveThemeMode(preference, system));
    };
    nachziehen();
    mq.addEventListener("change", nachziehen);
    return () => mq.removeEventListener("change", nachziehen);
  }, [preference, cookieDomain, stempeln]);

  const api = useMemo(
    () => ({ mode, preference, setPreference }),
    [mode, preference, setPreference],
  );

  return (
    <ThemeModeContext.Provider value={api}>
      <ConfigProvider theme={buildTheme(mode)} locale={deDE}>
        <App>{children}</App>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
