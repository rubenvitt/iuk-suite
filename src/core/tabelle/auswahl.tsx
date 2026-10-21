import { cloneElement, isValidElement, type ReactNode } from "react";
import type { TableProps } from "antd";
import stil from "./auswahl.module.css";

type Zeilenauswahl<T> = NonNullable<TableProps<T>["rowSelection"]>;

/**
 * Die Breite der Auswahlspalte, wenn der Aufrufer keine nennt: 44 px
 * Trefferfläche plus antds Zellenrand von je 8 px (`paddingXS` links und rechts,
 * `antd/es/table/style/selection.js`). antds eigene Vorgabe ist `controlHeight`
 * und damit unter `SCHREIBTISCHDICHTE` 32 px — das Kreuzchen ragte über den Rand.
 */
export const AUSWAHL_SPALTENBREITE = 60;

/**
 * Gibt antds Kreuzchen die Trefferfläche der Arbeitsdichte, 44 x 44 px (IDA-245).
 *
 * antd leitet die Größe des `Checkbox`-Labels nicht aus `controlHeight` ab; ohne
 * diese Klasse ist es 22 x 22 px, am Tablet mit dem Finger kaum zu treffen. Die
 * Klasse hängt am LABEL selbst, weil das Label die Fläche ist, die den Klick
 * annimmt — ein größerer Kasten DRUM HERUM nähme ihn nicht an. Zustand, Sperre
 * und Tastaturbedienung bleiben antds; es gibt kein zweites Kreuzchen.
 */
function vergroessert(kreuz: ReactNode): ReactNode {
  if (!isValidElement<{ className?: string }>(kreuz)) return kreuz;
  const klassen = [kreuz.props.className, stil.kreuz].filter(Boolean).join(" ");
  return cloneElement(kreuz, { className: klassen });
}

/**
 * `rowSelection` mit großen Kreuzchen in JEDER Zeile und im Spaltenkopf
 * („Alle auswählen"). Steht in `Datentabelle`, damit keine Tabelle es einzeln
 * nachrüsten muss — IDA-238 hatte es an zwei Lagerbuch-Tabellen über
 * `renderCell` gesetzt, die Artikelliste und der Spaltenkopf blieben klein.
 *
 * ⚠️ EIN EIGENES `renderCell` BLEIBT, ES BEKOMMT DAS GROSSE KREUZCHEN. Ein
 * eigener `columnTitle`, `hideSelectAll` und `selections` bleiben ebenfalls
 * unberührt: antd beachtet beide letzteren nur ohne `columnTitle`
 * (`useSelection.js`, `renderColumnTitle`), ein gesetzter Kopf schaltete sie
 * still ab. Bei `type: "radio"` gibt es keinen Kopf zum Vergrößern.
 */
export function mitGrossenKreuzchen<T>(auswahl: Zeilenauswahl<T> | undefined): Zeilenauswahl<T> | undefined {
  if (!auswahl) return auswahl;
  const eigeneZelle = auswahl.renderCell;
  const kopfBleibt = auswahl.columnTitle !== undefined
    || auswahl.hideSelectAll
    || auswahl.selections
    || auswahl.type === "radio";
  return {
    ...auswahl,
    columnWidth: auswahl.columnWidth ?? AUSWAHL_SPALTENBREITE,
    renderCell: (gewaehlt, zeile, index, kreuz) => (
      eigeneZelle ? eigeneZelle(gewaehlt, zeile, index, vergroessert(kreuz)) : vergroessert(kreuz)
    ),
    ...(kopfBleibt ? {} : { columnTitle: (kreuz: ReactNode) => vergroessert(kreuz) }),
  };
}
