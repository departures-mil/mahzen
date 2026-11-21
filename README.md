# Mahzen

Windows masaüstü programı (Go + WebView2 kabuğu) ve Android uygulaması; arayüzün tamamı tek sayfa (`kaynak/mahzen.html`).
Kayıtlar Firebase ve aynı Wi‑Fi üzerinden şifreli eşitlenir; **kayıtlar bu depoda bulunmaz**.

- `kaynak/mahzen.html` — uygulama sayfası (APP_VERSION). `kaynak/kabuk/` — masaüstü kabuğu (Go). `kaynak/android/` — APK derleme betiği.
- `guncelleme/son.json` + `mahzen-<sürüm>.html` — sayfa güncellemesi; `guncelleme/exe.json` + `Mahzen-exe-<n>.b64` — masaüstü kabuğu.
  Programlar buradan indirir ve sha256 ile doğrular.
- Android Java kaynağı ve imza anahtarı geliştiricinin bilgisayarındadır (`Mahzen-v2.5\android`), bu depoda değildir.

## Yeni sürüm
1. `kaynak/mahzen.html` içinde `APP_VERSION`'ı artır.
2. `python3 araclar/yayinla.py sayfa "notlar"`  (kabuk değiştiyse: `python3 araclar/yayinla.py exe Mahzen.exe <n> "notlar"`)
3. `git add -A && git commit -m "Mahzen X" && git push`
