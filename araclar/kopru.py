#!/usr/bin/env python3
"""Eski kanal köprüsü (Mahzen 3.8 ve önceki masaüstü kurulumları için). Release'ten SONRA çalıştırılır:

  python3 araclar/kopru.py [X.Y.Z]        (sürüm verilmezse releases/latest)
  git add guncelleme && git commit -m "Eski kanal köprüsü: exe.json → kabuk 4 (Mahzen X.Y.Z)" && git push

Eski kabuk (Mahzen.exe yerel sürüm ≤ 3) güncellemeyi raw guncelleme/exe.json + Mahzen-exe-<n>.b64'ten alır ve exe'nin
yerine yazar (sha256 + MZ + ≥1 MB denetimiyle). Bu betik release'teki win-exe dosyasını (yeni Go kabuğu; arayüz ve ortak çekirdek
gömülü) latest.json'daki SHA-256 ile doğrular ve eski kanala kabuk 4 olarak koyar. Yeni exe açılınca arayüzü web\\ altına kurar;
kayıtlar (veri\\, köken https://mahzen.local) aynı yerde kalır. Sonraki güncellemeler GitHub Releases + latest.json'dan gelir.
guncelleme/son.json (sayfa kanalı) DEĞİŞMEZ: Android uygulaması (kaynağı bu depoda değil) 3.8 sayfasında kalır.
İmza gerekmez (eski kanal imzasız, yalnız sha256)."""
import base64, hashlib, json, os, sys, urllib.request

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(KOK, "guncelleme")
REPO = "departures-mil/mahzen"
KABUK = 4  # main.go nativeVersion

NOTLAR = ("Mahzen 3.9: yeni görünüm, tam ekran açılış, Ayarlar sayfası ve GitHub'dan tek tıkla güncelleme. "
          "Kayıtlarınız olduğu gibi kalır. / New look, settings page and one-click updates; your records are kept. / "
          "مظهر جديد وصفحة إعدادات وتحديث بضغطة واحدة؛ سجلاتك محفوظة.")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "mahzen-kopru"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def main():
    v = sys.argv[1] if len(sys.argv) > 1 else None
    base = f"https://github.com/{REPO}/releases/" + (f"download/v{v}/" if v else "latest/download/")
    man = json.loads(get(base + "latest.json"))
    a = man["assets"]["win-exe"]
    exe = get(f"https://github.com/{REPO}/releases/download/v{man['version']}/{a['file']}")
    if len(exe) != a["size"] or hashlib.sha256(exe).hexdigest() != a["sha256"].lower():
        raise SystemExit("win-exe SHA-256/boyut latest.json ile uyuşmuyor")
    if exe[:2] != b"MZ" or len(exe) < (1 << 20):
        raise SystemExit("win-exe geçerli bir exe değil")
    b64 = base64.b64encode(exe).decode()
    dosya = f"Mahzen-exe-{KABUK}.b64"
    with open(os.path.join(G, dosya), "w", newline="") as f:
        f.write(b64)
    for f in os.listdir(G):
        if f.startswith("Mahzen-exe-") and f != dosya:
            os.remove(os.path.join(G, f))
    info = {"surum": KABUK, "notlar": NOTLAR, "dosya": dosya, "mahzen": man["version"],
            "sha": hashlib.sha256(b64.encode()).hexdigest(), "boyut": len(b64)}
    with open(os.path.join(G, "exe.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print("KÖPRÜ HAZIR: exe.json → kabuk", KABUK, "(Mahzen", man["version"] + ")", dosya, len(b64), "bayt")


if __name__ == "__main__":
    main()
