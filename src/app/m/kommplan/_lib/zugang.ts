import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { istKommplanHost } from "./host";
import type { Person } from "./rechte";
import type { Bearbeiter } from "./speichern";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Ansehen und Drucken: die Zugangsgruppe (`SUITE_ACCESS_GROUP_KOMMPLAN`) ODER wer das Modul
 * administriert (`isModuleAdmin`, also auch der Suite-Admin — anders als im Einsatzbuch liegt hier
 * nichts, was der Betrieb nicht sehen dürfte).
 */
export function hatKommplanZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  const mod = getModule("kommplan");
  return hasAnyGroup(groups, requiredGroupsFor(mod, env)) || isModuleAdmin(mod, groups ? [...groups] : null, env);
}

/**
 * Modul-Admin: Bibliothek und Einstellungen pflegen, jeden GETEILTEN Plan bearbeiten und verwalten. Private Pläne
 * anderer sieht auch ein Admin nicht — was an einem einzelnen Plan erlaubt ist, entscheidet `_lib/rechte.ts`.
 */
export function darfKommplanBearbeiten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("kommplan"), groups ? [...groups] : null, env);
}

/**
 * Riegel für das Layout der Arbeitsrouten UND jede Seite darunter (eine Route Group ist keine
 * Sicherheitsgrenze). `redirect`/`notFound` bleiben hier, damit Seiten keinen Eintrag im
 * Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireKommplanZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("kommplan");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/kommplan")}`);
  }
  if (!hatKommplanZugang(viewer.groups)) {
    auditDenied("kommplan", auditActor(viewer));
    notFound();
  }
  return viewer;
}

/**
 * Seitenriegel der Verwaltungsseiten Bibliothek und Einstellungen (Umsetzungsplan Phase 4, Entscheidung 16):
 * nach `requireKommplanZugang` zusätzlich das Bearbeitungsrecht — sonst 404, damit sich die Seite nicht
 * verrät. Dasselbe Prädikat wie die Links in der Planliste und jede Server Action.
 */
export function pruefeKommplanBearbeiten(viewer: Viewer): void {
  if (darfKommplanBearbeiten(viewer.groups)) return;
  auditDenied("kommplan", auditActor(viewer));
  notFound();
}

/**
 * Für Server Actions (Vorbild `einsatzbuch/_lib/zugang.ts`, `requireEinsatzbuchAktion`): Wurf statt
 * `notFound`, weil eine Action keine Seite ist. Host, Anmeldung und Bearbeiten-Recht — dasselbe
 * Prädikat wie der Knopf „Neu" und die Editor-Weiche der Planseite (docs/design/README.md,
 * „Führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?").
 */
export async function requireKommplanBearbeitenAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istKommplanHost(kopf)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("kommplan"); throw new Error("Forbidden"); }
  if (!darfKommplanBearbeiten(viewer.groups)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/**
 * Für die Server Actions an Plänen: Host, Anmeldung und Modulzugang — Anlegen und Importieren darf jeder mit
 * Zugang, alles an einem bestehenden Plan prüft die Action danach über `rechteAn` (`_lib/rechte.ts`). Wurf statt
 * `notFound`, weil eine Action keine Seite ist.
 */
export async function requireKommplanAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istKommplanHost(kopf)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("kommplan"); throw new Error("Forbidden"); }
  if (!hatKommplanZugang(viewer.groups)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Wer fragt, für `rechteFuer`: dieselbe Kennung wie `bearbeiterAus` (Eigentümer, Einladung) und das Admin-Recht. */
export function personAus(viewer: Viewer): Person {
  const akteur = auditActor(viewer);
  return { nutzer: akteur.kind === "user" ? akteur.id : null, admin: darfKommplanBearbeiten(viewer.groups) };
}

/**
 * Kennung für `plan_bearbeitung.nutzer`, Anzeigename für `plan.aktualisiert_von` (gedruckter „Bearbeitung: …").
 * NUR EIN ECHTER NAME, sonst leer (Abnahme kommplan): der Name steht auf jedem Ausdruck und in der login-freien
 * Token-Ansicht — ersatzweise E-Mail-Adresse oder `sub` wären dort ein personenbezogenes Datum. Leer lassen die
 * Leser die Angabe weg (`rahmen.ts`, `TokenKopf`, Konflikt in der Kopfleiste, Teilen).
 */
export function bearbeiterAus(viewer: Viewer): Bearbeiter {
  const akteur = auditActor(viewer);
  const nutzer = akteur.kind === "user" ? akteur.id : "unbekannt";
  return { nutzer, name: viewer.name?.trim() ?? "" };
}
