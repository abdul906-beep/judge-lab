const fs=require('fs');
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}
 if(f||row.length){row.push(f);rows.push(row);}return rows;}
const load=p=>{const [h,...d]=parseCSV(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);
  return d.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));};
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sd=a=>a.length<2?0:Math.sqrt(a.reduce((s,x)=>s+(x-mean(a))**2,0)/(a.length-1));

function summarise(label, rows){
  rows = rows.filter(r=>r.batchName==='round 1' && r.judgeModel==='gemini-3-flash-preview');
  const calls={}; rows.forEach(r=>(calls[r.callId||r.ts]=calls[r.callId||r.ts]||[]).push(r));
  const ok=Object.values(calls).filter(rs=>rs.some(r=>r.parseOk==='true'&&r.target));
  let ties=0; const win={}; const aesVals={}; let decimals=0, total=0;
  ok.forEach(rs=>{
    const sc=rs.filter(r=>r.target&&r.score!=='').map(r=>({k:r.target==='parent'?'parent':'v'+r.variantIndex,s:+r.score}));
    const top=Math.max(...sc.map(x=>x.s));
    if(sc.filter(x=>x.s===top).length>1) ties++;
    const w=rs.find(r=>r.winner).winner; win[w]=(win[w]||0)+1;
    rs.filter(r=>r.target&&r.aes!=='').forEach(r=>{ aesVals[r.aes]=(aesVals[r.aes]||0)+1; total++; if(+r.aes%1!==0) decimals++; });
  });
  const vr={}; ok.forEach(rs=>rs.filter(r=>r.target==='variant').forEach(r=>(vr['v'+r.variantIndex]=vr['v'+r.variantIndex]||[]).push(+r.score)));
  const top=Object.entries(win).sort((a,b)=>b[1]-a[1])[0];
  console.log('\n══ '+label+' ══');
  console.log('successful calls:', ok.length);
  console.log('ties for top score: '+ties+'/'+ok.length+' = '+(100*ties/ok.length).toFixed(0)+'%');
  console.log('winners:', win, '→ modal '+top[0]+' '+(100*top[1]/ok.length).toFixed(0)+'%');
  console.log('distinct aesthetic values used:', Object.keys(aesVals).length,
              '| non-integer scores:', decimals+'/'+total);
  Object.keys(vr).sort().forEach(k=>console.log('  '+k+': mean '+mean(vr[k]).toFixed(2)+'  SD '+sd(vr[k]).toFixed(2)));
}
const oldRows=[...load('data/rows-2026-09-15.csv'),...load('data/rows-2026-09-17-shuffled.csv')]
  .filter(r=>r.order==='0-1-2');   // written order only, to match today's run
summarise('INTEGER SCALE (app default), written order', oldRows);
summarise('ONE DECIMAL PLACE, written order', load('data/rows-2026-09-20-decimals.csv').filter(r=>r.order==='0-1-2'));
