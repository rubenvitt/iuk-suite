-- Schema v4 (IDA-359): Welcher versiegelte Block welchen Einsatz eines Umsystems nennt. Der Block
-- selbst ist für die Suite verschlüsselt, der Rechner liest ihn nicht wieder; die Meldung an die
-- Suite (`POST /api/anker`, Feld `umsysteme`) nimmt die Verknüpfung von hier. Geschrieben in
-- derselben Transaktion wie das `INSERT` in `bloecke` (`versiegele_ausstehend`). Ein Einsatz
-- eines Umsystems gehört zu höchstens einem Block.
CREATE TABLE umsystem_meldung (
  system TEXT    NOT NULL,
  id     TEXT    NOT NULL,
  block  INTEGER NOT NULL REFERENCES bloecke (block),
  PRIMARY KEY (system, id)
);
CREATE INDEX umsystem_meldung_block ON umsystem_meldung (block);
