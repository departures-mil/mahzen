#!/usr/bin/env python3
"""Mahzen GitHub yayın aracı (depo kökünden).

  python3 araclar/yayinla.py sayfa "notlar" [--yerel 1]     kaynak/mahzen.html -> guncelleme/son.json
  python3 araclar/yayinla.py exe Mahzen.exe <yerel sürüm> "notlar"   -> guncelleme/exe.json
Sonra: git add -A && git commit -m "Mahzen X" && git push
"""
import base64, hashlib, json, os, re, sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(KOK, "guncelleme")


def temizle(prefix, keep):
    for f in os.listdir(G):
        if f.startswith(prefix) and f != keep:
            os.remove(os.path.join(G, f))


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("sayfa", "exe"):
        raise SystemExit(__doc__)
    os.makedirs(G, exist_ok=True)
    if a[0] == "sayfa":
        html = open(os.path.join(KOK, "kaynak", "mahzen.html"), encoding="utf-8").read()
        ver = re.search(r'APP_VERSION="([0-9.]+)"', html).group(1)
        yerel = int(a[a.index("--yerel") + 1]) if "--yerel" in a else 1
        dosya = f"mahzen-{ver}.html"
        open(os.path.join(G, dosya), "w", encoding="utf-8", newline="").write(html)
        temizle("mahzen-", dosya)
        info = {"surum": ver, "notlar": a[1] if len(a) > 1 else "", "dosya": dosya, "yerel": yerel,
                "sha": hashlib.sha256(html.encode("utf-8")).hexdigest(), "boyut": len(html.encode("utf-8"))}
        json.dump(info, open(os.path.join(G, "son.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    else:
        b64 = base64.b64encode(open(a[1], "rb").read()).decode()
        ver = int(a[2])
        dosya = f"Mahzen-exe-{ver}.b64"
        open(os.path.join(G, dosya), "w").write(b64)
        temizle("Mahzen-exe-", dosya)
        info = {"surum": ver, "notlar": a[3] if len(a) > 3 else "", "dosya": dosya,
                "sha": hashlib.sha256(b64.encode()).hexdigest(), "boyut": len(b64)}
        json.dump(info, open(os.path.join(G, "exe.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("HAZIR", info["surum"], info["dosya"])


if __name__ == "__main__":
    main()
