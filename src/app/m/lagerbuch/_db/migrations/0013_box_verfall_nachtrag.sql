-- DRK-377: der gemeldete Verfall fuer Material, das BEIM ROLLOUT SCHON IN DER
-- KISTE LIEGT.
--
-- Die Aenderung selbst laesst die Meldung dem Material folgen — aber erst ab
-- der naechsten Abgabe. Bestand, der vorher in die Entnahmebox gewandert ist,
-- hat seine Meldung an der Einheit zurueckgelassen: die Kiste zeigt fuer ihn
-- weiterhin nichts, und „nichts" liest sich auf dem Schirm als „bis 12/99".
-- Das ist exakt der Schaden, gegen den das Ticket gebaut ist — er stuende ohne
-- diese Migration nach dem Rollout unveraendert weiter auf der Flaeche und
-- verschwaende erst, wenn jemand zufaellig denselben Artikel noch einmal
-- abgibt.
--
-- DIE HERKUNFT STEHT IM JOURNAL, sie muss nicht geraten werden: eine
-- Box-Zugangsbuchung traegt `referenz = 'entnahmebox:<quellOrtId>'`. Das ist
-- das einzige der sieben Praefixe, das die QUELLE nennt statt des Ziels
-- (`_lib/vorgang.ts`) — hier ist genau das die tragende Eigenschaft.
--
-- ⚠️ SIE KOPIERT, SIE LOESCHT NICHT — anders als `verfallFolgtDemMaterial` zur
-- Laufzeit, und das ist kein Vergessen. Zur Laufzeit faellt die Angabe an der
-- Einheit, weil in derselben Sekunde das letzte Stueck von dort verschwunden
-- ist. Hier liegt zwischen beidem ein unbekannter Zeitraum: die Einheit ist
-- laengst wieder bestueckt, ihre Zeile beschreibt eine Packung, die HEUTE dort
-- liegt, und sie zu loeschen naehme einer Einheit eine gueltige Meldung weg.
-- Das Aufraeumen an der Einheit bleibt dem normalen Weg
-- (`bereinigeVerfallOhneAktivesSoll`).
--
-- ⚠️ DIE RIEGEL STEHEN HIER ANDERSHERUM ALS IM SEED, und wer das fuer einen
-- Widerspruch haelt, dreht einen davon in die falsche Richtung. Der Seed darf
-- keinen Zustand ERFINDEN — sein Fehlschlag ist eine Demo-Datenbank, die etwas
-- behauptet, was nie passiert ist, und dagegen hilft nur eng. Diese Migration
-- darf kein Warnsignal VERLIEREN — ihr Fehlschlag ist eine abgelaufene Packung
-- ohne Hinweis, und dagegen hilft nur grosszuegig. Jedes Datum ist frueher als
-- gar keines; die teuerste Zeile ist die, die leer bleibt.
--
-- ⚠️ WAS SIE NICHT KANN, damit es niemand fuer mehr haelt: eine Buchung sagt,
-- WIEVIEL an einen Ort kam, nicht WELCHE Packung noch dort liegt. Wurde die
-- Kiste zwischendurch geleert und aus einer anderen Einheit neu befuellt, kann
-- das uebernommene Datum Material beschreiben, das nicht mehr da ist. Der Preis
-- ist eine Warnung, die zu FRUEH kommt — dieselbe Richtung, die die
-- Betreiberentscheidung „das fruehere Datum gewinnt" ohnehin waehlt, und die
-- harmlose Haelfte des Irrtums. Genau umgekehrt waere sie teuer.
--
-- ⚠️ UND „GENAU UMGEKEHRT" WAR MOEGLICH, BIS DIE ZEITPROBE DAZUKAM. Dieser
-- Absatz hat die harmlose Richtung behauptet, ohne sie zu sichern: weil
-- `lagerort_verfall` keine Historie fuehrt, konnte ein SPAETERER Check der
-- Herkunftseinheit ihre Zeile ueberschreiben, und der Nachtrag trug dann ein zu
-- SPAETES Datum ein. Die Bedingung, die den Absatz wahr macht, steht unten an
-- der Buchung (`b.ts >= lv.erfasst_at`) — wer sie entfernt, nimmt nicht eine
-- Vorsichtsmassnahme weg, sondern die Voraussetzung dieser Begruendung.
--
-- ⚠️ NUR AN EINEN ARTIKEL MIT BESTAND UND OHNE EIGENE MELDUNG. `NOT EXISTS`
-- macht den Schritt zugleich wiederholbar: eine Meldung, die der neue Weg
-- bereits geschrieben hat, wird nie ueberschrieben.
--
-- Die Meldung wandert ALS GANZES, mit `erfasst_at` und Quelle — dieselbe
-- Begruendung wie in `uebernimmVerfall`: sie ist die Ablesung eines Menschen
-- und bleibt dieselbe Meldung, auch wenn sie jetzt einen anderen Ort
-- beschreibt. „Jetzt" darauf zu stempeln ergaebe unter „Gemeldet" einen Tag, an
-- dem niemand hingesehen hat.
--
-- ⚠️ DIE `id` IST BEWUSST ERKENNBAR (`0013-…`) und keine nanoid: diese Zeilen
-- hat kein Mensch angelegt. Denselben Satz sagt `quelle_typ` NICHT — das traegt
-- die Quelle der urspruenglichen Meldung, nicht die dieses Schritts. Der
-- Audit-Eintrag, den `audit_lagerort_verfall_create` (0004) dazu schreibt,
-- traegt den System-Akteur und ist die ehrliche Auskunft.
INSERT INTO lagerort_verfall
  (id, lagerort_id, artikel_id, verfall, erfasst_at, quelle_typ, quelle_id)
SELECT
  '0013-' || lower(hex(randomblob(8))),
  'entnahmebox',
  q.artikel_id, q.verfall, q.erfasst_at, q.quelle_typ, q.quelle_id
FROM (
  SELECT
    lv.artikel_id, lv.verfall, lv.erfasst_at, lv.quelle_typ, lv.quelle_id,
    -- Das fruehere Datum gewinnt (Betreiberentscheidung zu DRK-377); bei
    -- gleichem Datum entscheidet die Ort-Id, damit zwei Laeufe auf derselben
    -- Datenbank dieselbe Zeile waehlen. "YYYY-MM" ist lexikografisch dieselbe
    -- Ordnung wie chronologisch — erzwungen von MONAT_REGEX an jedem Schreibweg.
    ROW_NUMBER() OVER (
      PARTITION BY lv.artikel_id ORDER BY lv.verfall ASC, lv.lagerort_id ASC
    ) AS rang
  FROM lagerort_verfall lv
  -- Diese Einheit hat diesen Artikel wirklich einmal in die Kiste gegeben.
  -- ⚠️ DAS SCHLIESST DIE KISTE ZUGLEICH ALS QUELLE AUS, ohne dass es dafuer eine
  -- eigene Zeile braucht: ein `entnahmebox:entnahmebox` gibt es nicht. Eine
  -- solche Zeile waere nicht nur ueberfluessig, sie waere UNPRUEFBAR — kein Fall
  -- stellt sie rot, und eine Bedingung, deren Wegfall niemand messen kann,
  -- sieht aus wie geprueftes Wissen, ohne es zu sein.
  WHERE EXISTS (
      SELECT 1 FROM buchungen b
       WHERE b.lagerort_id = 'entnahmebox'
         AND b.artikel_id  = lv.artikel_id
         AND b.menge > 0
         AND b.referenz = 'entnahmebox:' || lv.lagerort_id
         -- ⚠️ UND DIE MELDUNG MUSS AELTER SEIN ALS DIE ABGABE, sonst beschreibt
         -- sie das Material in der Kiste gar nicht (Codex zu PR #194, sechster
         -- Befund). `lagerort_verfall` fuehrt KEINE Historie: ein spaeterer
         -- Check an derselben Einheit ueberschreibt ihre einzige Zeile. Ohne
         -- diese Zeile wanderte eine Beobachtung in die Kiste, die NACH dem
         -- Abgang an einer inzwischen neu bestueckten Einheit gemacht wurde:
         --
         --     T1  RTW gibt Kompressen ab, gemeldet 10/26
         --     T2  RTW wird neu bestueckt, Check meldet 12/30 (ueberschreibt)
         --     --  Nachtrag kopiert 12/30 an die Kiste
         --     →   die Packung von T1 sieht bis 12/30 unbedenklich aus
         --
         -- DAS IST DIE TEURE HAELFTE DES IRRTUMS und widerspricht der
         -- Begruendung im Kopf: „jedes Datum ist frueher als gar keines" gilt
         -- nur, solange das Datum das Material auch MEINT. Eine zu spaete
         -- Angabe warnt nicht zu frueh, sie beruhigt zu Unrecht — und eine
         -- konkrete Zahl auf dem Schirm erstickt den Verdacht, den ein leeres
         -- Feld noch zulaesst.
         --
         -- `>=` und nicht `>`: Abgabe und Ablesung fallen im Check in dieselbe
         -- Sekunde (Sekundengranularitaet, Falle 3 am Schema) — mit `>` fiele
         -- genau der haeufigste Fall heraus.
         AND b.ts >= lv.erfasst_at
    )
    -- Die Kiste fuehrt fuer diesen Artikel noch keine eigene Meldung.
    AND NOT EXISTS (
      SELECT 1 FROM lagerort_verfall z
       WHERE z.lagerort_id = 'entnahmebox' AND z.artikel_id = lv.artikel_id
    )
    -- Und es liegt ueberhaupt noch etwas davon darin.
    AND (
      SELECT COALESCE(SUM(b2.menge), 0) FROM buchungen b2
       WHERE b2.lagerort_id = 'entnahmebox' AND b2.artikel_id = lv.artikel_id
    ) > 0
) q
WHERE q.rang = 1;
