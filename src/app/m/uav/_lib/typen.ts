// 1:1 aus uav-praxis/shared/types.ts — `Identity` entfällt, der liegt in `sitzung.ts`.

export type Teil = 1 | 2 | 3;

export interface TaskDTO {
  id: string;
  teil: Teil;
  nummer: string;
  titel: string;
  lernziel: string;
  schritte: string[];
  durchfuehrungshinweise: string[];
  sicherheitshinweise: string[];
  zielanzahlDefault: number;
  sortOrder: number;
  aktiv: boolean;
  bildUrl?: string | null;
}

export interface ExecutionDTO {
  id: string; // client-UUID
  taskId: string;
  datum: string; // yyyy-mm-dd
  drohnensteuerer: string;
  luftraumbeobachter: string;
  deletedAt?: string | null;
}

export interface TaskStatusDTO {
  taskId: string;
  zielanzahl: number | null;
  nichtAnwendbar: boolean;
  updatedAt: string;
}

export interface ProgressSnapshot {
  executions: ExecutionDTO[];
  taskStatus: TaskStatusDTO[];
  serverTime: string;
}

// Sync: Client schiebt seit letztem Sync angefallene Mutationen, Server antwortet
// mit autoritativem Snapshot (Pull).
export interface SyncRequest {
  since: string | null; // letzter erfolgreicher Sync (serverTime) oder null
  executions: ExecutionDTO[]; // Upserts inkl. Tombstones (deletedAt gesetzt)
  taskStatus: TaskStatusDTO[]; // Upserts (last-write-wins via updatedAt)
}
export type SyncResponse = ProgressSnapshot;

// Admin-DTOs
export interface ParticipantDTO {
  id: string;
  name: string;
  loginCode: string;
  aktiv: boolean;
  beginn: string | null; // Trainingsbeginn, ISO yyyy-mm-dd, optional
  lastSeen: string | null;
}

/** Überblicks-Zeile pro Teilnehmer (Liste). */
export interface ParticipantProgressDTO {
  participant: ParticipantDTO;
  erledigt: number;
  gesamt: number;
  quote: number;
}

/** Fortschritt eines einzelnen Teils (1–3). */
export interface TeilStatDTO {
  teil: Teil;
  erledigt: number;
  gesamt: number;
  quote: number;
}

/** Fortschritt einer einzelnen Aufgabe für einen Teilnehmer. */
export interface TaskProgressDTO {
  taskId: string;
  teil: Teil;
  nummer: string;
  titel: string;
  anzahl: number; // nicht-gelöschte Durchführungen
  ziel: number; // effektive Zielanzahl
  erledigt: boolean;
  nichtAnwendbar: boolean;
  letzteDurchfuehrung: string | null; // datum der jüngsten Durchführung
}

/** Vollständige Detail-Auswertung eines Teilnehmers. */
export interface ParticipantDetailDTO {
  participant: ParticipantDTO;
  erledigt: number; // über alle anwendbaren Aufgaben
  gesamt: number;
  quote: number;
  teile: TeilStatDTO[]; // pro Teil 1–3
  aufgaben: TaskProgressDTO[];
  letzteAktivitaet: string | null; // max(lastSeen, jüngste Durchführung)
}
