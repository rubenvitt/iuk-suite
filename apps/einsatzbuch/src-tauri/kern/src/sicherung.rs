//! Die Sicherungsdatei des Rechners (Spec §4.5): die vollständige Kette als
//! `einsatzbuch-sicherung.json` im gewählten Ordner, atomar geschrieben und in zehn Ständen
//! rotiert, dazu das atomare Schreiben ohne Rotation für den Export und die Sicherungsstufe der
//! Verwaltung. Rein und ohne Tauri: Wann gesichert wird und was mit dem Ergebnis geschieht,
//! entscheidet die Hülle.
//!
//! **Keine Sicherung zerstört eine bessere** (Entscheidung 2):
//! - Eine leere Kette wird nie geschrieben.
//! - Trägt die vorhandene Datei denselben letzten Hash, wird weder geschrieben noch rotiert.
//! - Trägt die vorhandene, lesbare Datei mehr Blöcke, wird nichts geschrieben.
//! - Eine unlesbare vorhandene Datei (kein JSON, fremdes Format, zu groß) wird normal nach `.1`
//!   rotiert. Scheitert dagegen schon das Lesen selbst, wird nichts angefasst.
use std::fs::{self, File};
use std::io::{self, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, TimeDelta, Utc};
use serde::{Deserialize, Serialize};

use crate::buch::Betrieb;
use crate::format::Block;

/// Name der Sicherungsdatei im Sicherungsordner.
pub const DATEI: &str = "einsatzbuch-sicherung.json";
/// Wert von `format` in der Sicherungsdatei.
pub const FORMAT: &str = "einsatzbuch-sicherung";
/// Wert von `version` in der Sicherungsdatei.
pub const VERSION: u32 = 1;
/// Größte Sicherungsdatei, die `lies` annimmt. Geprüft vor dem Lesen, damit eine fremde Datei
/// nicht den Speicher füllt.
pub const HOECHSTENS_BYTES: u64 = 256 * 1024 * 1024;
/// Anzahl der rotierten Stände neben der aktuellen Datei (`.1` bis `.10`).
const STAENDE: u32 = 10;
/// Ab diesem Alter der letzten gelungenen Sicherung ist die Stufe rot.
const ROT_AB_TAGEN: i64 = 7;

/// Inhalt von `einsatzbuch-sicherung.json`. Die Datei enthält keine CEKs, sie ist nur mit dem
/// Suite-Schlüssel lesbar. `deny_unknown_fields` wie die Formattypen in `format.rs`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sicherungsdatei {
    pub format: String,
    pub version: u32,
    pub erstellt: String,
    pub bloecke: Vec<Block>,
}

impl Sicherungsdatei {
    /// Eine Sicherungsdatei mit `format` und `version` dieses Kerns.
    pub fn neu(erstellt: String, bloecke: Vec<Block>) -> Sicherungsdatei {
        Sicherungsdatei { format: FORMAT.into(), version: VERSION, erstellt, bloecke }
    }
}

/// Was `schreibe` getan hat. `Unveraendert` gilt als gelungene Sicherung: Die Datei im Ordner
/// ist schon auf dem Stand der Kette.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Schreibergebnis {
    Geschrieben,
    Unveraendert,
    LeereKette,
}

#[derive(Debug, thiserror::Error)]
pub enum SicherungFehler {
    #[error("Die Sicherungsdatei ließ sich nicht lesen oder schreiben: {0}")]
    Io(#[from] io::Error),
    #[error("Im Sicherungsordner liegt eine längere Kette ({vorhanden} Blöcke) als auf diesem Rechner ({lokal}). Nichts überschrieben.")]
    VorhandeneLaenger { vorhanden: usize, lokal: usize },
    #[error("Die Sicherungsdatei ist mit {bytes} Byte zu groß, erlaubt sind höchstens 256 MiB.")]
    ZuGross { bytes: u64 },
    #[error("Die Sicherungsdatei ist kein gültiges JSON oder hat unbekannte Felder: {0}")]
    Json(serde_json::Error),
    #[error("Die Datei ist keine Einsatzbuch-Sicherung (Format oder Version unbekannt).")]
    FremdesFormat,
}

/// Schreibt die Sicherung nach `ordner/einsatzbuch-sicherung.json`. Ablauf:
/// 1. Leere Kette: nichts anfassen, `LeereKette`.
/// 2. Vorhandene, lesbare Datei: mit mehr Blöcken `VorhandeneLaenger`, mit demselben letzten
///    Hash `Unveraendert`. Beides ohne Schreiben und ohne Rotation. Scheitert das Lesen mit
///    einem Ein-/Ausgabefehler, endet `schreibe` mit `Io`, ebenfalls ohne Rotation.
/// 3. Temp-Datei im selben Ordner vollständig schreiben, `sync_all` über das Schreib-Handle,
///    Handle schließen.
/// 4. Die bisherige Datei rotieren (`rotiere`): die Stände bis zur ersten Lücke um eins nach
///    oben, dann die aktuelle nach `.1`.
/// 5. Die Temp-Datei auf den Zielnamen umbenennen, danach unter Unix das Verzeichnis
///    synchronisieren.
///
/// Scheitert ein Schritt nach dem Anlegen, entfernt die Wache die Temp-Datei. Scheitert erst das
/// Umbenennen, wird die eben nach `.1` rotierte Datei zurückbenannt, so gut es geht.
pub fn schreibe(ordner: &Path, datei: &Sicherungsdatei) -> Result<Schreibergebnis, SicherungFehler> {
    schreibe_mit(ordner, datei, &mut |von: &Path, nach: &Path| fs::rename(von, nach))
}

/// `schreibe` mit austauschbarem Umbenennen — die Naht, über die die Tests dieses Moduls ein
/// scheiterndes `rename` an einer bestimmten Stelle herstellen.
fn schreibe_mit(ordner: &Path, datei: &Sicherungsdatei, umbenennen: Umbenennen) -> Result<Schreibergebnis, SicherungFehler> {
    let Some(letzter) = datei.bloecke.last() else {
        return Ok(Schreibergebnis::LeereKette);
    };
    let ziel = ordner.join(DATEI);
    if ziel.try_exists()? {
        match lies(&ziel) {
            Ok(vorhanden) => {
                if vorhanden.bloecke.len() > datei.bloecke.len() {
                    return Err(SicherungFehler::VorhandeneLaenger { vorhanden: vorhanden.bloecke.len(), lokal: datei.bloecke.len() });
                }
                if vorhanden.bloecke.last().map(|b| &b.hash) == Some(&letzter.hash) {
                    return Ok(Schreibergebnis::Unveraendert);
                }
            }
            // Unlesbar heißt: kaputter oder fremder Inhalt. Solche Dateien werden rotiert.
            Err(SicherungFehler::Json(_) | SicherungFehler::FremdesFormat | SicherungFehler::ZuGross { .. }) => {}
            // Zwischen `try_exists` und `lies` verschwunden: wie keine Datei.
            Err(SicherungFehler::Io(e)) if e.kind() == ErrorKind::NotFound => {}
            // Ein Lesefehler (Rechte, gestörtes Netzlaufwerk) sagt nichts über den Inhalt. Eine
            // womöglich längere Kette darf deshalb nicht nach `.1` wandern: nichts anfassen.
            Err(e) => return Err(e),
        }
    }

    let bytes = serde_json::to_vec(datei).map_err(io::Error::other)?;
    let temp = TempDatei::neben(&ziel, &bytes)?;
    let aktuelle_rotiert = rotiere(ordner, &ziel, umbenennen)?;
    if let Err(e) = ersetze_mit(&temp.pfad, &ziel, cfg!(windows), umbenennen) {
        if aktuelle_rotiert {
            let _ = umbenennen(&ordner.join(rotiert(1)), &ziel);
        }
        return Err(e.into());
    }
    temp.entschaerfe();
    synchronisiere_ordner(ordner);
    Ok(Schreibergebnis::Geschrieben)
}

/// Schreibt `bytes` atomar nach `ziel`, ohne Rotation (auch für den Export): Temp-Datei neben
/// dem Ziel, `sync_all`, umbenennen, unter Unix das Verzeichnis synchronisieren. Ein bestehendes
/// Ziel wird vollständig ersetzt.
pub fn schreibe_atomar(ziel: &Path, bytes: &[u8]) -> io::Result<()> {
    let temp = TempDatei::neben(ziel, bytes)?;
    ersetze_mit(&temp.pfad, ziel, cfg!(windows), &mut |von: &Path, nach: &Path| fs::rename(von, nach))?;
    temp.entschaerfe();
    synchronisiere_ordner(ordner_von(ziel));
    Ok(())
}

/// Nur die Kennung der Datei, ohne `deny_unknown_fields`: So meldet `lies` eine fremde Datei
/// (etwa einen Export) als fremdes Format statt als unbekanntes Feld.
#[derive(Deserialize)]
struct Kennung {
    format: Option<String>,
    version: Option<u64>,
}

/// Liest eine Sicherungsdatei. Größer als `HOECHSTENS_BYTES` wird schon vor dem Lesen abgelehnt
/// (Länge aus den Metadaten des geöffneten Handles), dann fremdes Format oder fremde Version,
/// dann ein unbekanntes Feld. Die Kette selbst prüft `kette::pruefe`.
pub fn lies(pfad: &Path) -> Result<Sicherungsdatei, SicherungFehler> {
    let datei = File::open(pfad)?;
    let laenge = datei.metadata()?.len();
    if laenge > HOECHSTENS_BYTES {
        return Err(SicherungFehler::ZuGross { bytes: laenge });
    }
    // `take`: Wächst die Datei zwischen Metadaten und Lesen, liest `lies` trotzdem nie mehr als
    // die Grenze.
    let mut inhalt = Vec::with_capacity(laenge as usize);
    datei.take(HOECHSTENS_BYTES + 1).read_to_end(&mut inhalt)?;
    if inhalt.len() as u64 > HOECHSTENS_BYTES {
        return Err(SicherungFehler::ZuGross { bytes: inhalt.len() as u64 });
    }
    let kennung: Kennung = serde_json::from_slice(&inhalt).map_err(SicherungFehler::Json)?;
    if kennung.format.as_deref() != Some(FORMAT) || kennung.version != Some(u64::from(VERSION)) {
        return Err(SicherungFehler::FremdesFormat);
    }
    serde_json::from_slice(&inhalt).map_err(SicherungFehler::Json)
}

/// Was die Verwaltung zur Sicherung braucht, aus der Einrichtung (`Buch::sicherungsangaben`).
/// `letzte` ist der Zeitpunkt der letzten gelungenen Sicherung, `fehler` der Text des letzten
/// gescheiterten Versuchs (`None` nach einem Erfolg).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sicherungsangaben {
    pub ordner: Option<String>,
    pub letzte: Option<String>,
    pub fehler: Option<String>,
    pub eingerichtet_am: String,
}

/// Die Ampel der Sicherung in der Verwaltung (Entscheidung 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sicherungsstufe {
    Aus,
    Ok,
    Gelb,
    Rot,
}

/// Die Sicherungsstufe, in dieser Rangfolge:
/// - `Aus` im Testbetrieb, denn dort wird nicht gesichert.
/// - `Rot`, wenn die letzte gelungene Sicherung 7 Tage oder älter ist. Ohne je eine gelungene
///   Sicherung zählt `eingerichtet_am`. Ein unlesbarer Zeitpunkt ist kein Beleg für eine
///   Sicherung und zählt ebenfalls als rot.
/// - `Gelb` ohne Ordner oder nach einem gescheiterten letzten Versuch.
/// - sonst `Ok`.
pub fn stufe(betrieb: Betrieb, angaben: &Sicherungsangaben, jetzt: DateTime<Utc>) -> Sicherungsstufe {
    if betrieb == Betrieb::Test {
        return Sicherungsstufe::Aus;
    }
    let bezug = angaben.letzte.as_deref().unwrap_or(&angaben.eingerichtet_am);
    let Ok(zeitpunkt) = DateTime::parse_from_rfc3339(bezug) else {
        return Sicherungsstufe::Rot;
    };
    if jetzt - zeitpunkt.with_timezone(&Utc) >= TimeDelta::days(ROT_AB_TAGEN) {
        return Sicherungsstufe::Rot;
    }
    if angaben.ordner.is_none() || angaben.fehler.is_some() {
        return Sicherungsstufe::Gelb;
    }
    Sicherungsstufe::Ok
}

fn rotiert(i: u32) -> String {
    format!("einsatzbuch-sicherung.{i}.json")
}

/// Ein Umbenennen, wie `fs::rename` — austauschbar für die Tests (`schreibe_mit`).
type Umbenennen<'a> = &'a mut dyn FnMut(&Path, &Path) -> io::Result<()>;

/// Rotiert die bisherige Datei nach `.1`. Geschoben wird nur bis zur ersten Lücke: Ist `.k` der
/// kleinste freie Stand, wandern `.k-1` nach `.k` herunter bis `.1` nach `.2`. Sind alle zehn
/// belegt, fällt der älteste `.10` weg. Danach wandert die aktuelle Datei nach `.1`.
///
/// Warum bis zur Lücke: Scheitert `aktuell → .1` oder danach das Umbenennen der Temp-Datei, ist
/// `.1` frei. Der nächste Versuch füllt genau diese Lücke, statt alle Stände erneut zu schieben.
/// So kostet ein wiederholt scheiternder Versuch keinen weiteren Stand. Ohne aktuelle Datei gibt
/// es nichts zu rotieren. Meldet, ob die aktuelle Datei nach `.1` gewandert ist.
fn rotiere(ordner: &Path, ziel: &Path, umbenennen: Umbenennen) -> io::Result<bool> {
    if !ziel.try_exists()? {
        return Ok(false);
    }
    let mut frei = STAENDE;
    for i in 1..=STAENDE {
        if !ordner.join(rotiert(i)).try_exists()? {
            frei = i;
            break;
        }
    }
    for i in (1..frei).rev() {
        ersetze_mit(&ordner.join(rotiert(i)), &ordner.join(rotiert(i + 1)), cfg!(windows), umbenennen)?;
    }
    ersetze_mit(ziel, &ordner.join(rotiert(1)), cfg!(windows), umbenennen)?;
    Ok(true)
}

/// Benennt `von` nach `nach` um und ersetzt dabei ein bestehendes Ziel. `std::fs::rename`
/// ersetzt eine bestehende Datei auf allen Systemen, unter Windows über `MoveFileExW` mit
/// `MOVEFILE_REPLACE_EXISTING`. Erst wenn Windows das Umbenennen verweigert
/// (`PermissionDenied`, `AlreadyExists`, etwa wegen einer Freigabe), wird das Ziel entfernt und
/// genau einmal neu versucht. Ein Entfernen vorab hätte bei einem danach scheiternden
/// Umbenennen die alte Datei gekostet. `windows` kommt aus `cfg!(windows)` (nicht `#[cfg]`),
/// damit der Zweig überall übersetzt, von Clippy geprüft und in den Tests erreicht wird.
fn ersetze_mit(von: &Path, nach: &Path, windows: bool, umbenennen: Umbenennen) -> io::Result<()> {
    match umbenennen(von, nach) {
        Err(e) if windows && matches!(e.kind(), ErrorKind::PermissionDenied | ErrorKind::AlreadyExists) => {
            match fs::remove_file(nach) {
                Ok(()) => {}
                Err(entfernen) if entfernen.kind() == ErrorKind::NotFound => {}
                Err(_) => return Err(e),
            }
            umbenennen(von, nach)
        }
        sonst => sonst,
    }
}

/// Synchronisiert das Verzeichnis nach dem Umbenennen, damit der neue Name einen Stromausfall
/// übersteht — nur unter Unix. Windows-Lehre aus dem Einsatzarchiv (Spec §4.2, `7fb15de`):
/// Dateien über das Schreib-Handle flushen (`TempDatei::neben`), kein fsync auf Verzeichnisse
/// unter Windows. Ein Fehler hier macht die Sicherung nicht ungeschehen, denn die Datei ist
/// schon ersetzt und über `sync_all` geschrieben. Er wird nur protokolliert, etwa auf
/// Netzlaufwerken ohne fsync für Verzeichnisse (`EINVAL`, `ENOTSUP`).
fn synchronisiere_ordner(ordner: &Path) {
    if !cfg!(unix) {
        return;
    }
    if let Err(e) = File::open(ordner).and_then(|d| d.sync_all()) {
        eprintln!("Sicherung: fsync auf den Ordner {} fehlgeschlagen: {e}", ordner.display());
    }
}

fn ordner_von(ziel: &Path) -> &Path {
    match ziel.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    }
}

/// Die Temp-Datei neben dem Ziel, mit Drop-Wache: Solange sie nicht entschärft ist, entfernt ihr
/// Drop die Datei. Name `.<Stamm des Ziels>.<16 Hex Zufall>.tmp`, für die Sicherung also
/// `.einsatzbuch-sicherung.<16 Hex>.tmp`.
struct TempDatei {
    pfad: PathBuf,
    aktiv: bool,
}

impl TempDatei {
    /// Legt die Temp-Datei neu an (`create_new`, nie eine vorhandene überschreiben), schreibt
    /// `bytes` vollständig, `sync_all` über das Schreib-Handle und schließt es vor dem
    /// Umbenennen (Windows benennt keine offene Datei um).
    fn neben(ziel: &Path, bytes: &[u8]) -> io::Result<TempDatei> {
        let stamm = ziel.file_stem().and_then(|s| s.to_str()).unwrap_or("einsatzbuch");
        let mut zufall = [0u8; 8];
        // `getrandom` direkt statt `krypto::SystemZufall`: Der bricht bei fehlendem Systemzufall
        // mit einem Panic ab, hier wird daraus ein gewöhnlicher Schreibfehler.
        getrandom::fill(&mut zufall).map_err(io::Error::other)?;
        let name = format!(".{stamm}.{:016x}.tmp", u64::from_be_bytes(zufall));
        let pfad = ordner_von(ziel).join(name);
        let mut datei = File::create_new(&pfad)?;
        let wache = TempDatei { pfad, aktiv: true };
        let geschrieben = datei.write_all(bytes).and_then(|()| datei.sync_all());
        drop(datei);
        geschrieben?;
        Ok(wache)
    }

    /// Nach dem gelungenen Umbenennen: Die Datei trägt jetzt den Zielnamen und bleibt.
    fn entschaerfe(mut self) {
        self.aktiv = false;
    }
}

impl Drop for TempDatei {
    fn drop(&mut self) {
        if self.aktiv {
            let _ = fs::remove_file(&self.pfad);
        }
    }
}

/// Fehlerpfade, die sich mit echten Dateien nicht verlässlich herstellen lassen: über die Naht
/// `umbenennen` in `schreibe_mit` und `ersetze_mit`.
#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::format::{Blockkopf, Umgebung, Umschlag};

    fn block(n: u64) -> Block {
        Block {
            kopf: Blockkopf {
                v: 1,
                block: n,
                prev: format!("{:064x}", n - 1),
                versiegelt: "2026-09-25T10:00:00+02:00".into(),
                schluessel_id: "0123456789abcdef".into(),
                umgebung: Umgebung::Echt,
            },
            iv: "AAAAAAAAAAAAAAAA".into(),
            daten: "AAAA".into(),
            umschlag: Umschlag { epk: "BA==".into(), iv: "AAAAAAAAAAAAAAAA".into(), ct: "AAAA".into() },
            hash: format!("{n:064x}"),
        }
    }

    fn datei(n: u64) -> Sicherungsdatei {
        Sicherungsdatei::neu("2026-09-25T12:00:00+02:00".into(), (1..=n).map(block).collect())
    }

    fn schnappschuss(ordner: &Path) -> BTreeMap<String, Vec<u8>> {
        fs::read_dir(ordner)
            .unwrap()
            .map(|e| {
                let e = e.unwrap();
                (e.file_name().into_string().unwrap(), fs::read(e.path()).unwrap())
            })
            .collect()
    }

    fn echt(von: &Path, nach: &Path) -> io::Result<()> {
        fs::rename(von, nach)
    }

    fn verweigert() -> io::Error {
        io::Error::from(ErrorKind::PermissionDenied)
    }

    /// Aktuelle Datei plus `.1` bis `.anzahl`, jeweils mit eigenem Inhalt.
    fn ordner_mit_staenden(anzahl: u32) -> tempfile::TempDir {
        let ordner = tempfile::tempdir().unwrap();
        schreibe(ordner.path(), &datei(1)).unwrap();
        for i in 1..=anzahl {
            fs::write(ordner.path().join(rotiert(i)), format!("stand {i}")).unwrap();
        }
        ordner
    }

    /// Scheitert `aktuell → .1` immer wieder, verschiebt nur der erste Versuch die Stände (die
    /// Lücke bei `.1` bleibt). Jeder weitere Versuch füllt diese Lücke, statt erneut zu schieben:
    /// Kein Fehlversuch kostet einen Stand.
    #[test]
    fn wiederholt_scheiterndes_rotieren_kostet_keinen_stand() {
        let ordner = ordner_mit_staenden(5);
        let aktuell = fs::read(ordner.path().join(DATEI)).unwrap();
        let eins = ordner.path().join(rotiert(1));
        for _ in 0..3 {
            let mut umbenennen = |von: &Path, nach: &Path| if nach == eins { Err(verweigert()) } else { echt(von, nach) };
            let fehler = schreibe_mit(ordner.path(), &datei(2), &mut umbenennen).unwrap_err();
            assert!(matches!(fehler, SicherungFehler::Io(_)), "{fehler:?}");
        }
        let mut erwartet = BTreeMap::from([(DATEI.to_string(), aktuell)]);
        for i in 1..=5 {
            erwartet.insert(rotiert(i + 1), format!("stand {i}").into_bytes());
        }
        assert_eq!(schnappschuss(ordner.path()), erwartet);
    }

    /// Scheitert erst `temp → aktuell`, wandert die eben nach `.1` rotierte Datei zurück, die
    /// Temp-Datei verschwindet. Der nächste gelungene Lauf füllt die Lücke bei `.1`.
    #[test]
    fn scheiterndes_umbenennen_der_temp_datei_benennt_die_aktuelle_zurueck() {
        let ordner = ordner_mit_staenden(3);
        let aktuell = fs::read(ordner.path().join(DATEI)).unwrap();
        let mut umbenennen = |von: &Path, nach: &Path| {
            if von.extension().is_some_and(|e| e == "tmp") { Err(verweigert()) } else { echt(von, nach) }
        };
        let fehler = schreibe_mit(ordner.path(), &datei(2), &mut umbenennen).unwrap_err();
        assert!(matches!(fehler, SicherungFehler::Io(_)), "{fehler:?}");
        let mut erwartet = BTreeMap::from([(DATEI.to_string(), aktuell.clone())]);
        for i in 1..=3 {
            erwartet.insert(rotiert(i + 1), format!("stand {i}").into_bytes());
        }
        assert_eq!(schnappschuss(ordner.path()), erwartet);

        assert_eq!(schreibe(ordner.path(), &datei(2)).unwrap(), Schreibergebnis::Geschrieben);
        let nachher = schnappschuss(ordner.path());
        assert_eq!(nachher[&rotiert(1)], aktuell);
        for i in 1..=3 {
            assert_eq!(nachher[&rotiert(i + 1)], format!("stand {i}").into_bytes(), ".{} blieb erhalten", i + 1);
        }
        assert_eq!(nachher.len(), 5);
    }

    /// Windows-Zweig: Verweigert `rename` das bestehende Ziel, wird es entfernt und genau einmal
    /// neu versucht.
    #[test]
    fn ersetze_entfernt_unter_windows_erst_nach_verweigertem_umbenennen() {
        let ordner = tempfile::tempdir().unwrap();
        let (von, nach) = (ordner.path().join("neu"), ordner.path().join("ziel"));
        fs::write(&von, "neu").unwrap();
        fs::write(&nach, "alt").unwrap();
        let mut versuche = 0;
        let mut umbenennen = |a: &Path, b: &Path| {
            versuche += 1;
            if b.exists() { Err(verweigert()) } else { echt(a, b) }
        };
        ersetze_mit(&von, &nach, true, &mut umbenennen).unwrap();
        assert_eq!(versuche, 2);
        assert_eq!(fs::read(&nach).unwrap(), b"neu");
        assert!(!von.exists());
    }

    /// Außerhalb von Windows wird ein bestehendes Ziel nie entfernt: Der Fehler geht durch, das
    /// Ziel bleibt.
    #[test]
    fn ersetze_entfernt_ausserhalb_von_windows_nichts() {
        let ordner = tempfile::tempdir().unwrap();
        let (von, nach) = (ordner.path().join("neu"), ordner.path().join("ziel"));
        fs::write(&von, "neu").unwrap();
        fs::write(&nach, "alt").unwrap();
        let fehler = ersetze_mit(&von, &nach, false, &mut |_: &Path, _: &Path| Err(verweigert())).unwrap_err();
        assert_eq!(fehler.kind(), ErrorKind::PermissionDenied);
        assert_eq!(fs::read(&nach).unwrap(), b"alt");
    }

    /// Unter Windows ist ein anderer Fehler als „verweigert“/„existiert“ kein Grund, das Ziel zu
    /// entfernen.
    #[test]
    fn ersetze_entfernt_bei_anderen_fehlern_nichts() {
        let ordner = tempfile::tempdir().unwrap();
        let (von, nach) = (ordner.path().join("neu"), ordner.path().join("ziel"));
        fs::write(&von, "neu").unwrap();
        fs::write(&nach, "alt").unwrap();
        let fehler =
            ersetze_mit(&von, &nach, true, &mut |_: &Path, _: &Path| Err(io::Error::from(ErrorKind::NotFound))).unwrap_err();
        assert_eq!(fehler.kind(), ErrorKind::NotFound);
        assert_eq!(fs::read(&nach).unwrap(), b"alt");
    }
}
