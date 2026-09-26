//! Kryptografie des Einsatzbuchs — Rust-Gegenstück zu `block.ts` und `umschlag.ts` in
//! `src/app/m/einsatzbuch/_lib/kern`. Versiegelt einen `Einsatz` zu einem `Block`:
//! AES-256-GCM über den Klartext (AAD = JCS(Blockkopf)), dazu ein Umschlag, der den
//! Inhaltsschlüssel (CEK) per ECDH-ES (P-256) + HKDF-SHA256 für den öffentlichen
//! Suite-Schlüssel verpackt. Reine RustCrypto-Krypto, kein `ring` — CI prüft das per
//! `cargo tree -i ring`, die Ausgabe muss „nichts gefunden“ melden.
//!
//! Crate-Satz: `p256 0.14`, `hkdf 0.13`, `sha2 0.11`, `aes-gcm 0.11`, `base64 0.23`,
//! `getrandom 0.4`, `zeroize 1` — ein kohärenter RustCrypto-Stand, der sich sauber auflöst.
//! Die Kodiermethode für einen unkomprimierten Kurvenpunkt heißt in dieser `p256`-Fassung
//! `to_sec1_point`, nicht `to_encoded_point` (Letzteres steht dort nur noch als veraltete
//! Weiterleitung).
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
use zeroize::{Zeroize, Zeroizing};

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
    #[error("Klartext ist kein kanonisches JSON")]
    KeinKanonischesJson,
    #[error("Klartext ist kein Einsatz im Format v1")]
    KeinEinsatz,
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
/// `ZeroizeOnDrop` — der ephemere Schlüssel braucht also kein eigenes Aufräumen; `cek` ist
/// ein rohes Array und bekommt sein eigenes `Drop` unten.
///
/// Die Felder sind privat, und der Typ ist weder `Clone` noch `Copy`: Außerhalb dieses Moduls
/// kommt niemand an den CEK, und es entsteht keine zweite Kopie, die kein `Drop` wischt. Gelesen
/// wird er nur in `versiegele`, die den Zufall verbraucht.
pub struct Blockzufall {
    cek: [u8; 32],
    iv: [u8; 12],
    ephemer: SecretKey,
    umschlag_iv: [u8; 12],
}

impl Blockzufall {
    /// Zieht frischen Zufall. Der ephemere Skalar wird aus 32 Zufallsbytes gebildet
    /// (`SecretKey::from_slice`); ist er kein gültiger P-256-Skalar (Null oder ≥ Kurvenordnung —
    /// astronomisch selten), wird neu gezogen. Der rohe Skalar-Puffer `d` ist nach jedem
    /// Versuch — ob er einen gültigen Skalar ergab oder nicht — gewischt, denn ein
    /// verworfener Versuch ist trotzdem ein privater Skalar, der im Speicher stand.
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
            let versuch = SecretKey::from_slice(&d);
            d.zeroize();
            if let Ok(schluessel) = versuch {
                break schluessel;
            }
        };
        Blockzufall { cek, iv, ephemer, umschlag_iv }
    }

    /// Fester Zufall für die Testvektoren (`tests/vektoren.rs`) und andere Tests. Nur mit dem
    /// Merkmal `testhilfe`, das allein die Tests des Kerns einschalten.
    #[cfg(feature = "testhilfe")]
    pub fn fest(cek: [u8; 32], iv: [u8; 12], ephemer: SecretKey, umschlag_iv: [u8; 12]) -> Blockzufall {
        Blockzufall { cek, iv, ephemer, umschlag_iv }
    }
}

impl Drop for Blockzufall {
    /// Wischt den Inhaltsschlüssel beim Verlassen des Gültigkeitsbereichs — auf jedem Pfad,
    /// auch wenn `versiegele` vorher über `?` mit einem Fehler zurückkehrt. `ephemer` bringt
    /// sein eigenes `ZeroizeOnDrop` schon mit (siehe oben); `iv` und `umschlag_iv` sind kein
    /// Geheimnis und bleiben unverändert.
    fn drop(&mut self) {
        self.cek.zeroize();
    }
}

/// Versiegelt einen Einsatz zu einem Block. Prüft zuerst, dass `kopf.schluessel_id` zum
/// öffentlichen Suite-Schlüssel passt (wie `versiegele` in `block.ts`), verschlüsselt dann
/// den kanonischen Klartext mit dem CEK (AAD = JCS(Kopf)) und verpackt den CEK per ECDH-ES +
/// HKDF-SHA256 für die Suite. Der Fingerabdruck ist SHA-256-Hex über JCS von
/// `{kopf, iv, daten, umschlag}` — nie über den Klartext. KEK (`Zeroizing<[u8; 32]>`) und CEK
/// (`Blockzufall::drop`) werden auf jedem Pfad gewischt, auch wenn diese Funktion vorher über
/// `?` mit einem Fehler zurückkehrt.
pub fn versiegele(
    einsatz: &Einsatz,
    kopf: &Blockkopf,
    suite: &PublicKey,
    z: Blockzufall,
) -> Result<Block, KryptoFehler> {
    let spki = suite.to_public_key_der().map_err(|_| KryptoFehler::UngueltigerOeffentlicherSchluessel)?;
    if kopf.schluessel_id != schluessel_id(spki.as_bytes()) {
        return Err(KryptoFehler::SchluesselIdPasstNicht);
    }

    let aad = kopf.kanonisch()?;
    let klar = einsatz.kanonisch()?;
    // `new_from_slice` statt `new(&z.cek.into())`: Die Umwandlung in ein Array legte eine
    // ungewischte Kopie des Schlüssels auf den Stack, `new_from_slice` nur eine Referenz darauf.
    let daten = Aes256Gcm::new_from_slice(&z.cek)
        .map_err(|_| KryptoFehler::Verschluesselung)?
        .encrypt(&z.iv.into(), Payload { msg: klar.as_bytes(), aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Verschluesselung)?;

    // ECDH-ES: geteiltes Geheimnis = x-Koordinate (32 Byte) → HKDF-SHA256, Salt leer, feste Info.
    //
    // Was hier gewischt wird (belegt am Quelltext der Crates, nicht behauptet):
    // - Der Zustand in `Hkdf` ist ein `hmac::Hmac<Sha256>`, gebaut per `digest::buffer_fixed!`
    //   mit `impl: MacTraits` — ohne `ZeroizeOnDrop`-Marker. Gewischt wird er trotzdem über die
    //   Drop-Kette: seine beiden Kerne (`hmac::block_api::HmacCore`, Felder `digest` und
    //   `opad_digest`) enthalten je einen `sha2::block_api::Sha256VarCore`, dessen `impl Drop`
    //   mit dem Merkmal `sha2/zeroize` Zustand und Blockzähler wischt. Der Puffer ist ein
    //   `block_buffer::BlockBuffer`, dessen `impl Drop` mit `block-buffer/zeroize` wischt
    //   (eingeschaltet über `digest/zeroize`, das `hmac/zeroize` setzt). Das gilt auch für den
    //   Klon, den `hkdf::GenericHkdf::expand_multi_info` je Ausgabeblock anlegt. Der Test
    //   `hmac_zustand_wischt_sich_beim_drop` bricht den Bau, fehlt eines der Merkmale.
    // - Den PRK gibt `hkdf::GenericHkdf::new` ungewischt weg; deshalb hier `extract` und der PRK
    //   in `Zeroizing`.
    // - Nicht erreichbar sind Zwischenwerte auf dem Stack der Crates: der Schlüsselblock
    //   (PRK ⊕ ipad/opad) aus `hmac::utils::get_der_key` in `HmacCore::new_from_slice` sowie
    //   `output`/`prev` in `hkdf::GenericHkdf::expand_multi_info` — bei 32 Byte Ausgabe ist
    //   `output` der KEK selbst.
    let geteilt = ecdh::diffie_hellman(z.ephemer.to_nonzero_scalar(), suite.as_affine());
    let mut kek = Zeroizing::new([0u8; 32]);
    let (prk, hkdf) = Hkdf::<Sha256>::extract(None, geteilt.raw_secret_bytes());
    let _prk = Zeroizing::new(prk);
    hkdf.expand(UMSCHLAG_INFO, kek.as_mut()).map_err(|_| KryptoFehler::HkdfFehlgeschlagen)?;
    let ct = Aes256Gcm::new_from_slice(kek.as_ref())
        .map_err(|_| KryptoFehler::Verschluesselung)?
        .encrypt(&z.umschlag_iv.into(), Payload { msg: &z.cek, aad: aad.as_bytes() })
        .map_err(|_| KryptoFehler::Verschluesselung)?;
    let epk = z.ephemer.public_key().to_sec1_point(false); // 65 Byte, 0x04‖x‖y

    let umschlag = Umschlag { epk: b64(epk.as_bytes()), iv: b64(&z.umschlag_iv), ct: b64(&ct) };
    let ohne_hash = serde_json::json!({ "kopf": kopf, "iv": b64(&z.iv), "daten": b64(&daten), "umschlag": umschlag });
    let hash = sha256_hex(crate::jcs::kanonisch(&ohne_hash)?.as_bytes());
    Ok(Block { kopf: kopf.clone(), iv: b64(&z.iv), daten: b64(&daten), umschlag, hash })
}

/// Öffnet einen Block mit seinem CEK — Gegenstück zu `oeffneBlock` in `block.ts`: AES-256-GCM
/// mit AAD = JCS(Kopf), danach die Formprüfung des Klartexts. Ein gelungener GCM-Rundlauf beweist
/// nur, dass jemand mit diesem CEK den Klartext erzeugt hat, nicht dass er ein Einsatz im Format
/// v1 ist. Deshalb in der Reihenfolge des TS-Kerns:
/// 1. Der Klartext ist JSON und byte-gleich zu seiner eigenen Kanonik (`ausKanonischemJson`),
///    sonst `KeinKanonischesJson`.
/// 2. Er ist ein `Einsatz` mit `v = 1` und genau dessen Schlüsseln (`istEinsatz`), sonst
///    `KeinEinsatz`. Der Rundlauf `einsatz.kanonisch() == klartext` fängt dabei ein fehlendes
///    `Option`-Feld ab, das serde still mit `None` füllen würde.
///
/// Den CEK besitzt und wischt die Aufruferin; der entschlüsselte Klartext liegt hier in
/// `Zeroizing` und wird beim Verlassen überschrieben.
pub fn oeffne_block(block: &Block, cek: &[u8; 32]) -> Result<Einsatz, KryptoFehler> {
    let iv = aus_b64(&block.iv)?;
    let iv: [u8; 12] = iv.as_slice().try_into().map_err(|_| KryptoFehler::FalscheLaenge { was: "iv", soll: 12, ist: iv.len() })?;
    let daten = aus_b64(&block.daten)?;
    let aad = block.kopf.kanonisch()?;
    let klar = Zeroizing::new(
        Aes256Gcm::new_from_slice(cek)
            .map_err(|_| KryptoFehler::Entschluesselung)?
            .decrypt(&iv.into(), Payload { msg: &daten, aad: aad.as_bytes() })
            .map_err(|_| KryptoFehler::Entschluesselung)?,
    );

    let wert: serde_json::Value = serde_json::from_slice(&klar).map_err(|_| KryptoFehler::KeinKanonischesJson)?;
    let kanonisch = Zeroizing::new(crate::jcs::kanonisch(&wert).map_err(|_| KryptoFehler::KeinKanonischesJson)?);
    if kanonisch.as_bytes() != klar.as_slice() {
        return Err(KryptoFehler::KeinKanonischesJson);
    }
    let einsatz: Einsatz = serde_json::from_value(wert).map_err(|_| KryptoFehler::KeinEinsatz)?;
    if einsatz.v != 1 {
        return Err(KryptoFehler::KeinEinsatz);
    }
    let rundlauf = Zeroizing::new(einsatz.kanonisch().map_err(|_| KryptoFehler::KeinEinsatz)?);
    if rundlauf.as_bytes() != klar.as_slice() {
        return Err(KryptoFehler::KeinEinsatz);
    }
    Ok(einsatz)
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::*;
    use crate::format::{Einsatz, FahrzeugStand, GENESIS, PersonStand, Umgebung};

    fn leerer_einsatz() -> Einsatz {
        Einsatz {
            v: 1,
            nummer: String::new(),
            stichwort: String::new(),
            beginn_datum: String::new(),
            beginn_zeit: String::new(),
            ende_datum: None,
            ende_zeit: None,
            strasse: String::new(),
            ort: String::new(),
            objekt: String::new(),
            fahrzeuge: Vec::<FahrzeugStand>::new(),
            personal: Vec::<PersonStand>::new(),
            vor_ort: 0,
            transport: 0,
            notizen: String::new(),
        }
    }

    /// Verlangtes kanonisches Base64 (Standardalphabet, Padding, Rundlauf-Gleichheit):
    /// eine zu kurze Kodierung ohne Padding, ein Padding über nicht genullten Bits, das
    /// URL-sichere Alphabet und ein angehängtes Leerzeichen sind alle keine gültige Eingabe.
    #[test]
    fn aus_b64_lehnt_unkanonisches_base64_ab() {
        for text in ["QQ", "QR==", "-_==", "QQ== "] {
            assert!(aus_b64(text).is_err(), "{text} hätte abgelehnt werden müssen");
        }
    }

    #[test]
    fn versiegele_lehnt_falsche_schluessel_id_ab() {
        let geheim = SecretKey::from_slice(&[3u8; 32]).unwrap();
        let oeffentlich = geheim.public_key();
        let kopf = Blockkopf {
            v: 1,
            block: 1,
            prev: GENESIS.to_string(),
            versiegelt: "2026-01-01T00:00:00+01:00".to_string(),
            schluessel_id: "0000000000000000".to_string(),
            umgebung: Umgebung::Echt,
        };
        let z = Blockzufall {
            cek: [0u8; 32],
            iv: [0u8; 12],
            ephemer: SecretKey::from_slice(&[4u8; 32]).unwrap(),
            umschlag_iv: [0u8; 12],
        };
        let ergebnis = versiegele(&leerer_einsatz(), &kopf, &oeffentlich, z);
        assert!(matches!(ergebnis, Err(KryptoFehler::SchluesselIdPasstNicht)), "{ergebnis:?}");
    }

    /// `Blockzufall` ist nicht klonbar: Ein Klon wäre eine zweite Kopie des CEK. Geprüft beim
    /// Kompilieren — wäre `Blockzufall: Clone`, passten beide Implementierungen, und der Aufruf
    /// wäre mehrdeutig (dieselbe Technik wie `assert_not_impl_any!` aus `static_assertions`).
    #[test]
    fn blockzufall_ist_nicht_klonbar() {
        trait MehrdeutigWennKlonbar<A> {
            fn pruefe() {}
        }
        impl<T: ?Sized> MehrdeutigWennKlonbar<()> for T {}
        impl<T: Clone> MehrdeutigWennKlonbar<u8> for T {}
        <Blockzufall as MehrdeutigWennKlonbar<_>>::pruefe();
    }

    /// Der Zustand, den `Hkdf<Sha256>` hält, ist ein `hmac::Hmac<Sha256>`: zwei SHA-256-Kerne
    /// (`hmac::block_api::HmacCore`, Felder `digest` und `opad_digest`) und ein Blockpuffer. Beide
    /// wischen sich mit den Merkmalen `zeroize` von `sha2` und `hmac` beim Drop (Beleg im Kommentar
    /// an `versiegele`). Fehlt ein Merkmal, kompiliert dieser Test nicht.
    #[test]
    fn hmac_zustand_wischt_sich_beim_drop() {
        use hmac::block_api::HmacCore;
        use sha2::digest::block_api::{Buffer, CoreProxy};
        fn wischt_beim_drop<T: zeroize::ZeroizeOnDrop>() {}
        wischt_beim_drop::<<Sha256 as CoreProxy>::Core>();
        wischt_beim_drop::<Buffer<HmacCore<Sha256>>>();
    }

    /// Skript-Zufall für `ziehe`: liefert der Reihe nach feste Antworten, unabhängig von der
    /// angeforderten Pufferlänge (die Aufruferin fordert immer genau die Länge an, die eine
    /// Antwort auch hat).
    struct SkriptZufall(VecDeque<Vec<u8>>);

    impl Zufall for SkriptZufall {
        fn fuelle(&mut self, puffer: &mut [u8]) {
            let naechste = self.0.pop_front().expect("Skript erschöpft");
            puffer.copy_from_slice(&naechste);
        }
    }

    #[test]
    fn ziehe_zieht_neu_wenn_der_erste_versuch_den_nullskalar_liefert() {
        let mut skript = SkriptZufall(VecDeque::from(vec![
            vec![7u8; 32], // cek
            vec![1u8; 12], // iv
            vec![2u8; 12], // umschlag_iv
            vec![0u8; 32], // 1. Versuch: Nullskalar, ungültig — muss verworfen werden
            vec![9u8; 32], // 2. Versuch: gültiger Skalar
        ]));
        let z = Blockzufall::ziehe(&mut skript);
        let erwartet = SecretKey::from_slice(&[9u8; 32]).unwrap();
        assert_eq!(z.ephemer.to_bytes().as_slice(), erwartet.to_bytes().as_slice());
    }
}
