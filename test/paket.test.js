// Web paketi: deterministik zip, içerik, FCD1 test vektörleri (Node referans uygulayıcısıyla).
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const K = path.join(__dirname, '..');
const paket = require('../araclar/paket.js'), fcd = require('../araclar/fcdelta.js');

function entries(z) {   // merkezi dizinden ad listesi + içerik
  const end = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = z.readUInt16LE(end + 10); let p = z.readUInt32LE(end + 16); const out = {};
  for (let i = 0; i < n; i++) {
    const meth = z.readUInt16LE(p + 10), csz = z.readUInt32LE(p + 20), nl = z.readUInt16LE(p + 28), el = z.readUInt16LE(p + 30), cl = z.readUInt16LE(p + 32), lo = z.readUInt32LE(p + 42);
    const name = z.subarray(p + 46, p + 46 + nl).toString();
    const lnl = z.readUInt16LE(lo + 26), lel = z.readUInt16LE(lo + 28), body = z.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csz);
    out[name] = meth === 8 ? zlib.inflateRawSync(body) : body;
    p += 46 + nl + el + cl;
  }
  return out;
}

test('paket deterministik ve doğru içerikte', () => {
  const a = paket.build(), b = paket.build();
  assert.ok(a.z.equals(b.z), 'aynı kaynak → aynı zip');
  const e = entries(a.z);
  assert.equal(e['version.txt'].toString().trim(), a.v);
  for (const f of ['index.html', 'surum.js', 'kabuk-fc.js', 'kabuk-fc.css', 'cekirdek/fc-core.js', 'cekirdek/css/tokens.css', 'cekirdek/css/core.css', 'cekirdek/fonts/inter-latin-400-normal.woff2'])
    assert.ok(e[f], 'pakette yok: ' + f);
  assert.ok(e['index.html'].toString().includes('<script src="kabuk-fc.js"></script>'));
  assert.equal(paket.crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('FCD1 test vektörleri Node referansıyla da doğrulanır', () => {
  const D = path.join(K, 'kaynak/kabuk/testdata/fcd1'), v = JSON.parse(fs.readFileSync(path.join(D, 'vektorler.json'), 'utf8'));
  for (const c of v.iyi) assert.ok(fcd.apply(fs.readFileSync(path.join(D, c.name + '.old')), fs.readFileSync(path.join(D, c.name + '.patch'))).equals(fs.readFileSync(path.join(D, c.name + '.new'))), c.name);
  for (const c of v.bozuk) assert.throws(() => fcd.apply(fs.readFileSync(path.join(D, c.src + '.old')), fs.readFileSync(path.join(D, 'bozuk', c.name + '.patch'))), c.name);
});

test('paketten pakete yama (CI release adımının aynısı) Go/Node ortak biçimde', async () => {
  const a = paket.build().z;
  const e = entries(a);
  e['index.html'] = Buffer.from(e['index.html'].toString().replace('</body>', '<!-- 3.9.1 --></body>'));
  e['version.txt'] = Buffer.from('3.9.1\n');
  const b = paket.zip(Object.keys(e).sort().map((k) => [k, e[k]]));
  const p = await fcd.make(a, b);
  assert.ok(fcd.apply(a, p).equals(b));
  assert.ok(p.length < b.length * 0.7, 'yama küçük olmalı: ' + p.length + ' / ' + b.length);
});
