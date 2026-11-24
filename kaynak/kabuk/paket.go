// Web paketi (win-app kanalı): arayüzün zip'i. Kabuk onu <exe klasörü>/web/ altına açar ve https://mahzen.local/ olarak sunar.
//   web/paket.zip      kurulu paketin release'teki dosyayla BAYT BAYT aynı kopyası (FCD1 yamasının kaynağı)
//   web/b-<sha12>/     açılmış paket (index.html, version.txt, cekirdek/ …)
//   web/current.json   {"version","sha256","dir"} — atomik yazılır; geçerli paket
// Kayıtlar bu klasörlerde DEĞİL: WebView2 verisi exe'nin yanındaki veri/ klasöründe, köken https://mahzen.local (3.8'deki gibi).
// Windows dışında da derlenir (go test).
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type paketBilgi struct {
	Version string `json:"version"`
	Sha256  string `json:"sha256"`
	Dir     string `json:"dir"`
}

var semverRe = regexp.MustCompile(`^(\d+)\.(\d+)\.(\d+)$`)

// cmpSemver: a<b → -1, a==b → 0, a>b → 1. Geçersiz sürüm en küçük sayılır.
func cmpSemver(a, b string) int {
	pa, pb := semverRe.FindStringSubmatch(strings.TrimSpace(a)), semverRe.FindStringSubmatch(strings.TrimSpace(b))
	if pa == nil || pb == nil {
		switch {
		case pa == nil && pb == nil:
			return 0
		case pa == nil:
			return -1
		default:
			return 1
		}
	}
	for i := 1; i <= 3; i++ {
		x, _ := strconv.Atoi(pa[i])
		y, _ := strconv.Atoi(pb[i])
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

func shaHex(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

// zipSurum paketin version.txt'sini okur ve index.html içerdiğini denetler.
func zipSurum(z []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(z), int64(len(z)))
	if err != nil {
		return "", errors.New("BAD_BUNDLE")
	}
	ver, hasIndex := "", false
	for _, f := range zr.File {
		switch f.Name {
		case "index.html":
			hasIndex = true
		case "version.txt":
			rc, err := f.Open()
			if err != nil {
				return "", errors.New("BAD_BUNDLE")
			}
			b, _ := io.ReadAll(io.LimitReader(rc, 64))
			rc.Close()
			ver = strings.TrimSpace(string(b))
		}
	}
	if !hasIndex || !semverRe.MatchString(ver) {
		return "", errors.New("BAD_BUNDLE")
	}
	return ver, nil
}

func atomikYaz(p string, b []byte) error {
	tmp := p + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	f.Close()
	return os.Rename(tmp, p)
}

func zipAc(z []byte, dir string) error {
	zr, err := zip.NewReader(bytes.NewReader(z), int64(len(z)))
	if err != nil {
		return errors.New("BAD_BUNDLE")
	}
	root, _ := filepath.Abs(dir)
	for _, f := range zr.File {
		name := filepath.FromSlash(f.Name)
		dst := filepath.Join(root, name)
		if !strings.HasPrefix(dst, root+string(os.PathSeparator)) { // zip-slip
			return errors.New("BAD_BUNDLE")
		}
		if f.FileInfo().IsDir() || strings.HasSuffix(f.Name, "/") {
			if err := os.MkdirAll(dst, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return errors.New("BAD_BUNDLE")
		}
		out, err := os.Create(dst)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, io.LimitReader(rc, 512<<20))
		rc.Close()
		out.Close()
		if err != nil {
			return errors.New("BAD_BUNDLE")
		}
	}
	return nil
}

func webDir(base string) string { return filepath.Join(base, "web") }

// paketOku geçerli paketi döndürür (yoksa ya da bozuksa ok=false).
func paketOku(base string) (paketBilgi, bool) {
	var p paketBilgi
	b, err := os.ReadFile(filepath.Join(webDir(base), "current.json"))
	if err != nil || json.Unmarshal(b, &p) != nil || p.Dir == "" || strings.ContainsAny(p.Dir, `/\`) {
		return p, false
	}
	if _, err := os.Stat(filepath.Join(webDir(base), p.Dir, "index.html")); err != nil {
		return p, false
	}
	return p, true
}

// paketDizin geçerli paketin açıldığı klasör.
func paketDizin(base string, p paketBilgi) string { return filepath.Join(webDir(base), p.Dir) }

// paketKur zip'i doğrular, açar, paket.zip'i ve current.json'u atomik yazar. wantSha boş değilse SHA-256 denetlenir.
func paketKur(base string, z []byte, wantSha string) (paketBilgi, error) {
	sha := shaHex(z)
	if wantSha != "" && !strings.EqualFold(wantSha, sha) {
		return paketBilgi{}, errors.New("BAD_HASH")
	}
	ver, err := zipSurum(z)
	if err != nil {
		return paketBilgi{}, err
	}
	w := webDir(base)
	if err := os.MkdirAll(w, 0755); err != nil {
		return paketBilgi{}, errors.New("NO_WRITE")
	}
	name := "b-" + sha[:12]
	final := filepath.Join(w, name)
	if _, err := os.Stat(filepath.Join(final, "index.html")); err != nil {
		tmp := final + ".tmp"
		os.RemoveAll(tmp)
		if err := zipAc(z, tmp); err != nil {
			os.RemoveAll(tmp)
			return paketBilgi{}, err
		}
		os.RemoveAll(final)
		if err := os.Rename(tmp, final); err != nil {
			os.RemoveAll(tmp)
			return paketBilgi{}, errors.New("NO_WRITE")
		}
	}
	if err := atomikYaz(filepath.Join(w, "paket.zip"), z); err != nil {
		return paketBilgi{}, errors.New("NO_WRITE")
	}
	p := paketBilgi{Version: ver, Sha256: sha, Dir: name}
	j, _ := json.MarshalIndent(p, "", " ")
	if err := atomikYaz(filepath.Join(w, "current.json"), j); err != nil {
		return paketBilgi{}, errors.New("NO_WRITE")
	}
	paketTemizle(base, name)
	return p, nil
}

// paketTemizle geçerli ve bir önceki paket dışındaki eski b-* klasörlerini siler.
func paketTemizle(base, keep string) {
	ents, err := os.ReadDir(webDir(base))
	if err != nil {
		return
	}
	type d struct {
		n string
		t int64
	}
	var ds []d
	for _, e := range ents {
		if e.IsDir() && strings.HasPrefix(e.Name(), "b-") && e.Name() != keep {
			if strings.HasSuffix(e.Name(), ".tmp") {
				os.RemoveAll(filepath.Join(webDir(base), e.Name()))
				continue
			}
			if fi, err := e.Info(); err == nil {
				ds = append(ds, d{e.Name(), fi.ModTime().UnixNano()})
			}
		}
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i].t > ds[j].t })
	for i, x := range ds {
		if i >= 1 {
			os.RemoveAll(filepath.Join(webDir(base), x.n))
		}
	}
}

// paketHazirla açılışta çağrılır: kurulu paket yoksa, bozuksa ya da gömülü paket daha yeniyse gömülü paketi kurar.
func paketHazirla(base string, gomulu []byte) (paketBilgi, error) {
	cur, ok := paketOku(base)
	if len(gomulu) == 0 {
		if ok {
			return cur, nil
		}
		return paketBilgi{}, errors.New("NO_BUNDLE")
	}
	gv, err := zipSurum(gomulu)
	if err != nil {
		if ok {
			return cur, nil
		}
		return paketBilgi{}, err
	}
	if ok && cmpSemver(cur.Version, gv) >= 0 {
		return cur, nil
	}
	return paketKur(base, gomulu, "")
}

// paketYama kurulu paket.zip'e FCD1 yamasını uygular; sonuç targetSha ile doğrulanıp kurulur.
func paketYama(base string, patch []byte, targetSha string, targetSize int64) (paketBilgi, error) {
	src, err := os.ReadFile(filepath.Join(webDir(base), "paket.zip"))
	if err != nil {
		return paketBilgi{}, ErrFCD1Source
	}
	out, err := ApplyFCD1(src, patch)
	if err != nil {
		return paketBilgi{}, err
	}
	if targetSize > 0 && int64(len(out)) != targetSize {
		return paketBilgi{}, errors.New("BAD_SIZE")
	}
	return paketKur(base, out, targetSha)
}
