#!/usr/bin/env node
/* Web paketi (win-app kanalı): kaynak/web/ → cikti/Mahzen-web.zip + kaynak/kabuk/paket.zip (exe'ye gömülür; ikisi aynı dosya).
   Deterministik: dosyalar ada göre sıralı, sabit tarih (1980-01-01), DEFLATE seviye 9 — aynı kaynak her zaman aynı zip'i verir,
   böylece kurulu paket.zip release'teki dosyayla bayt bayt aynıdır ve FCD1 yamaları ona uygulanabilir.
   Pakete version.txt (package.json sürümü) eklenir; index.html'deki APP_VERSION ile aynı olmalı. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const KOK = path.join(__dirname, '..'), SRC = path.join(KOK, 'kaynak', 'web');
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function list(dir, pre) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (e.name.startsWith('.')) continue;
    const rel = pre ? pre + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(list(path.join(dir, e.name), rel)); else out.push(rel);
  }
  return out;
}
function zip(files) {   // files: [[ad, Buffer]]
  const parts = [], central = []; let off = 0;
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00
  for (const [name, data] of files) {
    const nb = Buffer.from(name, 'utf8'), crc = crc32(data);
    const def = zlib.deflateRawSync(data, { level: 9 }), store = def.length >= data.length, body = store ? data : def;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nb, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nb);
    off += 30 + nb.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, end]));
}
function build() {
  const v = JSON.parse(fs.readFileSync(path.join(KOK, 'package.json'), 'utf8')).version;
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  if (!html.includes('const APP_VERSION="' + v + '";')) throw new Error('index.html APP_VERSION ≠ package.json ' + v + ' (node araclar/surum.js)');
  if (!fs.readFileSync(path.join(SRC, 'surum.js'), 'utf8').includes('"version": "' + v + '"')) throw new Error('surum.js eski (node araclar/surum.js)');
  const files = list(SRC, '').map((f) => [f, fs.readFileSync(path.join(SRC, f))]);
  files.push(['version.txt', Buffer.from(v + '\n')]);
  files.sort((a, b) => a[0] < b[0] ? -1 : 1);
  return { v, z: zip(files), n: files.length };
}
if (require.main === module) {
  const { v, z, n } = build();
  fs.mkdirSync(path.join(KOK, 'cikti'), { recursive: true });
  fs.writeFileSync(path.join(KOK, 'cikti', 'Mahzen-web.zip'), z);
  fs.writeFileSync(path.join(KOK, 'kaynak', 'kabuk', 'paket.zip'), z);
  console.log('Mahzen ' + v + ' web paketi: ' + n + ' dosya, ' + z.length + ' bayt, sha256 ' + require('crypto').createHash('sha256').update(z).digest('hex'));
}
module.exports = { build, zip, crc32 };
