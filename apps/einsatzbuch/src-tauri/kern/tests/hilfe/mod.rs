//! Test-Helfer, gemeinsam für die Vektor-Tests dieses Tasks und den Reader-Test von Task 5
//! (Stufe-4-Umsetzungsplan): `vektor` liest eine Testvektor-Datei aus dem geteilten TS-Kern
//! (`src/app/m/einsatzbuch/_lib/kern/testvektoren/`), `packe_aus` ist das Gegenstück zu
//! `versiegele` (`einsatzbuch_kern::krypto`) — ECDH mit dem Suite-Privatschlüssel, dann HKDF,
//! dann AES-GCM-Entschlüsseln des Umschlags, mit AAD = JCS(Kopf) wie `packeAus` in
//! `umschlag.ts`. Kein Teil der Produktionsschnittstelle des Kerns.
#![allow(dead_code)]

use std::path::PathBuf;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use einsatzbuch_kern::format::{Blockkopf, Umschlag};
use einsatzbuch_kern::krypto::{self, KryptoFehler};
use hkdf::Hkdf;
use p256::{PublicKey, SecretKey, ecdh};
use serde_json::Value;
use sha2::Sha256;

/// Liest eine JSON-Datei aus `src/app/m/einsatzbuch/_lib/kern/testvektoren/` relativ zu diesem Crate.
pub fn vektor(datei: &str) -> Value {
    let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren")
        .join(datei);
    serde_json::from_str(&std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display())))
        .unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))
}

/// Packt den CEK eines Umschlags mit dem privaten Suite-Schlüssel aus. Wirft, wenn Umschlag
/// und Kopf nicht zusammengehören (falsches AAD), die Längen nicht stimmen oder `epk` nicht
/// unkomprimiert ist.
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

    let aad = kopf.kanonisch();
    let nonce: [u8; 12] = iv.try_into().expect("Länge oben geprüft");
    let cek = Aes256Gcm::new(&kek.into())
        .decrypt(&nonce.into(), Payload { msg: &ct, aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Entschluesselung)?;
    Ok(cek)
}
