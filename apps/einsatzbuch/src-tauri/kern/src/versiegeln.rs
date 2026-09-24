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

impl Buch {
    /// Versiegelt den ausstehenden Einsatz in einer Transaktion (Spec §4.3):
    /// 1. Nummer je Kalenderjahr in der Zone der Einrichtung vergeben.
    /// 2. Aktuelle Stammdaten in den Einsatz einsetzen (Rückfall auf den Schnappschuss).
    /// 3. `krypto::versiegele`.
    /// 4. Block anhängen.
    /// 5. `ausstehend` und `entwurf` löschen.
    ///
    /// Ohne ausstehenden Einsatz `Ok(None)`. Scheitert ein Schritt, verwirft die `Transaction`
    /// beim Verlassen der Funktion über `?` alles Bisherige — ohne `commit()` rollt `rusqlite`
    /// automatisch zurück. `VACUUM` läuft danach außerhalb der Transaktion; ein Fehler dabei ist
    /// unkritisch (der Block steht schon fest) und wird nur geloggt.
    pub fn versiegele_ausstehend(
        &mut self,
        jetzt: DateTime<Utc>,
        z: &mut dyn Zufall,
        verfallen_wenn_entwurf: bool,
    ) -> Result<Option<Versiegelung>, ErfassungFehler> {
        let einrichtung = self.einrichtung()?.ok_or(ErfassungFehler::NichtEingerichtet)?;

        let ausstehend_zeile: Option<(String, String)> = self
            .verbindung()
            .query_row("SELECT json, schnappschuss FROM ausstehend WHERE id = 1", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?;
        let Some((entwurf_json, schnappschuss_json)) = ausstehend_zeile else { return Ok(None) };

        let entwurf_existiert: bool =
            self.verbindung().query_row("SELECT EXISTS(SELECT 1 FROM entwurf WHERE id = 1)", [], |r| r.get(0))?;
        let verfallen = verfallen_wenn_entwurf && entwurf_existiert;

        let entwurf: Entwurf = serde_json::from_str(&entwurf_json)?;
        let alter_schnappschuss: Schnappschuss = serde_json::from_str(&schnappschuss_json)?;
        let (fahrzeuge, personal) = loese_schnappschuss(&entwurf, &einrichtung.paket.stammdaten, &alter_schnappschuss);

        let tz: chrono_tz::Tz = einrichtung.paket.zeitzone.parse().expect("Zeitzone wurde bei der Einrichtung geprüft");
        let jahr = i64::from(jetzt.with_timezone(&tz).year());
        // Vor `self.transaktion()` gelesen: `Betrieb` ist `Copy`, `tx` leiht `self` aber
        // veränderlich, solange sie lebt — ein späterer `self.betrieb()`-Aufruf ginge nicht mehr.
        let betrieb = self.betrieb();
        let praefix = if betrieb == Betrieb::Test { "T-" } else { "" };

        let tx = self.transaktion()?;

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
        tx.execute("DELETE FROM ausstehend", [])?;
        tx.execute("DELETE FROM entwurf", [])?;
        tx.commit()?;

        if let Err(fehler) = self.verbindung().execute("VACUUM", []) {
            eprintln!("VACUUM nach dem Versiegeln fehlgeschlagen (unkritisch, der Block ist schon geschrieben): {fehler}");
        }

        Ok(Some(Versiegelung { block: block_nr, hash: block.hash, prev, versiegelt: versiegelt_text, nummer, verfallen }))
    }

    /// Prüft die Frist mit der übergebenen Uhrzeit, nie mit der Systemzeit: Ist ein ausstehender
    /// Einsatz vorhanden und `frist_bis_ms` erreicht, versiegelt sie den zuletzt abgesendeten
    /// Stand (`verfallen = true`, sofern dabei ein ungespeicherter Formularstand existierte).
    /// Ohne ausstehenden Einsatz oder vor Ablauf `Ok(None)`.
    pub fn pruefe_frist(&mut self, jetzt: DateTime<Utc>, z: &mut dyn Zufall) -> Result<Option<Versiegelung>, ErfassungFehler> {
        let frist_bis_ms: Option<i64> =
            self.verbindung().query_row("SELECT frist_bis_ms FROM ausstehend WHERE id = 1", [], |r| r.get(0)).optional()?;
        match frist_bis_ms {
            Some(f) if f <= jetzt.timestamp_millis() => self.versiegele_ausstehend(jetzt, z, true),
            _ => Ok(None),
        }
    }
}
