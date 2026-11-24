package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func testZip(t *testing.T, ver string, extra map[string]string) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	files := map[string]string{"index.html": "<!doctype html><title>Mahzen " + ver + "</title>", "version.txt": ver + "\n", "cekirdek/fc-core.js": "/*core*/"}
	for k, v := range extra {
		files[k] = v
	}
	for _, k := range []string{"index.html", "version.txt", "cekirdek/fc-core.js", "../kacak.txt"} {
		v, ok := files[k]
		if !ok {
			continue
		}
		w, _ := zw.Create(k)
		w.Write([]byte(v))
	}
	zw.Close()
	return b.Bytes()
}

func TestSemver(t *testing.T) {
	cases := [][3]interface{}{{"3.9.0", "3.8.9", 1}, {"3.9.0", "3.9.0", 0}, {"3.10.0", "3.9.0", 1}, {"1.0.0", "x", 1}, {"3.8", "3.9.0", -1}}
	for _, c := range cases {
		if got := cmpSemver(c[0].(string), c[1].(string)); got != c[2].(int) {
			t.Errorf("cmp(%v,%v)=%d", c[0], c[1], got)
		}
	}
}

func TestPaketHazirlaVeYama(t *testing.T) {
	base := t.TempDir()
	// eski kurulumdan kalan veri: dokunulmamalı
	os.MkdirAll(filepath.Join(base, "veri", "EBWebView"), 0755)
	os.WriteFile(filepath.Join(base, "veri", "EBWebView", "kayit"), []byte("KAYIT"), 0644)

	z1 := testZip(t, "3.9.0", nil)
	p, err := paketHazirla(base, z1)
	if err != nil || p.Version != "3.9.0" {
		t.Fatalf("ilk kurulum: %+v %v", p, err)
	}
	if b, _ := os.ReadFile(filepath.Join(paketDizin(base, p), "index.html")); !bytes.Contains(b, []byte("3.9.0")) {
		t.Fatal("index.html açılmadı")
	}
	// aynı gömülü paket → yeniden kurulmaz
	p2, _ := paketHazirla(base, z1)
	if p2 != p {
		t.Fatal("aynı paket yeniden kuruldu")
	}
	// yama ile 3.9.1 (yama: boş kaynaktan değil, paket.zip'ten) — burada tam dosyayla kurulum yolunu deneriz
	z2 := testZip(t, "3.9.1", map[string]string{"index.html": "<!doctype html>yeni 3.9.1"})
	p3, err := paketKur(base, z2, shaHex(z2))
	if err != nil || p3.Version != "3.9.1" {
		t.Fatalf("tam kurulum: %+v %v", p3, err)
	}
	// daha eski gömülü paket (eski exe) yeni paketi ezmez
	p4, _ := paketHazirla(base, z1)
	if p4.Version != "3.9.1" {
		t.Fatalf("eski gömülü paket yeniyi ezdi: %+v", p4)
	}
	// yanlış SHA reddedilir, geçerli paket değişmez
	if _, err := paketKur(base, z1, "00"); err == nil || err.Error() != "BAD_HASH" {
		t.Fatalf("BAD_HASH bekleniyordu: %v", err)
	}
	if cur, _ := paketOku(base); cur.Version != "3.9.1" {
		t.Fatal("geçerli paket bozuldu")
	}
	// paket.zip bayt bayt release dosyası
	if b, _ := os.ReadFile(filepath.Join(base, "web", "paket.zip")); !bytes.Equal(b, z2) {
		t.Fatal("paket.zip release dosyasıyla aynı değil")
	}
	if b, _ := os.ReadFile(filepath.Join(base, "veri", "EBWebView", "kayit")); string(b) != "KAYIT" {
		t.Fatal("kullanıcı verisi değişti")
	}
}

func TestPaketYamaFCD1(t *testing.T) {
	// Go tarafında FCD1 üretici yok: boş kaynaktan "INSERT tüm dosya" yaması elle kurulur (FORMAT.md §2)
	base := t.TempDir()
	z1 := testZip(t, "3.9.0", nil)
	if _, err := paketKur(base, z1, ""); err != nil {
		t.Fatal(err)
	}
	z2 := testZip(t, "3.9.1", nil)
	patch := elleYama(z1, z2)
	p, err := paketYama(base, patch, shaHex(z2), int64(len(z2)))
	if err != nil || p.Version != "3.9.1" {
		t.Fatalf("yama: %+v %v", p, err)
	}
	// kaynak artık z2: aynı yama ikinci kez uygulanamaz (FCD1_SOURCE)
	if _, err := paketYama(base, patch, shaHex(z2), 0); err != ErrFCD1Source {
		t.Fatalf("FCD1_SOURCE bekleniyordu: %v", err)
	}
}

func TestZipSlip(t *testing.T) {
	z := testZip(t, "3.9.0", map[string]string{"../kacak.txt": "x"})
	base := t.TempDir()
	if _, err := paketKur(base, z, ""); err == nil {
		t.Fatal("zip-slip kabul edildi")
	}
	if _, err := os.Stat(filepath.Join(base, "kacak.txt")); err == nil {
		t.Fatal("dosya dışarı yazıldı")
	}
}
