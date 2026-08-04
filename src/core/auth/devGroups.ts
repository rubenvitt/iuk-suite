import { MODULES, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor, suiteAdminGroup } from "@/core/groups";

/** Wie in `registry.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * ALLE GRUPPEN, DIE IN DIESER INSTANZ ÜBERHAUPT ETWAS BEDEUTEN — die Auswahl
 * für den Entwicklungs-Login.
 *
 * WARUM DIESE DATEI UND NICHT EINE LISTE IM FORMULAR: `login-form.tsx` trägt
 * `"use client"`. Ein dort deklarierter WERT käme in `login/page.tsx` (Server
 * Component) nicht als Wert an, sondern als Client-Referenz — HTTP 500 für die
 * ganze Anmeldeseite, und weder `pnpm build` noch Vitest sehen es (Falle 6 in
 * `docs/design/README.md`). Die Richtung ist deshalb verbindlich: hier
 * berechnen, in der Server Component rufen, als Prop hineingeben. Diese Datei
 * trägt bewusst KEIN `"use client"`.
 *
 * GELESEN WIRD ÜBER `adminGroupsFor`/`requiredGroupsFor`/`suiteAdminGroup`, NIE
 * über `mod.adminGroups`/`mod.requiredGroups` direkt. An den Feldern gelesen
 * fehlte jede per `SUITE_ADMIN_GROUP_<KEY>`/`SUITE_ACCESS_GROUP_<KEY>`
 * konfigurierte Gruppe still in der Liste — und genau die will man beim
 * Entwickeln anhaken, weil sie von der Vorgabe abweicht. `registry.ts:28-34`
 * und `files/_lib/access.ts:44-53` schreiben dieselbe Falle aus.
 *
 * Der Suite-Admin (`ADMIN_GROUP`) steht MIT DRIN: er ist in `isModuleAdmin` die
 * Abkürzung über alle Module und damit die Gruppe, die man beim Prüfen am
 * häufigsten braucht. Dass `files` sie bewusst NICHT anerkennt
 * (`files/_lib/access.ts` liest nicht `isModuleAdmin`), ist eine Aussage dieses
 * Moduls — kein Grund, sie aus der Auswahl zu nehmen.
 *
 * NUR FÜR DEN DEV-LOGIN. Diese Liste ist keine Rechtequelle und entscheidet
 * nichts; sie füllt ein Formular, dessen Eingabe `parseDevGroups` ohnehin
 * unverändert in den Token schreibt. Eine hier fehlende Gruppe ist deshalb kein
 * Riegel, sondern nur ein fehlendes Häkchen — der Freitext daneben bleibt der
 * Weg für alles, was die Registry nicht kennt (etwa eine Gruppe, mit der man
 * einen Negativpfad prüfen will).
 */
export function devGroupChoices(env: EnvLike = process.env): string[] {
  const alle = new Set<string>([suiteAdminGroup(env)]);
  for (const mod of MODULES) {
    for (const g of adminGroupsFor(mod, env)) alle.add(g);
    for (const g of requiredGroupsFor(mod, env)) alle.add(g);
  }
  return [...alle].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Vereinigt die angehakten Gruppen mit dem Freitextfeld daneben — in dieser
 * Reihenfolge, doppelte Nennungen fallen weg. Das Ergebnis geht als EIN
 * kommagetrennter Wert an den `dev-login`-Provider, weil dessen `credentials`
 * genau ein `groups`-Feld kennt (`core/auth/config.ts:58`) und `parseDevGroups`
 * es serverseitig ohnehin wieder zerlegt, trimmt und Leeres verwirft.
 *
 * DIE TRENNUNG VON HÄKCHEN UND FREITEXT IST ABSICHT. Die Häkchen decken alles
 * ab, was diese Instanz kennt; der Freitext bleibt der Weg für alles andere —
 * eine erfundene Gruppe für einen Negativpfad etwa. Ohne ihn wäre der Dev-Login
 * auf die Registry beschränkt, und `e2e/fixtures.ts:18` füllt genau dieses Feld
 * (~90 Aufrufe in 12 Specs). Ohne Häkchen ist das Ergebnis deshalb exakt der
 * Freitext — das ist die Zusage, die die E2E-Suite unverändert grün hält.
 *
 * Steht hier und nicht in `login-form.tsx`, damit der Test sie prüfen kann,
 * ohne antd und `next-auth/react` in die Vitest-Umgebung zu ziehen.
 */
export function vereinigeGruppen(angehakt: string[], freitext: string): string {
  const alle = new Set(angehakt);
  for (const g of freitext.split(",").map((s) => s.trim())) {
    if (g) alle.add(g);
  }
  return [...alle].join(",");
}
