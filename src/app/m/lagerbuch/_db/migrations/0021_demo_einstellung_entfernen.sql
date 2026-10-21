-- IDA-225: Rueckbau des Demo-Checks aus IDA-224 (Kommandositzung am 20.10.2026).
--
-- 0018 bleibt stehen: sie ist auf `main` gelaufen und steht in den
-- Produktivdatenbanken; ein geloeschter Journal-Eintrag liesse die Tabelle dort
-- als Leiche liegen, abweichend von Schema und Audit-Katalog. Die drei
-- `audit_demo_einstellung_*`-Trigger fallen mit der Tabelle.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (vgl. Kopf von 0005).
DROP TABLE IF EXISTS `demo_einstellung`;
