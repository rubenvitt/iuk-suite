-- Entscheidung 5 (c): bz_kontrollen ist ein Medizinprodukte-Nachweis und friert in
-- ref_snapshot die Referenzbereiche zum Messzeitpunkt ein. Die Append-only-Zusage
-- stand bisher nur als Kommentar im Anwendungscode.
--
-- Geprueft, dass nichts bricht: im gesamten Alt-Repo null Treffer fuer
-- delete(bzKontrollen)/update(bzKontrollen); der Hard-Delete eines BZ-Geraets ist
-- bereits gesperrt, sobald eine Kontrolle existiert. Der Trigger nimmt keinem
-- laufenden Pfad etwas weg — er macht eine Zusage erzwingbar.
--
-- o2_messungen bekommt bewusst KEINE (§4.4). Die Gegenprobe steht in
-- _db/append-only.test.ts, sonst ist „bewusst offen gelassen" von „vergessen"
-- nicht zu unterscheiden.
CREATE TRIGGER bz_kontrollen_no_update
BEFORE UPDATE ON bz_kontrollen
BEGIN
  SELECT RAISE(ABORT, 'bz-kontrollen sind append-only');
END;
--> statement-breakpoint
CREATE TRIGGER bz_kontrollen_no_delete
BEFORE DELETE ON bz_kontrollen
BEGIN
  SELECT RAISE(ABORT, 'bz-kontrollen sind append-only');
END;
