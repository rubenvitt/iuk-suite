import type { CSSProperties } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { farbe, type Farbe, type Zeichen } from "../_lib/kategorieRegeln";
import v from "./verwaltung.module.css";

/** Zeichen und Name einer Kategorie auf ihrer Farbe, wie das Kürzel am Monitor. Ohne Kategorie: „Meldung“ in Blau. */
export function KategorieMarke({ kategorie }: { kategorie: { name: string; zeichen: Zeichen; farbe: Farbe } | null }) {
  const ton = farbe(kategorie?.farbe ?? "blau").ton;
  return (
    <span className={v.marke} style={{ "--kategorie": ton } as CSSProperties}>
      {kategorie ? <Icons8Ikone name={kategorie.zeichen} /> : null}
      {kategorie?.name ?? "Meldung"}
    </span>
  );
}
