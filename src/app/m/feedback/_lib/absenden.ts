/**
 * DER DRAHT ZWISCHEN ABGABE UND ANZEIGE (Entwurf 3.8).
 *
 * Zwei Zeichenketten, die an DREI Stellen zusammenpassen muessen: der Client
 * schreibt das JS-Feld in die Nutzlast (`Zettel.tsx`), die Action liest es und
 * leitet ohne JavaScript auf `?fehler=…` um (`actions.ts`), die Seite macht
 * daraus einen Satz (`f/[slugSecret]/page.tsx`). Ein Tippfehler an einer der
 * drei Stellen faellt nirgends auf: die Umleitung landet auf einem Parameter,
 * den niemand liest, und der Fehlerpfad ist wieder still — genau der Zustand,
 * den 3.8 beseitigt.
 *
 * WARUM EINE EIGENE DATEI und nicht `actions.ts`: eine Datei mit `"use server"`
 * darf ausschliesslich async Funktionen exportieren. Eine Konstante dort bricht
 * den Build — und `Zettel.tsx` (Client) muss denselben Wert kennen.
 */

/**
 * Das Feld, das den Weg MIT JavaScript kenntlich macht. Es steht nicht im
 * Markup, sondern wird im `submit`-Handler in die `FormData` geschrieben: ein
 * verstecktes Eingabefeld haengt an der Hydration, und ein vor der Hydration
 * abgeschickter Bogen (der Weg, den 3.11 ausdruecklich zusagt) wuerde damit
 * faelschlich als „mit JavaScript" gelesen — die Action wuerde antworten statt
 * umzuleiten, und die Antwort laese niemand.
 */
export const JS_FELD = "mitJs";

/**
 * Query-Werte fuer den Weg OHNE JavaScript. Deutsch, weil sie in der Adresszeile
 * einer oeffentlichen, login-freien Seite stehen.
 *
 * `none` und `invalid` fehlen hier absichtlich: sie brauchen keinen Parameter,
 * weil der native POST dieselbe Route neu rendert und `page.tsx` dann von selbst
 * Zustand C bzw. F liefert.
 */
export const FEHLER_PARAMETER = {
  closed: "geschlossen",
  ratelimit: "ratelimit",
  incomplete: "unvollstaendig",
} as const;
