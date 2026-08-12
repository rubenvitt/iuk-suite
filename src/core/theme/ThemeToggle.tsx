"use client";

import { Button, Tooltip } from "antd";
import { BulbFilled, BulbOutlined, DesktopOutlined } from "@ant-design/icons";
import { useThemeMode } from "@/core/theme/AntdProvider";
import type { ThemePreference } from "@/core/theme/theme";

/** Ein Knopf, drei Zustände: jeder Klick geht einen Schritt weiter. */
const NAECHSTE: Record<ThemePreference, ThemePreference> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

/** Der geltende Zustand — mit dem Zusatz, der `auto` überhaupt erklärt. */
const LANG: Record<ThemePreference, string> = {
  auto: "Automatisch (folgt dem Gerät)",
  light: "Hell",
  dark: "Dunkel",
};

/** Das Ziel des nächsten Klicks. Kurz, sonst wird das Label unlesbar. */
const KURZ: Record<ThemePreference, string> = {
  auto: "Automatisch",
  light: "Hell",
  dark: "Dunkel",
};

/**
 * Das Icon zeigt, was GILT — nicht, was der Klick tut. Die Glühbirnen sind aus
 * dem Zwei-Zustands-Umschalter übernommen; `DesktopOutlined` für `auto` sagt
 * „das Gerät entscheidet".
 */
const ICON: Record<ThemePreference, React.ReactNode> = {
  auto: <DesktopOutlined />,
  light: <BulbOutlined />,
  dark: <BulbFilled />,
};

export function ThemeToggle({ testId = "theme-toggle" }: { testId?: string } = {}) {
  const { preference, setPreference } = useThemeMode();
  const naechste = NAECHSTE[preference];
  /*
   * BEIDES im Label, und das ist der Unterschied zum Vorgänger: bei zwei
   * Zuständen genügte das Ziel ("Dunkles Design"), weil es nur eine Richtung
   * gab. Bei dreien muss man wissen, wo man steht — sonst ist jeder Klick ein
   * Versuch. Für Screenreader ist es die einzige Auskunft überhaupt.
   */
  const label = `Design: ${LANG[preference]} — weiter zu ${KURZ[naechste]}`;

  return (
    <Tooltip title={label}>
      <Button
        type="text"
        shape="circle"
        data-testid={testId}
        aria-label={label}
        icon={ICON[preference]}
        onClick={() => setPreference(naechste)}
      />
    </Tooltip>
  );
}
