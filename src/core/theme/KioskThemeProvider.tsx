"use client";

import { ConfigProvider } from "antd";
import { buildTheme } from "@/core/theme/theme";
import { useThemeMode } from "@/core/theme/AntdProvider";
import { TAP_XL } from "@/core/theme/tokens";

/**
 * Wandmonitor-Theme: erbt Farben und Algorithmus vom Suite-Theme, vergrößert
 * aber Schrift und Bedienelemente — ein Kiosk wird aus mehreren Metern
 * Entfernung gelesen, nicht aus Armlänge.
 *
 * Eigene Client-Komponente, weil `buildTheme()` eine Algorithmus-FUNKTION in
 * die Config legt und Funktionen die Server-zu-Client-Grenze nicht überleben.
 * Die Server-Shell könnte die Config also nicht als Prop durchreichen.
 */
export function KioskThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const base = buildTheme(mode);

  return (
    <ConfigProvider
      theme={{
        ...base,
        token: {
          ...base.token,
          fontSize: 20,
          fontSizeHeading1: 48,
          controlHeight: TAP_XL,
          controlHeightLG: TAP_XL + 24,
        },
      }}
      componentSize="large"
    >
      {children}
    </ConfigProvider>
  );
}
