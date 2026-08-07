import { readFileSync } from "node:fs";
import type { ComponentProps, ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import { LAGERBUCH_NAV } from "../_lib/nav";
import s from "./verwaltung.module.css";
import { VerwaltungsRahmen } from "./VerwaltungsRahmen";

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx",
  "utf8",
);
const CODE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("VerwaltungsRahmen", () => {
  it("bleibt eine Server Component ohne eigenen antd-Zugriff", () => {
    expect(CODE).not.toMatch(/^\s*["']use client["'];?/m);
    expect(CODE).not.toMatch(/from\s+["'](?:antd(?:\/|["'])|@ant-design\/icons)/);
  });

  it("nimmt die Shell-Variante aus der Lagerbuch-Registry", () => {
    expect(CODE).toMatch(/getModule\s*\(\s*["']lagerbuch["']\s*\)/);
    expect(CODE).toMatch(/variant\s*=\s*\{\s*mod\.shell\s*\}/);
    expect(CODE).toMatch(/moduleKey\s*=\s*["']lagerbuch["']/);
    expect(CODE).not.toMatch(/variant\s*=\s*["']full["']/);
  });

  it("haelt `nav` als Pflichtprop ohne `undefined`-Ausweg", () => {
    type Props = ComponentProps<typeof VerwaltungsRahmen>;
    type NavIstOptional = Pick<Props, "nav"> extends Required<Pick<Props, "nav">>
      ? false
      : true;
    type NavErlaubtUndefined = undefined extends Props["nav"] ? true : false;

    const navIstOptional: NavIstOptional = false;
    const navErlaubtUndefined: NavErlaubtUndefined = false;

    expect(navIstOptional).toBe(false);
    expect(navErlaubtUndefined).toBe(false);
    expect(CODE).toMatch(/\bnav\s*:\s*SuiteNavItem\[\]\s*;/);
    expect(CODE).not.toMatch(/\bnav\s*\?\s*:/);
  });

  it("traegt Modul-CSS, Shell, Navigation und Kinder an einer Stelle", () => {
    const kind = <span data-testid="lagerbuch-kind">Inhalt</span>;
    const aussen = VerwaltungsRahmen({ nav: LAGERBUCH_NAV, children: kind }) as ReactElement<{
      className: string;
      children: ReactElement<{
        variant: string;
        moduleKey: string;
        nav: unknown;
        children: unknown;
      }>;
    }>;

    expect(CODE).toMatch(/import\s+s\s+from\s+["']\.\/verwaltung\.module\.css["']/);
    expect(aussen.type).toBe("div");
    expect(aussen.props.className).toBe(s.modul);

    const innen = aussen.props.children;
    expect(innen.type).toBe(Shell);
    expect(innen.props.variant).toBe(getModule("lagerbuch").shell);
    expect(innen.props.moduleKey).toBe("lagerbuch");
    expect(innen.props.nav).toBe(LAGERBUCH_NAV);
    expect(innen.props.children).toBe(kind);
  });
});
