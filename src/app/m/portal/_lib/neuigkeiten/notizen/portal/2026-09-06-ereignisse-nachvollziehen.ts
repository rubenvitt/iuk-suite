import { absatz, type Releasenotiz } from "../../typen";
export default {
 modul:"portal", datum:"2026-09-06", slug:"ereignisse-nachvollziehen", titel:"Änderungen und Abrufe nachvollziehen",
 inhalt:[
  absatz("Als Suite-Admin findest du unter Verwaltung → Audit-Log die Änderungen, Anmeldungen und Abrufe aus der gesamten Suite. So kannst du nachsehen, wann ein Vorgang stattfindet und welchem Zugang er zugeordnet ist."),
  absatz("Du grenzt die Einträge nach Zeitraum, Modul, Person, Aktion und Ergebnis ein. In den Details siehst du die Herkunft; Exporte aus QR-Codes und dem Zeichenbaukasten tragen den Hinweis Vom Browser gemeldet."),
  absatz("Du siehst Ereignisse ab der Aktivierung. Frühere Vorgänge werden nicht nachträglich ergänzt. Deine bisherigen Arbeitswege und die anonymen Rückmeldungen bleiben erhalten."),
 ],
} satisfies Releasenotiz;
