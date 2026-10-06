// How big is each evolutionary step? For every run in an evolution CSV, compares
// each round's winning program with the previous round's (token-level edit
// distance divided by the longer program's length). No API calls.
// Usage: node step-size.js data/evolution-2026-10-05-mondrian-g38.csv
const fs = require('fs');
function parse(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"')q=true;else if(c===','){r.push(f);f=''}
  else if(c==='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!=='\r')f+=c}
  if(f||r.length){r.push(f);rows.push(r)}return rows}
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN;
const tok = s => s.replace(/\s+/g,' ').trim().split(' ');
function lev(a,b){let p=Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++){const c=[i];
    for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}
  return p[b.length]}
const change = (a,b) => { const x=tok(a), y=tok(b); return lev(x,y)/Math.max(x.length,y.length); };

const file = process.argv[2];
if(!file){ console.error('usage: node step-size.js <evolution csv> [start program]'); process.exit(1); }
const start = process.argv[3] || 'FD 100';
const rows = parse(fs.readFileSync(file,'utf8'));
const h = rows[0];
const data = rows.slice(1).filter(r=>r.length===h.length).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
const runs = {};
data.forEach(r => { const k=r.taste+'|'+r.arm+'|'+r.run; (runs[k]=runs[k]||[]).push(r); });
const step={}, len={}, nov={};
for(const g of Object.values(runs)){
  g.sort((a,b)=>a.round-b.round); let prev=start;
  for(const r of g){ const k=r.arm+'|'+r.round;
    (step[k]=step[k]||[]).push(change(prev,r.winnerCode));
    (len[k]=len[k]||[]).push(tok(r.winnerCode).length);
    (nov[k]=nov[k]||[]).push(+r.winnerNov); prev=r.winnerCode; } }
const R = Math.max(...data.map(r=>+r.round));
const line = (o,arm,d) => Array.from({length:R},(_,i)=>mean(o[arm+'|'+(i+1)]||[]).toFixed(d)).join('  ');
console.log(file + '  (' + Object.keys(runs).length + ' runs, rounds 1 to ' + R + ')');
for(const arm of ['original','enhanced']){
  console.log(arm);
  console.log('  share of the program changed : ' + line(step,arm,2));
  console.log('  program length in tokens     : ' + line(len,arm,0));
  console.log("  critic's novelty score       : " + line(nov,arm,1));
}
