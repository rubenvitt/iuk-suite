//! Test-Helfer, gemeinsam für die Vektor-Tests und die Datenbank-Tests (`tests/buch.rs`) dieses
//! Crates: `vektor` liest eine Testvektor-Datei aus dem geteilten TS-Kern
//! (`src/app/m/einsatzbuch/_lib/kern/testvektoren/`), `packe_aus` ist das Gegenstück zu
//! `versiegele` (`einsatzbuch_kern::krypto`) — ECDH mit dem Suite-Privatschlüssel, dann HKDF,
//! dann AES-GCM-Entschlüsseln des Umschlags, mit AAD = JCS(Kopf) wie `packeAus` in
//! `umschlag.ts`. `test_einrichtung` baut eine kleine, aber echte Einrichtung aus demselben
//! Vektor-SPKI und den Stammdaten-IDs aus
//! `src/app/m/einsatzbuch/_lib/kern/testvektoren/einsaetze.ts`. `FesteUhr` und `FesterZufall`
//! sind austauschbare Uhr- bzw. Zufallsquellen für deterministische Tests. Nicht jede Datei
//! nutzt jeden Helfer — daher das pauschale `allow(dead_code)` statt einzelner Ausnahmen je
//! Funktion. Kein Teil der Produktionsschnittstelle des Kerns.
#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use chrono::{DateTime, Utc};
use einsatzbuch_kern::einrichtung::{Einrichtung, Fahrzeug, Person, Stammdaten, Stammdatenpaket, Stichwortgruppe};
use einsatzbuch_kern::format::{Blockkopf, Umgebung, Umschlag};
use einsatzbuch_kern::krypto::{self, KryptoFehler};
use einsatzbuch_kern::uhr::Uhr;
use hkdf::Hkdf;
use p256::{PublicKey, SecretKey, ecdh};
use serde_json::Value;
use sha2::Sha256;

/// Rechnerkennung und -name, die die Tests dieses Crates `Buch::richte_ein`/`richte_neu_ein`
/// mitgeben. Ihr Inhalt ist für die Tests hier ohne Bedeutung, nur dass `Buch` sie unverändert
/// übernimmt (siehe `anbindung()`).
pub const RECHNER_ID: &str = "r1";
pub const RECHNER_NAME: &str = "Testrechner";

/// Liest eine JSON-Datei aus `src/app/m/einsatzbuch/_lib/kern/testvektoren/` relativ zu diesem Crate.
pub fn vektor(datei: &str) -> Value {
    let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren")
        .join(datei);
    serde_json::from_str(&std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display())))
        .unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))
}

/// Packt den CEK eines Umschlags mit dem privaten Suite-Schlüssel aus. Gibt `Err` zurück,
/// wenn Umschlag und Kopf nicht zusammengehören (falsches AAD), die Längen nicht stimmen
/// oder `epk` nicht unkomprimiert ist.
pub fn packe_aus(umschlag: &Umschlag, kopf: &Blockkopf, suite_privat: &SecretKey) -> Result<Vec<u8>, KryptoFehler> {
    let epk_bytes = krypto::aus_b64(&umschlag.epk)?;
    if epk_bytes.len() != 65 {
        return Err(KryptoFehler::FalscheLaenge { was: "epk", soll: 65, ist: epk_bytes.len() });
    }
    if epk_bytes[0] != 0x04 {
        return Err(KryptoFehler::UngueltigerOeffentlicherSchluessel);
    }
    let iv = krypto::aus_b64(&umschlag.iv)?;
    if iv.len() != 12 {
        return Err(KryptoFehler::FalscheLaenge { was: "iv", soll: 12, ist: iv.len() });
    }
    let ct = krypto::aus_b64(&umschlag.ct)?;
    if ct.len() != 48 {
        return Err(KryptoFehler::FalscheLaenge { was: "ct", soll: 48, ist: ct.len() });
    }

    let epk = PublicKey::from_sec1_bytes(&epk_bytes).map_err(|_| KryptoFehler::UngueltigerOeffentlicherSchluessel)?;
    let geteilt = ecdh::diffie_hellman(suite_privat.to_nonzero_scalar(), epk.as_affine());
    let mut kek = [0u8; 32];
    Hkdf::<Sha256>::new(None, geteilt.raw_secret_bytes())
        .expand(krypto::UMSCHLAG_INFO, &mut kek)
        .map_err(|_| KryptoFehler::HkdfFehlgeschlagen)?;

    let aad = kopf.kanonisch().expect("Testköpfe tragen sichere Blocknummern");
    let nonce: [u8; 12] = iv.try_into().expect("Länge oben geprüft");
    let cek = Aes256Gcm::new(&kek.into())
        .decrypt(&nonce.into(), Payload { msg: &ct, aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Entschluesselung)?;
    Ok(cek)
}

/// Kleine Testeinrichtung mit dem Vektor-SPKI aus `eingaben.json` (`suite.oeffentlichSpki`)
/// und drei Fahrzeugen, drei Personen und zwei Stichwortgruppen mit den Stammdaten-IDs aus
/// `src/app/m/einsatzbuch/_lib/kern/testvektoren/einsaetze.ts` (`11-83-1`, `p4` …) — keine
/// erfundenen IDs.
pub fn test_einrichtung(umgebung: Umgebung) -> Einrichtung {
    let spki_b64 = vektor("eingaben.json")["suite"]["oeffentlichSpki"].as_str().unwrap().to_string();
    let spki = krypto::aus_b64(&spki_b64).unwrap();
    let schluessel_id = krypto::schluessel_id(&spki);

    Einrichtung {
        umgebung,
        suite_url: "https://iuk-ue.example/einsatzbuch".into(),
        oeffentlich_spki: spki_b64,
        schluessel_id,
        paket: Stammdatenpaket {
            version: 1,
            stammdaten: Stammdaten {
                fahrzeuge: vec![
                    Fahrzeug {
                        id: "11-83-1".into(),
                        typ: "RTW".into(),
                        kennung: "11-83-1".into(),
                        ruf: "Rotkreuz Uelzen 11-83-1".into(),
                        standort: "Uelzen".into(),
                    },
                    Fahrzeug {
                        id: "12-19-1".into(),
                        typ: "MTF".into(),
                        kennung: "12-19-1".into(),
                        ruf: "Rotkreuz Bad Bevensen 12-19-1".into(),
                        standort: "Bad Bevensen".into(),
                    },
                    Fahrzeug {
                        id: "11-11-1".into(),
                        typ: "ELW 1".into(),
                        kennung: "11-11-1".into(),
                        ruf: "Rotkreuz Uelzen 11-11-1".into(),
                        standort: "Uelzen".into(),
                    },
                ],
                personal: vec![
                    Person { id: "p4".into(), name: "Dierks, Malte".into(), quali: "NotSan".into(), ov: "Uelzen".into() },
                    Person { id: "p8".into(), name: "Hansen, Ole".into(), quali: "RS".into(), ov: "Uelzen".into() },
                    Person { id: "p11".into(), name: "Kruse, Marie".into(), quali: "SanH".into(), ov: "Bad Bevensen".into() },
                ],
                stichworte: vec![
                    Stichwortgruppe { name: "Rettungsdienst".into(), items: vec!["RD 1".into(), "RD 2".into(), "RD 3".into()] },
                    Stichwortgruppe { name: "Sonderlagen".into(), items: vec!["SanD".into(), "MANV 10".into()] },
                ],
            },
            frist_minuten: 15,
            besatzung: true,
            zeitzone: "Europe/Berlin".into(),
            bereitschaft: "Regelbereitschaft".into(),
        },
        eingerichtet_am: "2026-01-01T00:00:00+01:00".into(),
        eingerichtet_von: "test".into(),
    }
}

/// Feste Uhr für deterministische Frist- und Versiegelungstests. `Uhr::jetzt` nimmt `&self`,
/// deshalb steckt die Zeit hinter einem Mutex statt in einem einfachen Feld.
pub struct FesteUhr(pub Mutex<DateTime<Utc>>);

impl FesteUhr {
    pub fn stelle(&self, t: DateTime<Utc>) {
        *self.0.lock().unwrap() = t;
    }
}

impl Uhr for FesteUhr {
    fn jetzt(&self) -> DateTime<Utc> {
        *self.0.lock().unwrap()
    }
}

/// Deterministischer Zufall: füllt jeden angeforderten Puffer mit demselben Byte. Das Byte
/// darf nicht `0` sein, wenn daraus ein ephemerer P-256-Skalar gezogen wird
/// (`Blockzufall::ziehe`) — 32 Nullbytes sind der Skalar 0 und damit ungültig, `ziehe` würde
/// endlos neu ziehen.
pub struct FesterZufall(pub u8);

impl krypto::Zufall for FesterZufall {
    fn fuelle(&mut self, puffer: &mut [u8]) {
        puffer.fill(self.0);
    }
}
