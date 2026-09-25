//! Loopback-Listener für den Anmelderückruf (Spec §4.4, Plan Stufe 5 „Loopback-Rückruf“). Die
//! Suite leitet den Browser nach der Anmeldung auf `http://127.0.0.1:<port>/rueckruf?code=…&state=…`
//! (oder `…&fehler=kein_zugang|abgebrochen`) um; dieser Listener nimmt genau einen solchen Rückruf
//! mit passendem `state` an.
//!
//! Nur `std::net`, kein HTTP-Crate: gelesen wird bis zum Ende der Kopfzeilen, ausgewertet nur die
//! Anfragezeile, geantwortet mit `Content-Length` und `Connection: close`. Die Kopfzeilen werden
//! trotzdem vollständig gelesen — wer eine Verbindung mit ungelesenen Daten schließt, schickt ein
//! RST, und der Browser zeigt „Verbindung zurückgesetzt“ statt der Antwortseite.
//!
//! Alle Verbindungen bleiben nicht blockierend und werden in derselben Schleife wie `accept`
//! abgefragt: Browser öffnen gern eine Verbindung auf Vorrat, über die nie etwas kommt. Ein
//! blockierendes Lesen darauf hielte den eigentlichen Rückruf auf und machte das Abbruch-Flag
//! taub.
use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use crate::anmeldung::prozent_dekodiere;

/// Wie lange die App auf den Rückruf der Suite wartet (Entscheidung 11).
pub const ZEITLIMIT: Duration = Duration::from_secs(300);

/// Takt der Warteschleife — Abbruch-Flag und Zeitlimit werden mindestens so oft geprüft.
const TAKT: Duration = Duration::from_millis(20);
/// Obergrenze für Anfragezeile und Kopfzeilen zusammen.
const HOECHSTENS_KOPF: usize = 16 * 1024;
/// Eine Verbindung, die so lange keine vollständige Anfrage liefert, wird verworfen.
const VERBINDUNG_ZEITLIMIT: Duration = Duration::from_secs(10);
/// Mehr gleichzeitig offene Verbindungen werden nicht gehalten; die älteste weicht.
const HOECHSTENS_VERBINDUNGEN: usize = 16;
/// Schreibzeitlimit für die Antwortseite.
const SCHREIB_ZEITLIMIT: Duration = Duration::from_secs(2);

const SEITE_ERFOLG: &str = "Du kannst dieses Fenster schließen.";
const SEITE_FREMDER_STATE: &str = "Diese Anmeldung gehört nicht zu diesem Rechner.";
const SEITE_UNGUELTIG: &str = "Diese Anfrage ist kein gültiger Anmelderückruf.";
const SEITE_NICHT_GEFUNDEN: &str = "Nicht gefunden.";
const SEITE_METHODE: &str = "Nur GET ist erlaubt.";

/// Was der Browser zurückmeldet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rueckruf {
    /// Einmalcode für `POST /api/anmelden/tausch`.
    Code(String),
    /// Die Suite-Seite „Kein Zugang“ (`fehler=kein_zugang`).
    KeinZugang,
    /// In der Suite abgebrochen (`fehler=abgebrochen`).
    Abgebrochen,
}

#[derive(Debug, thiserror::Error)]
pub enum LoopbackFehler {
    #[error("Anmeldung nicht abgeschlossen. Nach 5 Minuten ohne Rückmeldung der Suite abgebrochen.")]
    Zeitlimit,
    #[error("Anmeldung abgebrochen.")]
    Abbruch,
    #[error("Der lokale Rückruf der Anmeldung ist gescheitert: {0}")]
    Io(#[from] io::Error),
}

/// Ein `TcpListener` auf `127.0.0.1` mit einem vom Betriebssystem vergebenen Port, nicht
/// blockierend. Bewusst nie `0.0.0.0`: Der Rückruf trägt einen Einmalcode, den kein anderer
/// Rechner im Netz sehen darf.
pub struct Listener {
    inner: TcpListener,
    port: u16,
}

/// Eine angenommene Verbindung, deren Anfrage noch nicht vollständig ist.
struct Offen {
    strom: TcpStream,
    puffer: Vec<u8>,
    seit: Instant,
}

enum Lesestand {
    Wartet,
    Fertig,
    Weg,
}

/// Antwort an den Browser samt dem, was sie für die App bedeutet.
struct Entscheidung {
    status: u16,
    text: &'static str,
    rueckruf: Option<Rueckruf>,
}

impl Listener {
    pub fn oeffne() -> io::Result<Listener> {
        let inner = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        inner.set_nonblocking(true)?;
        let port = inner.local_addr()?.port();
        Ok(Listener { inner, port })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Die tatsächlich gebundene Adresse — für Tests, die `127.0.0.1` nachweisen.
    pub fn lokale_adresse(&self) -> io::Result<SocketAddr> {
        self.inner.local_addr()
    }

    /// Wartet auf `GET /rueckruf` mit passendem `state`. Prüft `abbruch` und das Zeitlimit in
    /// jedem Takt (≤ 50 ms). Ein falscher `state` bekommt 400 und der Listener wartet weiter,
    /// ebenso eine sonst unbrauchbare Anfrage; andere Pfade bekommen 404.
    pub fn warte(self, state: &str, zeitlimit: Duration, abbruch: &AtomicBool) -> Result<Rueckruf, LoopbackFehler> {
        let ende = Instant::now() + zeitlimit;
        let mut offen: Vec<Offen> = Vec::new();
        loop {
            if abbruch.load(Ordering::SeqCst) {
                return Err(LoopbackFehler::Abbruch);
            }
            if Instant::now() >= ende {
                return Err(LoopbackFehler::Zeitlimit);
            }
            self.nimm_an(&mut offen)?;

            let mut i = 0;
            while i < offen.len() {
                match lies_weiter(&mut offen[i]) {
                    Lesestand::Wartet if offen[i].seit.elapsed() < VERBINDUNG_ZEITLIMIT => i += 1,
                    Lesestand::Wartet | Lesestand::Weg => {
                        offen.swap_remove(i);
                    }
                    Lesestand::Fertig => {
                        let verbindung = offen.swap_remove(i);
                        let entscheidung = entscheide(&anfragezeile(&verbindung.puffer), state);
                        antworte(verbindung.strom, entscheidung.status, entscheidung.text);
                        if let Some(rueckruf) = entscheidung.rueckruf {
                            return Ok(rueckruf);
                        }
                    }
                }
            }
            thread::sleep(TAKT);
        }
    }

    /// Nimmt alle wartenden Verbindungen an. Ein angenommener Socket erbt `O_NONBLOCK` je nach
    /// Betriebssystem (macOS ja, Linux nein) — deshalb wird der Modus ausdrücklich gesetzt.
    fn nimm_an(&self, offen: &mut Vec<Offen>) -> io::Result<()> {
        loop {
            match self.inner.accept() {
                Ok((strom, _)) => {
                    if strom.set_nonblocking(true).is_err() {
                        continue;
                    }
                    if offen.len() >= HOECHSTENS_VERBINDUNGEN {
                        offen.remove(0);
                    }
                    offen.push(Offen { strom, puffer: Vec::new(), seit: Instant::now() });
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => return Ok(()),
                // Eine Gegenstelle, die schon vor `accept` wieder weg ist, beendet die Anmeldung nicht.
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::Interrupted | io::ErrorKind::ConnectionAborted | io::ErrorKind::ConnectionReset
                    ) => {}
                Err(e) => return Err(e),
            }
        }
    }
}

/// Liest, was die Verbindung gerade hergibt, ohne zu blockieren. Fertig ist die Anfrage mit dem
/// Ende der Kopfzeilen oder beim Erreichen der Obergrenze.
fn lies_weiter(o: &mut Offen) -> Lesestand {
    let mut stueck = [0u8; 2048];
    loop {
        match o.strom.read(&mut stueck) {
            Ok(0) => return Lesestand::Weg,
            Ok(n) => {
                o.puffer.extend_from_slice(&stueck[..n]);
                if o.puffer.windows(4).any(|w| w == b"\r\n\r\n") || o.puffer.len() >= HOECHSTENS_KOPF {
                    return Lesestand::Fertig;
                }
            }
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => return Lesestand::Wartet,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => return Lesestand::Weg,
        }
    }
}

/// Die erste Zeile der Anfrage (ohne Zeilenende); leer, wenn sie kein UTF-8 ist.
fn anfragezeile(puffer: &[u8]) -> String {
    let ende = puffer.iter().position(|&b| b == b'\n').unwrap_or(puffer.len());
    std::str::from_utf8(&puffer[..ende]).unwrap_or("").trim_end_matches('\r').to_string()
}

/// Wertet die Anfragezeile aus. Rein, damit jede Regel für sich prüfbar bleibt.
fn entscheide(anfragezeile: &str, state: &str) -> Entscheidung {
    let ohne = |status, text| Entscheidung { status, text, rueckruf: None };
    let mut teile = anfragezeile.split(' ');
    let (Some(methode), Some(ziel)) = (teile.next(), teile.next()) else {
        return ohne(400, SEITE_UNGUELTIG);
    };
    let (pfad, abfrage) = ziel.split_once('?').unwrap_or((ziel, ""));
    if pfad != "/rueckruf" {
        return ohne(404, SEITE_NICHT_GEFUNDEN);
    }
    if methode != "GET" {
        return ohne(405, SEITE_METHODE);
    }
    let Some(werte) = parameter(abfrage) else {
        return ohne(400, SEITE_UNGUELTIG);
    };
    let wert = |name: &str| werte.iter().find(|(n, _)| n == name).map(|(_, w)| w.as_str());

    if !wert("state").is_some_and(|s| gleich(s.as_bytes(), state.as_bytes())) {
        return ohne(400, SEITE_FREMDER_STATE);
    }
    let rueckruf = match (wert("fehler"), wert("code")) {
        (Some("kein_zugang"), _) => Rueckruf::KeinZugang,
        (Some("abgebrochen"), _) => Rueckruf::Abgebrochen,
        (Some(_), _) => return ohne(400, SEITE_UNGUELTIG),
        (None, Some(code)) if !code.is_empty() => Rueckruf::Code(code.to_string()),
        (None, _) => return ohne(400, SEITE_UNGUELTIG),
    };
    Entscheidung { status: 200, text: SEITE_ERFOLG, rueckruf: Some(rueckruf) }
}

/// Zerlegt eine Abfrage in dekodierte Name-Wert-Paare; bei doppelten Namen gilt der erste.
/// `None`, sobald ein Name oder Wert keine gültige Percent-Kodierung ist.
fn parameter(abfrage: &str) -> Option<Vec<(String, String)>> {
    abfrage
        .split('&')
        .filter(|teil| !teil.is_empty())
        .map(|teil| {
            let (name, wert) = teil.split_once('=').unwrap_or((teil, ""));
            Some((prozent_dekodiere(name)?, prozent_dekodiere(wert)?))
        })
        .collect()
}

/// Vergleich ohne frühen Ausstieg, damit die Laufzeit nicht verrät, wie viel vom `state` stimmt.
fn gleich(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Schreibt die Antwortseite. Fehler beim Schreiben sind egal: Ist der Browser schon weg, gilt
/// der Rückruf trotzdem.
fn antworte(mut strom: TcpStream, status: u16, text: &str) {
    let grund = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "",
    };
    let koerper = format!(
        "<!doctype html>\n<html lang=\"de\"><head><meta charset=\"utf-8\"><title>Einsatzbuch</title></head>\
         <body><p>{text}</p></body></html>\n"
    );
    let kopf = format!(
        "HTTP/1.1 {status} {grund}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n",
        koerper.len()
    );
    if strom.set_nonblocking(false).is_err() || strom.set_write_timeout(Some(SCHREIB_ZEITLIMIT)).is_err() {
        return;
    }
    let _ = strom
        .write_all(kopf.as_bytes())
        .and_then(|_| strom.write_all(koerper.as_bytes()))
        .and_then(|_| strom.flush());
    let _ = strom.shutdown(std::net::Shutdown::Write);
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: &str = "abcdefghijklmnop";

    fn status(zeile: &str) -> u16 {
        entscheide(zeile, S).status
    }

    #[test]
    fn regeln_der_anfragezeile() {
        assert_eq!(
            entscheide("GET /rueckruf?code=c&state=abcdefghijklmnop HTTP/1.1", S).rueckruf,
            Some(Rueckruf::Code("c".into()))
        );
        assert_eq!(status("GET /favicon.ico HTTP/1.1"), 404);
        assert_eq!(status("POST /rueckruf?code=c&state=abcdefghijklmnop HTTP/1.1"), 405);
        assert_eq!(status(""), 400);
        assert_eq!(status("GET"), 400);
        assert_eq!(status("GET /rueckruf?code=c&state=abcdefghijklmnoX HTTP/1.1"), 400);
        assert_eq!(status("GET /rueckruf?code=c&state=abcdefghijklmno HTTP/1.1"), 400);
        // Bei doppeltem Namen gilt der erste.
        assert_eq!(status("GET /rueckruf?code=c&state=falsch&state=abcdefghijklmnop HTTP/1.1"), 400);
        assert_eq!(
            entscheide("GET /rueckruf?state=abcdefghijklmnop&fehler=kein_zugang&code=c HTTP/1.1", S).rueckruf,
            Some(Rueckruf::KeinZugang)
        );
    }

    #[test]
    fn anfragezeile_endet_am_zeilenende() {
        assert_eq!(anfragezeile(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n"), "GET / HTTP/1.1");
        assert_eq!(anfragezeile(b"GET / HTTP/1.1"), "GET / HTTP/1.1");
        assert_eq!(anfragezeile(&[0xff, b'\n']), "");
    }

    #[test]
    fn gleich_vergleicht_laenge_und_inhalt() {
        assert!(gleich(b"abc", b"abc"));
        assert!(!gleich(b"abc", b"abd"));
        assert!(!gleich(b"abc", b"ab"));
    }
}
