import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";

/**
 * Inline-SVG-Zeichen der Oberfläche, immer dekorativ (`aria-hidden`). Aufgelöst über den
 * Icons8-Katalog der Suite (`core/ikonen`, Satz „Windows 11 Outline", DRK-502) — dieselben
 * Zeichen wie in der Web-Suite. Bis dahin standen hier Phosphor- und antd-Pfade aus der Vorlage.
 * `-kraeftig` zieht die Kontur nach (`Icons8Ikone kraeftig`), statt ein zweites Set zu laden.
 *
 * Exportiert als `Zeichen`, nicht `Symbol`: Ein importiertes `Symbol` verdeckte den globalen
 * Konstruktor in jedem Modul, das es nutzt.
 */
const ZEICHEN = {
  "pfeil-rechts": "arrow-right",
  "pfeil-links": "arrow-left",
  "schluessel": "key",
  "verketten": "link",
  "archiv": "archive",
  "herunterladen": "download",
  "drucken": "print",
  "info": "info",
  "haken": "checkmark",
  "kreuz": "close",
  "minus-kraeftig": "minus",
  "plus-kraeftig": "plus",
  "stift": "pencil",
  "plus": "plus",
  "anzeige-auto": "monitor",
  "anzeige-hell": "sun",
  "anzeige-dunkel": "moon",
} as const satisfies Record<string, Icons8Name>;

export type ZeichenName = keyof typeof ZEICHEN;

export function Zeichen({ name, groesse = 16 }: { name: ZeichenName; groesse?: number }) {
  return (
    <Icons8Ikone
      name={ZEICHEN[name]}
      groesse={groesse}
      kraeftig={name.endsWith("-kraeftig")}
      className="zeichen"
      data-zeichen={name}
    />
  );
}
