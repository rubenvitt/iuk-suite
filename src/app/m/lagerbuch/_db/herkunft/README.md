# `herkunft/` — Belege, keine Quellen

`0001_append_only.ca04eb1.sql` ist eine byte-genaue Kopie von `drizzle/0001_append_only.sql` aus der
Alt-Anwendung `lagerbuch`, eingefroren auf Commit `ca04eb1`. Sie liegt hier eingecheckt, weil die CI
dieser Suite nur dieses eine Repository auscheckt: eine Zusicherung, die gegen `../lagerbuch/` liest,
waere lokal gruen und in der CI rot. Mit der Kopie traegt der wichtigere Teil des Beweises —
`migrations/0001_append_only.sql` ist byte-gleich mit dieser Datei — ueberall.

Diese Datei wird **nie** veraendert. Sie ist ein Beleg, kein Vorbild und keine Quelle: der Migrator
darf sie nicht einlesen, deshalb liegt `herkunft/` **neben** `migrations/` und nicht darin. Wer sie
anfasst, entwertet genau die Zusicherung, fuer die sie da ist. Aendert sich das Alt-Schema, entsteht
eine neue Datei mit neuem Commit-Suffix — die alte bleibt.
