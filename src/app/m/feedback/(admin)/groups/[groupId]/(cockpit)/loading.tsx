import { SeiteLaedt } from "@/core/shell/SeiteLaedt";

/**
 * DRK-424 — die Ladegrenze des Cockpits, und NUR des Cockpits. Warum es sie
 * gibt, was sie in `next dev` nicht beweist und was sie ohne JavaScript
 * kostet, steht einmal am Bauteil (`core/shell/SeiteLaedt.tsx`).
 *
 * ⛔ DESHALB DIE ROUTENGRUPPE `(cockpit)`. Eine `loading.tsx` deckt ihr
 * Segment UND alles darunter. Unmittelbar unter `[groupId]` laege sie auch
 * ueber Trend und Auswertung — gemessen (`build`/`start`, 150 ms Rundlauf):
 * Cockpit → Auswertung zeigte den Ladezustand dann erst nach 221 ms und nur
 * fuer 75 ms, also ein Aufblitzen statt einer Rueckmeldung, und beide Seiten
 * waeren ohne JavaScript unlesbar geworden. In der Gruppe umschliesst die
 * Grenze allein diese Seite; die Adresse bleibt `/groups/<id>`.
 *
 * Trend und Auswertung bekommen keine eigene: der Trend wird nur ueber einen
 * Knopf mit `href` erreicht (nie vorabgeladen), und die Auswertung bleibt
 * so ohne JavaScript lesbar. Der Riegel steht in `feedback/ladegrenze.test.ts`.
 */
export default function Laedt() {
  return <SeiteLaedt />;
}
