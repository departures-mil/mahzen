#!/usr/bin/env node
/* Go FCD1 uygulayıcısı için test vektörleri: node araclar/fcd1-vektor.js
   araclar/fcdelta.js (= ortak-cekirdek/delta/node/fcdelta.js, cekirdek/VERSION'daki commit) ile üretir →
   kaynak/kabuk/testdata/fcd1/<ad>.{old,new,patch} + bozuk/<ad>.patch + vektorler.json. Deterministiktir. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const fcd = require('./fcdelta.js');
const DIR = path.join(__dirname, '..', 'kaynak', 'kabuk', 'testdata', 'fcd1');
let seed = 4242;
function rnd(n) { const o = Buffer.alloc(n); for (let i = 0; i < n; i += 32) { const h = crypto.createHash('sha256').update('mz' + seed++).digest(); h.copy(o, i, 0, Math.min(32, n - i)); } return o; }
function text(n) { const w = ['mahzen', 'hesap', 'şifre', 'dosya', 'başlık', 'function', 'return', 'const', 'güncelleme', 'falcon']; let s = '', i = 0; while (Buffer.byteLength(s) < n) s += w[(i * 7 + (i >> 2)) % w.length] + (i++ % 11 ? ' ' : '\n'); return Buffer.from(s).subarray(0, n); }
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIR, 'bozuk'), { recursive: true });
  const cases = [];
  const base = rnd(300000), tx = text(200000);
  const put = async (name, a, b) => {
    const p = await fcd.make(a, b);
    if (!fcd.apply(a, p).equals(b)) throw new Error('kendi doğrulaması: ' + name);
    fs.writeFileSync(path.join(DIR, name + '.old'), a); fs.writeFileSync(path.join(DIR, name + '.new'), b); fs.writeFileSync(path.join(DIR, name + '.patch'), p);
    cases.push({ name, old: a.length, new: b.length, patch: p.length });
  };
  await put('bos-abc', Buffer.alloc(0), Buffer.from('abc'));
  await put('ayni', tx, Buffer.from(tx));
  await put('metin-duzenleme', tx, Buffer.concat([tx.subarray(0, 50000), Buffer.from('YENİ SATIR\n'), tx.subarray(50000, 120000), tx.subarray(130000)]));
  await put('ikili-kayma', base, Buffer.concat([rnd(777), base.subarray(0, 100000), rnd(5000), base.subarray(100000, 250000), base.subarray(260000)]));
  await put('tamamen-yeni', rnd(40000), rnd(50000));
  await put('bosalt', rnd(1000), Buffer.alloc(0));
  // bozuk yamalar (kaynak: metin-duzenleme)
  const good = fs.readFileSync(path.join(DIR, 'metin-duzenleme.patch')), bad = [];
  const w = (name, buf, err) => { fs.writeFileSync(path.join(DIR, 'bozuk', name + '.patch'), buf); bad.push({ name, src: 'metin-duzenleme', err }); };
  let b = Buffer.from(good); b[0] = 0x58; w('magic', b, 'FCD1_MAGIC');
  b = Buffer.from(good); b[4] = 0x02; w('codec', b, 'FCD1_CODEC');
  b = Buffer.from(good); b[13] ^= 0xff; w('kaynak-sha', b, 'FCD1_SOURCE');
  w('kisa-baslik', good.subarray(0, 40), 'FCD1_TRUNCATED');
  w('kesik-govde', good.subarray(0, good.length - 20), 'ANY');
  w('fazla-bayt', Buffer.concat([good, Buffer.from([0])]), 'FCD1_CORRUPT');
  b = Buffer.from(good); b[60] ^= 0x01; w('hedef-sha', b, 'FCD1_TARGET');
  // END'siz akış ve END sonrası veri: elle kurulmuş op akışları
  const hdr = (src, dst) => { const h = Buffer.alloc(85); h.write('FCD1'); h[4] = 1; h.writeBigUInt64LE(BigInt(src.length), 5); crypto.createHash('sha256').update(src).digest().copy(h, 13); h.writeBigUInt64LE(BigInt(dst.length), 45); crypto.createHash('sha256').update(dst).digest().copy(h, 53); return h; };
  const oldTx = fs.readFileSync(path.join(DIR, 'metin-duzenleme.old'));
  w('endsiz', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([2, 3, 0x61, 0x62, 0x63]))]), 'FCD1_TRUNCATED');
  w('end-sonrasi', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([2, 3, 0x61, 0x62, 0x63, 0, 9]))]), 'FCD1_CORRUPT');
  w('copy-tasma', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([1, 0x80, 0x80, 0x80, 0x80, 0x01, 3, 0]))]), 'FCD1_CORRUPT');
  w('cikti-tasma', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([2, 4, 0x61, 0x62, 0x63, 0x64, 0]))]), 'FCD1_TARGET');
  w('bilinmeyen-op', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([7, 0]))]), 'FCD1_CORRUPT');
  w('uzun-varint', Buffer.concat([hdr(oldTx, Buffer.from('abc')), zlib.deflateSync(Buffer.from([2, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01, 0]))]), 'FCD1_CORRUPT');
  fs.writeFileSync(path.join(DIR, 'vektorler.json'), JSON.stringify({ uretici: 'ortak-cekirdek/delta/node/fcdelta.js', iyi: cases, bozuk: bad }, null, 1) + '\n');
  console.log(cases.length + ' iyi, ' + bad.length + ' bozuk vektör → ' + DIR);
})().catch((e) => { console.error(e); process.exit(1); });
