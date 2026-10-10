// Analysis of the "different model as critic" runs: pools one or more
// (evolution CSV, finals CSV) pairs. Usage:
//   node critic-model.js evoA.csv finalsA.csv [evoB.csv finalsB.csv ...]
const fs = require('fs');
function parse(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
  else if(c==='"')q=true;else if(c===','){r.push(f);f=''}
  else if(c==='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!=='\r')f+=c}
  if(f||r.length){r.push(f);rows.push(r)}return rows}
const load = f => { const rows=parse(fs.readFileSync(f,'utf8')); const h=rows[0];
  return rows.slice(1).filter(r=>r.length===h.length).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); };
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN;
const tok = s => s.replace(/\s+/g,' ').trim().split(' ');
function lev(a,b){let p=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){const c=[i];
  for(let j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
const change = (a,b) => { const x=tok(a), y=tok(b); return lev(x,y)/Math.max(x.length,y.length); };

const args = process.argv.slice(2);
if(args.length < 2 || args.length % 2){ console.error('usage: node critic-model.js evo.csv finals.csv [...]'); process.exit(1); }
let evo=[], fin=[], judged=[];
for(let i=0;i<args.length;i+=2){
  const set = 'set' + (i/2+1);
  load(args[i]).forEach(r => { r.set=set; evo.push(r); });
  fs.readFileSync(args[i],'utf8').split('\n').filter(l=>l.startsWith('# final')).forEach(l => {
    const m=l.match(/v(\d+) of batch (\w+) = (\w+), run (\d+) \((\d+) rounds\), taste: (.*)/);
    fin.push({set, v:m[1], b:m[2], arm:m[3], run:m[4], taste:m[6].trim()}); });
  load(args[i+1]).forEach(r => { if(r.target==='variant' && r.parseOk==='true') judged.push(r); });
}
const armOf = {}; fin.forEach(f => armOf[f.b+'|'+f.v] = f.arm);
judged = judged.filter(r => armOf[r.batchId+'|'+r.variantIndex]);
const label = {original:'same model as critic', enhanced:'other model as critic'};
console.log('critics:', [...new Set(evo.map(r=>r.arm+' = '+r.criticModel))].join(' ; '), '| generator', [...new Set(evo.map(r=>r.model))].join(','));

console.log('\nDuring the runs');
for(const arm of ['original','enhanced']){
  const rs = evo.filter(r=>r.arm===arm); const R = Math.max(...rs.map(r=>+r.round));
  const g = {}; rs.forEach(r => { const k=r.set+'|'+r.taste+'|'+r.run; (g[k]=g[k]||[]).push(r); });
  const st = {};
  for(const x of Object.values(g)){ x.sort((a,b)=>a.round-b.round); let prev='FD 100';
    for(const r of x){ (st[r.round]=st[r.round]||[]).push(change(prev,r.winnerCode)); prev=r.winnerCode; } }
  console.log(' '+label[arm]+': rounds '+rs.length+', ties '+rs.filter(r=>r.tiedAtTop==='true').length
    +', parent kept '+rs.filter(r=>r.parentKept==='true').length
    +'\n    parent aesthetic by round 2..'+R+': '+Array.from({length:R-1},(_,i)=>mean(rs.filter(r=>+r.round===i+2).map(r=>+r.parentScore)).toFixed(1)).join(' ')
    +'\n    share of program changed by round: '+Array.from({length:R},(_,i)=>mean(st[i+1]).toFixed(2)).join(' '));
}

console.log('\nFinal pictures, by judge (mean aesthetic; in how many calls the best picture came from each version)');
const judges = [...new Set(judged.map(r=>r.judgeModel))];
const pairKey = f => f.set+'|'+f.taste+'|'+f.run;
const pairs = [...new Set(fin.map(pairKey))];
const pairDiff = (jm) => pairs.map(k => {
  const of = arm => { const f=fin.find(x=>pairKey(x)===k && x.arm===arm); if(!f) return NaN;
    return mean(judged.filter(r=>(!jm||r.judgeModel===jm) && r.batchId===f.b && r.variantIndex===f.v).map(r=>+r.aes)); };
  return of('enhanced') - of('original'); }).filter(x=>!isNaN(x));
function signFlip(d){ const n=d.length, obs=Math.abs(mean(d)); let c=0, tot=0;
  if(n<=20){ for(let m=0;m<(1<<n);m++){ let s=0; for(let i=0;i<n;i++) s+=(m>>i&1?1:-1)*d[i]; tot++; if(Math.abs(s/n)>=obs-1e-12) c++; } }
  return c/tot; }
for(const jm of judges){
  const rs = judged.filter(r=>r.judgeModel===jm); const calls = {};
  rs.forEach(r => calls[r.callId] = armOf[r.batchId+'|'+String(r.winner).slice(1)]);
  const a = arm => mean(rs.filter(r=>armOf[r.batchId+'|'+r.variantIndex]===arm).map(r=>+r.aes)).toFixed(2);
  const w = arm => Object.values(calls).filter(x=>x===arm).length;
  const d = pairDiff(jm);
  console.log(' '+jm.padEnd(28)+' same '+a('original')+'  other '+a('enhanced')+'  | best from same '+w('original')+', other '+w('enhanced')+' of '+Object.keys(calls).length
    +'  | pairs favouring other '+d.filter(x=>x>0).length+' of '+d.length+', mean diff '+mean(d).toFixed(2)+', p '+signFlip(d).toFixed(3));
}
const d = pairDiff(null);
console.log('\nAll judges together, per pair of runs (other minus same): '+d.map(x=>x.toFixed(2)).join(' '));
console.log('mean '+mean(d).toFixed(2)+', favouring other '+d.filter(x=>x>0).length+' of '+d.length+', sign-flip p = '+signFlip(d).toFixed(4));
console.log('\nBy taste (other minus same, all judges):');
for(const t of [...new Set(fin.map(f=>f.taste))]){
  const ks = pairs.filter(k=>k.split('|')[1]===t);
  const dd = ks.map(k => { const of = arm => { const f=fin.find(x=>pairKey(x)===k && x.arm===arm); return mean(judged.filter(r=>r.batchId===f.b && r.variantIndex===f.v).map(r=>+r.aes)); }; return of('enhanced')-of('original'); });
  console.log('  '+t.slice(0,30).padEnd(30)+' '+dd.map(x=>x.toFixed(2)).join(' ')+'  mean '+mean(dd).toFixed(2));
}
