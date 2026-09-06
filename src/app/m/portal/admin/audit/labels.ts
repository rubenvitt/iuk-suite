import { getModule } from "@/core/registry";
import { AUDIT_MODULES, type AuditAction, type AuditEvent, type AuditResult } from "@/core/audit/types";
export const MODULE_LABELS = Object.fromEntries(AUDIT_MODULES.map(key => [key, key === "konto" ? "Konto" : getModule(key).title]));
export const ACTION_LABELS: Record<AuditAction, string> = { create: "Angelegt", update: "Geändert", delete: "Gelöscht", sign_in: "Angemeldet", sign_out: "Abgemeldet", session_revoke: "Sitzungen widerrufen", access_denied: "Zugriff verweigert", download: "Heruntergeladen", export: "Exportiert" };
export const RESULT_LABELS: Record<AuditResult,string> = { success: "Erfolgreich", denied: "Verweigert", failure: "Fehlgeschlagen" };
export const OBJECT_LABELS: Record<string,string> = {
 services:"Dienst",portal_einstellungen:"Portaleinstellung",presets:"QR-Vorlage",evenings:"Dienstabend",groups:"Gruppe",responses:"Anonyme Rückmeldung",surveys:"Umfrage",user_groups:"Gruppenzuordnung",
 aufraeum_laeufe:"Aufräumlauf",inbox_files:"Abgegebene Datei",share_files:"Geteilte Datei",shares:"Dateifreigabe",zugangslinks:"Abgabelink",
 artikel:"Artikel",buchungen:"Lagerbuchung",bz_geraete:"Betriebsstundengerät",bz_kontrollen:"Betriebsstundenkontrolle",chargen:"Charge",checks:"Fahrzeugkontrolle",fahrzeug_templates:"Fahrzeugvorlage",geraete:"Lagergerät",lagerort_verfall:"Verfall am Lagerort",lagerorte:"Lagerort",o2_flaschen:"Sauerstoffflasche",o2_messungen:"Sauerstoffmessung",soll_positionen:"Sollposition",template_positionen:"Vorlagenposition",tokens:"Helferzugang",
 aufgaben:"Aufgabe",dateien:"Aufgabendatei",nachweise:"Nachweis",personen:"Person",routinen:"Routine",verlauf:"Aufgabenverlauf",
 device_events:"Funkgeräteereignis",devices:"Funkgerät",loans:"Ausleihe",software_versions:"Softwarestand",zugangscodes:"Ausleihzugang",
 executions:"Durchführung",participants:"Trainingsteilnehmer",task_status:"Trainingsfortschritt",tasks:"Trainingsaufgabe",
 eigene_zeichen:"Eigenes Zeichen",lernset_zeichen:"Zeichen im Lernset",lernsets:"Lernset",lernstand:"Lernstand",merkliste:"Merkliste",sitzung_widerruf:"Sitzungswiderruf",
 session:"Anmeldung",sessions:"Sitzungen",access:"Modulzugriff",share_access:"Freigabezugriff",audit_log:"Audit-Log",browser_export:"Browserexport",
 share_file:"Datei aus Freigabe",share_archive:"Archiv aus Freigabe",inbox_file:"Datei aus Abgabe",inbox_archive:"Archiv der Abgaben",group_export:"Gruppenauswertung",evening_export:"Dienstabendauswertung",checklist_collection:"Fahrzeug-Checklisten",device_collection:"Funkgeräteübersicht",participant_export:"Teilnehmerauswertung",participant_collection:"Teilnehmerübersicht",proof_file:"Nachweisdatei",
 qr_png:"QR-Code als PNG",zeichen_png:"Zeichen als PNG",zeichen_svg:"Zeichen als SVG",zeichen_json:"Zusammenstellung als Datei",
};
export function objectLabel(type: string): string { return OBJECT_LABELS[type] ?? "Weiteres Objekt"; }
export function actorLabel(event: AuditEvent): string {
 const actor=event.actor;
 return actor.kind === "anonymous" ? "Anonym" : actor.kind === "system" ? "System" : actor.kind === "access" ? "Gemeinsamer Zugang" : "id" in actor ? actor.name || actor.id : "Anonym";
}
const formatter = new Intl.DateTimeFormat("de-DE", { timeZone:"UTC", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23" });
export function auditTime(time: number): string { return formatter.format(time) + " UTC"; }
