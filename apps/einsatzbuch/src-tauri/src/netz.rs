//! HTTP zur Suite (Entscheidung 8): `ureq` mit der TLS-Implementierung des Betriebssystems
//! (`native-tls`: Schannel unter Windows, Security.framework unter macOS), ohne rustls und damit
//! ohne `ring`/`aws-lc`. Der Kern baut die Anfragen und deutet die Antworten (`suite.rs`); hier
//! steht nur der Draht.
//!
//! Abweichend von den Vorgaben von `ureq`:
//! - Jeder HTTP-Status ist eine Antwort (`http_status_as_error(false)`), auch 401, 409 und 5xx —
//!   der Kern unterscheidet sie. `Err` heißt nur: Die Suite war nicht erreichbar.
//! - Keine Weiterleitung (`max_redirects(0)`): Eine Anfrage trägt ein Token, und eine 3xx geht als
//!   Antwort an den Kern, der sie als unerwartet ablehnt, statt das Token einem anderen Ziel
//!   mitzugeben.
//! - Vertrauensanker ist der Zertifikatsspeicher des Betriebssystems (`RootCerts::PlatformVerifier`,
//!   bei `native-tls` die Wurzeln, die das System selbst lädt) statt der mitgelieferten
//!   Mozilla-Liste: Eine Suite hinter einer eigenen Zertifizierungsstelle des Betreibers gilt so,
//!   sobald das Betriebssystem ihr vertraut.
//! - Ein Zeitlimit von 15 s für die ganze Anfrage.
//!
//! Körper und Token landen nie im Log: Fehlertexte von `ureq` nennen nur Adresse und Ursache.
use std::time::Duration;

use einsatzbuch_kern::suite::{Anfrage, Antwort, Transport};
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};

/// Zeitlimit einer Anfrage, vom Verbindungsaufbau bis zum letzten Byte der Antwort.
pub const ZEITLIMIT: Duration = Duration::from_secs(15);

pub struct NetzTransport {
    agent: ureq::Agent,
}

impl NetzTransport {
    pub fn neu() -> NetzTransport {
        let tls = TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build();
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(ZEITLIMIT))
            .http_status_as_error(false)
            .max_redirects(0)
            .tls_config(tls)
            .build()
            .new_agent();
        NetzTransport { agent }
    }
}

impl Default for NetzTransport {
    fn default() -> Self {
        NetzTransport::neu()
    }
}

/// Setzt die Kopfzeilen, die jede Anfrage tragen kann.
fn mit_kopfzeilen<B>(mut anfrage: ureq::RequestBuilder<B>, a: &Anfrage<'_>) -> ureq::RequestBuilder<B> {
    if let Some(token) = a.bearer {
        anfrage = anfrage.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(etag) = a.if_none_match {
        anfrage = anfrage.header("If-None-Match", etag);
    }
    anfrage
}

impl Transport for NetzTransport {
    fn sende(&self, a: Anfrage<'_>) -> Result<Antwort, String> {
        let ergebnis = match (a.methode, a.json.as_deref()) {
            ("GET", None) => mit_kopfzeilen(self.agent.get(&a.url), &a).call(),
            ("DELETE", None) => mit_kopfzeilen(self.agent.delete(&a.url), &a).call(),
            ("POST", Some(json)) => {
                mit_kopfzeilen(self.agent.post(&a.url), &a).header("Content-Type", "application/json").send(json)
            }
            ("POST", None) => mit_kopfzeilen(self.agent.post(&a.url), &a).send_empty(),
            (methode, _) => return Err(format!("Die Methode {methode} kennt der Transport nicht.")),
        };
        let antwort = ergebnis.map_err(|e| e.to_string())?;
        let status = antwort.status().as_u16();
        let etag = antwort.headers().get("etag").and_then(|w| w.to_str().ok()).map(str::to_string);
        let koerper = antwort.into_body().read_to_string().map_err(|e| e.to_string())?;
        Ok(Antwort { status, etag, koerper })
    }
}

#[cfg(test)]
mod tests {
    //! Gegen einen eigenen `TcpListener` auf `127.0.0.1:0` — kein Netz, keine Suite.
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::mpsc;
    use std::thread;

    use super::*;

    /// Nimmt genau eine Verbindung an, liest die Anfrage (Kopf und Körper nach
    /// `Content-Length`), antwortet mit `antwort` und reicht die Anfrage als Text zurück.
    fn einmal_server(antwort: impl Into<String>) -> (String, mpsc::Receiver<String>) {
        let antwort: String = antwort.into();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let adresse = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let (mut strom, _) = listener.accept().unwrap();
            let anfrage = lies_anfrage(&mut strom);
            strom.write_all(antwort.as_bytes()).unwrap();
            strom.flush().unwrap();
            let _ = tx.send(anfrage);
        });
        (adresse, rx)
    }

    fn lies_anfrage(strom: &mut TcpStream) -> String {
        let mut puffer = Vec::new();
        let mut stueck = [0u8; 1024];
        let kopf_ende = loop {
            let n = strom.read(&mut stueck).unwrap();
            assert!(n > 0, "Verbindung vor dem Ende der Kopfzeilen geschlossen");
            puffer.extend_from_slice(&stueck[..n]);
            if let Some(i) = puffer.windows(4).position(|f| f == b"\r\n\r\n") {
                break i + 4;
            }
        };
        let kopf = String::from_utf8_lossy(&puffer[..kopf_ende]).to_lowercase();
        let laenge: usize = kopf
            .lines()
            .find_map(|z| z.strip_prefix("content-length:"))
            .map_or(0, |w| w.trim().parse().unwrap());
        while puffer.len() < kopf_ende + laenge {
            let n = strom.read(&mut stueck).unwrap();
            assert!(n > 0);
            puffer.extend_from_slice(&stueck[..n]);
        }
        String::from_utf8(puffer).unwrap()
    }

    fn hat_kopfzeile(anfrage: &str, zeile: &str) -> bool {
        anfrage.lines().any(|z| z.eq_ignore_ascii_case(zeile))
    }

    fn anfrage<'a>(methode: &'static str, url: String) -> Anfrage<'a> {
        Anfrage { methode, url, bearer: None, if_none_match: None, json: None }
    }

    #[test]
    fn post_schickt_bearer_und_json_und_liefert_204() {
        let (adresse, rx) = einmal_server("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
        let a = Anfrage {
            bearer: Some("geraet-token"),
            json: Some(r#"{"block":1,"hash":"ab"}"#.into()),
            ..anfrage("POST", format!("{adresse}/m/einsatzbuch/api/anker"))
        };
        let antwort = NetzTransport::neu().sende(a).unwrap();
        assert_eq!(antwort.status, 204);
        assert_eq!(antwort.koerper, "");

        let gesehen = rx.recv().unwrap();
        assert!(gesehen.starts_with("POST /m/einsatzbuch/api/anker HTTP/1.1\r\n"), "{gesehen}");
        assert!(hat_kopfzeile(&gesehen, "authorization: Bearer geraet-token"), "{gesehen}");
        assert!(hat_kopfzeile(&gesehen, "content-type: application/json"), "{gesehen}");
        assert!(gesehen.ends_with("\r\n\r\n{\"block\":1,\"hash\":\"ab\"}"), "{gesehen}");
    }

    #[test]
    fn get_schickt_if_none_match_und_liest_etag_und_koerper() {
        let (adresse, rx) = einmal_server(
            "HTTP/1.1 200 OK\r\nETag: \"7/Europe/Berlin\"\r\nContent-Type: application/json\r\nContent-Length: 10\r\nConnection: close\r\n\r\n{\"a\":\"ä\"}",
        );
        let a = Anfrage {
            bearer: Some("g"),
            if_none_match: Some("\"6/Europe/Berlin\""),
            ..anfrage("GET", format!("{adresse}/m/einsatzbuch/api/stammdaten"))
        };
        let antwort = NetzTransport::neu().sende(a).unwrap();
        assert_eq!(antwort.status, 200);
        assert_eq!(antwort.etag.as_deref(), Some("\"7/Europe/Berlin\""));
        assert_eq!(antwort.koerper, "{\"a\":\"ä\"}");

        let gesehen = rx.recv().unwrap();
        assert!(gesehen.starts_with("GET /m/einsatzbuch/api/stammdaten HTTP/1.1\r\n"), "{gesehen}");
        assert!(hat_kopfzeile(&gesehen, "if-none-match: \"6/Europe/Berlin\""), "{gesehen}");
        assert!(!gesehen.to_lowercase().contains("content-type"), "ein GET trägt keinen Körper: {gesehen}");
    }

    /// 401, 409 und 5xx sind Antworten, kein `Err` — sonst hielte der Kern einen Widerruf oder eine
    /// Abweichung für „offline“.
    #[test]
    fn fehlerstatus_sind_antworten_kein_err() {
        for (status, zeile) in [(401, "401 Unauthorized"), (409, "409 Conflict"), (503, "503 Service Unavailable")] {
            let (adresse, _rx) =
                einmal_server(format!("HTTP/1.1 {zeile}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"));
            let antwort = NetzTransport::neu().sende(anfrage("GET", format!("{adresse}/x"))).unwrap();
            assert_eq!(antwort.status, status);
            assert_eq!(antwort.koerper, "{}");
        }
    }

    /// Eine Weiterleitung wird nicht verfolgt: Das Token ginge sonst an das neue Ziel mit.
    #[test]
    fn weiterleitung_wird_nicht_verfolgt() {
        let (adresse, _rx) =
            einmal_server("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://127.0.0.1:9/fremd\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let a = Anfrage { bearer: Some("geheim"), ..anfrage("DELETE", format!("{adresse}/m/einsatzbuch/api/rechner/r1")) };
        let antwort = NetzTransport::neu().sende(a).unwrap();
        assert_eq!(antwort.status, 307);
    }

    #[test]
    fn delete_ohne_koerper() {
        let (adresse, rx) = einmal_server("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
        let a = Anfrage { bearer: Some("sitzung"), ..anfrage("DELETE", format!("{adresse}/m/einsatzbuch/api/rechner/r%201")) };
        assert_eq!(NetzTransport::neu().sende(a).unwrap().status, 204);
        let gesehen = rx.recv().unwrap();
        assert!(gesehen.starts_with("DELETE /m/einsatzbuch/api/rechner/r%201 HTTP/1.1\r\n"), "{gesehen}");
        assert!(hat_kopfzeile(&gesehen, "authorization: Bearer sitzung"), "{gesehen}");
    }

    /// Niemand hört auf dem Port: Das ist „nicht erreichbar“, also `Err`.
    #[test]
    fn verweigerte_verbindung_ist_err() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let ergebnis = NetzTransport::neu().sende(anfrage("GET", format!("http://127.0.0.1:{port}/x")));
        assert!(ergebnis.is_err(), "{ergebnis:?}");
    }

    /// Baut den echten TLS-Weg (native-tls mit den Wurzeln des Systems) — das ist der Pfad jeder
    /// Anfrage an `https://…` im Betrieb. Die Gegenstelle spricht kein TLS: Das muss ein `Err`
    /// sein („nicht erreichbar“), keine Panik bei der Konfiguration.
    #[test]
    fn https_gegen_eine_gegenstelle_ohne_tls_ist_err_ohne_panik() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            let (mut strom, _) = listener.accept().unwrap();
            let _ = strom.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
        });
        let ergebnis = NetzTransport::neu().sende(anfrage("GET", format!("https://127.0.0.1:{port}/x")));
        assert!(ergebnis.is_err(), "{ergebnis:?}");
    }

    #[test]
    fn unbekannte_methode_ist_err() {
        assert!(NetzTransport::neu().sende(anfrage("PATCH", "http://127.0.0.1:9/x".into())).is_err());
    }
}
