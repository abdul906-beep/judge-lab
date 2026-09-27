// What if the app broke ties at random instead of keeping the first candidate?
// Uses only the scores already collected: no new API calls.
const fs=require('fs');
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}
 if(f||row.length){row.push(f);rows.push(row);}return rows;}
const load=p=>{const [h,...d]=parseCSV(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);return d.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));};
const rows=[...load('data/rows-2026-09-15.csv'),...load('data/rows-2026-09-17-shuffled.csv')]
  .filter(r=>r.judgeModel==='gemini-3-flash-preview'&&r.batchName==='round 1');
const calls={};rows.forEach(r=>(calls[r.callId||r.ts]=calls[r.callId||r.ts]||[]).push(r));
const okAll=Object.values(calls).filter(rs=>rs.some(r=>r.parseOk==='true'&&r.target));
const ok=process.argv[2]==='written'?okAll.filter(rs=>rs[0].order==='0-1-2'):okAll;
const name=k=>k==='parent'?'parent':'variant '+(+k.slice(1)+1);

const first={}, random={};
ok.forEach(rs=>{
  const sc=rs.filter(r=>r.target&&r.score!=='').map(r=>({k:r.target==='parent'?'parent':'v'+r.variantIndex,s:+r.score,pos:+r.position}));
  const top=Math.max(...sc.map(x=>x.s));
  const atTop=sc.filter(x=>x.s===top).sort((a,b)=>a.pos-b.pos);
  const f=name(atTop[0].k); first[f]=(first[f]||0)+1;                       // app's rule
  atTop.forEach(x=>{const n=name(x.k); random[n]=(random[n]||0)+1/atTop.length;}); // expected under random
});
const fmt=o=>Object.keys(o).sort().map(k=>k+': '+(typeof o[k]==='number'&&o[k]%1?o[k].toFixed(1):o[k])+' ('+(100*o[k]/ok.length).toFixed(0)+'%)').join('   ');
console.log('calls:',ok.length);
console.log('\napp rule (earliest keeps a tie):\n  '+fmt(first));
console.log('\nrandom tie-break (expected wins):\n  '+fmt(random));
