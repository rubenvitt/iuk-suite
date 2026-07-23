"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { App, ConfigProvider } from "antd";
import deDE from "antd/locale/de_DE";
import { buildTheme } from "@/core/theme/theme";
import { themeCookieString, type ThemeMode } from "@/core/theme/mode";

interface ThemeModeApi {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeApi>({ mode: "light", setMode: () => {} });

export function useThemeMode(): ThemeModeApi {
  return useContext(ThemeModeContext);
}

/**
 * Der Provider bekommt den MODUS, nicht die fertige ThemeConfig. Das ist keine
 * Geschmacksfrage: `buildTheme` steckt eine Algorithmus-FUNKTION in die Config,
 * und Funktionen überleben die Server-zu-Client-Grenze nicht. Ein Server-Layout
 * könnte die Config also gar nicht durchreichen.
 *
 * `<App>` ist Pflicht, nicht Zierde: statische Aufrufe von `message`,
 * `notification` und `Modal.confirm` rendern in einen eigenen DOM-Knoten und
 * verlieren dabei Theme und Locale. Innerhalb von `<App>` holt man sich die
 * Instanzen über `App.useApp()` und behält beides.
 */
export function AntdProvider({
  initialMode,
  cookieDomain,
  children,
}: {
  initialMode: ThemeMode;
  cookieDomain?: string;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      document.cookie = themeCookieString(next, cookieDomain);
      // Scrollbalken und native Bedienelemente ziehen sonst nicht mit.
      document.documentElement.style.colorScheme = next;
    },
    [cookieDomain],
  );

  const api = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeModeContext.Provider value={api}>
      <ConfigProvider theme={buildTheme(mode)} locale={deDE}>
        <App>{children}</App>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
