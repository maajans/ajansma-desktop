// Mezopotamya Ajansı · Haber Merkezi masaüstü uygulaması
// Panel web uygulamasını kendi penceresinde açar; her açılışta makine kodunu bildirir.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};

const PANEL_HOST: &str = "ajansma.com";
const BASE_URL: &str = "https://ajansma.com/index.php";
const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Makineye özgü, değişmeyen cihaz kodu: MA-XXXX-XXXX-XXXX
fn machine_code() -> String {
    let seed = machine_seed();
    let mut hasher = Sha256::new();
    hasher.update(seed.trim().to_uppercase().as_bytes());
    hasher.update(b"MA-HABER-MERKEZI-V1");
    let digest = hasher.finalize();
    // Karıştırılabilir harfler yok (I/O/0/1 kullanılmaz)
    let alphabet = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut code = String::from("MA-");
    for (index, byte) in digest.iter().take(12).enumerate() {
        if index > 0 && index % 4 == 0 {
            code.push('-');
        }
        code.push(alphabet[(*byte as usize) % alphabet.len()] as char);
    }
    code
}

#[cfg(windows)]
fn machine_seed() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let guid = hklm
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .and_then(|key| key.get_value::<String, _>("MachineGuid"))
        .unwrap_or_else(|_| "unknown-machine".to_string());
    // Yedek: bilgisayar adı (MachineGuid okunamazsa)
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".to_string());
    format!("{}|{}", guid, name)
}

#[cfg(target_os = "macos")]
fn machine_seed() -> String {
    use std::process::Command;
    let text = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .unwrap_or_default();
    let uuid = text
        .lines()
        .find(|line| line.contains("IOPlatformUUID"))
        .and_then(|line| line.split('"').nth(3))
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let host = std::env::var("HOSTNAME").unwrap_or_default();
    format!("{}|{}", if uuid.is_empty() { "no-uuid" } else { uuid.as_str() }, host)
}

#[cfg(not(any(windows, target_os = "macos")))]
fn machine_seed() -> String {
    std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown-machine".to_string())
}

fn platform_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(windows) {
        "Windows"
    } else {
        "Linux"
    }
}

fn panel_url() -> String {
    format!(
        "{}?kod={}&surum={}&platform={}",
        BASE_URL,
        machine_code(),
        VERSION,
        urlencode(&format!("{} ({})", platform_label(), VERSION))
    )
}

fn urlencode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn main() {
    let target = panel_url();
    println!("[ma] cihaz: {} · sürüm {}", machine_code(), VERSION);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let url: tauri::Url = target.parse().expect("panel adresi geçersiz");
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("Mezopotamya Ajansı · Haber Merkezi")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .center()
                .on_navigation(|u| {
                    // Yalnız ajansma.com içinde gezinme; dış bağlantılar varsayılan tarayıcıda açılır.
                    let host = u.host_str().unwrap_or_default();
                    if host == PANEL_HOST || host.ends_with(&format!(".{}", PANEL_HOST)) {
                        return true;
                    }
                    let _ = tauri_plugin_opener::open_url(u.as_str(), None::<&str>);
                    false
                })
                .on_download(|_webview, event| {
                    // İndirmeler (haber indirme, görsel/video) çalışsın
                    if let tauri::webview::DownloadEvent::Requested { destination, .. } = event {
                        println!("[ma] indirme: {:?}", destination);
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("uygulama başlatılamadı");
}
