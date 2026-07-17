"use client";

import {
  LayoutGrid,
  Square,
  Triangle,
  Circle,
  Monitor,
  Grid3x3,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Icon-Name (aus ModuleDef.icon, Registry) -> lucide-react Komponente.
// Deckt die aktuell in MODULES verwendeten Namen ab; unbekannte Namen fallen
// auf Grid3x3 zurück statt den Render zu crashen.
const ICONS: Record<string, LucideIcon> = {
  LayoutGrid,
  Square,
  Triangle,
  Circle,
  Monitor,
};

export interface AppSwitcherEntry {
  key: string;
  title: string;
  icon: string;
  href: string;
}

// Always-visible Raster von Modul-Links (Waffel). Bewusst NICHT hinter einem
// geschlossenen Dropdown/Popup versteckt: Task 10 prüft
// `page.getByRole("link", { name: /Alpha/ }).toBeVisible()` ohne vorheriges
// Öffnen — die Links müssen also beim Seitenaufbau direkt sichtbar sein.
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
    <div className="flex items-center gap-3" data-testid="app-switcher">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Module">
        {entries.map((entry) => {
          const Icon = ICONS[entry.icon] ?? Grid3x3;
          return (
            <a
              key={entry.key}
              href={entry.href}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
              <span>{entry.title}</span>
            </a>
          );
        })}
      </nav>
      {userName ? (
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  );
}
