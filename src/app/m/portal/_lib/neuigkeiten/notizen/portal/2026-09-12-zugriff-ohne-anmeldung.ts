import { absatz, type Releasenotiz } from "../../typen";
export default {
 modul:"portal", datum:"2026-09-12", slug:"zugriff-ohne-anmeldung", titel:"Zwei Gründe für eine verweigerte Seite, zwei Einträge",
 inhalt:[
  absatz("Im Audit-Log heißt ein verweigerter Seitenaufruf jetzt entweder Modulzugriff oder Modulzugriff ohne Anmeldung. Der erste Fall meint eine angemeldete Person, der die nötige Gruppe fehlt; ihre Personenkennung steht in den Details. Der zweite meint, dass niemand angemeldet war."),
  absatz("Bisher standen beide Fälle als Modulzugriff mit dem Zugang Anonym nebeneinander. Wer einen solchen Eintrag sah, konnte nicht unterscheiden, ob jemand abgewiesen wurde oder ob die Seite ohne Anmeldung aufgerufen und zum Login geschickt wurde — und das passiert auch, ohne dass ein Mensch beteiligt ist, etwa wenn ein Suchdienst eine Adresse abruft oder ein Messenger eine Linkvorschau erzeugt."),
  absatz("Die Einträge werden weiterhin beide festgehalten, nur benannt wie sie gemeint sind. Filter, Zeitraum und Details bleiben unverändert; frühere Einträge behalten ihre bisherige Bezeichnung."),
 ],
} satisfies Releasenotiz;
