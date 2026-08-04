-- Entscheidung 25 (a): die Handlager-Zeile ist eine MIGRATIONSZEILE, kein Seed.
--
-- Sie ist eine fachliche Konstante mit 75 Fundstellen unter src/ der Alt-App; jede
-- Entnahme, Inventurkorrektur, Aussonderung und Nachfuellung bucht gegen genau diese
-- ID. Mit foreign_keys = ON ist eine andere ID kein Schoenheitsfehler, sondern ein
-- FK-Fehler bei der ersten Entnahme.
--
-- Als Boot-Schritt liefe sie ausserhalb der Versionierung; als Boot-Assert machte
-- eine fehlende Zeile aus einem Datenproblem einen TOTALAUSFALL DER GANZEN SUITE,
-- weil migrateAllModules() alle Module in einer Schleife faehrt.
--
-- INSERT OR IGNORE ist idempotent und kollidiert nicht mit der Altzeile, die der
-- Import mitbringt: die produktive lagerorte-Tabelle traegt 'handlager' seit dem
-- ersten Boot (ensureHandlager arbeitet selbst mit onConflictDoNothing).
INSERT OR IGNORE INTO lagerorte (id, name, typ, kennung, aktiv, template_id)
VALUES ('handlager', 'Handlager', 'lager', NULL, 1, NULL);
