-- Datenmodell des Drohnen-Trainingsbegleiters (SQLite).
-- Idempotent: alle Tabellen mit IF NOT EXISTS. IDs sind TEXT (UUID v4, außer login_code).
-- Zeitstempel als ISO-8601-TEXT (UTC).

-- Admins (identifiziert über PocketID-subject)
CREATE TABLE IF NOT EXISTS admins (
  id          TEXT PRIMARY KEY,
  oidc_sub    TEXT UNIQUE NOT NULL,
  email       TEXT,
  name        TEXT,
  created_at  TEXT NOT NULL,
  last_login  TEXT
);

-- Teilnehmer (oberste Verwaltungsebene; kein Kurskonzept mehr)
CREATE TABLE IF NOT EXISTS participants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  login_code  TEXT UNIQUE NOT NULL,   -- persönlicher Dauer-Code (base32, 8 Zeichen)
  aktiv       INTEGER NOT NULL DEFAULT 1,
  beginn      TEXT,                    -- Trainingsbeginn, ISO yyyy-mm-dd, optional
  created_at  TEXT NOT NULL,
  last_seen   TEXT
);

-- Globaler Aufgabenkatalog (Voll-CRUD durch Admin)
CREATE TABLE IF NOT EXISTS tasks (
  id                     TEXT PRIMARY KEY,   -- z.B. "1-1" beim Seed, sonst UUID
  teil                   INTEGER NOT NULL,   -- 1 | 2 | 3
  nummer                 TEXT NOT NULL,      -- "1.1"
  titel                  TEXT NOT NULL,
  lernziel               TEXT NOT NULL DEFAULT '',
  schritte               TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  durchfuehrungshinweise TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  sicherheitshinweise    TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
  zielanzahl_default     INTEGER NOT NULL DEFAULT 1,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  aktiv                  INTEGER NOT NULL DEFAULT 1,
  bild                   TEXT,               -- relativer Pfad zur Illustration, nullable
  updated_at             TEXT NOT NULL
);

-- Durchführungen (eine erfasste Übung eines Teilnehmers zu einer Aufgabe)
CREATE TABLE IF NOT EXISTS executions (
  id                 TEXT PRIMARY KEY,        -- client-generierte UUID (Idempotenz)
  participant_id     TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  task_id            TEXT NOT NULL,
  datum              TEXT NOT NULL,           -- ISO yyyy-mm-dd
  drohnensteuerer    TEXT NOT NULL DEFAULT '',
  luftraumbeobachter TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  deleted_at         TEXT                     -- soft delete für Sync-Tombstones
);

CREATE INDEX IF NOT EXISTS idx_executions_participant ON executions (participant_id);

-- Pro-Teilnehmer Aufgaben-Einstellungen (Zielanzahl-Override + nicht anwendbar)
CREATE TABLE IF NOT EXISTS task_status (
  participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  task_id         TEXT NOT NULL,
  zielanzahl      INTEGER,                   -- NULL = Default der Aufgabe nutzen
  nicht_anwendbar INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (participant_id, task_id)
);

-- Server-Sessions (Admin + Teilnehmer)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,        -- SHA-256-Hash des Roh-Tokens (Cookie hält das Roh-Token)
  kind        TEXT NOT NULL,           -- 'admin' | 'participant'
  subject_id  TEXT NOT NULL,           -- admins.id | participants.id
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- Temporärer OIDC-Login-State (PKCE)
CREATE TABLE IF NOT EXISTS oidc_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
