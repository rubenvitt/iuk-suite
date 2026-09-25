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

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::einrichtung::{Einrichtung, Stammdaten, Stammdatenpaket};
use crate::format::{Block, Umgebung};
use crate::grenzen;
use crate::krypto::{self, KryptoFehler};

const SCHEMA: &str = include_str!("schema.sql");
const SCHEMA_V2: &str = include_str!("schema_v2.sql");
const SCHEMA_VERSION: i64 = 2;

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
    /// Ein Stammdatenfeld über der Grenze des Readers (`grenzen.rs`). Abgelehnt schon beim
    /// Übernehmen, damit das Versiegeln nie an einem Schnappschuss scheitert, den niemand öffnen
    /// könnte.
    #[error("Stammdaten zu lang: {feld} bei „{eintrag}“ hat {laenge} Zeichen, erlaubt sind höchstens {hoechstens}")]
    StammdatenZuLang { feld: &'static str, eintrag: String, laenge: usize, hoechstens: usize },
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
    /// Entscheidung 10: Die Betriebsart folgt aus der Einrichtung, die Datenbankdatei entsteht
    /// erst nach einer erfolgreichen Antwort von `einrichten`. Liegen beide Dateien vor — etwa
    /// nach einem manuellen Eingriff im Datenordner —, ist unklar, welche gilt; das frühere
    /// stille „Test vor Echt“ verschluckte genau diesen Fall (Fund aus Phase C).
    #[error(
        "Im Datenordner liegen sowohl einsatzbuch.db als auch einsatzbuch-test.db. Welche gilt, \
         ist unklar — bitte eine der beiden Dateien entfernen (lassen)."
    )]
    BeideDateien,
    /// Entscheidung 12: Neu einrichten nach Widerruf gibt es nur für den echten Rechner, und der
    /// Schlüssel bleibt dabei gepinnt. Eine andere `schluesselId` wird abgelehnt, mit beiden IDs
    /// in der Meldung, damit die Oberfläche sie rot anzeigen kann.
    #[error(
        "Dieser Rechner ist mit einem anderen Schlüssel eingerichtet (gepinnt: {gepinnt}, \
         angeboten: {neu}). Neu einrichten ändert den gepinnten Schlüssel nicht — bitte wende \
         dich an die Verwaltung."
    )]
    AndererSchluessel { gepinnt: String, neu: String },
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

/// Liest die Betriebsart aus dem Ordnerinhalt. Liegt keine der beiden Dateien vor, ist der
/// Rechner noch nicht eingerichtet — die Einrichtungsfrage beim ersten Start. Liegen **beide**
/// vor, ist das ein Startfehler (Entscheidung 10, Fund aus Phase C): Die Betriebsart folgt aus
/// der Einrichtung, es sollte also nie beide Dateien zugleich geben, und ein früheres stilles
/// „Test vor Echt“ hätte genau diesen widersprüchlichen Zustand verschluckt. `try_exists` statt
/// `exists`: ein Lesefehler (z. B. fehlende Berechtigung) wird gemeldet, nicht still als „Datei
/// fehlt“ gedeutet.
pub fn erkenne_betrieb(ordner: &Path) -> Result<Option<Betrieb>, BuchFehler> {
    let test_da = ordner.join(Betrieb::Test.datei()).try_exists()?;
    let echt_da = ordner.join(Betrieb::Echt.datei()).try_exists()?;
    match (test_da, echt_da) {
        (true, true) => Err(BuchFehler::BeideDateien),
        (true, false) => Ok(Some(Betrieb::Test)),
        (false, true) => Ok(Some(Betrieb::Echt)),
        (false, false) => Ok(None),
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

/// Prüft die Feldregeln, die sowohl beim erstmaligen Einrichten als auch bei jedem späteren
/// Stammdatenabgleich gelten müssen: eine sinnvolle Frist, eine lesbare Zeitzone und
/// Stammdaten innerhalb der Grenzen des Readers (`grenzen::pruefe_stammdaten`).
fn pruefe_paket(paket: &Stammdatenpaket) -> Result<(), BuchFehler> {
    if !(1..=120).contains(&paket.frist_minuten) {
        return Err(BuchFehler::FristAusserBereich(paket.frist_minuten));
    }
    paket
        .zeitzone
        .parse::<chrono_tz::Tz>()
        .map_err(|_| BuchFehler::UngueltigeZeitzone(paket.zeitzone.clone()))?;
    grenzen::pruefe_stammdaten(paket).map_err(|u| BuchFehler::StammdatenZuLang {
        feld: u.feld,
        eintrag: u.eintrag,
        laenge: u.laenge,
        hoechstens: u.hoechstens,
    })?;
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

/// Eine gemeldete Abweichung zwischen dem Anker, den dieser Rechner meldet, und dem, was die
/// Suite dazu gespeichert hat (`409 anker_abweichung`) — camelCase, denn dieselbe Form geht
/// unverändert über die Naht nach Task 7/8 hinaus (`Ankerstand`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ankerabweichung {
    pub block: u64,
    pub erwartet: String,
    pub gemeldet: String,
}

/// Der Teil der Einrichtung, den erst die Anbindung an die Suite (Stufe 5, Schema v2) hinzufügt:
/// Rechnerkennung und -name, Stand des letzten Stammdatenabrufs, wie weit die Kette der Suite
/// schon bestätigt ist, eine offene Ankerabweichung und ob dieser Rechner widerrufen ist. `None`
/// von `Buch::anbindung`, solange noch gar keine Einrichtung vorliegt — nicht zu verwechseln mit
/// leeren Feldern einer migrierten v1-Zeile (siehe dort).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anbindung {
    pub rechner_id: String,
    pub rechner_name: String,
    pub stammdaten_etag: Option<String>,
    pub stammdaten_abgerufen: Option<String>,
    pub anker_gemeldet_bis: u64,
    pub anker_abweichung: Option<Ankerabweichung>,
    pub widerrufen: bool,
}

/// Legt bei einer frischen Datenbank (`user_version = 0`) das Schema v1 und danach v2 in einer
/// Transaktion an; eine v1-Datei (`user_version = 1`, aus der Zeit vor der Anbindung an die
/// Suite) wendet nur noch v2 an. Beide Zweige setzen `user_version` im selben Zug auf
/// `SCHEMA_VERSION`. Eine schon bekannte Version wird übersprungen, eine unbekannte höhere
/// Version verweigert — dieser Rechner kennt kein Rückwärtsschema.
fn richte_schema_ein(conn: &mut Connection) -> Result<(), BuchFehler> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    match version {
        0 => {
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.execute_batch(SCHEMA_V2)?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            tx.commit()?;
            Ok(())
        }
        1 => {
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA_V2)?;
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
    /// - jedes Stammdatenfeld hält die Grenzen des Readers ein (`grenzen.rs`);
    /// - es liegt noch keine Einrichtung vor.
    ///
    /// Ein Schlüsselwechsel gehört nicht in diese Methode; das Neu-Einrichten nach einem
    /// Widerruf ist `richte_neu_ein`. `rechner_id` und `rechner_name` kommen aus derselben
    /// Antwort von `POST einrichten` wie `e` — der neu angelegte Rechner dieser Sitzung
    /// (Entscheidung 2) — und werden ungeprüft übernommen; die Anbindung beginnt ohne Anker
    /// (`anker_gemeldet_bis = 0`) und unwiderrufen.
    pub fn richte_ein(&mut self, e: &Einrichtung, rechner_id: &str, rechner_name: &str) -> Result<(), BuchFehler> {
        if e.umgebung != self.betrieb.umgebung() {
            return Err(BuchFehler::FalscheUmgebung { angegeben: e.umgebung, betrieb: self.betrieb.umgebung() });
        }
        let spki = krypto::aus_b64(&e.oeffentlich_spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        krypto::oeffentlich_aus_spki(&spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        if e.schluessel_id != krypto::schluessel_id(&spki) {
            return Err(BuchFehler::SchluesselIdPasstNicht);
        }
        pruefe_paket(&e.paket)?;
        if self.einrichtung()?.is_some() {
            return Err(BuchFehler::SchonEingerichtet);
        }

        let stammdaten_json = serde_json::to_string(&e.paket.stammdaten)?;
        self.conn.execute(
            "INSERT INTO einrichtung (id, umgebung, suite_url, oeffentlich_spki, schluessel_id, \
             stammdaten_json, stammdaten_version, frist_minuten, besatzung, zeitzone, bereitschaft, \
             eingerichtet_am, eingerichtet_von, rechner_id, rechner_name) \
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                rechner_id,
                rechner_name,
            ],
        )?;
        Ok(())
    }

    /// Richtet einen zuvor widerrufenen echten Rechner neu ein (Entscheidung 12). Der Schlüssel
    /// bleibt gepinnt: Nennt `e` eine andere `schluesselId` als die schon gespeicherte, wird das
    /// mit `AndererSchluessel` abgelehnt, ohne dass sich irgendetwas ändert. Bei passendem
    /// Schlüssel übernimmt sie Suite-URL, Schlüssel, Stammdatenpaket sowie die neue
    /// `rechnerId`/`rechnerName` dieser Sitzung und setzt die Anbindung zurück: Der Rechner
    /// meldet seine ganze Kette neu (`ankerGemeldetBis = 0`), ist nicht mehr widerrufen und
    /// trägt keine offene Ankerabweichung mehr. Kette und `eingerichtetAm` bleiben unverändert —
    /// es ist dieselbe Installation, kein neues Buch.
    pub fn richte_neu_ein(&mut self, e: &Einrichtung, rechner_id: &str, rechner_name: &str) -> Result<(), BuchFehler> {
        if e.umgebung != self.betrieb.umgebung() {
            return Err(BuchFehler::FalscheUmgebung { angegeben: e.umgebung, betrieb: self.betrieb.umgebung() });
        }
        let spki = krypto::aus_b64(&e.oeffentlich_spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        krypto::oeffentlich_aus_spki(&spki).map_err(BuchFehler::UngueltigerSchluessel)?;
        if e.schluessel_id != krypto::schluessel_id(&spki) {
            return Err(BuchFehler::SchluesselIdPasstNicht);
        }
        pruefe_paket(&e.paket)?;

        let bestehend = self.einrichtung()?.ok_or(BuchFehler::NichtEingerichtet)?;
        if e.schluessel_id != bestehend.schluessel_id {
            return Err(BuchFehler::AndererSchluessel { gepinnt: bestehend.schluessel_id, neu: e.schluessel_id.clone() });
        }

        let stammdaten_json = serde_json::to_string(&e.paket.stammdaten)?;
        self.conn.execute(
            "UPDATE einrichtung SET suite_url = ?1, oeffentlich_spki = ?2, schluessel_id = ?3, \
             stammdaten_json = ?4, stammdaten_version = ?5, frist_minuten = ?6, besatzung = ?7, \
             zeitzone = ?8, bereitschaft = ?9, rechner_id = ?10, rechner_name = ?11, \
             anker_gemeldet_bis = 0, widerrufen = 0, anker_abweichung = NULL \
             WHERE id = 1",
            params![
                e.suite_url,
                e.oeffentlich_spki,
                e.schluessel_id,
                stammdaten_json,
                e.paket.version,
                e.paket.frist_minuten,
                e.paket.besatzung,
                e.paket.zeitzone,
                e.paket.bereitschaft,
                rechner_id,
                rechner_name,
            ],
        )?;
        Ok(())
    }

    /// Liest die Anbindung an die Suite, sofern schon eine Einrichtung vorliegt. `rechner_id`
    /// und `rechner_name` kommen per `COALESCE(…, '')`: Eine Datenbank, die noch unter Schema v1
    /// entstand (vor dieser Anbindung), hat dort `NULL` stehen — dieser Fall trifft nur
    /// Entwicklerdateien, denn eine ausgelieferte Installation kennt nur Schema v2. `None` heißt
    /// „noch gar keine Einrichtung“, nicht zu verwechseln mit den leeren Feldern dieses Falls.
    pub fn anbindung(&self) -> Result<Option<Anbindung>, BuchFehler> {
        let gefunden = self.conn.query_row(
            "SELECT COALESCE(rechner_id, ''), COALESCE(rechner_name, ''), stammdaten_etag, \
             stammdaten_abgerufen, anker_gemeldet_bis, anker_abweichung, widerrufen \
             FROM einrichtung WHERE id = 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, bool>(6)?,
                ))
            },
        );
        let (rechner_id, rechner_name, stammdaten_etag, stammdaten_abgerufen, anker_gemeldet_bis, abweichung_json, widerrufen) =
            match gefunden {
                Ok(zeile) => zeile,
                Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
                Err(e) => return Err(e.into()),
            };
        let anker_abweichung = match abweichung_json {
            Some(json) => Some(serde_json::from_str(&json)?),
            None => None,
        };
        Ok(Some(Anbindung {
            rechner_id,
            rechner_name,
            stammdaten_etag,
            stammdaten_abgerufen,
            anker_gemeldet_bis: anker_gemeldet_bis as u64,
            anker_abweichung,
            widerrufen,
        }))
    }

    /// Übernimmt ein neues Stammdatenpaket eines späteren Abgleichs, mit denselben Paketregeln
    /// wie `richte_ein`, und schreibt zugleich den ETag der Antwort sowie den Abrufzeitpunkt
    /// fest (Entscheidung 7). Verlangt eine bestehende Einrichtung — ohne sie gäbe es keine
    /// Zeile zum Aktualisieren.
    pub fn uebernehme_stammdaten(&mut self, p: &Stammdatenpaket, etag: Option<&str>, abgerufen: &str) -> Result<(), BuchFehler> {
        pruefe_paket(p)?;
        let stammdaten_json = serde_json::to_string(&p.stammdaten)?;
        let geaenderte_zeilen = self.conn.execute(
            "UPDATE einrichtung SET stammdaten_json = ?1, stammdaten_version = ?2, \
             frist_minuten = ?3, besatzung = ?4, zeitzone = ?5, bereitschaft = ?6, \
             stammdaten_etag = ?7, stammdaten_abgerufen = ?8 WHERE id = 1",
            params![stammdaten_json, p.version, p.frist_minuten, p.besatzung, p.zeitzone, p.bereitschaft, etag, abgerufen],
        )?;
        if geaenderte_zeilen == 0 {
            return Err(BuchFehler::NichtEingerichtet);
        }
        Ok(())
    }

    /// Bestätigt eine `304` der Suite auf `GET stammdaten` (unverändert seit dem letzten ETag):
    /// schreibt nur den neuen Abrufzeitpunkt fest, lässt Paket und ETag unangetastet.
    pub fn stammdaten_bestaetigt(&mut self, abgerufen: &str) -> Result<(), BuchFehler> {
        let geaenderte_zeilen =
            self.conn.execute("UPDATE einrichtung SET stammdaten_abgerufen = ?1 WHERE id = 1", params![abgerufen])?;
        if geaenderte_zeilen == 0 {
            return Err(BuchFehler::NichtEingerichtet);
        }
        Ok(())
    }

    /// Blöcke, die der Suite noch nicht als Anker gemeldet sind (`block > anker_gemeldet_bis`),
    /// aufsteigend nach Blocknummer — die Arbeitsliste für den nächsten Ankerlauf. Verlangt eine
    /// bestehende Einrichtung, denn ohne sie gibt es keinen Stand, gegen den `block` verglichen
    /// werden könnte.
    pub fn unbestaetigte_anker(&self) -> Result<Vec<(u64, String)>, BuchFehler> {
        let bestaetigt_bis: i64 = self
            .conn
            .query_row("SELECT anker_gemeldet_bis FROM einrichtung WHERE id = 1", [], |r| r.get(0))
            .optional()?
            .ok_or(BuchFehler::NichtEingerichtet)?;
        let mut anweisung = self.conn.prepare("SELECT block, hash FROM bloecke WHERE block > ?1 ORDER BY block ASC")?;
        let zeilen = anweisung.query_map(params![bestaetigt_bis], |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, String>(1)?)))?;
        let mut ergebnis = Vec::new();
        for zeile in zeilen {
            ergebnis.push(zeile?);
        }
        Ok(ergebnis)
    }

    /// Merkt einen von der Suite bestätigten Anker vor. Setzt `anker_gemeldet_bis` nur herauf
    /// (`MAX`), nie herunter — eine verspätet ankommende, schon überholte Bestätigung darf einen
    /// inzwischen weiter fortgeschrittenen Stand nicht wieder zurückdrehen.
    pub fn anker_bestaetigt(&mut self, block: u64) -> Result<(), BuchFehler> {
        let geaenderte_zeilen = self.conn.execute(
            "UPDATE einrichtung SET anker_gemeldet_bis = MAX(anker_gemeldet_bis, ?1) WHERE id = 1",
            params![block as i64],
        )?;
        if geaenderte_zeilen == 0 {
            return Err(BuchFehler::NichtEingerichtet);
        }
        Ok(())
    }

    /// Merkt eine von der Suite gemeldete Ankerabweichung vor (`409 anker_abweichung`) — oder
    /// löscht sie mit `richte_neu_ein`; ein eigenes „Abweichung löschen“ gibt es sonst nicht.
    pub fn anker_abweichung_setzen(&mut self, a: &Ankerabweichung) -> Result<(), BuchFehler> {
        let json = serde_json::to_string(a)?;
        let geaenderte_zeilen = self.conn.execute("UPDATE einrichtung SET anker_abweichung = ?1 WHERE id = 1", params![json])?;
        if geaenderte_zeilen == 0 {
            return Err(BuchFehler::NichtEingerichtet);
        }
        Ok(())
    }

    /// Setzt oder löscht den Widerruf dieses Rechners.
    pub fn widerrufen_setzen(&mut self, widerrufen: bool) -> Result<(), BuchFehler> {
        let geaenderte_zeilen = self.conn.execute("UPDATE einrichtung SET widerrufen = ?1 WHERE id = 1", params![widerrufen])?;
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
