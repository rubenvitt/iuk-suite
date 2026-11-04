import type { HTMLAttributes, ReactNode } from "react";

import s from "./seite.module.css";

/**
 * DIE VIER SEITENTYPEN UNTER `FullShell` (Haarlinie, IDA-347, Etappe 2).
 *
 * Betreiberentscheidung 2026-11-04: Inhalt steht IMMER links an der Menükante, nie mittig. Der
 * Typ legt nur fest, wie breit und hoch eine Seite werden darf:
 *
 * - `liste` — volle Breite (Tabellen).
 * - `uebersicht` — volle Breite (Karten, Kennzahlen).
 * - `formular` — links, höchstens 960px (Formular und Detail); Felder darin per `Felder`.
 * - `werkzeug` — volle Breite und volle Höhe (Editoren).
 *
 * KEINE CLIENT-DIREKTIVE und kein antd: nacktes Markup mit einem CSS-Modul, also aus einer Server
 * Component wie aus einer Client-Insel nutzbar (Falle 1, Falle 6).
 */
export type Seitentyp = "liste" | "uebersicht" | "formular" | "werkzeug";

export const SEITENTYPEN: readonly Seitentyp[] = ["liste", "uebersicht", "formular", "werkzeug"];

/** Die Höchstbreite des Typs `formular`, für Messungen in Tests; die Regel steht im CSS-Modul. */
export const FORMULAR_BREITE = 960;

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "children">;

function klassen(...namen: (string | false | undefined)[]): string {
  return namen.filter(Boolean).join(" ");
}

export function Seite({
  typ,
  className,
  children,
  ...rest
}: DivProps & { typ: Seitentyp; children: ReactNode }) {
  return (
    <div {...rest} data-seite={typ} className={klassen(s.seite, s[typ], className)}>
      {children}
    </div>
  );
}

/**
 * Das Feldraster: zwei Spalten, wo Platz ist, eine am Telefon. Jedes Kind ist eine Zelle — ein
 * `Form.Item` direkt, oder `Feld` für ein Feld über die ganze Zeile.
 */
export function Felder({ className, children, ...rest }: DivProps & { children: ReactNode }) {
  return (
    <div {...rest} data-felder="" className={klassen(s.felder, className)}>
      {children}
    </div>
  );
}

/** Eine Zelle im Feldraster; `breit` spannt sie über die ganze Zeile (Textbereich, Anschrift). */
export function Feld({
  breit = false,
  className,
  children,
  ...rest
}: DivProps & { breit?: boolean; children: ReactNode }) {
  return (
    <div {...rest} data-feld={breit ? "breit" : "schmal"} className={klassen(breit && s.breit, className)}>
      {children}
    </div>
  );
}

/**
 * Die Klasse für ein breites Feld, wo keine Hülle dazwischen darf — etwa an `Form.Item` selbst
 * (`<Form.Item className={FELD_BREIT}>`), damit dessen Unterrand im Raster bleibt.
 */
export const FELD_BREIT: string = s.breit;
