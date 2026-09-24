//! Kanonisches JSON nach RFC 8785 (JCS) für die Werte des Einsatzbuchs — Gegenstück zu
//! `kanonisch` in `src/app/m/einsatzbuch/_lib/kern/kanonisch.ts`. Schlüssel werden HIER
//! sortiert (UTF-16-Codeeinheiten), nie über die Reihenfolge von `serde_json::Map`:
//! schaltet irgendein Crate `preserve_order` ein, wird die Map still zur IndexMap.
//! `serde_json` weist einzelne Surrogate schon beim Parsen ab, und ein Rust-`String` kann
//! keine enthalten — die Surrogat-Prüfung des TS-Kerns ist hier also strukturell erfüllt.
use serde_json::Value;
use std::fmt::Write as _;

/// Grenze von `Number.isSafeInteger` — der TS-Kern lehnt alles darüber ab.
const SICHER: i64 = 9_007_199_254_740_991;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum JcsFehler {
    #[error("Nur ganze Zahlen im sicheren Bereich erlaubt: {0}")]
    KeineGanzeZahl(String),
}

pub fn kanonisch(wert: &Value) -> Result<String, JcsFehler> {
    let mut aus = String::new();
    schreibe(wert, &mut aus)?;
    Ok(aus)
}

fn schreibe(wert: &Value, aus: &mut String) -> Result<(), JcsFehler> {
    match wert {
        Value::Null => aus.push_str("null"),
        Value::Bool(b) => aus.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => match n.as_i64() {
            Some(i) if (-SICHER..=SICHER).contains(&i) => { let _ = write!(aus, "{i}"); }
            _ => return Err(JcsFehler::KeineGanzeZahl(n.to_string())),
        },
        Value::String(s) => maskiere(s, aus),
        Value::Array(a) => {
            aus.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 { aus.push(','); }
                schreibe(x, aus)?;
            }
            aus.push(']');
        }
        Value::Object(o) => {
            let mut eintraege: Vec<(&String, &Value)> = o.iter().collect();
            eintraege.sort_by(|(a, _), (b, _)| a.encode_utf16().cmp(b.encode_utf16()));
            aus.push('{');
            for (i, (k, v)) in eintraege.into_iter().enumerate() {
                if i > 0 { aus.push(','); }
                maskiere(k, aus);
                aus.push(':');
                schreibe(v, aus)?;
            }
            aus.push('}');
        }
    }
    Ok(())
}

/// Wie `JSON.stringify` für Zeichenketten: Kurzformen, `\u00xx` (klein) nur unter 0x20,
/// alles andere roh — auch Nicht-ASCII, U+2028 und DEL.
fn maskiere(s: &str, aus: &mut String) {
    aus.push('"');
    for c in s.chars() {
        match c {
            '"' => aus.push_str("\\\""),
            '\\' => aus.push_str("\\\\"),
            '\u{8}' => aus.push_str("\\b"),
            '\u{c}' => aus.push_str("\\f"),
            '\n' => aus.push_str("\\n"),
            '\r' => aus.push_str("\\r"),
            '\t' => aus.push_str("\\t"),
            c if (c as u32) < 0x20 => { let _ = write!(aus, "\\u{:04x}", c as u32); }
            c => aus.push(c),
        }
    }
    aus.push('"');
}

#[cfg(test)]
mod tests {
    use super::kanonisch;
    use serde_json::{json, Map, Value};

    #[test]
    fn sortiert_schluessel_ohne_leerraum_verschachtelt() {
        let v = json!({"b": 1, "a": [true, null, "x"], "c": {"z": "", "y": -3}});
        assert_eq!(kanonisch(&v).unwrap(), r#"{"a":[true,null,"x"],"b":1,"c":{"y":-3,"z":""}}"#);
    }

    #[test]
    fn sortiert_auch_bei_umgekehrter_einfuegereihenfolge() {
        // Mit `preserve_order` wäre die Map eine IndexMap in genau dieser Reihenfolge.
        let mut m = Map::new();
        for k in ["z", "b", "a", "10", "2", "1"] { m.insert(k.into(), json!(0)); }
        assert_eq!(kanonisch(&Value::Object(m)).unwrap(), r#"{"1":0,"10":0,"2":0,"a":0,"b":0,"z":0}"#);
    }

    #[test]
    fn maskiert_wie_json_stringify() {
        let s = "ä\n\"x\u{1}😀\t\u{8}\u{c}\r\\ \u{2028} \u{7f} \u{1f}";
        assert_eq!(
            kanonisch(&json!(s)).unwrap(),
            "\"ä\\n\\\"x\\u0001😀\\t\\b\\f\\r\\\\ \u{2028} \u{7f} \\u001f\""
        );
    }

    #[test]
    fn nur_sichere_ganze_zahlen() {
        assert_eq!(kanonisch(&json!(9007199254740991_i64)).unwrap(), "9007199254740991");
        assert_eq!(kanonisch(&json!(-9007199254740991_i64)).unwrap(), "-9007199254740991");
        assert!(kanonisch(&json!(9007199254740992_i64)).is_err());
        assert!(kanonisch(&json!(1.5)).is_err());
        assert!(kanonisch(&json!(u64::MAX)).is_err());
    }

    #[test]
    fn utf16_sortierung_nicht_bytes() {
        // U+FF61 (UTF-16 0xFF61) liegt nach U+1F600 in UTF-8-Bytes vorn, in UTF-16-Einheiten
        // (0xD83D…) aber hinten — JCS (RFC 8785 §3.2.3) sortiert nach UTF-16.
        let mut m = Map::new();
        m.insert("\u{ff61}".into(), json!(1));
        m.insert("\u{1f600}".into(), json!(2));
        assert_eq!(kanonisch(&Value::Object(m)).unwrap(), "{\"\u{1f600}\":2,\"\u{ff61}\":1}");
    }
}
