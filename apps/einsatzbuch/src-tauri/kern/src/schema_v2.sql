-- Schema v2 (Stufe 5, Anbindung an die Suite): die Spalten, die ein Rechner erst nach der
-- Registrierung bei der Suite braucht. `einrichtung.anker_gemeldet_bis` gibt es schon seit v1
-- (Vorgriff, dort ungenutzt); diese Migration ergänzt nur, was dort noch fehlt.
ALTER TABLE einrichtung ADD COLUMN rechner_id TEXT;
ALTER TABLE einrichtung ADD COLUMN rechner_name TEXT;
ALTER TABLE einrichtung ADD COLUMN stammdaten_etag TEXT;
ALTER TABLE einrichtung ADD COLUMN stammdaten_abgerufen TEXT;
ALTER TABLE einrichtung ADD COLUMN anker_abweichung TEXT;
ALTER TABLE einrichtung ADD COLUMN widerrufen INTEGER NOT NULL DEFAULT 0 CHECK (widerrufen IN (0, 1));
