"use client";

import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  DesktopOutlined,
  GlobalOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Space } from "antd";
import type { ComponentType } from "react";

import { SPACE } from "@/core/theme/tokens";
// Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
// Deckt die aktuell in MODULES verwendeten Namen ab; unbekannte Namen fallen
// auf AppstoreOutlined zurück statt den Render zu crashen.
const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
};

export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

// Always-visible Raster von Modul-Links (Waffel). Bewusst NICHT hinter einem
// geschlossenen Dropdown/Popup versteckt: keystone.spec.ts prüft
// `page.getByRole("link", { name: /Alpha/ }).toBeVisible()` ohne vorheriges
// Öffnen — die Links müssen also beim Seitenaufbau direkt sichtbar sein.
// Deshalb `Button href=…` (rendert ein <a>, Rolle "link") statt Menu/Dropdown.
export function AppSwitcher({
  entries,
  userName,
}: {
  entries: AppSwitcherEntry[];
  userName: string | null;
}) {
  const initials = (userName ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Space size="middle" data-testid="app-switcher">
      {/* Die installierte antd-Version kennt an `Space` kein `component`-Prop
          (rendert immer ein div) — deshalb hier ein natives <nav>, das
          aria-label="Module" trägt, mit Space-gleichem Flex-Wrap-Layout. */}
      <nav aria-label="Module" style={{ display: "flex", flexWrap: "wrap", gap: SPACE.xs }}>
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon] ?? AppstoreOutlined;
          return (
            <Button key={entry.key} type="text" href={entry.href} icon={<Icon />}>
              {entry.title}
            </Button>
          );
        })}
      </nav>
      {userName ? <Avatar size="small">{initials}</Avatar> : null}
    </Space>
  );
}
