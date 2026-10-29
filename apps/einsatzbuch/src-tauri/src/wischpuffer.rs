//! Ein Puffer für Geheimnisse (Sitzungs- und Geräte-Token, CEKs), der keine Kopie stehen lässt:
//! `Vec` und `String` geben beim Wachsen den alten Speicher unbesehen frei, und darin stünde das
//! Geheimnis weiter. `Wischpuffer` wächst deshalb selbst — neuer Puffer, Inhalt hinüber, alter
//! Puffer per `Zeroizing` überschrieben — und überschreibt beim Drop die ganze Kapazität (IDA-273).
//!
//! Zwei Wege führen hindurch: die Antwortkörper der Suite (`netz.rs`) und die CEKs auf dem Weg
//! zur Oberfläche (`befehle.rs`, `schluessel_freigeben`). Was danach außerhalb dieses Crates
//! liegt, erreicht er nicht: die Lesepuffer von `ureq` und die IPC-Kopie von Tauri.
use std::io::{self, Read, Write};

use zeroize::Zeroizing;

/// Größe der Lesestücke; das Stück selbst ist ebenfalls `Zeroizing`.
const STUECK: usize = 8 * 1024;

pub struct Wischpuffer(Zeroizing<Vec<u8>>);

impl Wischpuffer {
    pub fn mit_kapazitaet(kapazitaet: usize) -> Wischpuffer {
        Wischpuffer(Zeroizing::new(Vec::with_capacity(kapazitaet)))
    }

    /// Liest `quelle` bis zum Ende. `erwartet` (etwa `Content-Length`) ist nur die
    /// Anfangskapazität; der Puffer wächst darüber hinaus wie oben beschrieben.
    pub fn lies(mut quelle: impl Read, erwartet: usize) -> io::Result<Wischpuffer> {
        let mut puffer = Wischpuffer::mit_kapazitaet(erwartet);
        let mut stueck = Zeroizing::new([0u8; STUECK]);
        loop {
            match quelle.read(&mut stueck[..]) {
                Ok(0) => return Ok(puffer),
                Ok(n) => puffer.haenge_an(&stueck[..n]),
                Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
    }

    fn haenge_an(&mut self, bytes: &[u8]) {
        let noetig = self.0.len() + bytes.len();
        if noetig > self.0.capacity() {
            let mut groesser = Zeroizing::new(Vec::with_capacity(noetig.max(self.0.capacity() * 2).max(64)));
            groesser.extend_from_slice(&self.0);
            // Der alte Puffer endet hier und wird von `Zeroizing` überschrieben.
            self.0 = groesser;
        }
        self.0.extend_from_slice(bytes);
    }

    /// Der Inhalt als Text, immer ohne Kopie. Ungültiges UTF-8 (etwa eine Latin-1-Fehlerseite
    /// eines Proxys) wird wie bisher bei `read_to_string` von `ureq` Byte für Byte durch `?`
    /// ersetzt, an Ort und Stelle: `from_utf8_lossy` legte eine Kopie an, die beim Wachsen
    /// ungewischt stehen bliebe. Den Text wischt, wer ihn bekommt.
    pub fn in_text(mut self) -> String {
        let mut bytes = std::mem::take(&mut *self.0);
        let mut start = 0;
        while let Err(fehler) = std::str::from_utf8(&bytes[start..]) {
            let stelle = start + fehler.valid_up_to();
            let laenge = fehler.error_len().unwrap_or(bytes.len() - stelle);
            bytes[stelle..stelle + laenge].fill(b'?');
            start = stelle + laenge;
        }
        String::from_utf8(bytes).expect("ungültige Bytes sind ersetzt")
    }
}

impl Write for Wischpuffer {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.haenge_an(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Eine Quelle, die in kleinen Happen liefert und einmal unterbrochen wird.
    struct Happen<'a> {
        rest: &'a [u8],
        unterbrochen: bool,
    }

    impl Read for Happen<'_> {
        fn read(&mut self, ziel: &mut [u8]) -> io::Result<usize> {
            if !self.unterbrochen {
                self.unterbrochen = true;
                return Err(io::ErrorKind::Interrupted.into());
            }
            let n = self.rest.len().min(ziel.len()).min(3);
            ziel[..n].copy_from_slice(&self.rest[..n]);
            self.rest = &self.rest[n..];
            Ok(n)
        }
    }

    #[test]
    fn liest_ueber_die_anfangskapazitaet_hinaus() {
        let text = "ä".repeat(STUECK);
        let quelle = Happen { rest: text.as_bytes(), unterbrochen: false };
        assert_eq!(Wischpuffer::lies(quelle, 0).unwrap().in_text(), text);
    }

    /// Wie `ureq` (`body/lossy.rs`): jedes ungültige Byte wird ein `?`, auch eine abgeschnittene
    /// Folge am Ende.
    #[test]
    fn ungueltiges_utf8_wird_wie_bei_ureq_ersetzt() {
        let puffer = Wischpuffer::lies(&b"A\xe4 \xc3\xa4 \xf0\x9f\x98"[..], 16).unwrap();
        assert_eq!(puffer.in_text(), "A? ä ???");
    }

    #[test]
    fn schreiben_waechst_wie_lesen() {
        let mut puffer = Wischpuffer::mit_kapazitaet(1);
        serde_json::to_writer(&mut puffer, &[("cek", "x".repeat(500))]).unwrap();
        assert_eq!(puffer.in_text(), format!(r#"[["cek","{}"]]"#, "x".repeat(500)));
    }
}
