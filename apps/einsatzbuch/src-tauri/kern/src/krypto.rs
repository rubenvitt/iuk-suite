//! Kryptografie des Einsatzbuchs — Rust-Gegenstück zu `block.ts` und `umschlag.ts` in
//! `src/app/m/einsatzbuch/_lib/kern`. Versiegelt einen `Einsatz` zu einem `Block`:
//! AES-256-GCM über den Klartext (AAD = JCS(Blockkopf)), dazu ein Umschlag, der den
//! Inhaltsschlüssel (CEK) per ECDH-ES (P-256) + HKDF-SHA256 für den öffentlichen
//! Suite-Schlüssel verpackt. Reine RustCrypto-Krypto, kein `ring` (`cargo tree -i ring`
//! muss „nichts gefunden" melden, Vorgabe der Kontextdatei).
//!
//! Gewählter Crate-Satz: der Primärsatz aus dem Auftrag (`p256 0.14`, `hkdf 0.13`,
//! `sha2 0.11`, `aes-gcm 0.11`, `base64 0.23`, `getrandom 0.4`, `zeroize 1`) — er löst sich
//! sauber auf. Gegenüber der Vorlage im Auftrag heißt die Kodiermethode für einen
//! unkomprimierten Kurvenpunkt in dieser Fassung `to_sec1_point`, nicht `to_encoded_point`
//! (Letzteres steht dort nur noch als veraltete Weiterleitung).
use std::fmt::Write as _;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use hkdf::Hkdf;
use p256::elliptic_curve::sec1::ToSec1Point;
use p256::pkcs8::{DecodePublicKey, EncodePublicKey};
use p256::{PublicKey, SecretKey, ecdh};
use sha2::{Digest, Sha256};
use zeroize::Zeroize;

use crate::format::{Block, Blockkopf, Einsatz, Umschlag};

/// HKDF-Info des Umschlags — fest, wie `INFO` in `umschlag.ts`.
pub const UMSCHLAG_INFO: &[u8] = b"einsatzbuch/v1/umschlag";

#[derive(Debug, thiserror::Error)]
pub enum KryptoFehler {
    #[error("Kanonisierung fehlgeschlagen: {0}")]
    Jcs(#[from] crate::jcs::JcsFehler),
    #[error("schluesselId passt nicht zum Schlüssel")]
    SchluesselIdPasstNicht,
    #[error("ungültiger öffentlicher Schlüssel (SPKI bzw. unkomprimierter Kurvenpunkt)")]
    UngueltigerOeffentlicherSchluessel,
    #[error("HKDF-Expand fehlgeschlagen (Ausgabelänge zu groß)")]
    HkdfFehlgeschlagen,
    #[error("AES-GCM-Verschlüsselung fehlgeschlagen")]
    Verschluesselung,
    #[error("AES-GCM-Entschlüsselung fehlgeschlagen (falscher Schlüssel, veränderter Kopf oder verändertes Chiffrat)")]
    Entschluesselung,
    #[error("kein kanonisches Base64 (Standardalphabet mit Padding, Rundlauf-Gleichheit)")]
    UngueltigesBase64,
    #[error("{was} muss {soll} Byte lang sein, war {ist}")]
    FalscheLaenge { was: &'static str, soll: usize, ist: usize },
}

/// Zufallsquelle für einen Versiegelungsvorgang — austauschbar, damit Tests deterministisch
/// gegen feste Testvektoren laufen (siehe `tests/vektoren.rs`).
pub trait Zufall {
    fn fuelle(&mut self, puffer: &mut [u8]);
}

/// Der im Betrieb tatsächlich benutzte Zufall (Betriebssystem-CSPRNG).
pub struct SystemZufall;

impl Zufall for SystemZufall {
    fn fuelle(&mut self, puffer: &mut [u8]) {
        getrandom::fill(puffer).expect("Systemzufall muss verfügbar sein");
    }
}

/// Base64 mit Standardalphabet und Padding — wie `zuBase64` in `bytes.ts`.
pub fn b64(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

/// Verlangt kanonisches Base64 wie `ausBase64` in `bytes.ts`: Standardalphabet, Padding,
/// und der Rundlauf `b64(aus_b64(text)) == text` muss gelten — sonst gäbe es zwei Base64-
/// Schreibweisen für dasselbe Byte, und der Fingerabdruck über den Block wäre nicht eindeutig.
pub fn aus_b64(text: &str) -> Result<Vec<u8>, KryptoFehler> {
    let bytes = B64.decode(text).map_err(|_| KryptoFehler::UngueltigesBase64)?;
    if b64(&bytes) != text {
        return Err(KryptoFehler::UngueltigesBase64);
    }
    Ok(bytes)
}

/// SHA-256 in Hex-Kleinbuchstaben.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    let mut aus = String::with_capacity(hash.len() * 2);
    for b in hash.as_slice() {
        let _ = write!(aus, "{b:02x}");
    }
    aus
}

/// Die ersten 16 Hex-Zeichen von SHA-256 über den öffentlichen Schlüssel (SPKI-DER) —
/// wie `schluesselIdVon` in `umschlag.ts`.
pub fn schluessel_id(spki_der: &[u8]) -> String {
    sha256_hex(spki_der)[..16].to_string()
}

/// Liest einen öffentlichen P-256-Schlüssel aus SPKI-DER.
pub fn oeffentlich_aus_spki(spki_der: &[u8]) -> Result<PublicKey, KryptoFehler> {
    PublicKey::from_public_key_der(spki_der).map_err(|_| KryptoFehler::UngueltigerOeffentlicherSchluessel)
}

/// Der Zufall eines einzelnen Versiegelungsvorgangs: Inhaltsschlüssel (CEK), dessen IV, ein
/// ephemerer Schlüssel für den Umschlag und dessen eigene IV. `SecretKey` ist selbst
/// `ZeroizeOnDrop` — der ephemere Schlüssel braucht also kein eigenes Aufräumen.
pub struct Blockzufall {
    pub cek: [u8; 32],
    pub iv: [u8; 12],
    pub ephemer: SecretKey,
    pub umschlag_iv: [u8; 12],
}

impl Blockzufall {
    /// Zieht frischen Zufall. Der ephemere Skalar wird aus 32 Zufallsbytes gebildet
    /// (`SecretKey::from_slice`); ist er kein gültiger P-256-Skalar (Null oder ≥ Kurvenordnung —
    /// astronomisch selten), wird neu gezogen.
    pub fn ziehe(z: &mut dyn Zufall) -> Blockzufall {
        let mut cek = [0u8; 32];
        z.fuelle(&mut cek);
        let mut iv = [0u8; 12];
        z.fuelle(&mut iv);
        let mut umschlag_iv = [0u8; 12];
        z.fuelle(&mut umschlag_iv);
        let ephemer = loop {
            let mut d = [0u8; 32];
            z.fuelle(&mut d);
            if let Ok(schluessel) = SecretKey::from_slice(&d) {
                break schluessel;
            }
        };
        Blockzufall { cek, iv, ephemer, umschlag_iv }
    }
}

/// Versiegelt einen Einsatz zu einem Block. Prüft zuerst, dass `kopf.schluessel_id` zum
/// öffentlichen Suite-Schlüssel passt (wie `versiegele` in `block.ts`), verschlüsselt dann
/// den kanonischen Klartext mit dem CEK (AAD = JCS(Kopf)) und verpackt den CEK per ECDH-ES +
/// HKDF-SHA256 für die Suite. Der Fingerabdruck ist SHA-256-Hex über JCS von
/// `{kopf, iv, daten, umschlag}` — nie über den Klartext. Überschreibt KEK und CEK zum
/// Schluss mit `zeroize`.
pub fn versiegele(
    einsatz: &Einsatz,
    kopf: &Blockkopf,
    suite: &PublicKey,
    mut z: Blockzufall,
) -> Result<Block, KryptoFehler> {
    let spki = suite.to_public_key_der().map_err(|_| KryptoFehler::UngueltigerOeffentlicherSchluessel)?;
    if kopf.schluessel_id != schluessel_id(spki.as_bytes()) {
        return Err(KryptoFehler::SchluesselIdPasstNicht);
    }

    let aad = kopf.kanonisch();
    let klar = einsatz.kanonisch()?;
    let daten = Aes256Gcm::new(&z.cek.into())
        .encrypt(&z.iv.into(), Payload { msg: klar.as_bytes(), aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Verschluesselung)?;

    // ECDH-ES: geteiltes Geheimnis = x-Koordinate (32 Byte) → HKDF-SHA256, Salt leer, feste Info.
    let geteilt = ecdh::diffie_hellman(z.ephemer.to_nonzero_scalar(), suite.as_affine());
    let mut kek = [0u8; 32];
    Hkdf::<Sha256>::new(None, geteilt.raw_secret_bytes())
        .expand(UMSCHLAG_INFO, &mut kek)
        .map_err(|_| KryptoFehler::HkdfFehlgeschlagen)?;
    let ct = Aes256Gcm::new(&kek.into())
        .encrypt(&z.umschlag_iv.into(), Payload { msg: &z.cek, aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Verschluesselung)?;
    let epk = z.ephemer.public_key().to_sec1_point(false); // 65 Byte, 0x04‖x‖y

    kek.zeroize();
    z.cek.zeroize();

    let umschlag = Umschlag { epk: b64(epk.as_bytes()), iv: b64(&z.umschlag_iv), ct: b64(&ct) };
    let ohne_hash = serde_json::json!({ "kopf": kopf, "iv": b64(&z.iv), "daten": b64(&daten), "umschlag": umschlag });
    let hash = sha256_hex(crate::jcs::kanonisch(&ohne_hash)?.as_bytes());
    Ok(Block { kopf: kopf.clone(), iv: b64(&z.iv), daten: b64(&daten), umschlag, hash })
}
