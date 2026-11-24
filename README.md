# Mahzen

Hesaplar, şifreler ve dosyalar. Windows masaüstü programı (Go + WebView2 kabuğu) ve Android uygulaması; arayüz tek sayfa
(`kaynak/web/index.html`) + ortak çekirdek (`kaynak/web/cekirdek/`, departures-mil/ortak-cekirdek kopyası).
Kayıtlar Firebase (kendi projeniz) ve aynı Wi‑Fi üzerinden şifreli eşitlenir; **kayıtlar bu depoda bulunmaz**.

- `kaynak/web/` — arayüz: `index.html` (uygulama), `kabuk-fc.js`/`kabuk-fc.css` (çekirdek bağlantısı: üst çubuk, Ayarlar, klasik şema,
  arşiv, eski kabuk köprüsü), `surum.js` (otomatik), `cekirdek/` (fc-core.js, css, yazı tipleri; commit `cekirdek/VERSION`).
- `kaynak/kabuk/` — masaüstü kabuğu (Go): tam ekran açılış, `window.fcHost` (pencere düğmeleri, indirme, güncelleme), web paketi, FCD1 yamaları,
  Wi‑Fi eşitleme sunucusu. Derleme: `kaynak/kabuk/DERLE.txt`.
- `kaynak/kurulum/mahzen.nsi` — NSIS kurulum (kullanıcı başına, tek tık, tr/en/ar). Veri klasörü (`veri\` exe'nin yanında) değişmez.
- `kaynak/android/` — APK derleme betiği; Android Java kaynağı ve imza anahtarı geliştiricinin bilgisayarındadır (`Mahzen-v2.5\android`), bu depoda değildir.
- `guncelleme/` — ESKİ kanal (≤ 3.8 kurulumları): `son.json` (sayfa, Android hâlâ okur) ve `exe.json` (masaüstü kabuğu köprüsü).

## Yeni sürüm (3.9.0'dan beri GitHub Releases)
1. `release-notes.json` (tr/en/ar) → `node araclar/surum.js X.Y.Z`
2. `npm test` (arayüz duman testi + go test + paket), dal `ortak-cekirdek-*` ya da main
3. main'de: `gh api -X POST repos/departures-mil/mahzen/actions/workflows/release.yml/dispatches -f ref=main`
   → release `vX.Y.Z`: `latest.json`, win-app (web paketi zip + son 5 sürümden FCD1 yamaları), win-setup (NSIS), win-exe.
4. Kabuk (Go) değiştiyse `release.yml` → `min_version`'ı o sürüme çekin (eski kabuklar win-setup ile güncellenir).

Eski masaüstü kurulumları (kabuk ≤ 3) için köprü: release'ten sonra `python3 araclar/kopru.py` → `guncelleme/exe.json` (kabuk 4) → commit + push.
