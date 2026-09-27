// Test Gemini's explanations against the data already collected.
const fs=require('fs');
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}
 if(f||row.length){row.push(f);rows.push(row);}return rows;}
const load=p=>{const [h,...d]=parseCSV(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);
  return d.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));};
const rows=[...load('data/rows-2026-09-15.csv'),...load('data/rows-2026-09-17-shuffled.csv')]
  .filter(r=>r.judgeModel==='gemini-3-flash-preview'&&r.batchName==='round 1'&&r.target&&r.aes!=='');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;

// ── CLAIM 1: coarse integer scale forces ties, scores cluster at 7-8 ──
console.log('── CLAIM: "models default to safe 7-8 integers, coarse scale causes ties" ──');
const aes={}, nov={};
rows.forEach(r=>{ aes[r.aes]=(aes[r.aes]||0)+1; nov[r.nov]=(nov[r.nov]||0)+1; });
const show=o=>Object.keys(o).map(Number).sort((a,b)=>a-b).map(k=>`${k}:${o[k]}`).join('  ');
console.log('aesthetic scores given:', show(aes));
console.log('novelty scores given: ', show(nov));
const vals=Object.keys(aes).length;
const decimals=Object.keys(aes).filter(k=>+k%1!==0).length;
console.log(`→ ${vals} distinct aesthetic values used, ${decimals} of them non-integer`);

// ── CLAIM 2: primacy bias — position 1 gets favoured by the model ──
console.log('\n── CLAIM: "primacy bias — variant 1 benefited from being shown first" ──');
const vr=rows.filter(r=>r.target==='variant');
const picMean={}; vr.forEach(r=>(picMean[r.variantIndex]=picMean[r.variantIndex]||[]).push(+r.score));
for(const k in picMean) picMean[k]=mean(picMean[k]);
const bySlot={}; vr.forEach(r=>(bySlot[r.position]=bySlot[r.position]||[]).push(+r.score-picMean[r.variantIndex]));
const slots=Object.keys(bySlot).sort();
slots.forEach(s=>console.log(`  slot ${s}: ${mean(bySlot[s])>=0?'+':''}${mean(bySlot[s]).toFixed(2)} (n=${bySlot[s].length})`));
// permutation test: shuffle slot labels within each call
const calls={}; vr.forEach(r=>(calls[r.callId||r.ts]=calls[r.callId||r.ts]||[]).push(r));
const stat=o=>Math.max(...slots.map(s=>Math.abs(mean(o[s]||[0]))));
const obs=stat(bySlot);
let worse=0, N=20000;
for(let i=0;i<N;i++){
  const perm={};
  Object.values(calls).forEach(rs=>{
    const pos=rs.map(r=>r.position).sort(()=>Math.random()-0.5);
    rs.forEach((r,j)=>(perm[pos[j]]=perm[pos[j]]||[]).push(+r.score-picMean[r.variantIndex]));
  });
  if(stat(perm)>=obs) worse++;
}
console.log(`→ permutation test on slot effect: p = ${(worse/N).toFixed(3)}`,
            worse/N<0.05?'(significant)':'(NOT significant — no detectable position effect on the scores themselves)');

// ── CLAIM 3: variant 3 has a real visual advantage that survives shuffling ──
console.log('\n── CLAIM: "variant 3 has a genuine visual advantage" ──');
const v3=vr.filter(r=>r.variantIndex==='2');
const bySlot3={}; v3.forEach(r=>(bySlot3[r.position]=bySlot3[r.position]||[]).push(+r.score));
Object.keys(bySlot3).sort().forEach(s=>
  console.log(`  variant 3 in slot ${s}: mean ${mean(bySlot3[s]).toFixed(2)} (n=${bySlot3[s].length})`));
const others=vr.filter(r=>r.variantIndex!=='2');
console.log(`  variant 3 overall ${mean(v3.map(r=>+r.score)).toFixed(2)} vs others ${mean(others.map(r=>+r.score)).toFixed(2)}`);
