# Mahzen

Hesap/şifre/dosya kasası. Windows: Go + WebView2 kabuğu (`kaynak/kabuk`), arayüz tek sayfa + ortak çekirdek (`kaynak/web`). Android APK'nın Java
kaynağı bu depoda DEĞİL (Milen'in bilgisayarı); Android eski kanaldan (`guncelleme/son.json`, 3.8 sayfası) güncellenir — son.json'a dokunma.

## Kurallar (Milen)
- Sürüm semver X.Y.Z, etiket `vX.Y.Z`. Tek kaynak `package.json` → `node araclar/surum.js X.Y.Z` (index.html APP_VERSION + surum.js). Notlar `release-notes.json` (tr/en/ar).
- Güncelleme yalnız GitHub Releases + `latest.json` + FCD1 yama (ortak `reusable-release.yml`). Kanallar: `win-app` (web paketi zip; kabuk `web\paket.zip`'e yama uygular),
  `win-setup` (NSIS; kabuk `/D=<kendi klasörü>` ile çalıştırır), `win-exe` (yalnız eski kanal köprüsü için).
- Kayıtlar asla kaybolmaz: köken `https://mahzen.local`, WebView2 verisi exe'nin yanında `veri\`, IndexedDB `isim-rehberi` — değiştirme. Silme ve eşitlemede
  üstüne yazma → meta `arsiv:*` / `yedek:*` (Ayarlar → Arşiv'den geri alınır). Wi‑Fi (LanCore) ve Firebase ikisi de bu kurala uyar.
- Ayarlar sırası: Görünüm · Güvenlik · Eşitleme · Yedek · Arşiv · Asistan · Kullanım · Hata raporu · Hakkında · **Admin ile iletişim EN SON** (`FC.settings`).
- Varsayılan şema falcon; 3.8'in altın-gece renkleri `klasik`. Diller tr/en/ar (ar RTL). Masaüstü her açılışta tam ekran.
- Çekirdek kopyası `kaynak/web/cekirdek` (commit `VERSION`); ortak-cekirdek deposunu buradan değiştirme. FCD1 test vektörleri `node araclar/fcd1-vektor.js`.
- İmza anahtarları/şifreler depoya girmez.

## Test
`bash araclar/deps.sh && node araclar/paket.js && npm test` (Playwright Chromium: `PLAYWRIGHT_CORE=/opt/npm-tools/node_modules/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
CI (`.github/workflows/release.yml`): test → windows build (exe + `--duman` açılış testi + NSIS + kurulum/kaldırma testi) → release (yalnız main'de workflow_dispatch).
Ekran görüntüleri: `node araclar/ekran.js <klasör>`.
