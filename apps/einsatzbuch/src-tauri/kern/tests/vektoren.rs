//! Format-Vertrag mit dem TS-Kern: `src/app/m/einsatzbuch/_lib/kern/testvektoren/`
//! (`erzeuge.ts`, `erzeugeErwartung`). Gleiche Eingaben → byte-gleiche Blöcke.
mod hilfe;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use einsatzbuch_kern::format::{Block, Blockkopf, Einsatz, GENESIS, Umgebung};
use einsatzbuch_kern::jcs;
use einsatzbuch_kern::krypto::{self, Blockzufall, SystemZufall};
use p256::elliptic_curve::sec1::ToSec1Point;

fn b64url(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).unwrap()
}
fn b64(s: &str) -> Vec<u8> {
    krypto::aus_b64(s).unwrap()
}

#[test]
fn versiegelt_die_vektoren_byte_genau() {
    let eingaben = hilfe::vektor("eingaben.json");
    let erwartet = hilfe::vektor("erwartet.json");
    let spki = b64(eingaben["suite"]["oeffentlichSpki"].as_str().unwrap());
    let suite = krypto::oeffentlich_aus_spki(&spki).unwrap();
    let schluessel_id = krypto::schluessel_id(&spki);
    assert_eq!(schluessel_id, erwartet["schluesselId"].as_str().unwrap());

    let einsaetze: Vec<Einsatz> = serde_json::from_value(eingaben["einsaetze"].clone()).unwrap();
    let mut prev = GENESIS.to_string();
    for (i, einsatz) in einsaetze.iter().enumerate() {
        let z = &eingaben["bloecke"][i];

        // Vor der Verschlüsselung: der eigene kanonische Klartext muss zur direkten
        // JCS-Kanonisierung des rohen Eingabewerts passen. Das fängt einen stummen
        // Feldverlust ab (z. B. ein `Option`-Feld, das im JSON fehlt statt `null` zu sein),
        // bevor er sich hinter einem falschen Chiffrat versteckt.
        let roh_kanonisch = jcs::kanonisch(&eingaben["einsaetze"][i]).unwrap();
        assert_eq!(einsatz.kanonisch().unwrap(), roh_kanonisch, "Einsatz {} weicht schon vor der Verschlüsselung ab", i + 1);

        let kopf = Blockkopf {
            v: 1,
            block: i as u64 + 1,
            prev: prev.clone(),
            versiegelt: z["versiegelt"].as_str().unwrap().into(),
            schluessel_id: schluessel_id.clone(),
            umgebung: Umgebung::Echt,
        };
        let zufall = Blockzufall {
            cek: b64(z["cek"].as_str().unwrap()).try_into().unwrap(),
            iv: b64(z["iv"].as_str().unwrap()).try_into().unwrap(),
            ephemer: p256::SecretKey::from_slice(&b64url(z["umschlag"]["ephemer"]["d"].as_str().unwrap())).unwrap(),
            umschlag_iv: b64(z["umschlag"]["iv"].as_str().unwrap()).try_into().unwrap(),
        };
        let block: Block = krypto::versiegele(einsatz, &kopf, &suite, zufall).unwrap();
        let soll = &erwartet["bloecke"][i];

        // Reihenfolge folgt der Datenabhängigkeit: IV und epk hängen nur vom gezogenen Zufall
        // ab, `daten` zusätzlich vom Klartext, `umschlag.ct` zusätzlich vom ECDH/HKDF-Pfad,
        // `hash` von allem zuvor. Schlägt ein früher Assert fehl, zeigt das genau, wo die
        // Abweichung beginnt, statt nur „ganzer Block stimmt nicht“ zu melden.
        assert_eq!(block.iv, soll["iv"].as_str().unwrap(), "IV Block {}", i + 1);
        assert_eq!(block.umschlag.epk, soll["umschlag"]["epk"].as_str().unwrap(), "epk Block {}", i + 1);
        assert_eq!(block.daten, soll["daten"].as_str().unwrap(), "Chiffrat Block {}", i + 1);
        assert_eq!(block.umschlag.ct, soll["umschlag"]["ct"].as_str().unwrap(), "Umschlag-Chiffrat Block {}", i + 1);
        assert_eq!(block.hash, soll["hash"].as_str().unwrap(), "Hash Block {}", i + 1);
        assert_eq!(serde_json::to_value(&block).unwrap(), *soll, "ganzer Block {}", i + 1);
        prev = block.hash;
    }
}

#[test]
fn ephemerer_oeffentlicher_schluessel_passt_zum_jwk() {
    // Schützt den Test selbst: x/y des JWK gehören zum `d`, das wir benutzen.
    let eingaben = hilfe::vektor("eingaben.json");
    let jwk = &eingaben["bloecke"][0]["umschlag"]["ephemer"];
    let geheim = p256::SecretKey::from_slice(&b64url(jwk["d"].as_str().unwrap())).unwrap();
    let punkt = geheim.public_key().to_sec1_point(false);
    assert_eq!(punkt.x().unwrap().as_slice(), b64url(jwk["x"].as_str().unwrap()).as_slice());
    assert_eq!(punkt.y().unwrap().as_slice(), b64url(jwk["y"].as_str().unwrap()).as_slice());
}

/// Längen-Test — Vertrag des Kerns, wie `mitLaenge` in `bytes.ts`
/// (`src/app/m/einsatzbuch/_lib/kern`): IV und Umschlag-IV 12 Byte, `epk` 65 Byte mit
/// führendem `0x04` (unkomprimiert), Umschlag-`ct` 48 Byte (32 Byte CEK + 16 Byte Tag), und
/// jedes Base64-Feld ist kanonisch (`b64(aus_b64(x)) == x`).
#[test]
fn laengen_und_kanonisches_base64_wie_im_ts_kern() {
    let erwartet = hilfe::vektor("erwartet.json");
    for soll in erwartet["bloecke"].as_array().unwrap() {
        let iv_text = soll["iv"].as_str().unwrap();
        let iv = krypto::aus_b64(iv_text).unwrap();
        assert_eq!(iv.len(), 12, "iv");
        assert_eq!(krypto::b64(&iv), iv_text, "iv nicht kanonisch");

        let umschlag_iv_text = soll["umschlag"]["iv"].as_str().unwrap();
        let umschlag_iv = krypto::aus_b64(umschlag_iv_text).unwrap();
        assert_eq!(umschlag_iv.len(), 12, "umschlag.iv");
        assert_eq!(krypto::b64(&umschlag_iv), umschlag_iv_text, "umschlag.iv nicht kanonisch");

        let epk_text = soll["umschlag"]["epk"].as_str().unwrap();
        let epk = krypto::aus_b64(epk_text).unwrap();
        assert_eq!(epk.len(), 65, "epk");
        assert_eq!(epk[0], 0x04, "epk muss unkomprimiert sein");
        assert_eq!(krypto::b64(&epk), epk_text, "epk nicht kanonisch");

        let ct_text = soll["umschlag"]["ct"].as_str().unwrap();
        let ct = krypto::aus_b64(ct_text).unwrap();
        assert_eq!(ct.len(), 48, "umschlag.ct");
        assert_eq!(krypto::b64(&ct), ct_text, "umschlag.ct nicht kanonisch");

        let daten_text = soll["daten"].as_str().unwrap();
        let daten = krypto::aus_b64(daten_text).unwrap();
        assert_eq!(krypto::b64(&daten), daten_text, "daten nicht kanonisch");
    }
}

/// Rundlauf-Test mit dem privaten Vektor-Suiteschlüssel: `SystemZufall` versiegelt einen
/// frischen Block, der Umschlag packt per `hilfe::packe_aus` auf genau 32 Byte aus, und der
/// so gewonnene CEK öffnet `daten` zu genau `einsatz.kanonisch()`. Ein veränderter Kopf
/// (`versiegelt` geändert) lässt das Auspacken scheitern, weil sich damit die AAD ändert.
#[test]
fn rundlauf_mit_systemzufall_oeffnet_den_klartext_und_scheitert_bei_veraendertem_kopf() {
    let eingaben = hilfe::vektor("eingaben.json");
    let spki = b64(eingaben["suite"]["oeffentlichSpki"].as_str().unwrap());
    let suite_oeffentlich = krypto::oeffentlich_aus_spki(&spki).unwrap();
    let suite_privat = p256::SecretKey::from_slice(&b64url(eingaben["suite"]["privat"]["d"].as_str().unwrap())).unwrap();
    let schluessel_id = krypto::schluessel_id(&spki);

    let einsatz: Einsatz = serde_json::from_value(eingaben["einsaetze"][0].clone()).unwrap();
    let kopf = Blockkopf {
        v: 1,
        block: 1,
        prev: GENESIS.to_string(),
        versiegelt: "2026-01-01T00:00:00+01:00".to_string(),
        schluessel_id,
        umgebung: Umgebung::Echt,
    };

    let mut zufall = SystemZufall;
    let z = Blockzufall::ziehe(&mut zufall);
    let block = krypto::versiegele(&einsatz, &kopf, &suite_oeffentlich, z).unwrap();

    let cek = hilfe::packe_aus(&block.umschlag, &block.kopf, &suite_privat).unwrap();
    assert_eq!(cek.len(), 32, "CEK muss 32 Byte lang sein");

    let iv: [u8; 12] = krypto::aus_b64(&block.iv).unwrap().try_into().unwrap();
    let daten = krypto::aus_b64(&block.daten).unwrap();
    let aad = block.kopf.kanonisch();
    let cek_array: [u8; 32] = cek.try_into().unwrap();
    let klar = Aes256Gcm::new(&cek_array.into())
        .decrypt(&iv.into(), Payload { msg: &daten, aad: aad.as_bytes() })
        .expect("der ausgepackte CEK muss den Klartext öffnen");
    assert_eq!(String::from_utf8(klar).unwrap(), einsatz.kanonisch().unwrap());

    let mut veraendert = block.kopf.clone();
    veraendert.versiegelt = "2099-01-01T00:00:00+01:00".to_string();
    assert!(
        hilfe::packe_aus(&block.umschlag, &veraendert, &suite_privat).is_err(),
        "ein veränderter Kopf muss das Auspacken scheitern lassen, weil er die AAD ändert"
    );
}
