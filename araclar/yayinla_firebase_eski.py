#!/usr/bin/env python3
"""Mahzen yayın aracı: bir sürümü Firebase'e (Firestore guncelleme/...) yükler.

Kullanım:
  YAYINCI_SIFRE=... python3 yayinla.py mahzen-2.9.html "sürüm notları" [--yerel 1] [--dry]

Firestore düzeni (uygulamanın beklediği):
  guncelleme/son            surum, notlar, parca, sha, yerel, boyut (bayt; 3.0+ ilerleme göstergesi)
  guncelleme/exe            surum (yerel sürüm, tamsayı), notlar, parca, sha, boyut   (--exe Mahzen.exe N: masaüstü kabuğu)
  guncelleme/exe~{k}        c  (exe base64, k. parça)
  guncelleme/{surum}~{k}    c  (sayfa metni, k. parça)
Önce parçalar, en son 'son' yazılır; böylece yarım kalmış bir yayın hiçbir cihaza görünmez."""
import sys, os, re, json, hashlib, urllib.request, urllib.error

API_KEY = "AIzaSyBCfIi4FDt8Us19dMF5mz2y6CPxxzUPqH4"
PROJECT = "mahzen-d91fd"
PUBLISHER = os.environ.get("YAYINCI_EPOSTA", "yayinci@mahzen.app")
CHUNK = 400000          # karakter; Firestore belge sınırı 1 MiB
FS = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def call(url, body=None, token=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:400]}")

def sv(s): return {"stringValue": s}
def iv(n): return {"integerValue": str(n)}

def publish_exe(path, ver, notes):
    import base64
    b64 = base64.b64encode(open(path, "rb").read()).decode()
    sha = hashlib.sha256(b64.encode()).hexdigest()
    parts = [b64[i:i + CHUNK] for i in range(0, len(b64), CHUNK)]
    print(f"exe yerel sürüm {ver}, {len(b64)} karakter, {len(parts)} parça")
    pw = os.environ.get("YAYINCI_SIFRE")
    if not pw: raise SystemExit("YAYINCI_SIFRE ortam değişkeni gerekli")
    auth = call(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                {"email": PUBLISHER, "password": pw, "returnSecureToken": True})
    tok = auth["idToken"]
    base = f"projects/{PROJECT}/databases/(default)/documents/guncelleme/"
    for k, p in enumerate(parts):
        call(f"{FS}:commit", {"writes": [{"update": {"name": base + f"exe~{k}", "fields": {"c": sv(p)}}}]}, tok)
    call(f"{FS}:commit", {"writes": [{"update": {"name": base + "exe", "fields": {
        "surum": iv(ver), "notlar": sv(notes), "parca": iv(len(parts)), "sha": sv(sha), "boyut": iv(len(b64))}}}]}, tok)
    print("guncelleme/exe güncellendi →", ver)

def main():
    if "--exe" in sys.argv:
        i = sys.argv.index("--exe"); return publish_exe(sys.argv[i + 1], int(sys.argv[i + 2]), sys.argv[i + 3] if len(sys.argv) > i + 3 else "")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = sys.argv[1:]
    if len(args) < 1: raise SystemExit(__doc__)
    path, notes = args[0], (args[1] if len(args) > 1 else "")
    yerel = int(opts[opts.index("--yerel") + 1]) if "--yerel" in opts else 1
    dry = "--dry" in opts
    html = open(path, encoding="utf-8").read()
    m = re.search(r'APP_VERSION="([0-9.]+)"', html)
    if not m: raise SystemExit("APP_VERSION bulunamadı")
    ver = m.group(1)
    sha = hashlib.sha256(html.encode("utf-8")).hexdigest()
    parts = [html[i:i + CHUNK] for i in range(0, len(html), CHUNK)]
    print(f"sürüm {ver}, {len(html)} karakter, {len(parts)} parça, sha {sha[:12]}…, yerel≥{yerel}")
    if dry: return
    pw = os.environ.get("YAYINCI_SIFRE")
    if not pw: raise SystemExit("YAYINCI_SIFRE ortam değişkeni gerekli")
    auth = call(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
                {"email": PUBLISHER, "password": pw, "returnSecureToken": True})
    tok = auth["idToken"]; print("yayıncı girişi tamam, uid", auth["localId"])
    base = f"projects/{PROJECT}/databases/(default)/documents/guncelleme/"
    for k, p in enumerate(parts):
        call(f"{FS}:commit", {"writes": [{"update": {"name": base + f"{ver}~{k}", "fields": {"c": sv(p)}}}]}, tok)
        print(f"  parça {k} yazıldı ({len(p)})")
    call(f"{FS}:commit", {"writes": [{"update": {"name": base + "son", "fields": {
        "surum": sv(ver), "notlar": sv(notes), "parca": iv(len(parts)), "sha": sv(sha), "yerel": iv(yerel), "boyut": iv(len(html.encode("utf-8")))}}}]}, tok)
    print("guncelleme/son güncellendi →", ver)
    # doğrulama: herkese açık okuma
    d = call(f"{FS}/guncelleme/son?key={API_KEY}")
    print("doğrulama:", d["fields"]["surum"]["stringValue"], d["fields"]["sha"]["stringValue"][:12])

if __name__ == "__main__": main()
