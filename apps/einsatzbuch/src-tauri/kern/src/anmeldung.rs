//! Anmeldung an der Suite (Spec §4.4): PKCE-S256 und `state` für den Loopback-Rückruf
//! (`loopback.rs`), die Anmelde-URL samt Percent-Kodierung und die Weiche, wohin diese URL geht.
//! In Debug-Builds mit `EINSATZBUCH_ANMELDUNG_STDOUT=1` geht sie auf stdout statt in den
//! Systembrowser, damit ein Testtreiber die Anmeldung übernehmen kann.
use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use crate::krypto::Zufall;

/// Suite-Adresse eines echten Rechners (Nachtrag des Controllers); ein Build kann sie über
/// `EINSATZBUCH_SUITE_URL` ersetzen. `match` statt `unwrap_or`, damit der Wert eine Konstante
/// bleibt.
pub const SUITE_VORGABE: &str = match option_env!("EINSATZBUCH_SUITE_URL") {
    Some(url) => url,
    None => "https://einsatzbuch.iuk-ue.de",
};

/// PKCE-Paar (RFC 7636, Methode S256). Der `verifier` bleibt im Rechner und geht erst mit dem
/// Tausch an die Suite; die `challenge` steht in der Anmelde-URL.
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

/// Zieht 32 Zufallsbytes als Verifier (base64url ohne Padding, 43 Zeichen — erfüllt
/// `^[A-Za-z0-9._~-]{43,128}$` der Suite) und leitet die Challenge davon ab.
pub fn pkce(z: &mut dyn Zufall) -> Pkce {
    let mut roh = Zeroizing::new([0u8; 32]);
    z.fuelle(roh.as_mut());
    let verifier = B64URL.encode(roh.as_ref());
    let challenge = challenge_zu(&verifier);
    Pkce { verifier, challenge }
}

/// `BASE64URL(SHA256(ASCII(verifier)))` ohne Padding (RFC 7636, Abschnitt 4.2).
pub fn challenge_zu(verifier: &str) -> String {
    B64URL.encode(Sha256::digest(verifier.as_bytes()))
}

/// Frischer `state` für einen Anmeldeversuch: 32 Zufallsbytes base64url (43 Zeichen), erfüllt
/// `^[A-Za-z0-9_-]{16,128}$` der Suite. Der Loopback-Listener nimmt nur einen Rückruf mit
/// genau diesem Wert an.
pub fn neuer_state(z: &mut dyn Zufall) -> String {
    let mut roh = [0u8; 32];
    z.fuelle(&mut roh);
    B64URL.encode(roh)
}

/// Adresse eines Pfads im Modul Einsatzbuch der Suite: `<suite>/m/einsatzbuch<pfad>`. Alle
/// Suite-Adressen des Kerns laufen hierüber, damit eine Korrektur an einer Stelle reicht. Der
/// interne Pfad `/m/einsatzbuch` gilt auf dem Modul-Host wie auf dem Hauptnamen der Suite
/// (`decideRoute` in `src/core/routing.ts` präfixt einen schon internen Pfad nicht erneut).
pub fn modul_url(suite_url: &str, pfad: &str) -> String {
    format!("{}/m/einsatzbuch{pfad}", suite_url.trim_end_matches('/'))
}

/// Anmelde-URL der Suite (Tabelle „Schnittstellen“, Nr. 1). `einrichtung` ist `(art, name)`
/// und nur bei einer Einrichtung gesetzt (Entscheidung 1); alle Werte sind percent-kodiert.
pub fn anmelde_url(suite_url: &str, port: u16, state: &str, challenge: &str, einrichtung: Option<(&str, &str)>) -> String {
    let mut url = format!(
        "{}?port={port}&state={}&challenge={}",
        modul_url(suite_url, "/anmelden"),
        prozent_kodiere(state),
        prozent_kodiere(challenge)
    );
    if let Some((art, name)) = einrichtung {
        url.push_str(&format!("&art={}&name={}", prozent_kodiere(art), prozent_kodiere(name)));
    }
    url
}

/// Percent-Kodierung (RFC 3986): Nur die unreservierten Zeichen `A–Z a–z 0–9 - . _ ~` bleiben
/// stehen, jedes andere Byte der UTF-8-Form wird `%XX` — taugt für Abfragewerte wie für ein
/// Pfadsegment.
pub fn prozent_kodiere(text: &str) -> String {
    let mut aus = String::with_capacity(text.len());
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            aus.push(char::from(b));
        } else {
            aus.push_str(&format!("%{b:02X}"));
        }
    }
    aus
}

/// Dekodiert einen Abfragewert: `%XX` wird zum Byte, `+` zum Leerzeichen (Formularkodierung, wie
/// `URLSearchParams` sie schreibt). `None` bei einer unvollständigen oder nicht hexadezimalen
/// `%`-Folge und wenn das Ergebnis kein gültiges UTF-8 ist.
pub fn prozent_dekodiere(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut aus = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                let hex = bytes.get(i + 1..i + 3)?;
                // Vorher prüfen: `from_str_radix` nähme auch ein Vorzeichen („%+1“) an.
                if !hex.iter().all(u8::is_ascii_hexdigit) {
                    return None;
                }
                aus.push(u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?);
                i += 3;
            }
            b'+' => {
                aus.push(b' ');
                i += 1;
            }
            b => {
                aus.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(aus).ok()
}

pub const STDOUT_SCHALTER: &str = "EINSATZBUCH_ANMELDUNG_STDOUT";
pub const STDOUT_PRAEFIX: &str = "EINSATZBUCH_ANMELDE_URL=";

/// Wohin die Anmelde-URL geht: als fertige Zeile auf stdout oder in den Systembrowser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ziel {
    Stdout(String),
    Browser,
}

/// Reine Entscheidung (testbar); `schalter` ist der Wert der Umgebungsvariable
/// `STDOUT_SCHALTER`. Nur genau `"1"` schaltet um, und nur in Debug-Builds — ein Release-Build
/// öffnet immer den Systembrowser, gleich was in der Umgebung steht.
pub fn ziel(url: &str, schalter: Option<&str>) -> Ziel {
    if cfg!(debug_assertions) && schalter == Some("1") {
        Ziel::Stdout(format!("{STDOUT_PRAEFIX}{url}"))
    } else {
        Ziel::Browser
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Die Tests laufen im Debug-Profil, `cfg!(debug_assertions)` ist hier also wahr.
    #[test]
    fn schalter_eins_schickt_die_url_mit_praefix_auf_stdout() {
        assert_eq!(ziel("u", Some("1")), Ziel::Stdout("EINSATZBUCH_ANMELDE_URL=u".into()));
    }

    #[test]
    fn ohne_schalter_oder_mit_anderem_wert_geht_es_in_den_browser() {
        assert_eq!(ziel("u", None), Ziel::Browser);
        assert_eq!(ziel("u", Some("0")), Ziel::Browser);
        assert_eq!(ziel("u", Some("")), Ziel::Browser);
        assert_eq!(ziel("u", Some("true")), Ziel::Browser);
    }

    /// Liefert der Reihe nach die Bytes des Skripts, unabhängig von der Pufferlänge.
    struct SkriptZufall(Vec<u8>);

    impl Zufall for SkriptZufall {
        fn fuelle(&mut self, puffer: &mut [u8]) {
            let rest = self.0.split_off(puffer.len());
            puffer.copy_from_slice(&self.0);
            self.0 = rest;
        }
    }

    fn ist_base64url(text: &str) -> bool {
        text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    }

    /// RFC 7636, Anhang B: diese 32 Oktette ergeben genau diesen Verifier und diese Challenge —
    /// derselbe Vektor wie `s256` in `src/app/m/einsatzbuch/_lib/anbindung/token.test.ts`.
    #[test]
    fn pkce_folgt_dem_vektor_aus_rfc_7636() {
        let oktette = vec![
            116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191,
            240, 91, 88, 5, 88, 83, 132, 141, 121,
        ];
        let p = pkce(&mut SkriptZufall(oktette));
        assert_eq!(p.verifier, "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
        assert_eq!(p.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assert_eq!(challenge_zu("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), p.challenge);
    }

    #[test]
    fn pkce_und_state_sind_43_zeichen_base64url() {
        let p = pkce(&mut SkriptZufall(vec![0xfb; 32]));
        assert_eq!(p.verifier.len(), 43);
        assert!(ist_base64url(&p.verifier), "{}", p.verifier);
        assert_eq!(p.challenge.len(), 43);
        assert!(ist_base64url(&p.challenge), "{}", p.challenge);
        assert_eq!(p.challenge, challenge_zu(&p.verifier));

        let state = neuer_state(&mut SkriptZufall(vec![0xff; 32]));
        assert_eq!(state.len(), 43);
        assert!(ist_base64url(&state), "{state}");
        assert_ne!(neuer_state(&mut crate::krypto::SystemZufall), neuer_state(&mut crate::krypto::SystemZufall));
    }

    #[test]
    fn anmelde_url_kodiert_die_werte() {
        assert_eq!(
            anmelde_url("https://suite.example/", 49152, "st-_a", "ch", Some(("test", "Laptop Küche & Co"))),
            "https://suite.example/m/einsatzbuch/anmelden?port=49152&state=st-_a&challenge=ch&art=test&name=Laptop%20K%C3%BCche%20%26%20Co"
        );
        assert_eq!(
            anmelde_url("https://suite.example", 1024, "s", "c", None),
            "https://suite.example/m/einsatzbuch/anmelden?port=1024&state=s&challenge=c"
        );
    }

    #[test]
    fn modul_url_haengt_den_pfad_ohne_doppelten_schraegstrich_an() {
        assert_eq!(modul_url("https://s.example", "/api/anker"), "https://s.example/m/einsatzbuch/api/anker");
        assert_eq!(modul_url("https://s.example//", "/api/anker"), "https://s.example/m/einsatzbuch/api/anker");
    }

    #[test]
    fn prozentkodierung_laesst_nur_unreservierte_zeichen_stehen() {
        assert_eq!(prozent_kodiere("AZaz09-._~"), "AZaz09-._~");
        assert_eq!(prozent_kodiere("a b/ä&=+?#%"), "a%20b%2F%C3%A4%26%3D%2B%3F%23%25");
        assert_eq!(prozent_kodiere(""), "");
    }

    #[test]
    fn prozentdekodierung_und_ihre_fehler() {
        assert_eq!(prozent_dekodiere("a%20b").as_deref(), Some("a b"));
        assert_eq!(prozent_dekodiere("a+b").as_deref(), Some("a b"));
        assert_eq!(prozent_dekodiere("%C3%a4").as_deref(), Some("ä"));
        assert_eq!(prozent_dekodiere("").as_deref(), Some(""));
        assert_eq!(prozent_dekodiere("%zz"), None);
        assert_eq!(prozent_dekodiere("%4"), None);
        assert_eq!(prozent_dekodiere("%"), None);
        assert_eq!(prozent_dekodiere("%+1"), None, "Vorzeichen ist keine Hexziffer");
        assert_eq!(prozent_dekodiere("%FF"), None, "kein gültiges UTF-8");
        let text = "Laptop Küche & Co/+%";
        assert_eq!(prozent_dekodiere(&prozent_kodiere(text)).as_deref(), Some(text));
    }
}
