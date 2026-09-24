//! Die lokale Datenbank des Einsatzbuch-Rechners (Spec §4.2). Unveränderlich ist nur die
//! Tabelle `bloecke` (Trigger im Schema, `src/schema.sql`); alle übrigen Tabellen ändert die
//! App im normalen Betrieb.
//!
//! Betriebsart und Einrichtung sind ausdrücklich getrennt: `Betrieb` entscheidet nur, welche
//! Datei geöffnet wird (`erkenne_betrieb` liest das aus dem Ordnerinhalt, Test vor Echt, und
//! meldet einen Lesefehler statt ihn zu verschlucken); ob
//! ein geöffnetes Buch schon eine Suite kennt, sagt `Buch::einrichtung`. `richte_ein` und
//! `uebernehme_stammdaten` sind die Naht zu Stufe 5 (Einrichtungsseite, Stammdatenabgleich) —
//! hier nur geprüft und geschrieben, aufgerufen wird beides erst dort.
use std::path::{Path, PathBuf};

use rusqlite::{Connection, params};
use serde::Serialize;

use crate::einrichtung::{Einrichtung, Stammdaten, Stammdatenpaket};
use crate::format::{Block, Umgebung};
use crate::krypto::{self, KryptoFehler};

const SCHEMA: &str = include_str!("schema.sql");
const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, thiserror::Error)]
pub enum BuchFehler {
    #[error("Datenbankfehler: {0}")]
    Datenbank(#[from] rusqlite::Error),
    #[error("Dateizugriff fehlgeschlagen: {0}")]
    Datei(#[from] std::io::Error),
    #[error("gespeicherte Stammdaten sind kein gültiges JSON: {0}")]
    StammdatenJson(#[from] serde_json::Error),
    #[error("unbekannte Schemaversion {gefunden} — dieser Rechner kennt nur Version {bekannt}")]
    UnbekannteSchemaversion { gefunden: i64, bekannt: i64 },
    #[error("die Einrichtung nennt die Umgebung {angegeben:?}, dieses Buch führt aber {betrieb:?}")]
    FalscheUmgebung { angegeben: Umgebung, betrieb: Umgebung },
    #[error("unbekannter Umgebungswert {0:?} in der Datenbank")]
    UnbekannteUmgebung(String),
    /// Ohne `#[from]`: ein Krypto-Fehler soll nicht über ein blindes `?` zu dieser Variante
    /// werden, denn sie behauptet „Schlüssel der Einrichtung“, während derselbe
    /// `KryptoFehler` z. B. beim Versiegeln eines Blocks ganz woanders auftreten kann.
    /// `richte_ein` ordnet deshalb ausdrücklich per `map_err` zu.
    #[error("der öffentliche Schlüssel der Einrichtung ist ungültig: {0}")]
    UngueltigerSchluessel(KryptoFehler),
    #[error("die angegebene schluesselId passt nicht zum öffentlichen Schlüssel")]
    SchluesselIdPasstNicht,
    #[error("frist_minuten muss zwischen 1 und 120 liegen, war {0}")]
    FristAusserBereich(u32),
    #[error("Zeitzone {0:?} ist keine gültige IANA-Zeitzone")]
    UngueltigeZeitzone(String),
    #[error("dieses Buch ist schon eingerichtet")]
    SchonEingerichtet,
    #[error("dieses Buch ist noch nicht eingerichtet")]
    NichtEingerichtet,
    #[error("Testbetrieb beenden ist nur im Testbetrieb erlaubt")]
    NichtImTestbetrieb,
    #[error("WAL-Checkpoint konnte nicht abschließen — eine andere Verbindung ist noch aktiv")]
    WalCheckpointBeschaeftigt,
    #[error("SQLite hat den Journalmodus {gefunden:?} gewählt, erwartet war `wal`")]
    JournalModusNichtWal { gefunden: String },
}

/// Betriebsart des Rechners — entscheidet nur, welche Datei geöffnet wird (Betriebsart aus
/// der Datei, Test vor Echt; Spec §12). Ob eine Einrichtung vorliegt, ist davon unabhängig
/// (`Buch::einrichtung`).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Betrieb {
    Echt,
    Test,
}

impl Betrieb {
    pub fn datei(self) -> &'static str {
        match self {
            Betrieb::Echt => "einsatzbuch.db",
            Betrieb::Test => "einsatzbuch-test.db",
        }
    }

    pub fn umgebung(self) -> Umgebung {
        match self {
            Betrieb::Echt => Umgebung::Echt,
            Betrieb::Test => Umgebung::Test,
        }
    }
}

/// Liest die Betriebsart aus dem Ordnerinhalt: Liegt `einsatzbuch-test.db` vor, ist es
/// Testbetrieb, sonst zählt `einsatzbuch.db`. Liegt keine der beiden Dateien vor, ist der
/// Rechner noch nicht eingerichtet — die Einrichtungsfrage beim ersten Start kommt in Stufe 5.
/// `try_exists` statt `exists`: ein Lesefehler (z. B. fehlende Berechtigung) wird gemeldet,
/// nicht still als „Datei fehlt“ gedeutet.
pub fn erkenne_betrieb(ordner: &Path) -> Result<Option<Betrieb>, BuchFehler> {
    if ordner.join(Betrieb::Test.datei()).try_exists()? {
        Ok(Some(Betrieb::Test))
    } else if ordner.join(Betrieb::Echt.datei()).try_exists()? {
        Ok(Some(Betrieb::Echt))
    } else {
        Ok(None)
    }
}

fn umgebung_text(u: Umgebung) -> &'static str {
    match u {
        Umgebung::Echt => "echt",
        Umgebung::Test => "test",
    }
}

/// Gibt `Err` zurück, wenn die Datenbank einen anderen Wert als `"echt"` oder `"test"` trägt
/// — ein unbekannter Wert fällt nicht still auf `Echt` zurück.
fn umgebung_aus_text(text: &str) -> Result<Umgebung, BuchFehler> {
    match text {
        "echt" => Ok(Umgebung::Echt),
        "test" => Ok(Umgebung::Test),
        sonst => Err(BuchFehler::UnbekannteUmgebung(sonst.to_string())),
    }
}

/// Prüft die beiden Feldregeln, die sowohl beim erstmaligen Einrichten als auch bei jedem
/// späteren Stammdatenabgleich gelten müssen: eine sinnvolle Frist und eine lesbare Zeitzone.
fn pruefe_frist_und_zeitzone(paket: &Stammdatenpaket) -> Result<(), BuchFehler> {
    if !(1..=120).contains(&paket.frist_minuten) {
        return Err(BuchFehler::FristAusserBereich(paket.frist_minuten));
    }
    paket
        .zeitzone
        .parse::<chrono_tz::Tz>()
        .map_err(|_| BuchFehler::UngueltigeZeitzone(paket.zeitzone.clone()))?;
    Ok(())
}

/// Eine Zeile der Tabelle `einrichtung`, gelesen aber noch nicht in `Einrichtung` entpackt
/// (die Stammdaten liegen dort noch als JSON-Text vor).
struct EinrichtungZeile {
    umgebung: String,
    suite_url: String,
    oeffentlich_spki: String,
    schluessel_id: String,
    stammdaten_json: String,
    stammdaten_version: i64,
    frist_minuten: u32,
    besatzung: bool,
    zeitzone: String,
    bereitschaft: String,
    eingerichtet_am: String,
    eingerichtet_von: String,
}

fn lies_einrichtung_zeile(zeile: &rusqlite::Row<'_>) -> rusqlite::Result<EinrichtungZeile> {
    Ok(EinrichtungZeile {
        umgebung: zeile.get("umgebung")?,
        suite_url: zeile.get("suite_url")?,
        oeffentlich_spki: zeile.get("oeffentlich_spki")?,
        schluessel_id: zeile.get("schluessel_id")?,
        stammdaten_json: zeile.get("stammdaten_json")?,
        stammdaten_version: zeile.get("stammdaten_version")?,
        frist_minuten: zeile.get("frist_minuten")?,
        besatzung: zeile.get("besatzung")?,
        zeitzone: zeile.get("zeitzone")?,
        bereitschaft: zeile.get("bereitschaft")?,
        eingerichtet_am: zeile.get("eingerichtet_am")?,
        eingerichtet_von: zeile.get("eingerichtet_von")?,
    })
}

/// Legt bei einer frischen Datenbank (`user_version = 0`) das Schema in einer Transaktion an
/// und setzt `user_version` im selben Zug. Eine bekannte Version wird übersprungen, eine
/// unbekannte höhere Version verweigert — dieser Rechner kennt kein Rückwärtsschema.
fn richte_schema_ein(conn: &mut Connection) -> Result<(), BuchFehler> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    match version {
        0 => {
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            tx.commit()?;
            Ok(())
        }
        v if v == SCHEMA_VERSION => Ok(()),
        gefunden => Err(BuchFehler::UnbekannteSchemaversion { gefunden, bekannt: SCHEMA_VERSION }),
    }
}

/// Das lokale Einsatzbuch: eine offene Verbindung auf `einsatzbuch.db` oder
/// `einsatzbuch-test.db`, samt Pfad (für `beende_testbetrieb`, das die Verbindung erst
/// schließt und die Datei danach über den Pfad löscht) und der Betriebsart, mit der sie
/// geöffnet wurde.
pub struct Buch {
    conn: Connection,
    betrieb: Betrieb,
    pfad: PathBuf,
}

impl Buch {
    /// Öffnet (und legt bei Bedarf an) die Datenbank der gegebenen Betriebsart im Ordner.
    /// Legt den Ordner selbst **nicht** an — das übernimmt die Hülle, denn nur sie kennt den
    /// richtigen Zeitpunkt (z. B. erst nach einer erfolgreichen Einrichtung). Setzt WAL,
    /// `synchronous = FULL` und Fremdschlüsselprüfung, bevor sie migriert. Liest den
    /// tatsächlich gewählten Journalmodus zurück (`pragma_update_and_check`) statt ihn nur
    /// anzufordern — manche Umgebungen (z. B. eine Netzwerkfreigabe oder `:memory:`) lassen
    /// WAL gar nicht zu und fallen sonst still auf einen anderen Modus zurück.
    pub fn oeffne(ordner: &Path, betrieb: Betrieb) -> Result<Buch, BuchFehler> {
        let pfad = ordner.join(betrieb.datei());
        let mut conn = Connection::open(&pfad)?;
        let journal: String = conn.pragma_update_and_check(None, "journal_mode", "WAL", |r| r.get(0))?;
        if journal != "wal" {
            return Err(BuchFehler::JournalModusNichtWal { gefunden: journal });
        }
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        // Der Klartext eines ausstehenden Einsatzes liegt bewusst unverschlüsselt in `ausstehend`
        // und `entwurf` (Spec §4.2) — `secure_delete` sorgt dafür, dass SQLite eine gelöschte
        // Seite mit Nullen statt mit ihrem alten Inhalt überschreibt, sobald sie wiederverwendet
        // wird. Nötig, aber allein nicht hinreichend: erst zusammen mit `VACUUM` und einem
        // WAL-Checkpoint nach dem Versiegeln (`versiegeln.rs`) verschwindet der Klartext auch aus
        // der `-wal`-Datei.
        conn.pragma_update(None, "secure_delete", "ON")?;
        richte_schema_ein(&mut conn)?;
        Ok(Buch { conn, betrieb, pfad })
    }

    pub fn betrieb(&self) -> Betrieb {
        self.betrieb
    }

    /// Liest die Einrichtung, sofern schon eine geschrieben wurde.
    pub fn einrichtung(&self) -> Result<Option<Einrichtung>, BuchFehler> {
        let gefunden = self.conn.query_row(
            "SELECT umgebung, suite_url, oeffentlich_spki, schluessel_id, stammdaten_json, \
             stammdaten_version, frist_minuten, besatzung, zeitzone, bereitschaft, \
             eingerichtet_am, eingerichtet_von FROM einrichtung WHERE id = 1",
            [],
            lies_einrichtung_zeile,
        );
        let zeile = match gefunden {
            Ok(zeile) => zeile,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let stammdaten: Stammdaten = serde_json::from_str(&zeile.stammdaten_json)?;
        Ok(Some(Einrichtung {
            umgebung: umgebung_aus_text(&zeile.umgebung)?,
            suite_url: zeile.suite_url,
            oeffentlich_spki: zeile.oeffentlich_spki,
            schluessel_id: zeile.schluessel_id,
            paket: Stammdatenpaket {
                version: zeile.stammdaten_version,
                stammdaten,
                frist_minuten: zeile.frist_minuten,
                besatzung: zeile.besatzung,
                zeitzone: zeile.zeitzone,
                bereitschaft: zeile.bereitschaft,
            },
            eingerichtet_am: zeile.eingerichtet_am,
            eingerichtet_von: zeile.eingerichtet_von,
        }))
    }

    /// Schreibt die einmalige Einrichtung fest (Naht für Stufe 5: Antwort von
    /// `POST einrichten`). Prüft der Reihe nach:
    /// - die Umgebung der Einrichtung passt zur Betriebsart dieses Buchs;
    /// - der öffentliche Schlüssel ist gültiges P-256-SPKI, und `schluessel_id` passt dazu;
    /// - `frist_minuten` liegt zwischen 1 und 120;
    /// - `zeitzone` ist eine lesbare IANA-Zeitzone;
    /// - es liegt noch keine Einrichtung vor.
    ///
    /// Ein Schlüsselwechsel gehört nicht zu v2.0; das Neu-Einrichten nach einem Widerruf
    /// klärt Stufe 5.
    pub fn richte_ein(&mut self, e: &Einrichtung) -> Result<(), BuchFehler> {
        if e.umgebung != self.betrieb.umgebung() {
            return Err(BuchFehler::FalscheUmgebung { angegeben: e.umgebung, betrieb: self.betrieb.umgebung() });
        }
        let spki = krypto::aus_b64(&e.oeffentlich_spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        krypto::oeffentlich_aus_spki(&spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        if e.schluessel_id != krypto::schluessel_id(&spki) {
            return Err(BuchFehler::SchluesselIdPasstNicht);
        }
        pruefe_frist_und_zeitzone(&e.paket)?;
        if self.einrichtung()?.is_some() {
            return Err(BuchFehler::SchonEingerichtet);
        }

        let stammdaten_json = serde_json::to_string(&e.paket.stammdaten)?;
        self.conn.execute(
            "INSERT INTO einrichtung (id, umgebung, suite_url, oeffentlich_spki, schluessel_id, \
             stammdaten_json, stammdaten_version, frist_minuten, besatzung, zeitzone, bereitschaft, \
             eingerichtet_am, eingerichtet_von) \
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                umgebung_text(e.umgebung),
                e.suite_url,
                e.oeffentlich_spki,
                e.schluessel_id,
                stammdaten_json,
                e.paket.version,
                e.paket.frist_minuten,
                e.paket.besatzung,
                e.paket.zeitzone,
                e.paket.bereitschaft,
                e.eingerichtet_am,
                e.eingerichtet_von,
            ],
        )?;
        Ok(())
    }

    /// Übernimmt ein neues Stammdatenpaket eines späteren Abgleichs (Naht für Stufe 5).
    /// Verlangt eine bestehende Einrichtung — ohne sie gäbe es keine Zeile zum Aktualisieren.
    pub fn uebernehme_stammdaten(&mut self, p: &Stammdatenpaket) -> Result<(), BuchFehler> {
        pruefe_frist_und_zeitzone(p)?;
        let stammdaten_json = serde_json::to_string(&p.stammdaten)?;
        let geaenderte_zeilen = self.conn.execute(
            "UPDATE einrichtung SET stammdaten_json = ?1, stammdaten_version = ?2, \
             frist_minuten = ?3, besatzung = ?4, zeitzone = ?5, bereitschaft = ?6 WHERE id = 1",
            params![stammdaten_json, p.version, p.frist_minuten, p.besatzung, p.zeitzone, p.bereitschaft],
        )?;
        if geaenderte_zeilen == 0 {
            return Err(BuchFehler::NichtEingerichtet);
        }
        Ok(())
    }

    /// Letzter Block der Kette: seine Nummer und sein Hash — die Grundlage für `prev` des
    /// nächsten Blocks. `None` bei einer frischen Kette.
    pub fn kettenkopf(&self) -> Result<Option<(u64, String)>, BuchFehler> {
        let ergebnis = self.conn.query_row("SELECT block, hash FROM bloecke ORDER BY block DESC LIMIT 1", [], |r| {
            Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?))
        });
        match ergebnis {
            Ok(kopf) => Ok(Some(kopf)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Alle versiegelten Blöcke, aufsteigend nach Blocknummer.
    pub fn bloecke(&self) -> Result<Vec<Block>, BuchFehler> {
        let mut anweisung = self.conn.prepare("SELECT json FROM bloecke ORDER BY block ASC")?;
        let zeilen = anweisung.query_map([], |r| r.get::<_, String>(0))?;
        let mut bloecke = Vec::new();
        for zeile in zeilen {
            bloecke.push(serde_json::from_str(&zeile?)?);
        }
        Ok(bloecke)
    }

    /// Nur für Integrationstests (`tests/*.rs`, die als eigene Crates nur `pub` sehen): Zugriff
    /// auf die rohe Verbindung, um z. B. die Trigger auf `bloecke` unmittelbar zu prüfen oder eine
    /// Zeile für einen Fehlerfall zu manipulieren. Der Kern selbst liest und schreibt außerhalb
    /// einer Transaktion über `conn()` (`pub(crate)`, siehe dort).
    pub fn verbindung(&self) -> &Connection {
        &self.conn
    }

    /// Zugriff auf die Verbindung für den Kern selbst — die Naht, über die `erfassung.rs` und
    /// `versiegeln.rs` innerhalb des Crates lesen und (außerhalb einer Transaktion) schreiben.
    /// Die Tabellen `ausstehend`, `entwurf` und `nummern` sind für die App nur über die
    /// `Buch`-Methoden dieser beiden Module erreichbar, nie unmittelbar.
    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Startet eine Transaktion auf der Verbindung dieses Buchs — die zweite Naht neben `conn()`,
    /// für die Fälle, in denen mehrere Schritte atomar zusammengehören (`sende_ab`,
    /// `versiegele_ausstehend`).
    pub(crate) fn transaktion(&mut self) -> Result<rusqlite::Transaction<'_>, BuchFehler> {
        Ok(self.conn.transaction()?)
    }
}

/// Baut aus einem Datenbankpfad den Pfad einer WAL-Begleitdatei (`-wal`, `-shm`) — SQLite
/// hängt den Zusatz an den vollen Dateinamen an, nicht an die Endung.
fn mit_dateizusatz(pfad: &Path, zusatz: &str) -> PathBuf {
    let mut name = pfad.as_os_str().to_os_string();
    name.push(zusatz);
    PathBuf::from(name)
}

fn loesche_falls_vorhanden(pfad: &Path) -> Result<(), BuchFehler> {
    match std::fs::remove_file(pfad) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Beendet den Testbetrieb: schließt die Verbindung und löscht die Testdatenbank samt
/// `-wal`/`-shm`. Verweigert bei `Betrieb::Echt` und lässt die Datei in dem Fall unberührt —
/// ein echtes Einsatzbuch löscht niemand über diesen Weg.
///
/// Nimmt `Buch` bewusst by value: `PRAGMA wal_checkpoint(TRUNCATE)` schreibt den WAL-Inhalt
/// noch vor dem Schließen in die Hauptdatei zurück — das Ergebnis wird per `query_row`
/// gelesen, denn ein `busy`-Wert ungleich 0 heißt, eine andere Verbindung war noch aktiv und
/// der Checkpoint ist nicht vollständig durchgelaufen. Erst danach schließt `conn.close()` die
/// Verbindung ausdrücklich; ein Fehler dabei wird weitergereicht statt verschluckt. Windows
/// löscht keine offene Datei — deshalb muss die Hülle das Buch vorher aus ihrem geteilten
/// Zustand herausnehmen und hier übergeben, statt mit einer geliehenen Verbindung zu
/// arbeiten. Ein fehlendes Dateipaar (`NotFound`) ist kein Fehler, jeder andere Lesefehler
/// schon.
pub fn beende_testbetrieb(ordner: &Path, buch: Buch) -> Result<(), BuchFehler> {
    if buch.betrieb != Betrieb::Test {
        return Err(BuchFehler::NichtImTestbetrieb);
    }
    // `ordner` steht auch im schon gespeicherten `buch.pfad` — beide müssen übereinstimmen,
    // wenn die Aufruferin (die Hülle) denselben Ordner übergibt, mit dem sie das Buch geöffnet
    // hat. Nur eine Entwicklerprüfung, kein Nutzerfehlerfall.
    debug_assert_eq!(ordner.join(buch.betrieb.datei()), buch.pfad, "ordner passt nicht zum geöffneten Buch");
    let pfad = buch.pfad.clone();

    let (busy, _log, _checkpointed): (i64, i64, i64) = buch
        .conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    if busy != 0 {
        return Err(BuchFehler::WalCheckpointBeschaeftigt);
    }

    let Buch { conn, .. } = buch;
    conn.close().map_err(|(_, fehler)| fehler)?;

    loesche_falls_vorhanden(&pfad)?;
    loesche_falls_vorhanden(&mit_dateizusatz(&pfad, "-wal"))?;
    loesche_falls_vorhanden(&mit_dateizusatz(&pfad, "-shm"))?;
    Ok(())
}

/// Ob im Ordner schon eine **echte** Einrichtung liegt, also `einsatzbuch.db` mit einer Zeile
/// in `einrichtung` (Spec §12: eine echte Installation wird nie zum Testrechner). Bewusst nicht
/// über `Buch::oeffne`: Das legte auf einem frischen Ordner eine leere `einsatzbuch.db` an, und
/// `erkenne_betrieb` meldete danach `Echt` statt „nicht eingerichtet“. Stattdessen erst
/// `try_exists`, dann rein lesend öffnen (`SQLITE_OPEN_READ_ONLY` legt keine Datei an und
/// migriert nichts). Eine Datei ohne Tabelle `einrichtung` (noch kein Schema) zählt als
/// „keine Einrichtung“.
pub fn hat_echte_einrichtung(ordner: &Path) -> Result<bool, BuchFehler> {
    let pfad = ordner.join(Betrieb::Echt.datei());
    if !pfad.try_exists()? {
        return Ok(false);
    }
    let conn = Connection::open_with_flags(
        &pfad,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let hat_tabelle: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'einrichtung')",
        [],
        |r| r.get(0),
    )?;
    if !hat_tabelle {
        return Ok(false);
    }
    let hat_zeile: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM einrichtung)", [], |r| r.get(0))?;
    Ok(hat_zeile)
}
