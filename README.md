# MA Haber Merkezi — Masaüstü Uygulaması (Tauri 2)

Panelin (`https://ajansma.com/index.php`) kendi penceresinde açılan Windows uygulaması.
Her açılışta makineye özgü **cihaz kodu** üretir ve sunucuya bildirir; sunucu onaylamadan
o bilgisayar haber merkezine giremez.

## Cihaz kodu nasıl üretilir
`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` + bilgisayar adı →
SHA-256 → `MA-XXXX-XXXX-XXXX`. Format: `MA-` + 4 + 4 + 4 (karışabilen harfler yok: I/O/0/1).

## Sunucu tarafı
- `src/cihaz.php`: kod doğrulama, çerez (`ma_cihaz`), cihaz kaydı, kapı kontrolü.
- `access_devices` tablosu: `machine_code`, `status` (pending/approved/rejected/revoked), `bypass`.
- Panel → **Erişimler**: talepleri onayla/reddet, "her koşulda bağlansın" (bypass) işaretle,
  cihaz kapısı modunu seç (`kapali` / `uygulama` / `herkes`).
- Mod **uygulama** (varsayılan): tarayıcıdan giriş serbest, onaysız uygulama cihazı içeri girmez.

## Derleme
```bash
npm install
export PATH="$HOME/.cargo/bin:$PATH"   # Rust (rustup) gerekir
npx tauri icon src-tauri/icons/source.png
npx tauri build
```
Çıktı: `src-tauri/target/release/bundle/nsis/MA Haber Merkezi_1.0.0_x64-setup.exe`

## Kurucu makine
Kurulumu yapan bilgisayarın kodu `MA-LG7E-QVHV-84HM` olarak `bypass=1` ile önceden onaylıdır
(Erişimler → "Kurucu bilgisayar"). Böylece kurulum sırasında erişim kesilmez.

## Sürüm yükseltme
`src-tauri/Cargo.toml` ve `tauri.conf.json` içindeki `version` alanını artırıp yeniden derleyin.
Uygulama yeni sürümde `surum` parametresini sunucuya bildirir; panelde cihazın sürümü görünür.
