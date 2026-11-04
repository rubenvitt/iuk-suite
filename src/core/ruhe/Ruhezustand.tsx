import type { HTMLAttributes, ReactNode } from "react";

import { FigurInsel } from "./FigurInsel";
import { figurFuer, type RuheSchluessel } from "./figuren";
import s from "./ruhe.module.css";

/**
 * EIN RUHEZUSTAND: Figur, eine kurze Zeile, höchstens EINE Aktion (IDA-347, Etappe 3).
 *
 * Kein Erklärtext — „Keine Mängel", nicht „Hier erscheinen später …". Die Zeile ist eine Auskunft.
 *
 * KEINE CLIENT-DIREKTIVE und kein antd-Compound: aus Server Components wie aus Client-Inseln nutzbar
 * (Falle 1, Falle 6). Die Figur kommt als Schlüssel (`figur="lagerbuch"`), nie als Komponente.
 */
export function Ruhezustand({
  figur,
  titel,
  aktion,
  als = "p",
  groesse = "gross",
  mittig = false,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "children" | "title"> & {
  figur: RuheSchluessel;
  titel: ReactNode;
  aktion?: ReactNode;
  /** `h1` auf Seiten, deren einzige Auskunft der Zustand ist (404, 403). */
  als?: "h1" | "h2" | "p";
  groesse?: "gross" | "klein";
  /** Nur für Randseiten ohne Shell (404, 403): dort gibt es keine Menükante. */
  mittig?: boolean;
}) {
  const Titel = als;
  return (
    <div
      {...rest}
      data-rolle="ruhezustand"
      className={[s.ruhe, mittig && s.mittig, className].filter(Boolean).join(" ")}
    >
      <FigurInsel figur={figurFuer(figur)} groesse={groesse} />
      <Titel className={groesse === "klein" ? `${s.titel} ${s.titelKlein}` : s.titel}>{titel}</Titel>
      {aktion ? <div className={s.aktion}>{aktion}</div> : null}
    </div>
  );
}

/**
 * Die Figur allein, ohne Zeile — für einen Ruhezustand, dessen Überschrift schon dasteht (die
 * Anmeldung). Dieselben Regeln: Schlüssel statt Komponente, still bei reduzierter Bewegung.
 */
export function RuheFigur({
  figur,
  groesse = "klein",
  className,
}: {
  figur: RuheSchluessel;
  groesse?: "gross" | "klein";
  className?: string;
}) {
  return <FigurInsel figur={figurFuer(figur)} groesse={groesse} className={className} />;
}
