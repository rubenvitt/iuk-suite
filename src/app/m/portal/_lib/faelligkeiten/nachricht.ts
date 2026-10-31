/**
 * DIE WÖCHENTLICHE PUSH-NACHRICHT — aus den Gruppen einer Person, ohne Datenbank und ohne Uhr.
 *
 * ⚠️ KEIN KLARNAME. Das Feld `person` (Entleiher) bleibt draußen: das Thema liest jeder, der seinen
 * Namen kennt, und die Mitteilung steht auf dem Sperrbildschirm.
 *
 * Kurz statt vollständig: je Modul höchstens `ZEILEN_JE_MODUL` Zeilen, der Rest als „… und N weitere".
 * Die vollständige Liste ist einen Tipp entfernt (`click` auf die Seite im Portal).
 */
import type { Faelligkeit } from "@/core/faelligkeiten";
import { woAnzeige } from "./anzeige";
import type { FaelligkeitsGruppe } from "./sammeln";
import { zaehle } from "./sammeln";

export const ZEILEN_JE_MODUL = 5;

export interface PushNachricht {
  title: string;
  message: string;
  /** 4 = hoch, wenn etwas überfällig ist; sonst 3 = normal. */
  priority: 3 | 4;
  tags: string[];
  click?: string;
}

function zeile(f: Faelligkeit): string {
  const ort = woAnzeige(f);
  const wo = ort ? ` (${ort})` : "";
  return `• ${f.art}: ${f.titel}${wo} — ${f.zustand}`;
}

/** `null`: nichts fällig und keine Quelle ausgefallen — dann wird nichts gesendet. */
export function baueNachricht(gruppen: readonly FaelligkeitsGruppe[], seitenUrl: string | null): PushNachricht | null {
  const { ueberfaellig, bald } = zaehle(gruppen);
  const ausgefallen = gruppen.filter((g) => g.fehler);
  if (ueberfaellig + bald === 0 && ausgefallen.length === 0) return null;

  const teile: string[] = [];
  for (const g of gruppen) {
    if (g.fehler) {
      teile.push(`${g.titel}: konnte nicht gelesen werden`);
      continue;
    }
    if (g.eintraege.length === 0) continue;
    const zeilen = g.eintraege.slice(0, ZEILEN_JE_MODUL).map(zeile);
    const rest = g.eintraege.length - zeilen.length;
    if (rest > 0) zeilen.push(`… und ${rest} weitere`);
    teile.push([g.titel, ...zeilen].join("\n"));
  }

  const zahlen = [ueberfaellig > 0 && `${ueberfaellig} überfällig`, bald > 0 && `${bald} bald fällig`].filter(Boolean).join(", ");
  return {
    title: zahlen ? `Was steht an: ${zahlen}` : "Was steht an",
    message: teile.join("\n\n"),
    priority: ueberfaellig > 0 ? 4 : 3,
    tags: ["date"],
    ...(seitenUrl ? { click: seitenUrl } : {}),
  };
}
