-- DRK-488: Die Suite führt keinen Ortsverein mehr, alle gehören zu Uelzen. Die Spalte `ov` bleibt,
-- weil sie im Draht zur App und im versiegelten Einsatzformat steht (`PersonStand`), und wird
-- geleert. Die Trigger aus 0001 zählen dabei den Stammdatenstand hoch, damit jeder Rechner das
-- Paket mit leerem Ortsverein neu abholt, und schreiben je geänderter Person ein Audit-Ereignis.
UPDATE person SET ov = '' WHERE ov <> '';
