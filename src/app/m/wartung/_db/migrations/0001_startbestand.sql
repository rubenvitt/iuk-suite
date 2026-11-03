-- Startbestand der Gerätewartung (IDA-312): Gruppen Technik und I&K, die vier Gerätearten aus dem POC
-- (IDA-307) mit Fristen und Checklisten. Feste Kennungen (UUIDv5), damit Demodaten und Tests sie finden.
-- Danach pflegt die Verwaltung alles selbst; die Pocket-ID-Gruppen lassen sich unter Gruppen umbenennen.
INSERT INTO gruppe (id, name, pocket_gruppe, position, angelegt_am, aktualisiert_am) VALUES ('c7ccd7ce-32aa-51cf-aee2-50a529dfa2e9', 'Technik', 'wartung-technik', 0, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO gruppe (id, name, pocket_gruppe, position, angelegt_am, aktualisiert_am) VALUES ('3c4eb323-d210-59c9-a3b0-c1b7c410f13d', 'I&K', 'wartung-iuk', 1, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO art (id, name, einzahl, ikone, stunden_pflicht, position, angelegt_am, aktualisiert_am) VALUES ('fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Stromerzeuger', 'Stromerzeuger', 'engine', 1, 0, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('d06ab9f8-8d7d-55c8-a1ab-17e081c17795', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Quartalsprüfung', 'intern', 3, NULL, 0);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('0a60d30a-b5c2-5b6e-82bb-57fd37fbb1ab', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Wartung', 'fachfirma', 12, 100, 1);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('0b3bc63a-20c9-5da6-9e87-d6127573b178', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Elektroprüfung (DGUV V3)', 'elektrofachkraft', 12, NULL, 2);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('c8110ca9-db95-5fdb-81f9-f9ad714b25bd', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Sichtprüfung', 'Gehäuse, Rahmen und Griffe ohne Schaden, keine Öl- oder Kraftstoffspuren unter dem Gerät.', 0);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('113240f0-bc2d-5eff-9329-d4779fce7f4f', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Ölstand', 'Gerät waagerecht, Messstab abwischen, eintauchen, ablesen. Unter Minimum: nachfüllen und als Mangel notieren.', 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('b976cb84-2a28-5a2c-9471-a247444b71de', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Kraftstoff', 'Tank mindestens drei Viertel voll, Reservekanister voll und dicht.', 2);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('5c51fe64-2956-5e24-adcf-f2232ac1e213', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Luftfilter', 'Deckel öffnen, Filter auf Schmutz und Risse ansehen.', 3);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('32b71474-7228-50a1-a6ba-c3212036817c', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Probelauf unter Last', 'Starten, Verbraucher (z. B. Scheinwerfer) anschließen, mindestens 15 Minuten laufen lassen. Läuft er rund?', 4);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('01324117-01cf-574b-b282-479eab70dded', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Spannung und Frequenz', 'Anzeige unter Last: etwa 230 V und 50 Hz.', 5);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('c77080a4-d050-581e-b790-8b755e5555e5', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Isolationswächter / FI', 'Prüftaste drücken: muss abschalten. Danach zurücksetzen.', 6);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('6fd0f8c5-53aa-52c3-a672-4b572314cb37', 'fd1af1ab-5190-5347-969d-cd0a31d9b6c4', 'Zubehör vollständig', 'Verlängerung, Verteiler, Erdungsspieß mit Leitung, Betriebsanleitung im Fach.', 7);
--> statement-breakpoint
INSERT INTO art (id, name, einzahl, ikone, stunden_pflicht, position, angelegt_am, aktualisiert_am) VALUES ('041a7030-e246-5614-9946-20bd4d2f490c', 'Heizungen', 'Heizung', 'fire', 0, 1, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('5f692f33-2bd4-575f-8d00-9aefaa44b298', '041a7030-e246-5614-9946-20bd4d2f490c', 'Quartalsprüfung', 'intern', 3, NULL, 0);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('8a2acc24-6dda-5c16-a7f5-4d24504cf700', '041a7030-e246-5614-9946-20bd4d2f490c', 'Wartung vor der Heizsaison', 'fachfirma', 12, NULL, 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('0b16fc08-ebbb-52c9-bec1-31d1252a2f5b', '041a7030-e246-5614-9946-20bd4d2f490c', 'Sichtprüfung', 'Gehäuse, Abgasrohr, Warmluftschlauch und Kabel ohne Schaden.', 0);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('71f961a2-fba3-5ae9-b91c-44c0e1c15385', '041a7030-e246-5614-9946-20bd4d2f490c', 'Brennstoff', 'Tank voll, Kanister voll. Bei Elektroheizung: Stecker und Leitung prüfen.', 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('81b3f0ca-07cd-5b15-95df-746e9cb7014e', '041a7030-e246-5614-9946-20bd4d2f490c', 'Probelauf', 'Mindestens 10 Minuten laufen lassen. Kommt warme Luft, ohne Rauch oder Geruch im Zelt?', 2);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('52cf55ee-7c1f-5616-992e-6a914da12df1', '041a7030-e246-5614-9946-20bd4d2f490c', 'Thermostat und Überhitzungsschutz', 'Thermostat herunterdrehen: Brenner muss abschalten.', 3);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('98b4d097-1e29-5a01-801a-fe8e5df749f7', '041a7030-e246-5614-9946-20bd4d2f490c', 'CO-Warner', 'Liegt beim Gerät, Testtaste piept, Batterie nicht leer.', 4);
--> statement-breakpoint
INSERT INTO art (id, name, einzahl, ikone, stunden_pflicht, position, angelegt_am, aktualisiert_am) VALUES ('32104ecc-dd27-59e1-ac96-15ee83b96707', 'Akkus und Powerstationen', 'Akku / Powerstation', 'charging-battery', 0, 2, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('a86ee46d-168e-53ff-a314-a46631adf341', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Quartalsprüfung', 'intern', 3, NULL, 0);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('15ccad90-4b29-5327-a9c1-66d7d16a5504', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Elektroprüfung (DGUV V3)', 'elektrofachkraft', 12, NULL, 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('618fd486-0f9f-5b05-80f7-0f4dac2061fb', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Sichtprüfung', 'Gehäuse ohne Risse oder Wölbung, Anschlüsse sauber, Kabel ohne Knick.', 0);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('53fba7b3-6e89-5be0-abc2-fa8bb8d2bef1', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Ladestand', 'Auf Lagerladung bringen (etwa 60–80 %), nicht voll über Monate stehen lassen.', 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('721b576a-2e29-5b12-8192-caad64d7ddf1', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Last kurz prüfen', 'Einen Verbraucher (z. B. Router) 5 Minuten betreiben, Anzeige plausibel.', 2);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('ac2546fb-f1ef-5ddb-b17f-6fa590904ebd', '32104ecc-dd27-59e1-ac96-15ee83b96707', 'Ladegerät und Kabel vollständig', 'Netzteil, Kfz-Kabel und Adapter liegen in der Kiste.', 3);
--> statement-breakpoint
INSERT INTO art (id, name, einzahl, ikone, stunden_pflicht, position, angelegt_am, aktualisiert_am) VALUES ('d0fd6334-2f77-5dde-a0df-613133afdf84', 'IT und Netzwerk', 'IT-Gerät', 'computer', 0, 3, 1793664000000, 1793664000000);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('173cf362-ee70-5303-a056-698f8cf7e603', 'd0fd6334-2f77-5dde-a0df-613133afdf84', 'Quartalsprüfung', 'intern', 3, NULL, 0);
--> statement-breakpoint
INSERT INTO frist (id, art_id, name, wer, monate, stunden, position) VALUES ('1709a29b-2902-5f22-a055-9a0f61ba8805', 'd0fd6334-2f77-5dde-a0df-613133afdf84', 'Elektroprüfung (DGUV V3)', 'elektrofachkraft', 24, NULL, 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('5b2ecd2f-04b4-5dfd-a8b8-5fa80efa7790', 'd0fd6334-2f77-5dde-a0df-613133afdf84', 'Startet und meldet sich an', 'Einschalten, mit dem Einsatzkonto anmelden.', 0);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('32466009-ee1f-53d2-960e-056b43941d2a', 'd0fd6334-2f77-5dde-a0df-613133afdf84', 'Updates eingespielt', 'Systemupdates laufen lassen, bis nichts mehr ansteht.', 1);
--> statement-breakpoint
INSERT INTO checkpunkt (id, art_id, text, hinweis, position) VALUES ('8c69de22-77e3-595e-8be8-181b490493f9', 'd0fd6334-2f77-5dde-a0df-613133afdf84', 'Netzteil und Zubehör vollständig', 'Netzteil, Maus, Netzwerkkabel in der Tasche.', 2);
