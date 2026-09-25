//! Loopback-Rückruf der Anmeldung (Spec §4.4, Plan Stufe 5 „Loopback-Rückruf“): Der Listener
//! hört nur auf 127.0.0.1, nimmt genau einen Rückruf mit passendem `state` an und lässt sich
//! per Zeitlimit oder Abbruch-Flag beenden. Die Tests schicken rohe HTTP-Anfragen über einen
//! lokalen `TcpStream` — kein Netz nach außen.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use einsatzbuch_kern::loopback::{Listener, LoopbackFehler, Rueckruf};

const STATE: &str = "Zm9vYmFyYmF6cXV4cXV1eHh5enp5eHh5enp5eHh5eno";

/// Startet `warte` in einem eigenen Thread und liefert Port, Abbruch-Flag und den Thread.
fn starte(zeitlimit: Duration) -> (u16, Arc<AtomicBool>, thread::JoinHandle<Result<Rueckruf, LoopbackFehler>>) {
    let listener = Listener::oeffne().unwrap();
    let port = listener.port();
    let abbruch = Arc::new(AtomicBool::new(false));
    let flag = abbruch.clone();
    let faden = thread::spawn(move || listener.warte(STATE, zeitlimit, &flag));
    (port, abbruch, faden)
}

/// Schickt eine rohe GET-Anfrage wie ein Browser (mit Kopfzeilen) und liest die Antwort bis
/// zum Schließen der Verbindung.
fn hole(port: u16, ziel: &str) -> String {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    write!(s, "GET {ziel} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUser-Agent: test\r\nAccept: text/html\r\n\r\n").unwrap();
    let mut antwort = String::new();
    s.read_to_string(&mut antwort).unwrap();
    antwort
}

fn status(antwort: &str) -> u16 {
    antwort.split_whitespace().nth(1).unwrap().parse().unwrap()
}

fn koerper(antwort: &str) -> &str {
    antwort.split_once("\r\n\r\n").unwrap().1
}

#[test]
fn passender_state_liefert_den_code_und_der_browser_bekommt_200() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    let antwort = hole(port, &format!("/rueckruf?code=abc&state={STATE}"));
    assert_eq!(status(&antwort), 200, "{antwort}");
    assert!(antwort.contains("Content-Type: text/html; charset=utf-8\r\n"), "{antwort}");
    assert!(antwort.contains("Connection: close\r\n"), "{antwort}");
    assert!(koerper(&antwort).contains("Du kannst dieses Fenster schließen."), "{antwort}");
    // Content-Length zählt Bytes, nicht Zeichen — „ß“ ist in UTF-8 zwei Byte lang.
    let laenge: usize = antwort
        .lines()
        .find_map(|z| z.strip_prefix("Content-Length: "))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert_eq!(laenge, koerper(&antwort).len());
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("abc".into()));
}

#[test]
fn falscher_state_bekommt_400_und_der_listener_wartet_weiter() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    let falsch = hole(port, "/rueckruf?code=abc&state=falschfalschfalschfalsch");
    assert_eq!(status(&falsch), 400, "{falsch}");
    assert!(koerper(&falsch).contains("Diese Anmeldung gehört nicht zu diesem Rechner."), "{falsch}");
    // Ohne `state` ebenfalls 400.
    assert_eq!(status(&hole(port, "/rueckruf?code=abc")), 400);
    assert!(!faden.is_finished(), "der Listener darf nach einem falschen state nicht aufhören");

    let richtig = hole(port, &format!("/rueckruf?code=xyz&state={STATE}"));
    assert_eq!(status(&richtig), 200, "{richtig}");
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("xyz".into()));
}

#[test]
fn andere_pfade_bekommen_404() {
    let (port, abbruch, faden) = starte(Duration::from_secs(10));
    assert_eq!(status(&hole(port, "/favicon.ico")), 404);
    assert_eq!(status(&hole(port, &format!("/rueckruf/x?code=abc&state={STATE}"))), 404);
    assert!(!faden.is_finished());
    abbruch.store(true, Ordering::SeqCst);
    assert!(matches!(faden.join().unwrap(), Err(LoopbackFehler::Abbruch)));
}

#[test]
fn state_ohne_code_und_ohne_fehler_ist_400_und_der_listener_wartet_weiter() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    assert_eq!(status(&hole(port, &format!("/rueckruf?state={STATE}"))), 400);
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=&state={STATE}"))), 400);
    assert_eq!(status(&hole(port, &format!("/rueckruf?state={STATE}&fehler=unbekannt"))), 400);
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=a%ZZ&state={STATE}"))), 400);
    assert!(!faden.is_finished());
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=ok&state={STATE}"))), 200);
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("ok".into()));
}

#[test]
fn fehler_kein_zugang_liefert_kein_zugang() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    let antwort = hole(port, &format!("/rueckruf?state={STATE}&fehler=kein_zugang"));
    assert_eq!(status(&antwort), 200, "{antwort}");
    assert!(koerper(&antwort).contains("Du kannst dieses Fenster schließen."), "{antwort}");
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::KeinZugang);
}

#[test]
fn fehler_abgebrochen_liefert_abgebrochen() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    assert_eq!(status(&hole(port, &format!("/rueckruf?state={STATE}&fehler=abgebrochen"))), 200);
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Abgebrochen);
}

#[test]
fn zeitlimit_endet_mit_zeitlimit() {
    let listener = Listener::oeffne().unwrap();
    let abbruch = AtomicBool::new(false);
    let start = Instant::now();
    let ergebnis = listener.warte(STATE, Duration::from_millis(200), &abbruch);
    let dauer = start.elapsed();
    assert!(matches!(ergebnis, Err(LoopbackFehler::Zeitlimit)), "{ergebnis:?}");
    assert!(dauer >= Duration::from_millis(200), "{dauer:?}");
    assert!(dauer < Duration::from_secs(2), "{dauer:?}");
    assert_eq!(
        LoopbackFehler::Zeitlimit.to_string(),
        "Anmeldung nicht abgeschlossen. Nach 5 Minuten ohne Rückmeldung der Suite abgebrochen."
    );
}

#[test]
fn abbruch_endet_binnen_200_ms() {
    let (_port, abbruch, faden) = starte(Duration::from_secs(60));
    thread::sleep(Duration::from_millis(100));
    let start = Instant::now();
    abbruch.store(true, Ordering::SeqCst);
    let ergebnis = faden.join().unwrap();
    assert!(start.elapsed() < Duration::from_millis(200), "{:?}", start.elapsed());
    assert!(matches!(ergebnis, Err(LoopbackFehler::Abbruch)), "{ergebnis:?}");
    assert_eq!(LoopbackFehler::Abbruch.to_string(), "Anmeldung abgebrochen.");
}

/// Browser öffnen gern eine Verbindung auf Vorrat, über die (noch) nichts kommt. Die darf weder
/// den eigentlichen Rückruf aufhalten noch das Abbruch-Flag taub machen.
#[test]
fn eine_stumme_verbindung_haelt_weder_rueckruf_noch_abbruch_auf() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(60));
    let _stumm = TcpStream::connect(("127.0.0.1", port)).unwrap();
    thread::sleep(Duration::from_millis(100));
    let start = Instant::now();
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=abc&state={STATE}"))), 200);
    assert!(start.elapsed() < Duration::from_secs(1), "{:?}", start.elapsed());
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("abc".into()));

    let (port, abbruch2, faden2) = starte(Duration::from_secs(60));
    let _stumm2 = TcpStream::connect(("127.0.0.1", port)).unwrap();
    thread::sleep(Duration::from_millis(100));
    let start = Instant::now();
    abbruch2.store(true, Ordering::SeqCst);
    assert!(matches!(faden2.join().unwrap(), Err(LoopbackFehler::Abbruch)));
    assert!(start.elapsed() < Duration::from_millis(200), "{:?}", start.elapsed());
}

#[test]
fn ein_prozentkodierter_code_wird_dekodiert() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(10));
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=a%2Bb%3D%C3%A4&state={STATE}"))), 200);
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("a+b=ä".into()));
}

#[test]
fn listener_hoert_nur_auf_127_0_0_1_und_einem_hohen_port() {
    let listener = Listener::oeffne().unwrap();
    let adresse = listener.lokale_adresse().unwrap();
    assert!(adresse.ip().is_loopback(), "{adresse}");
    assert!(!adresse.ip().is_unspecified(), "{adresse}");
    assert_eq!(adresse.ip().to_string(), "127.0.0.1");
    assert!(listener.port() >= 1024, "{}", listener.port());
    assert_eq!(listener.port(), adresse.port());
}

/// Hält bis zu `anzahl` stumme Verbindungen offen, verteilt auf drei Fäden, bis `halt` gesetzt ist.
/// Stumm und gehalten statt auf- und wieder zugemacht: Sonst liegen Tausende Ports im TIME_WAIT
/// und stören andere Läufe auf demselben Rechner.
fn flut(port: u16, anzahl: usize, halt: Arc<AtomicBool>) -> Vec<thread::JoinHandle<Vec<TcpStream>>> {
    (0..3)
        .map(|_| {
            let halt = halt.clone();
            thread::spawn(move || {
                let mut gehalten = Vec::new();
                while gehalten.len() < anzahl / 3 && !halt.load(Ordering::SeqCst) {
                    match TcpStream::connect(("127.0.0.1", port)) {
                        Ok(s) => gehalten.push(s),
                        Err(_) => thread::sleep(Duration::from_millis(1)),
                    }
                }
                gehalten
            })
        })
        .collect()
}

fn warte_auf_flut(faeden: Vec<thread::JoinHandle<Vec<TcpStream>>>) -> Vec<TcpStream> {
    faeden.into_iter().flat_map(|f| f.join().unwrap()).collect()
}

/// Ein Rückruf, dem viele stumme Verbindungen folgen, bevor der Listener zum Zug kommt: Er darf
/// nicht ungelesen verdrängt werden, weil die Warteschlange voll ist.
#[test]
fn ein_rueckruf_vor_einer_flut_wird_nicht_ungelesen_verdraengt() {
    let listener = Listener::oeffne().unwrap();
    let port = listener.port();
    let mut echt = TcpStream::connect(("127.0.0.1", port)).unwrap();
    echt.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    write!(echt, "GET /rueckruf?code=zuerst&state={STATE} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").unwrap();
    let _stumm: Vec<TcpStream> = (0..40).map(|_| TcpStream::connect(("127.0.0.1", port)).unwrap()).collect();

    let abbruch = Arc::new(AtomicBool::new(false));
    let flag = abbruch.clone();
    let faden = thread::spawn(move || listener.warte(STATE, Duration::from_secs(5), &flag));
    let mut antwort = String::new();
    let _ = echt.read_to_string(&mut antwort);
    assert!(antwort.starts_with("HTTP/1.1 200 "), "{antwort:?}");
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("zuerst".into()));
}

/// Nach einer Flut stummer Verbindungen kommt der echte Rückruf noch an.
#[test]
fn ein_rueckruf_nach_einer_flut_wird_angenommen() {
    let (port, _abbruch, faden) = starte(Duration::from_secs(30));
    let halt = Arc::new(AtomicBool::new(false));
    let _stumm = warte_auf_flut(flut(port, 150, halt));
    // Erst die Warteschlange des Betriebssystems leerlaufen lassen (Rückstau 128): Ist sie voll,
    // setzt der Kern die nächste Verbindung schon vor `accept` zurück — das prüft dieser Test nicht.
    thread::sleep(Duration::from_secs(1));
    let start = Instant::now();
    assert_eq!(status(&hole(port, &format!("/rueckruf?code=danach&state={STATE}"))), 200);
    assert!(start.elapsed() < Duration::from_secs(5), "{:?}", start.elapsed());
    assert_eq!(faden.join().unwrap().unwrap(), Rueckruf::Code("danach".into()));
}

/// Während eine Flut von Verbindungen hereinkommt, wirken Abbruch und Zeitlimit weiter.
#[test]
fn eine_flut_verzoegert_weder_abbruch_noch_zeitlimit() {
    let (port, abbruch, faden) = starte(Duration::from_secs(60));
    let halt = Arc::new(AtomicBool::new(false));
    let fluter = flut(port, 150, halt.clone());
    thread::sleep(Duration::from_millis(50));
    let start = Instant::now();
    abbruch.store(true, Ordering::SeqCst);
    let ergebnis = faden.join().unwrap();
    let dauer = start.elapsed();
    halt.store(true, Ordering::SeqCst);
    drop(warte_auf_flut(fluter));
    assert!(matches!(ergebnis, Err(LoopbackFehler::Abbruch)), "{ergebnis:?}");
    assert!(dauer < Duration::from_secs(1), "{dauer:?}");

    let listener = Listener::oeffne().unwrap();
    let port = listener.port();
    let halt = Arc::new(AtomicBool::new(false));
    let fluter = flut(port, 150, halt.clone());
    let start = Instant::now();
    let ergebnis = listener.warte(STATE, Duration::from_millis(300), &AtomicBool::new(false));
    let dauer = start.elapsed();
    halt.store(true, Ordering::SeqCst);
    drop(warte_auf_flut(fluter));
    assert!(matches!(ergebnis, Err(LoopbackFehler::Zeitlimit)), "{ergebnis:?}");
    assert!(dauer < Duration::from_secs(3), "{dauer:?}");
}

/// Der echte Rückruf kommt in zwei Stücken: Die Anfragezeile ist schon gelesen, das Kopfende fehlt
/// noch. Die Liste ist voll mit gelesenen Verbindungen, und eine Flut drängt nach. Der halbe
/// Rückruf darf nicht weichen — „gelesen“ heißt hier nur „halb gelesen“.
#[test]
fn ein_halber_rueckruf_ueberlebt_eine_flut() {
    let listener = Listener::oeffne().unwrap();
    let port = listener.port();
    let mut halb = TcpStream::connect(("127.0.0.1", port)).unwrap();
    halb.set_read_timeout(Some(Duration::from_secs(8))).unwrap();
    write!(halb, "GET /rueckruf?code=halb&state={STATE} HTTP/1.1\r\n").unwrap();
    // Füllt die Liste (16) mit stummen Verbindungen, die nach dem ersten Takt „gelesen“ sind.
    let _stumm: Vec<TcpStream> = (0..15).map(|_| TcpStream::connect(("127.0.0.1", port)).unwrap()).collect();

    let abbruch = Arc::new(AtomicBool::new(false));
    let flag = abbruch.clone();
    let faden = thread::spawn(move || listener.warte(STATE, Duration::from_secs(8), &flag));
    thread::sleep(Duration::from_millis(300));

    let halt = Arc::new(AtomicBool::new(false));
    let _flut = warte_auf_flut(flut(port, 90, halt));
    thread::sleep(Duration::from_millis(500));

    // Im roten Fall ist die Verbindung schon geschlossen; das Schreiben darf dann scheitern.
    let _ = write!(halb, "Host: 127.0.0.1:{port}\r\n\r\n");
    let mut antwort = String::new();
    let _ = halb.read_to_string(&mut antwort);
    abbruch.store(true, Ordering::SeqCst);
    let ergebnis = faden.join().unwrap();
    assert!(antwort.starts_with("HTTP/1.1 200 "), "{antwort:?}");
    assert_eq!(ergebnis.unwrap(), Rueckruf::Code("halb".into()));
}
