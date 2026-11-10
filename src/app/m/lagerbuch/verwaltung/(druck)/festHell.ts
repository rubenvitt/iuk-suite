import type { ThemeConfig } from "antd";
import { ARBEITSDICHTE, buildTheme } from "@/core/theme/theme";

/**
 * DAS THEME DER DRUCKFLÄCHEN — fest hell, gleich welcher Modus gilt (IDA-380).
 *
 * ⚠️ `inherit: false` IST DIE TRAGENDE ZEILE. Ohne sie mischt antd den Token
 * des umgebenden (dunklen) Themes unter: `buildTheme("dark")` setzt Schlüssel,
 * die das helle gar nicht kennt (`colorBgElevated`, `colorTextLightSolid`), und
 * die blieben dann stehen — ein Primärknopf mit fast schwarzer Schrift auf
 * Tinte. Weil nichts geerbt wird, muss die Arbeitsdichte hier selbst hinein
 * (44 statt 56, `ARBEITSDICHTE`); sonst stünden die Knöpfe der Bedienleiste
 * größer als eine Seite weiter.
 *
 * ⚠️ EIN EIGENER `cssVar.key`. antd schreibt die Variablen eines Themes unter
 * eine Klasse dieses Namens; teilte er sich `iuk` mit dem umgebenden Theme,
 * stünden helle und dunkle Werte unter demselben Selektor, und die Reihenfolge
 * im Stylesheet entschiede still, welche gilt.
 *
 * KEIN "use client" (Falle 6): reiner Wert, prüfbar ohne zu rendern.
 */
const HELL = buildTheme("light");

export const FEST_HELL: ThemeConfig = {
  ...HELL,
  inherit: false,
  cssVar: { key: "lb-hell" },
  token: { ...HELL.token, ...ARBEITSDICHTE.token },
  components: {
    ...HELL.components,
    Radio: { ...HELL.components?.Radio, ...ARBEITSDICHTE.components?.Radio },
  },
};
