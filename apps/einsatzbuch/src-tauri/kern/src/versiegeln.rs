//! Versiegeln eines ausstehenden Einsatzes in einer Transaktion: Nummer je Kalenderjahr in der
//! Suite-Zone, aktuelle Stammdaten einsetzen, verschlüsseln (`krypto::versiegele`), an die Kette
//! anhängen und aufräumen. Dazu die Frist-Prüfung, die dieselbe Transaktion auslöst, sobald
//! `frist_bis_ms` erreicht ist (Spec §4.3).
use chrono::{DateTime, Datelike, Utc};
use rusqlite::{OptionalExtension, params};

use crate::buch::{Betrieb, Buch};
use crate::einrichtung::Stammdaten;
use crate::erfassung::{Entwurf, ErfassungFehler, Schnappschuss, Versiegelung, formatiere_zeitpunkt};
use crate::format::{Blockkopf, Einsatz, FahrzeugStand, GENESIS, PersonStand};
use crate::krypto::{self, Blockzufall, Zufall};

/// Löst die IDs eines Entwurfs gegen die aktuellen Stammdaten auf; eine ID, die es dort nicht
/// mehr gibt, fällt auf den beim Absenden gespeicherten Schnappschuss zurück — eine automatische
/// Versiegelung darf nie an inzwischen geänderten Stammdaten scheitern. Das gewählte Fahrzeug
/// einer Person kommt in jedem Fall aus dem Entwurf, nicht aus dem Schnappschuss: Es ist die zum
/// Versiegelungszeitpunkt gültige Zuordnung, unabhängig davon, woher Name und Qualifikation
/// stammen.
fn loese_schnappschuss(entwurf: &Entwurf, stammdaten: &Stammdaten, alt: &Schnappschuss) -> (Vec<FahrzeugStand>, Vec<PersonStand>) {
    let fahrzeuge = entwurf
        .fahrzeuge
        .iter()
        .map(|id| {
            stammdaten
                .fahrzeuge
                .iter()
                .find(|f| &f.id == id)
                .map(|f| FahrzeugStand { id: f.id.clone(), typ: f.typ.clone(), kennung: f.kennung.clone(), ruf: f.ruf.clone(), standort: f.standort.clone() })
                .or_else(|| alt.fahrzeuge.iter().find(|f| &f.id == id).cloned())
                .expect("beim Absenden geprüfte ID muss in den Stammdaten oder im Schnappschuss stehen")
        })
        .collect();
    let personal = entwurf
        .personal
        .iter()
        .map(|auswahl| {
            let mut stand = stammdaten
                .personal
                .iter()
                .find(|p| p.id == auswahl.id)
                .map(|p| PersonStand { id: p.id.clone(), name: p.name.clone(), quali: p.quali.clone(), ov: p.ov.clone(), fahrzeug_id: None })
                .or_else(|| alt.personal.iter().find(|p| p.id == auswahl.id).cloned())
                .expect("beim Absenden geprüfte ID muss in den Stammdaten oder im Schnappschuss stehen");
            stand.fahrzeug_id = auswahl.fahrzeug_id.clone();
            stand
        })
        .collect();
    (fahrzeuge, personal)
}

/// Räumt nach einem erfolgreichen Versiegeln den Klartext auch aus der WAL: `VACUUM` allein
/// schreibt bei einer offenen Verbindung im WAL-Modus nur neue Frames in die `-wal`-Datei, die
/// alten Frames mit dem Klartext aus `ausstehend`/`entwurf` blieben dort bis zum nächsten,
/// von dieser Funktion nicht kontrollierten Checkpoint liegen — das träfe den Normalbetrieb mit
/// langlebiger Verbindung ebenso wie jeden Absturz dazwischen. Der Checkpoint danach schreibt die
/// WAL vollständig in die Hauptdatei zurück und schneidet `-wal` auf 0 Byte zurück (`TRUNCATE`).
/// Beide Schritte sind unkritisch, wenn sie scheitern — der Block steht schon fest — und werden
/// nur geloggt, nie als Fehler nach außen gereicht.
fn raeume_nach_dem_versiegeln_auf(conn: &rusqlite::Connection) {
    if let Err(fehler) = conn.execute("VACUUM", []) {
        eprintln!("VACUUM nach dem Versiegeln fehlgeschlagen (unkritisch, der Block ist schon geschrieben): {fehler}");
    }
    match conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
    }) {
        Ok((busy, _log, _checkpointed)) if busy != 0 => eprintln!(
            "WAL-Checkpoint nach dem Versiegeln unvollständig (unkritisch, der Block ist schon geschrieben): eine andere Verbindung war noch aktiv"
        ),
        Ok(_) => {}
        Err(fehler) => {
            eprintln!("WAL-Checkpoint nach dem Versiegeln fehlgeschlagen (unkritisch, der Block ist schon geschrieben): {fehler}")
        }
    }
}

impl Buch {
    /// Versiegelt den ausstehenden Einsatz in einer Transaktion (Spec §4.3):
    /// 1. Nummer je Kalenderjahr in der Zone der Einrichtung vergeben.
    /// 2. Aktuelle Stammdaten in den Einsatz einsetzen (Rückfall auf den Schnappschuss).
    /// 3. `krypto::versiegele`.
    /// 4. Block anhängen.
    /// 5. Die Versiegelung als unquittiert vormerken (`unquittiert`, ersetzt eine ältere).
    /// 6. `ausstehend` und `entwurf` löschen.
    ///
    /// Ohne ausstehenden Einsatz `Ok(None)` — auch der Lesezugriff, der das feststellt, läuft
    /// schon auf `tx`, damit diese Methode für sich genommen atomar ist, unabhängig davon, was
    /// die Aufruferin (`pruefe_frist` oder ein unmittelbarer „Jetzt versiegeln"-Aufruf) vorher
    /// schon gelesen hat. Scheitert ein Schritt, verwirft die `Transaction` beim Verlassen der
    /// Funktion über `?` alles Bisherige — ohne `commit()` rollt `rusqlite` automatisch zurück.
    /// `raeume_nach_dem_versiegeln_auf` läuft danach außerhalb der Transaktion.
    pub fn versiegele_ausstehend(
        &mut self,
        jetzt: DateTime<Utc>,
        z: &mut dyn Zufall,
        verfallen_wenn_entwurf: bool,
    ) -> Result<Option<Versiegelung>, ErfassungFehler> {
        let einrichtung = self.einrichtung()?.ok_or(ErfassungFehler::NichtEingerichtet)?;
        // Vor `self.transaktion()` gelesen: `Betrieb` ist `Copy`, `tx` leiht `self` aber
        // veränderlich, solange sie lebt — ein späterer `self.betrieb()`-Aufruf ginge nicht mehr.
        let betrieb = self.betrieb();
        let praefix = if betrieb == Betrieb::Test { "T-" } else { "" };

        let tx = self.transaktion()?;

        let ausstehend_zeile: Option<(String, String)> = tx
            .query_row("SELECT json, schnappschuss FROM ausstehend WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?;
        let Some((entwurf_json, schnappschuss_json)) = ausstehend_zeile else { return Ok(None) };

        let entwurf_existiert: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM entwurf WHERE id = 1)", [], |r| r.get(0))?;
        let verfallen = verfallen_wenn_entwurf && entwurf_existiert;

        let entwurf: Entwurf = serde_json::from_str(&entwurf_json)?;
        let alter_schnappschuss: Schnappschuss = serde_json::from_str(&schnappschuss_json)?;
        let (fahrzeuge, personal) = loese_schnappschuss(&entwurf, &einrichtung.paket.stammdaten, &alter_schnappschuss);

        let tz: chrono_tz::Tz = einrichtung.paket.zeitzone.parse().expect("Zeitzone wurde bei der Einrichtung geprüft");
        let jahr = i64::from(jetzt.with_timezone(&tz).year());

        let letzte: i64 = tx.query_row(
            "INSERT INTO nummern (jahr, letzte) VALUES (?1, 1) \
             ON CONFLICT(jahr) DO UPDATE SET letzte = letzte + 1 \
             RETURNING letzte",
            params![jahr],
            |r| r.get(0),
        )?;
        let nummer = format!("{praefix}{jahr}-{letzte:03}");

        let (block_nr, prev) = match tx.query_row("SELECT block, hash FROM bloecke ORDER BY block DESC LIMIT 1", [], |r| {
            Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?))
        }) {
            Ok((letzter, hash)) => (letzter + 1, hash),
            Err(rusqlite::Error::QueryReturnedNoRows) => (1, GENESIS.to_string()),
            Err(e) => return Err(e.into()),
        };

        let versiegelt_text = formatiere_zeitpunkt(jetzt, &einrichtung.paket.zeitzone);
        let kopf = Blockkopf {
            v: 1,
            block: block_nr,
            prev: prev.clone(),
            versiegelt: versiegelt_text.clone(),
            schluessel_id: einrichtung.schluessel_id.clone(),
            umgebung: betrieb.umgebung(),
        };
        // Fund aus Phase C: Vor der eigentlichen Verschlüsselung prüfen, ob sich dieser Kopf
        // überhaupt kanonisieren lässt — eine manipulierte Kette mit einer Blocknummer über der
        // Grenze sicherer Ganzzahlen (`jcs::SICHER`) lief hier früher in einen Panic statt in
        // diesen Fehler.
        kopf.kanonisch()?;
        let einsatz = Einsatz {
            v: 1,
            nummer: nummer.clone(),
            stichwort: entwurf.stichwort.clone(),
            beginn_datum: entwurf.beginn_datum.clone(),
            beginn_zeit: entwurf.beginn_zeit.clone(),
            ende_datum: (!entwurf.ende_datum.is_empty()).then(|| entwurf.ende_datum.clone()),
            ende_zeit: (!entwurf.ende_zeit.is_empty()).then(|| entwurf.ende_zeit.clone()),
            strasse: entwurf.strasse.clone(),
            ort: entwurf.ort.clone(),
            objekt: entwurf.objekt.clone(),
            fahrzeuge,
            personal,
            vor_ort: entwurf.vor_ort,
            transport: entwurf.transport,
            notizen: entwurf.notizen.clone(),
        };

        let suite_spki = krypto::aus_b64(&einrichtung.oeffentlich_spki)?;
        let suite_oeffentlich = krypto::oeffentlich_aus_spki(&suite_spki)?;
        let zufall = Blockzufall::ziehe(z);
        let block = krypto::versiegele(&einsatz, &kopf, &suite_oeffentlich, zufall)?;

        tx.execute(
            "INSERT INTO bloecke (block, json, hash, versiegelt) VALUES (?1, ?2, ?3, ?4)",
            params![block_nr as i64, serde_json::to_string(&block)?, block.hash, versiegelt_text],
        )?;
        let versiegelung = Versiegelung { block: block_nr, hash: block.hash, prev, versiegelt: versiegelt_text, nummer, verfallen };
        // In `tx`, nach dem Block: Ohne Hinweis kein Block und umgekehrt. So übersteht „Deine
        // letzten Änderungen wurden nicht übernommen …“ auch einen Absturz direkt danach.
        tx.execute(
            "INSERT OR REPLACE INTO unquittiert (id, json) VALUES (1, ?1)",
            params![serde_json::to_string(&versiegelung)?],
        )?;
        tx.execute("DELETE FROM ausstehend", [])?;
        tx.execute("DELETE FROM entwurf", [])?;
        tx.commit()?;

        raeume_nach_dem_versiegeln_auf(self.conn());

        Ok(Some(versiegelung))
    }

    /// Prüft die Frist mit der übergebenen Uhrzeit, nie mit der Systemzeit: Ist ein ausstehender
    /// Einsatz vorhanden und `frist_bis_ms` erreicht, versiegelt sie den zuletzt abgesendeten
    /// Stand (`verfallen = true`, sofern dabei ein ungespeicherter Formularstand existierte).
    /// Ohne ausstehenden Einsatz oder vor Ablauf `Ok(None)`. Die Prüfung selbst läuft auf einer
    /// eigenen, rein lesenden Transaktion (`tx` wird ohne Schreibzugriff verworfen, das ist bei
    /// einer reinen Leseaktion gleichwertig zu `commit()`); das eigentliche Versiegeln danach ist
    /// unabhängig davon noch einmal für sich atomar (`versiegele_ausstehend`).
    pub fn pruefe_frist(&mut self, jetzt: DateTime<Utc>, z: &mut dyn Zufall) -> Result<Option<Versiegelung>, ErfassungFehler> {
        let faellig = {
            let tx = self.transaktion()?;
            let frist_bis_ms: Option<i64> =
                tx.query_row("SELECT frist_bis_ms FROM ausstehend WHERE id = 1", [], |r| r.get(0)).optional()?;
            matches!(frist_bis_ms, Some(f) if f <= jetzt.timestamp_millis())
        };
        if faellig { self.versiegele_ausstehend(jetzt, z, true) } else { Ok(None) }
    }
}
