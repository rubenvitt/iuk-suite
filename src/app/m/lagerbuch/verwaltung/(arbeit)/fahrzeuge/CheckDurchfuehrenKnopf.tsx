import { Button } from "antd";
import { Ikone } from "../../../_ui/ikonen";

/**
 * DER WEG IN DEN FAHRZEUG-CHECK — DRK-305, von der Fahrzeugliste (alle aktiven)
 * und vom Fahrzeugblatt (genau dieses eine).
 *
 * Er führt in DIESELBE Fläche, die eine Helferin nach dem Kärtchen-Scan sieht
 * (`/helfer/check`). Das ist die tragende Entscheidung des Tickets: es gibt
 * genau eine Check-Oberfläche, und der Unterschied zwischen den beiden Wegen
 * liegt allein in der Bindung — wer scannt, prüft das Fahrzeug seines Kärtchens
 * (DRK-302), wer angemeldet kommt, wählt aus allen aktiven. Eine zweite,
 * verwaltungseigene Check-Fläche wäre eine zweite Wahrheit darüber, wie ein
 * Fahrzeug geprüft wird.
 *
 * ⚠️ `?fz=` IST EINE VORAUSWAHL, KEINE ZUSAGE. `helfer/check/page.tsx` sucht die
 * Id in der auf `aktiv` gefilterten Liste; ein stillgelegtes Fahrzeug fällt dort
 * still auf die Fahrzeugwahl zurück. Deshalb steht dieser Knopf — anders als
 * `ChecklisteKnopf` daneben — NUR an aktiven Fahrzeugen: ein Knopf, der auf eine
 * Wahlliste führt statt auf das Fahrzeug, das man vor sich hat, ist schlimmer
 * als kein Knopf.
 *
 * ⚠️ `Button href`, NIEMALS `<Link><Button/></Link>` — dieselbe behobene Falle
 * wie an `ChecklisteKnopf`: ein `<button>` in einem `<a>` ist verbotener Inhalt,
 * der Knopf schluckt den Klick, und der Anker navigiert nie. `typecheck`,
 * `lint`, `build` und Vitest bleiben dabei grün; gefunden hat es nur ein echter
 * Klick. Der Dokumentwechsel ist hier ohnehin richtig — die Check-Fläche liegt
 * außerhalb des Verwaltungsrahmens.
 *
 * KEIN "use client" und KEIN `size` — beides aus denselben Gründen wie an
 * `ChecklisteKnopf` (Falle 6 bzw. Falle 4).
 */
export function CheckDurchfuehrenKnopf({
  fahrzeugId,
  beschriftung,
}: {
  /** Genau ein Fahrzeug, oder `undefined` für die Fahrzeugwahl. */
  fahrzeugId?: string;
  beschriftung: string;
}) {
  const ziel = fahrzeugId === undefined
    ? "/helfer/check"
    : `/helfer/check?fz=${encodeURIComponent(fahrzeugId)}`;

  return (
    <Button href={ziel} icon={<Ikone name="haken" groesse={16} />}>
      {beschriftung}
    </Button>
  );
}
