-- Schema v3 (Stufe 6, Sicherung und Export).
-- `unquittiert`: die letzte Versiegelung, die die Oberfläche noch nicht quittiert hat, als JSON
-- (`erfassung::Versiegelung`). Höchstens eine Zeile; geschrieben in derselben Transaktion wie
-- das `INSERT` in `bloecke` (`versiegele_ausstehend`), damit der Hinweis auf verworfene
-- Änderungen einen Neustart übersteht.
CREATE TABLE unquittiert (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT    NOT NULL
);
-- Zeitpunkt der letzten Bestätigung von `anker_gemeldet_bis` durch die Suite, in der Zone der
-- Einrichtung — der Anker im Export trägt ihn (`Exportinhalt.anker.gemeldetAm`).
ALTER TABLE einrichtung ADD COLUMN anker_gemeldet_am TEXT;
-- Text des letzten gescheiterten Sicherungsversuchs, `NULL` nach einer gelungenen Sicherung.
-- `sicherungsordner` und `letzte_sicherung` gibt es schon seit v1.
ALTER TABLE einrichtung ADD COLUMN sicherung_fehler TEXT;
