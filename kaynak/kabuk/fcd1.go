// FCD1 ikili yama uygulayıcı — ortak-cekirdek/delta/FORMAT.md (sürüm 1) birebir.
// Yalnız standart kitaplık: compress/zlib + crypto/sha256. Windows dışında da derlenir (go test).
package main

import (
	"bufio"
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"io"
)

const fcd1HeaderLen = 85

// FCD1 hata kodları (arayüze olduğu gibi gider; istemci yama hatasında tam dosyaya geçer).
var (
	ErrFCD1Magic    = errors.New("FCD1_MAGIC")
	ErrFCD1Codec    = errors.New("FCD1_CODEC")
	ErrFCD1Source   = errors.New("FCD1_SOURCE") // kurulu dosya yamanın kaynağı değil
	ErrFCD1Corrupt  = errors.New("FCD1_CORRUPT")
	ErrFCD1Target   = errors.New("FCD1_TARGET") // sonuç uzunluğu/SHA-256 başlıkla uyuşmuyor
	ErrFCD1Truncate = errors.New("FCD1_TRUNCATED")
)

// FCD1Header yamanın 85 baytlık başlığı.
type FCD1Header struct {
	SrcLen    uint64
	SrcSha256 [32]byte
	DstLen    uint64
	DstSha256 [32]byte
}

// ReadFCD1Header başlığı okur ve magic/codec denetler.
func ReadFCD1Header(patch []byte) (FCD1Header, error) {
	var h FCD1Header
	if len(patch) < fcd1HeaderLen {
		return h, ErrFCD1Truncate
	}
	if string(patch[0:4]) != "FCD1" {
		return h, ErrFCD1Magic
	}
	if patch[4] != 0x01 {
		return h, ErrFCD1Codec
	}
	h.SrcLen = binary.LittleEndian.Uint64(patch[5:13])
	copy(h.SrcSha256[:], patch[13:45])
	h.DstLen = binary.LittleEndian.Uint64(patch[45:53])
	copy(h.DstSha256[:], patch[53:85])
	return h, nil
}

func readVarint(r io.ByteReader) (uint64, error) {
	var v uint64
	for i := 0; i < 9; i++ {
		b, err := r.ReadByte()
		if err != nil {
			return 0, ErrFCD1Truncate
		}
		v |= uint64(b&0x7f) << (7 * uint(i))
		if b&0x80 == 0 {
			return v, nil
		}
	}
	return 0, ErrFCD1Corrupt // 9 bayttan uzun
}

// ApplyFCD1 kaynak dosyaya (src) yamayı uygular ve hedef dosyayı döndürür.
// Kaynak uzunluk+SHA-256, op akışı, uzunluk sınırları ve hedef SHA-256 FORMAT.md §3'e göre denetlenir.
func ApplyFCD1(src, patch []byte) ([]byte, error) {
	h, err := ReadFCD1Header(patch)
	if err != nil {
		return nil, err
	}
	if uint64(len(src)) != h.SrcLen || sha256.Sum256(src) != h.SrcSha256 {
		return nil, ErrFCD1Source
	}
	if h.DstLen > 1<<40 {
		return nil, ErrFCD1Corrupt
	}
	body := bytes.NewReader(patch[fcd1HeaderLen:])
	zr, err := zlib.NewReader(body)
	if err != nil {
		return nil, ErrFCD1Corrupt
	}
	r := bufio.NewReaderSize(zr, 64<<10)
	capHint := h.DstLen
	if capHint > 256<<20 {
		capHint = 256 << 20
	}
	out := make([]byte, 0, capHint)
	ended := false
	for !ended {
		op, err := r.ReadByte()
		if err != nil {
			return nil, ErrFCD1Truncate // END'siz biten akış
		}
		switch op {
		case 0x00:
			ended = true
		case 0x01:
			off, err := readVarint(r)
			if err != nil {
				return nil, err
			}
			n, err := readVarint(r)
			if err != nil {
				return nil, err
			}
			if off > h.SrcLen || n > h.SrcLen-off {
				return nil, ErrFCD1Corrupt
			}
			if uint64(len(out))+n > h.DstLen {
				return nil, ErrFCD1Target
			}
			out = append(out, src[off:off+n]...)
		case 0x02:
			n, err := readVarint(r)
			if err != nil {
				return nil, err
			}
			if uint64(len(out))+n > h.DstLen {
				return nil, ErrFCD1Target
			}
			start := len(out)
			out = append(out, make([]byte, n)...)
			if _, err := io.ReadFull(r, out[start:]); err != nil {
				return nil, ErrFCD1Truncate
			}
		default:
			return nil, ErrFCD1Corrupt
		}
	}
	// END'den sonra açılmış veri kalmamalı; zlib akışı (Adler-32 dahil) tam bitmeli; dosyada fazladan bayt olmamalı.
	if _, err := r.ReadByte(); err != io.EOF {
		if err == nil {
			return nil, ErrFCD1Corrupt
		}
		return nil, ErrFCD1Corrupt
	}
	if err := zr.Close(); err != nil {
		return nil, ErrFCD1Corrupt
	}
	if body.Len() != 0 {
		return nil, ErrFCD1Corrupt
	}
	if uint64(len(out)) != h.DstLen || sha256.Sum256(out) != h.DstSha256 {
		return nil, ErrFCD1Target
	}
	return out, nil
}
