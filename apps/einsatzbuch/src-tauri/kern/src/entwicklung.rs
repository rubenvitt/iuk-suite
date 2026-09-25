//! Entwicklerweg: richtet einen Testbetrieb ohne Suite ein. Nur in Debug-Builds eingebunden
//! (`lib.rs`), denn `eingaben.json` trägt neben dem öffentlichen auch den privaten
//! Testschlüssel der Vektoren und darf nie in einem Release-Build landen. Die Stammdaten
//! (`entwicklung/stammdaten.json`) sind einmalig aus der Vorlage erzeugt
//! (`docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html`, `Component.GRUPPEN`, `FZ`,
//! `PERSONAL`) und eingecheckt.
use std::path::Path;

use chrono::{DateTime, Utc};

use crate::buch::{self, Betrieb, Buch};
use crate::einrichtung::{Einrichtung, Stammdaten, Stammdatenpaket};
use crate::erfassung::formatiere_zeitpunkt;
use crate::format::Umgebung;
use crate::krypto;

/// Die Testvektoren des geteilten TS-Kerns. Der Pfad ist relativ zu dieser Quelldatei
/// (`apps/einsatzbuch/src-tauri/kern/src/`), fünf Ebenen hoch ist die Wurzel des Repos.
const EINGABEN: &str = include_str!("../../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren/eingaben.json");
const STAMMDATEN: &str = include_str!("../entwicklung/stammdaten.json");

pub const SUITE_URL: &str = "http://einsatzbuch.localtest.me:3000";
pub const EINGERICHTET_VON: &str = "Entwickler-Einrichtung";
pub const ZEITZONE: &str = "Europe/Berlin";
pub const BEREITSCHAFT: &str = "DRK-Bereitschaft Uelzen";

/// Der öffentliche Suite-Schlüssel der Testvektoren (`suite.oeffentlichSpki`, Base64-DER). Zu
/// ihm gehört ein privater Schlüssel in derselben Datei — Blöcke des Entwicklerwegs lassen
/// sich also mit den Testvektoren wieder öffnen.
pub fn vektor_spki() -> String {
    let json: serde_json::Value = serde_json::from_str(EINGABEN).expect("eingaben.json ist gültiges JSON");
    json["suite"]["oeffentlichSpki"].as_str().expect("eingaben.json nennt suite.oeffentlichSpki").to_string()
}

/// Prüft Base64-DER auf einen öffentlichen P-256-Schlüssel (SPKI) und gibt die kanonische
/// Base64-Form zurück.
fn pruefe_spki(b64: &str) -> Result<String, String> {
    let der = krypto::aus_b64(b64).map_err(|_| "Der Schlüssel ist kein gültiges Base64.".to_string())?;
    krypto::oeffentlich_aus_spki(&der).map_err(|_| "Der Schlüssel ist kein öffentlicher P-256-Schlüssel (SPKI).".to_string())?;
    Ok(krypto::b64(&der))
}

/// Liest einen öffentlichen Suite-Schlüssel aus einer Datei: entweder Base64-DER oder PEM
/// (`-----BEGIN PUBLIC KEY-----`). Zeilenumbrüche (auch `\r\n`) und Leerraum im Base64-Teil
/// werden übergangen. Gibt die kanonische Base64-Form des SPKI zurück.
pub fn lies_spki_datei(pfad: &Path) -> Result<String, String> {
    const ANFANG: &str = "-----BEGIN PUBLIC KEY-----";
    const ENDE: &str = "-----END PUBLIC KEY-----";
    let text = std::fs::read_to_string(pfad).map_err(|e| format!("Die Schlüsseldatei ist nicht lesbar: {e}"))?;
    let text = text.trim();
    let koerper = if text.starts_with("-----") {
        let innen = text
            .strip_prefix(ANFANG)
            .and_then(|rest| rest.strip_suffix(ENDE))
            .ok_or_else(|| format!("Eine PEM-Datei muss mit {ANFANG} beginnen und mit {ENDE} enden."))?;
        innen.to_string()
    } else {
        text.to_string()
    };
    let b64: String = koerper.chars().filter(|c| !c.is_whitespace()).collect();
    if b64.is_empty() {
        return Err("Die Schlüsseldatei ist leer.".into());
    }
    pruefe_spki(&b64)
}

/// Richtet einen Testbetrieb mit den Entwicklerwerten ein und gibt das offene Buch zurück.
/// Verweigert, wenn im Ordner schon eine echte Einrichtung liegt — eine echte Installation
/// wird nie zum Testrechner (Spec §12). Schlüssel und Frist werden geprüft, bevor eine Datei
/// entsteht. Scheitert die Einrichtung danach, wird eine dabei neu angelegte Testdatenbank
/// wieder gelöscht; eine schon vorher vorhandene bleibt unberührt.
pub fn richte_testbetrieb_ein(ordner: &Path, spki: String, frist_minuten: u32, jetzt: DateTime<Utc>) -> Result<Buch, String> {
    if buch::hat_echte_einrichtung(ordner).map_err(|e| e.to_string())? {
        return Err("Auf diesem Rechner liegt schon eine echte Einrichtung. Eine echte Installation wird nie zum Testrechner.".into());
    }
    let spki = pruefe_spki(&spki)?;
    if !(1..=120).contains(&frist_minuten) {
        return Err(format!("Die Frist muss zwischen 1 und 120 Minuten liegen, war {frist_minuten}."));
    }
    let schluessel_id = krypto::schluessel_id(&krypto::aus_b64(&spki).expect("oben geprüft"));
    let stammdaten: Stammdaten = serde_json::from_str(STAMMDATEN).expect("entwicklung/stammdaten.json passt zu Stammdaten");
    let einrichtung = Einrichtung {
        umgebung: Umgebung::Test,
        suite_url: SUITE_URL.into(),
        oeffentlich_spki: spki,
        schluessel_id,
        paket: Stammdatenpaket {
            version: 1,
            stammdaten,
            frist_minuten,
            besatzung: true,
            zeitzone: ZEITZONE.into(),
            bereitschaft: BEREITSCHAFT.into(),
        },
        eingerichtet_am: formatiere_zeitpunkt(jetzt, ZEITZONE),
        eingerichtet_von: EINGERICHTET_VON.into(),
    };

    let schon_da = ordner.join(Betrieb::Test.datei()).try_exists().map_err(|e| e.to_string())?;
    let mut buch = Buch::oeffne(ordner, Betrieb::Test).map_err(|e| e.to_string())?;
    if let Err(fehler) = buch.richte_ein(&einrichtung) {
        if !schon_da {
            if let Err(aufraeumen) = buch::beende_testbetrieb(ordner, buch) {
                eprintln!("Die halb angelegte Testdatenbank ließ sich nicht löschen: {aufraeumen}");
            }
        }
        return Err(fehler.to_string());
    }
    Ok(buch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buch::{Betrieb, erkenne_betrieb};
    use crate::einrichtung::{Einrichtung, Stammdatenpaket};
    use crate::format::Umgebung;
    use crate::krypto;

    fn erwartete_schluessel_id() -> String {
        let pfad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json");
        let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(pfad).unwrap()).unwrap();
        json["schluesselId"].as_str().unwrap().to_string()
    }

    fn als_pem(spki_b64: &str, zeilenende: &str) -> String {
        let mut pem = format!("-----BEGIN PUBLIC KEY-----{zeilenende}");
        for stueck in spki_b64.as_bytes().chunks(64) {
            pem.push_str(std::str::from_utf8(stueck).unwrap());
            pem.push_str(zeilenende);
        }
        pem.push_str(&format!("-----END PUBLIC KEY-----{zeilenende}"));
        pem
    }

    fn jetzt() -> DateTime<Utc> {
        "2026-09-24T10:00:00Z".parse().unwrap()
    }

    #[test]
    fn vektor_spki_ergibt_die_schluessel_id_aus_erwartet_json() {
        let spki = krypto::aus_b64(&vektor_spki()).unwrap();
        assert_eq!(krypto::schluessel_id(&spki), erwartete_schluessel_id());
    }

    #[test]
    fn liest_base64_und_pem_auch_mit_crlf() {
        let ordner = tempfile::tempdir().unwrap();
        let b64 = ordner.path().join("suite.b64");
        std::fs::write(&b64, format!("{}\n", vektor_spki())).unwrap();
        assert_eq!(lies_spki_datei(&b64).unwrap(), vektor_spki());
        for zeilenende in ["\n", "\r\n"] {
            let pem = ordner.path().join("suite.pem");
            std::fs::write(&pem, als_pem(&vektor_spki(), zeilenende)).unwrap();
            assert_eq!(lies_spki_datei(&pem).unwrap(), vektor_spki());
        }
    }

    #[test]
    fn lehnt_muell_ab() {
        let ordner = tempfile::tempdir().unwrap();
        let faelle = [
            "",
            "kein Schlüssel",
            "AAAA",
            "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n",
            &als_pem(&vektor_spki(), "\n").replace("PUBLIC KEY", "PRIVATE KEY"),
            &als_pem(&vektor_spki(), "\n").replace("-----END PUBLIC KEY-----\n", ""),
        ];
        for (i, inhalt) in faelle.iter().enumerate() {
            let pfad = ordner.path().join(format!("muell-{i}"));
            std::fs::write(&pfad, inhalt).unwrap();
            assert!(lies_spki_datei(&pfad).is_err(), "Fall {i} hätte abgelehnt werden müssen: {inhalt:?}");
        }
        assert!(lies_spki_datei(&ordner.path().join("fehlt")).is_err());
    }

    #[test]
    fn richtet_testbetrieb_mit_entwicklerwerten_ein() {
        let ordner = tempfile::tempdir().unwrap();
        let buch = richte_testbetrieb_ein(ordner.path(), vektor_spki(), 3, jetzt()).unwrap();
        assert_eq!(buch.betrieb(), Betrieb::Test);
        let e = buch.einrichtung().unwrap().unwrap();
        assert_eq!(e.umgebung, Umgebung::Test);
        assert_eq!(e.suite_url, "http://einsatzbuch.localtest.me:3000");
        assert_eq!(e.eingerichtet_von, "Entwickler-Einrichtung");
        assert_eq!(e.eingerichtet_am, "2026-09-24T12:00:00+02:00");
        assert_eq!(e.schluessel_id, erwartete_schluessel_id());
        assert_eq!(e.paket.frist_minuten, 3);
        assert_eq!(e.paket.zeitzone, "Europe/Berlin");
        assert_eq!(e.paket.bereitschaft, "DRK-Bereitschaft Uelzen");
        assert!(e.paket.besatzung);
        assert_eq!(e.paket.stammdaten.personal.len(), 112);
        assert_eq!(e.paket.stammdaten.fahrzeuge.len(), 56);
        assert_eq!(e.paket.stammdaten.stichworte.len(), 5);
        assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), Some(Betrieb::Test));
    }

    #[test]
    fn verweigert_bei_vorhandener_echter_einrichtung_und_legt_keine_testdatei_an() {
        let ordner = tempfile::tempdir().unwrap();
        let spki = krypto::aus_b64(&vektor_spki()).unwrap();
        let mut echt = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
        echt.richte_ein(&Einrichtung {
            umgebung: Umgebung::Echt,
            suite_url: "https://iuk-ue.example".into(),
            oeffentlich_spki: vektor_spki(),
            schluessel_id: krypto::schluessel_id(&spki),
            paket: Stammdatenpaket {
                version: 1,
                stammdaten: serde_json::from_str(include_str!("../entwicklung/stammdaten.json")).unwrap(),
                frist_minuten: 15,
                besatzung: true,
                zeitzone: "Europe/Berlin".into(),
                bereitschaft: "DRK-Bereitschaft Uelzen".into(),
            },
            eingerichtet_am: "2026-01-01T00:00:00+01:00".into(),
            eingerichtet_von: "test".into(),
        })
        .unwrap();
        drop(echt);
        let fehler = richte_testbetrieb_ein(ordner.path(), vektor_spki(), 15, jetzt()).err().unwrap();
        assert!(fehler.contains("echte Einrichtung"), "{fehler}");
        assert!(!ordner.path().join("einsatzbuch-test.db").exists());
    }

    #[test]
    fn verweigert_frist_ausserhalb_und_ungueltigen_schluessel_ohne_datei() {
        let ordner = tempfile::tempdir().unwrap();
        assert!(richte_testbetrieb_ein(ordner.path(), vektor_spki(), 0, jetzt()).is_err());
        assert!(richte_testbetrieb_ein(ordner.path(), vektor_spki(), 121, jetzt()).is_err());
        assert!(richte_testbetrieb_ein(ordner.path(), "AAAA".into(), 15, jetzt()).is_err());
        assert_eq!(std::fs::read_dir(ordner.path()).unwrap().count(), 0, "der Ordner muss leer bleiben");
    }
}
