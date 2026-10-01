import { zeitFormat } from "@/core/zeit";
import type { Rahmen } from "../_ui/zeichnung/Blatt";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** `plan.datum` ist ein Kalendertag, gespeichert als Mitternacht UTC — deshalb hier `timeZone: "UTC"`. */
export function kalendertag(ms: number | null): string | null {
  if (ms === null) return null;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
}

export function rahmenFuer(p: {
  titel: string; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; vermerkVsNfD: boolean;
  kopf: Pick<Rahmen, "organisation" | "logo">;
}): Rahmen {
  const teile = [p.anlass?.trim() || null, kalendertag(p.datum)].filter((t): t is string => t !== null);
  return {
    titel: p.titel,
    untertitel: teile.length > 0 ? teile.join(" · ") : null,
    stand: `Stand: ${STAND.format(p.aktualisiertAm)}`,
    bearbeiter: p.aktualisiertVon.trim() === "" ? "" : `Bearbeitung: ${p.aktualisiertVon}`,
    vermerkVsNfD: p.vermerkVsNfD,
    organisation: p.kopf.organisation,
    logo: p.kopf.logo,
  };
}
