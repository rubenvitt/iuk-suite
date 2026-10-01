import type { KarteL } from "../../_lib/layout/typen";
import { FARBE } from "../zeichnung/farben";
import { UMSCHALTER, umschalterLage } from "./umschalter";

/** Einklapp-Umschalter einer Karte (Spec §5.7) — Betrachter und Editor. Ohne eigene Direktive: nur Client-Inseln rendern ihn. */
export function Umschalter({ k, onUmschalten }: { k: KarteL; onUmschalten: (id: string) => void }) {
  if (!k.einklappbar) return null;
  const u = umschalterLage(k);
  return (
    <g role="button" tabIndex={0} data-umschalter={k.id} aria-expanded={!k.eingeklappt}
      aria-label={`${k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}: Unterstellen ${k.eingeklappt ? "ausklappen" : "einklappen"}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onUmschalten(k.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onUmschalten(k.id); } }}>
      <circle cx={u.cx} cy={u.cy} r={UMSCHALTER.griff} fill="transparent" />
      <circle cx={u.cx} cy={u.cy} r={u.r} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={0.25} />
      <text x={u.cx} y={u.cy + UMSCHALTER.schrift * 0.35} fontSize={UMSCHALTER.schrift} textAnchor="middle" fill={FARBE.tinte}>{k.eingeklappt ? "+" : "−"}</text>
    </g>
  );
}
