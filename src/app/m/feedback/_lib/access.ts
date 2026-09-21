import { auditDenied, auditActor, auditLoginRequired } from "@/core/audit/server";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";

// `groups` = Suite-Gruppen (Admin-Frage), `fachgruppen` = Slugs der Gruppen, für
// die die Person Gruppenleitung ist. Letzteres gewährt NICHTS für sich: es wird
// ausschließlich in memberGroupIdsFor gegen groups.slug aufgelöst.
export type Viewer = { sub: string; groups: string[]; fachgruppen: string[] };

/**
 * BEWUSST NICHT `isModuleAdmin` — und das ist der einzige Unterschied zu jedem
 * anderen Modul der Suite.
 *
 * `isModuleAdmin` (core/groups) lässt den SUITE-Admin (`ADMIN_GROUP`, Vorgabe
 * `dashboard-admins`) durch: „ist Betreiber" heißt dort automatisch „darf jedes
 * Modul verwalten". Für `feedback` gilt das seit 2026-07-28 nicht mehr. Der
 * Grund ist fachlich, nicht technisch: Admin bedeutet hier Einblick in die
 * Rückmeldungen ALLER Gruppen — `accessibleGroupFilter` gibt `"all"` zurück —
 * und wer den Server betreibt, hat damit noch keinen Anlass, die Bewertungen
 * fremder Dienstabende zu lesen. Betrieb und Einsicht sind zwei Rollen.
 *
 * Wer feedback verwalten soll, gehört also in `da-feedback-admin` (bzw. in das,
 * was `SUITE_ADMIN_GROUP_FEEDBACK` benennt) — auch der Betreiber selbst. Das ist
 * eine Aussage über DIESES Modul: `qr`, `portal` und die kommenden Module
 * behalten die Suite-Admin-Abkürzung, solange niemand dasselbe für sie
 * entscheidet.
 *
 * FOLGE FÜR DEN ZUGANG, nicht nur für die Rechte: `requireFeedbackAccess` fragt
 * diese Funktion mit — ein Suite-Admin ohne Feedback-Gruppe bekommt auf
 * `/m/feedback` jetzt einen 404, keine leere Gruppenliste.
 */
export function isFeedbackAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("feedback"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * DIE EINE STELLE, DIE DIE ZWEI ABWEISUNGSGRÜNDE AUSEINANDERHÄLT.
 *
 * `feedback` mischt beide Fälle wie kein zweites Modul: seine Guards laufen auch
 * dort, wo gar keine Sitzung sein muss (`requiresAuth: false` wegen `/f/`), und
 * `auditActor(null)` ergibt denselben anonymen Akteur wie ein Bot auf der
 * Modul-Wurzel. Im Protokoll war beides eine Zeile „Zugriff verweigert ·
 * Modulzugriff · Anonym" — und damit nicht zu beantworten, ob jemand abgewiesen
 * wurde oder ob schlicht niemand angemeldet war.
 *
 * Ohne Viewer gibt es niemanden, dem etwas verweigert werden könnte: das ist der
 * Weg zum Login, nicht die Abweisung einer Person.
 */
export function auditFeedbackDenied(viewer: Viewer | null): void {
  if (viewer) auditDenied("feedback", auditActor(viewer));
  else auditLoginRequired("feedback");
}

/**
 * DARF DIESE PERSON DIE FEEDBACK-VERWALTUNG ÜBERHAUPT BETRETEN? — das
 * Modulprädikat, getrennt von der Frage „welche Gruppe?".
 *
 * Feedback-Admin (`isFeedbackAdmin`) ODER eine der Zugangsgruppen aus
 * `requiredGroupsFor` — also mit `SUITE_ACCESS_GROUP_FEEDBACK`, nie das
 * Registry-Feld direkt. Der Admin steht eigens davor, weil eine umkonfigurierte
 * Instanz ihre Admin-Gruppe nicht zwingend in die Zugangsliste schreibt.
 *
 * Es gibt dieses Prädikat nur EINMAL (DRK-290): `requireFeedbackAccess` hält es
 * in den Layouts, `assertGroupAccess` vor jeder Objektfreigabe. Vorher kannte nur
 * das Layout es — ein Export-Link oder eine Server Action läuft aber ohne Layout,
 * und dort genügte die Objektzuordnung allein. Eine ehemalige Gruppenleitung mit
 * entzogener Modulgruppe, aber stehen gebliebener `user_groups`-Zeile (oder
 * weiter passendem `fachgruppen`-Claim) las und änderte so ihre alte Gruppe
 * weiter, auch mit vollständig frischen Claims.
 */
export function hatFeedbackVerwaltungszugang(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  if (isFeedbackAdmin(viewer)) return true;
  const zugang = requiredGroupsFor(getModule("feedback"));
  return viewer.groups.some((g) => zugang.includes(g));
}

/**
 * DIE zentrale Ownership-Guard gegen die Alt-IDOR. `memberGroupIds` kommt aus
 * user_groups (im Aufrufer via memberGroupIdsFor geladen) — hier reingereicht,
 * damit die Guard rein/testbar bleibt. Jede Route/Action mit group/evening/
 * survey-id MUSS sie aufrufen (evening/survey vorher auf group_id auflösen).
 *
 * ZWEI Bedingungen, beide nötig (DRK-290): erst der Modulzugang
 * (`hatFeedbackVerwaltungszugang`), dann die Objektzuordnung. Die Zuordnung
 * allein ist KEIN Zugang — sie sagt nur, WELCHE Gruppe jemand verwalten dürfte,
 * wenn er das Modul überhaupt betreten darf. Weil jeder direkte Weg (beide
 * Export-Routen, jede Gruppen-Action über `guardGroup`, die Seiten über
 * `guardPage`) hier durchläuft, kann keiner das Prädikat vergessen.
 */
export function assertGroupAccess(
  viewer: Viewer | null,
  groupId: number,
  memberGroupIds: number[],
): void {
  if (isFeedbackAdmin(viewer)) return;
  if (hatFeedbackVerwaltungszugang(viewer) && memberGroupIds.includes(groupId)) return;
  auditFeedbackDenied(viewer);
  throw new Error("Forbidden");
}

/**
 * Die Sichtbarkeit der Gruppenliste folgt derselben Regel wie `assertGroupAccess`:
 * ohne Modulzugang KEINE Gruppe, auch bei vorhandener Zuordnung. Heute stehen
 * alle Aufrufer hinter `requireFeedbackAccess`, die Bedingung ändert dort also
 * nichts — sie steht hier, damit die beiden Freigaben derselben Datei nicht
 * auseinanderlaufen, sobald jemand die Liste an einer Stelle ohne Layout braucht.
 */
export function accessibleGroupFilter(
  viewer: Viewer | null,
  memberGroupIds: number[],
): "all" | number[] {
  if (isFeedbackAdmin(viewer)) return "all";
  if (!hatFeedbackVerwaltungszugang(viewer)) return [];
  return memberGroupIds;
}
