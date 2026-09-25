-- Lokale Datenbank des Einsatzbuch-Rechners (Spec §4.2). Unveränderlich ist NUR `bloecke`;
-- die übrigen Tabellen ändert die App im Betrieb ganz normal.
CREATE TABLE bloecke (
  block      INTEGER PRIMARY KEY CHECK (block >= 1),
  json       TEXT    NOT NULL,
  hash       TEXT    NOT NULL UNIQUE CHECK (length(hash) = 64),
  versiegelt TEXT    NOT NULL
);
CREATE TRIGGER bloecke_kein_update BEFORE UPDATE ON bloecke
BEGIN SELECT RAISE(ABORT, 'Versiegelte Blöcke sind unveränderlich'); END;
CREATE TRIGGER bloecke_kein_delete BEFORE DELETE ON bloecke
BEGIN SELECT RAISE(ABORT, 'Versiegelte Blöcke sind unveränderlich'); END;

CREATE TABLE ausstehend (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  json          TEXT    NOT NULL,   -- Entwurf, zuletzt abgesendet
  schnappschuss TEXT    NOT NULL,   -- {fahrzeuge: FahrzeugStand[], personal: PersonStand[]} beim Absenden
  abgesendet_am TEXT    NOT NULL,
  frist_bis_ms  INTEGER NOT NULL
);
CREATE TABLE entwurf (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  json         TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);
CREATE TABLE nummern (
  jahr   INTEGER PRIMARY KEY,
  letzte INTEGER NOT NULL CHECK (letzte >= 1)
);
CREATE TABLE einrichtung (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  umgebung           TEXT    NOT NULL CHECK (umgebung IN ('echt', 'test')),
  suite_url          TEXT    NOT NULL,
  oeffentlich_spki   TEXT    NOT NULL,
  schluessel_id      TEXT    NOT NULL CHECK (length(schluessel_id) = 16),
  stammdaten_json    TEXT    NOT NULL,
  stammdaten_version INTEGER NOT NULL,
  frist_minuten      INTEGER NOT NULL CHECK (frist_minuten BETWEEN 1 AND 120),
  besatzung          INTEGER NOT NULL CHECK (besatzung IN (0, 1)),
  zeitzone           TEXT    NOT NULL,
  bereitschaft       TEXT    NOT NULL,
  sicherungsordner   TEXT,
  letzte_sicherung   TEXT,
  anker_gemeldet_bis INTEGER NOT NULL DEFAULT 0,
  eingerichtet_am    TEXT    NOT NULL,
  eingerichtet_von   TEXT    NOT NULL
);
