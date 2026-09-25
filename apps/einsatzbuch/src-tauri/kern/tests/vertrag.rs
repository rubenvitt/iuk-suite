//! Drahtvertrag mit der Suite: Jede Beispieldatei unter
//! `src/app/m/einsatzbuch/_lib/anbindung/vertrag/` (dieselben Dateien prüft `vertrag.test.ts`
//! gegen die zod-Schemas) muss sich mit dem Rust-Typ lesen und unverändert zurückschreiben lassen,
//! und ein unbekanntes Feld auf jeder Ebene wird abgelehnt — wie `.strict()` auf der Suite-Seite.
use std::path::PathBuf;

use einsatzbuch_kern::format::Umgebung;
use einsatzbuch_kern::vertrag::{
    EinrichtenAntwort, Fehlerkoerper, Freigabeposten, KettenankerAntwort, Schluesselposten, TauschAntwort,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

fn ordner() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../src/app/m/einsatzbuch/_lib/anbindung/vertrag")
}

fn lies(datei: &str) -> Value {
    let pfad = ordner().join(datei);
    serde_json::from_str(&std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display())))
        .unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))
}

/// Hängt an jedes Objekt des Werts (auch verschachtelt, auch in Arrays) ein unbekanntes Feld
/// und liefert jede Variante einzeln — das Gegenstück zu `mitFremdemFeld` in `vertrag.test.ts`.
fn mit_fremdem_feld(wert: &Value) -> Vec<Value> {
    match wert {
        Value::Array(liste) => liste
            .iter()
            .enumerate()
            .flat_map(|(i, eintrag)| {
                mit_fremdem_feld(eintrag).into_iter().map(move |variante| {
                    let mut kopie = liste.clone();
                    kopie[i] = variante;
                    Value::Array(kopie)
                })
            })
            .collect(),
        Value::Object(objekt) => {
            let mut varianten = Vec::new();
            let mut oben = objekt.clone();
            oben.insert("unbekannt".into(), Value::from(1));
            varianten.push(Value::Object(oben));
            for (schluessel, kind) in objekt {
                for variante in mit_fremdem_feld(kind) {
                    let mut kopie = objekt.clone();
                    kopie.insert(schluessel.clone(), variante);
                    varianten.push(Value::Object(kopie));
                }
            }
            varianten
        }
        _ => Vec::new(),
    }
}

/// Liest die Datei als `T`, schreibt sie zurück und vergleicht mit dem Original — fängt ein
/// falsch geschriebenes camelCase-Feld oder ein still verlorenes Feld. Danach muss jede Variante
/// mit einem fremden Feld scheitern.
fn pruefe<T: DeserializeOwned + Serialize>(datei: &str) {
    let original = lies(datei);
    let gelesen: T = serde_json::from_value(original.clone()).unwrap_or_else(|e| panic!("{datei}: {e}"));
    assert_eq!(serde_json::to_value(&gelesen).unwrap(), original, "{datei}: Rundlauf weicht ab");

    let varianten = mit_fremdem_feld(&original);
    assert!(!varianten.is_empty(), "{datei}");
    for variante in varianten {
        assert!(serde_json::from_value::<T>(variante.clone()).is_err(), "{datei}: fremdes Feld angenommen: {variante}");
    }
}

/// Jede Datei im Ordner braucht einen Rust-Typ — eine neue Fixture ohne Eintrag hier fällt auf.
#[test]
fn jede_fixture_liest_sich_mit_ihrem_typ_und_lehnt_fremde_felder_ab() {
    let mut dateien: Vec<String> = std::fs::read_dir(ordner())
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    dateien.sort();
    assert_eq!(
        dateien,
        [
            "anker-lesen.json",
            "einrichten.json",
            "fehler-echt-vorhanden.json",
            "freigeben-anfrage.json",
            "freigeben.json",
            "stammdaten.json",
            "tausch.json",
        ]
    );
    for datei in &dateien {
        match datei.as_str() {
            "anker-lesen.json" => pruefe::<KettenankerAntwort>(datei),
            "einrichten.json" => pruefe::<EinrichtenAntwort>(datei),
            "fehler-echt-vorhanden.json" => pruefe::<Fehlerkoerper>(datei),
            "freigeben-anfrage.json" => pruefe::<Vec<Freigabeposten>>(datei),
            "freigeben.json" => pruefe::<Vec<Schluesselposten>>(datei),
            "stammdaten.json" => pruefe::<einsatzbuch_kern::einrichtung::Stammdatenpaket>(datei),
            "tausch.json" => pruefe::<TauschAntwort>(datei),
            sonst => panic!("keine Zuordnung für {sonst}"),
        }
    }
}

#[test]
fn kettenanker_antwort_kennt_null_und_einen_anker() {
    let ohne: KettenankerAntwort = serde_json::from_str(r#"{"anker":null}"#).unwrap();
    assert_eq!(ohne.anker, None);
    assert_eq!(serde_json::to_string(&ohne).unwrap(), r#"{"anker":null}"#);

    let mit: KettenankerAntwort = serde_json::from_value(lies("anker-lesen.json")).unwrap();
    let anker = mit.anker.expect("die Fixture trägt einen Anker");
    assert_eq!(anker.block, 7);
    assert_eq!(anker.hash.len(), 64);
}

#[test]
fn tausch_antwort_ohne_einrichtung_und_mit_rechner() {
    let json = r#"{"sitzungstoken":"t","name":"n","ablauf":"2026-09-25T10:30:00+02:00","rechnerId":"r1","einrichtung":null}"#;
    let a: TauschAntwort = serde_json::from_str(json).unwrap();
    assert_eq!(a.rechner_id.as_deref(), Some("r1"));
    assert_eq!(a.einrichtung, None);
    // `null` bleibt beim Zurückschreiben erhalten, statt wegzufallen.
    assert_eq!(serde_json::to_value(&a).unwrap(), serde_json::from_str::<Value>(json).unwrap());
}

#[test]
fn fehlerkoerper_kennt_alle_zusatzfelder() {
    let abweichung: Fehlerkoerper = serde_json::from_str(
        r#"{"error":{"code":"anker_abweichung","message":"m"},"erwartet":"ab"}"#,
    )
    .unwrap();
    assert_eq!(abweichung.error.code, "anker_abweichung");
    assert_eq!(abweichung.erwartet.as_deref(), Some("ab"));

    let zu_lang: Fehlerkoerper = serde_json::from_str(
        r#"{"error":{"code":"stammdaten_zu_lang","message":"m"},"feld":"ruf","eintrag":"11-83-1"}"#,
    )
    .unwrap();
    assert_eq!(zu_lang.feld.as_deref(), Some("ruf"));
    assert_eq!(zu_lang.eintrag.as_deref(), Some("11-83-1"));

    let schlicht: Fehlerkoerper = serde_json::from_str(r#"{"error":{"code":"x","message":"y"}}"#).unwrap();
    assert_eq!(schlicht.erwartet, None);
    assert_eq!(serde_json::to_string(&schlicht).unwrap(), r#"{"error":{"code":"x","message":"y"}}"#);
}

#[test]
fn einrichten_antwort_ergibt_die_lokale_einrichtung() {
    let a: EinrichtenAntwort = serde_json::from_value(lies("einrichten.json")).unwrap();
    let e = a.einrichtung("https://suite.example");
    assert_eq!(e.umgebung, Umgebung::Echt);
    assert_eq!(e.suite_url, "https://suite.example");
    assert_eq!(e.oeffentlich_spki, a.oeffentlich_spki);
    assert_eq!(e.schluessel_id, "8cedd95d94246a4d");
    assert_eq!(e.paket, a.paket);
    assert_eq!(e.eingerichtet_am, a.eingerichtet_am);
    assert_eq!(e.eingerichtet_von, a.eingerichtet_von);
}

/// Kein Geheimnis im Debug-Text: Wer eine Antwort mit `{:?}`
/// loggt, darf weder Sitzungs- noch Geräte-Token, weder Code noch Verifier, noch einen CEK
/// schreiben.
#[test]
fn geheimnisse_erscheinen_nicht_im_debug_text() {
    use einsatzbuch_kern::vertrag::TauschAnfrage;

    let tausch: TauschAntwort = serde_json::from_value(lies("tausch.json")).unwrap();
    let text = format!("{tausch:?}");
    assert!(!text.contains(&tausch.sitzungstoken), "{text}");
    assert!(text.contains(&tausch.name), "der Name bleibt lesbar: {text}");

    let einrichten: EinrichtenAntwort = serde_json::from_value(lies("einrichten.json")).unwrap();
    let text = format!("{einrichten:?}");
    assert!(!text.contains(&einrichten.geraete_token), "{text}");
    assert!(text.contains(&einrichten.rechner_id), "die Rechnerkennung bleibt lesbar: {text}");

    let posten = Schluesselposten { block: 7, cek: "GEHEIMER-CEK".into() };
    let text = format!("{posten:?}");
    assert!(!text.contains("GEHEIMER-CEK") && text.contains('7'), "{text}");

    let anfrage = TauschAnfrage { code: "GEHEIMER-CODE".into(), verifier: "GEHEIMER-VERIFIER".into() };
    let text = format!("{anfrage:?}");
    assert!(!text.contains("GEHEIMER-CODE") && !text.contains("GEHEIMER-VERIFIER"), "{text}");
}

/// Ein Posten der Freigabe trägt einen CEK. Er wischt ihn beim Drop selbst, auf jedem Pfad —
/// auch wenn `gib_frei` nach einem abgelehnten Paket alle schon gelesenen Posten verwirft.
#[test]
fn schluesselposten_wischt_seinen_cek_beim_drop() {
    fn wischt_beim_drop<T: zeroize::ZeroizeOnDrop>() {}
    wischt_beim_drop::<Schluesselposten>();
}
