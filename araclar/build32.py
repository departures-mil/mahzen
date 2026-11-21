#!/usr/bin/env python3
"""Mahzen 3.2: mahzen-3.1.html -> mahzen-3.2.html
- update download progress: no longer one long line that wraps mid-phrase.
  Shown as a tidy grid of labelled boxes (percent, downloaded/total, left, speed, time left);
  each box stays whole and boxes move to the next row as a unit on narrow screens.
- numbers use the language's decimal mark (tr: 1,55), RTL-safe for Arabic."""
import pathlib, sys
src = sys.argv[1] if len(sys.argv) > 1 else "mahzen-3.1.html"
out = pathlib.Path(src).read_text(encoding="utf-8")
n = 0
def rep(old, new, count=1):
    global out, n
    assert out.count(old) == count, ("pattern count mismatch", old[:80], out.count(old))
    out = out.replace(old, new)
    n += 1

rep('const APP_VERSION="3.1";', 'const APP_VERSION="3.2";')

# --- CSS
rep('.updprog i{display:block;height:100%;width:0;background:var(--pri-1);transition:width .2s}',
'''.updprog i{display:block;height:100%;width:0;background:var(--pri-1);transition:width .2s}
.updstat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
.updstat>div{background:var(--alt);border-radius:10px;padding:8px 10px;min-width:0}
.updstat small{display:block;font-size:11px;color:var(--ink-2);white-space:nowrap}
.updstat b{display:block;font-size:15px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;margin-top:2px}
.updstat .big,.updstat .wide{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.updstat .big b{font-size:22px;margin:0}
.updstat .wide b{margin:0}
@media(max-width:400px){.updstat{grid-template-columns:repeat(2,minmax(0,1fr))}.updstat>div:last-child{grid-column:1/-1;display:flex;align-items:baseline;justify-content:space-between;gap:10px}.updstat>div:last-child b{margin:0}}''')

# --- markup: one-line text -> grid
rep('''  <div class="ver hidden" id="updProgTxt" style="margin-top:6px;font-size:13px;color:var(--ink-2)" dir="ltr"></div>''',
'''  <div class="updstat hidden" id="updProgTxt">
    <div class="big"><small data-i="upPct"></small><b id="upPct"></b></div>
    <div class="wide"><small data-i="upDone"></small><b id="upDone"></b></div>
    <div><small data-i="upLeft"></small><b id="upLeft"></b></div>
    <div><small data-i="upSpeed"></small><b id="upSpeed"></b></div>
    <div><small data-i="upEta"></small><b id="upEta"></b></div>
  </div>''')

# --- strings
rep('updProg:"%{p} · {d} / {t} MB · kalan {r} MB · {s}",updProgNoTot:"{d} MB · {s}",',
    'upPct:"Tamamlanan",upDone:"İndirilen",upLeft:"Kalan",upSpeed:"Hız",upEta:"Kalan süre",upSec:"{n} sn",upMin:"{m} dk {n} sn",pctFmt:"%{p}",')
rep('updProg:"{p}% · {d} / {t} MB · {r} MB left · {s}",updProgNoTot:"{d} MB · {s}",',
    'upPct:"Completed",upDone:"Downloaded",upLeft:"Left",upSpeed:"Speed",upEta:"Time left",upSec:"{n} s",upMin:"{m} min {n} s",pctFmt:"{p}%",')
rep('updProg:"{p}% · {d} / {t} MB · متبقٍ {r} MB · {s}",updProgNoTot:"{d} MB · {s}",',
    'upPct:"المكتمل",upDone:"تم تنزيله",upLeft:"المتبقي",upSpeed:"السرعة",upEta:"الوقت المتبقي",upSec:"{n} ث",upMin:"{m} د {n} ث",pctFmt:"{p}%",')

# --- progress renderer
i = out.index('function updProgress(done,total,t0){')
j = out.index('/* parts are fetched one by one', i)
out = out[:i] + '''function updProgress(done,total,t0){
  const loc=lang==="tr"?"tr-TR":lang==="ar"?"ar":"en-US";
  const iso=x=>"\\u2066"+x+"\\u2069";
  const num=(x,d)=>x.toLocaleString(loc==="ar"?"en-US":loc,{minimumFractionDigits:d,maximumFractionDigits:d});
  const mb=x=>num(x/1048576,2)+" MB";
  const el=(Date.now()-t0)/1000,sp=el>0.05?done/el:0;
  const ps=lang==="tr"?"/sn":"/s";
  const spd=sp<=0?"—":iso(sp>=1048576?num(sp/1048576,2)+" MB"+ps:num(sp/1024,0)+" KB"+ps);
  const bar=$("#updProg"),box=$("#updProgTxt");bar.classList.remove("hidden");box.classList.remove("hidden");
  const has=total>0,d=has?Math.min(done,total):done,p=has?Math.min(100,Math.floor(d*100/total)):null;
  bar.firstElementChild.style.width=(has?p:50)+"%";
  $("#upPct").textContent=has?t("pctFmt",{p:"\\u2066"+p+"\\u2069"}):"—";
  $("#upDone").textContent=iso(has?mb(d)+" / "+mb(total):mb(d));
  $("#upLeft").textContent=has?iso(mb(total-d)):"—";
  $("#upSpeed").textContent=spd;
  let eta="—";if(has&&d>=total)eta=t("upSec",{n:0});else if(has&&sp>0){const r=Math.max(0,Math.ceil((total-d)/sp));eta=r>=60?t("upMin",{m:Math.floor(r/60),n:r%60}):t("upSec",{n:r})}
  $("#upEta").textContent=eta}
''' + out[j:]
n += 1

pathlib.Path(src.replace("3.1", "3.2")).write_text(out, encoding="utf-8")
print("ok, replacements:", n, "bytes:", len(out.encode()))
