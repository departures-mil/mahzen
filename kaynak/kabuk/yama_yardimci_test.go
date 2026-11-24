package main

import (
	"bytes"
	"compress/zlib"
	"crypto/sha256"
	"encoding/binary"
)

func uvarint(v uint64) []byte { b := make([]byte, binary.MaxVarintLen64); n := binary.PutUvarint(b, v); return b[:n] }

// elleYama: src'nin ilk yarısını COPY, kalanını INSERT eden geçerli bir FCD1 yaması (yalnız test için).
func elleYama(src, dst []byte) []byte {
	var ops bytes.Buffer
	k := len(src) / 2
	if k > len(dst) {
		k = len(dst)
	}
	for k > 0 && !bytes.Equal(src[:k], dst[:k]) {
		k--
	}
	if k > 0 {
		ops.WriteByte(1)
		ops.Write(uvarint(0))
		ops.Write(uvarint(uint64(k)))
	}
	ops.WriteByte(2)
	ops.Write(uvarint(uint64(len(dst) - k)))
	ops.Write(dst[k:])
	ops.WriteByte(0)
	var z bytes.Buffer
	zw, _ := zlib.NewWriterLevel(&z, 9)
	zw.Write(ops.Bytes())
	zw.Close()
	h := make([]byte, 85)
	copy(h, "FCD1")
	h[4] = 1
	binary.LittleEndian.PutUint64(h[5:], uint64(len(src)))
	s := sha256.Sum256(src)
	copy(h[13:], s[:])
	binary.LittleEndian.PutUint64(h[45:], uint64(len(dst)))
	d := sha256.Sum256(dst)
	copy(h[53:], d[:])
	return append(h, z.Bytes()...)
}
