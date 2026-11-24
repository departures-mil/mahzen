package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Vektörler: node araclar/fcd1-vektor.js (ortak-cekirdek/delta/node/fcdelta.js ile üretilir).
type vektorler struct {
	Iyi []struct {
		Name string `json:"name"`
	} `json:"iyi"`
	Bozuk []struct {
		Name string `json:"name"`
		Src  string `json:"src"`
		Err  string `json:"err"`
	} `json:"bozuk"`
}

func okuV(t *testing.T) vektorler {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "fcd1", "vektorler.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v vektorler
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Iyi) < 5 || len(v.Bozuk) < 10 {
		t.Fatalf("vektör sayısı az: %d iyi, %d bozuk", len(v.Iyi), len(v.Bozuk))
	}
	return v
}

func oku(t *testing.T, p ...string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(append([]string{"testdata", "fcd1"}, p...)...))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestFCD1Iyi(t *testing.T) {
	for _, c := range okuV(t).Iyi {
		t.Run(c.Name, func(t *testing.T) {
			out, err := ApplyFCD1(oku(t, c.Name+".old"), oku(t, c.Name+".patch"))
			if err != nil {
				t.Fatalf("hata: %v", err)
			}
			if !bytes.Equal(out, oku(t, c.Name+".new")) {
				t.Fatal("sonuç .new ile aynı değil")
			}
		})
	}
}

func TestFCD1Bozuk(t *testing.T) {
	for _, c := range okuV(t).Bozuk {
		t.Run(c.Name, func(t *testing.T) {
			out, err := ApplyFCD1(oku(t, c.Src+".old"), oku(t, "bozuk", c.Name+".patch"))
			if err == nil {
				t.Fatalf("hata bekleniyordu, %d bayt döndü", len(out))
			}
			if c.Err != "ANY" && err.Error() != c.Err {
				t.Fatalf("hata %v, beklenen %s", err, c.Err)
			}
		})
	}
}

// Yanlış kaynak dosya: istemci tam dosyaya geçmeli (FCD1_SOURCE).
func TestFCD1YanlisKaynak(t *testing.T) {
	src := oku(t, "metin-duzenleme.old")
	src = append([]byte{}, src...)
	src[10] ^= 1
	if _, err := ApplyFCD1(src, oku(t, "metin-duzenleme.patch")); err != ErrFCD1Source {
		t.Fatalf("FCD1_SOURCE bekleniyordu: %v", err)
	}
}

// FORMAT.md §6 test vektörü (bayt bayt).
func TestFCD1Belge(t *testing.T) {
	p := oku(t, "bos-abc.patch")
	h, err := ReadFCD1Header(p)
	if err != nil || h.SrcLen != 0 || h.DstLen != 3 {
		t.Fatalf("başlık: %+v %v", h, err)
	}
	if string(p[:5]) != "FCD1\x01" {
		t.Fatal("magic/codec")
	}
}
