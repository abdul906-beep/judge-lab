// Statistics on the collected calls: is the order effect real, and how many
// samples would be needed? No dependencies.
const fs = require('fs');
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
 else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!=='\r')f+=c;}
 if(f||row.length){row.push(f);rows.push(row);}return rows;}
const load=p=>{const [h,...d]=parseCSV(fs.readFileSync(p,'utf8')).filter(r=>r.length>1);
  return d.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));};

const rows=[...load('data/rows-2026-09-15.csv'),...load('data/rows-2026-09-17-shuffled.csv')]
  .filter(r=>r.judgeModel==='gemini-3-flash-preview'&&r.batchName==='round 1');
const calls={}; rows.forEach(r=>(calls[r.callId||r.ts]=calls[r.callId||r.ts]||[]).push(r));
const ok=Object.values(calls).filter(rs=>rs.some(r=>r.parseOk==='true'&&r.target));

// ── helpers ───────────────────────────────────────────────
const lgamma=x=>{ // Lanczos
  const g=[76.18009172947146,-86.50532032941677,24.01409824083091,
           -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let xx=x, y=x, tmp=xx+5.5; tmp-=(xx+0.5)*Math.log(tmp); let ser=1.000000000190015;
  for(let j=0;j<6;j++) ser+=g[j]/++y;
  return -tmp+Math.log(2.5066282746310005*ser/xx);
};
const lchoose=(n,k)=>lgamma(n+1)-lgamma(k+1)-lgamma(n-k+1);
function fisher2x2(a,b,c,d){ // two-tailed
  const n=a+b+c+d, r1=a+b, c1=a+c;
  const p=k=>Math.exp(lchoose(r1,k)+lchoose(n-r1,c1-k)-lchoose(n,c1));
  const obs=p(a); let tot=0;
  const lo=Math.max(0,c1-(n-r1)), hi=Math.min(r1,c1);
  for(let k=lo;k<=hi;k++){ const pk=p(k); if(pk<=obs*1.0000001) tot+=pk; }
  return Math.min(1,tot);
}
function wilson(k,n){ const z=1.96,p=k/n,d=1+z*z/n;
  const c=(p+z*z/(2*n))/d, w=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [c-w,c+w];
}
const asin=p=>2*Math.asin(Math.sqrt(p));

// ── the data ──────────────────────────────────────────────
let ties=0;
const cond={written:{},shuffled:{}}, n={written:0,shuffled:0};
ok.forEach(rs=>{
  const sc=rs.filter(r=>r.target&&r.score!=='').map(r=>({k:r.target,s:+r.score}));
  const top=Math.max(...sc.map(x=>x.s));
  if(sc.filter(x=>x.s===top).length>1) ties++;
  const c=rs[0].order==='0-1-2'?'written':'shuffled';
  const w=rs.find(r=>r.winner).winner;
  n[c]++; cond[c][w]=(cond[c][w]||0)+1;
});

console.log('calls analysed:', ok.length, '| written order:', n.written, '| shuffled:', n.shuffled);
console.log('\n── 1. how often does the critic tie? ──');
const ci=wilson(ties,ok.length);
console.log(`ties: ${ties}/${ok.length} = ${(100*ties/ok.length).toFixed(0)}%`,
            `(95% CI ${(100*ci[0]).toFixed(0)}–${(100*ci[1]).toFixed(0)}%)`);

console.log('\n── 2. does being listed first change v1\'s win rate? ──');
const a=cond.written['v0']||0, b=n.written-a, c=cond.shuffled['v0']||0, d=n.shuffled-c;
console.log(`variant 1 wins: ${a}/${n.written} written (${(100*a/n.written).toFixed(0)}%)`,
            `vs ${c}/${n.shuffled} shuffled (${(100*c/n.shuffled).toFixed(0)}%)`);
const pF=fisher2x2(a,b,c,d);
console.log('Fisher exact, two-tailed p =', pF.toFixed(4), pF<0.05?'→ significant at 0.05':'→ not significant at 0.05');

console.log('\n── 3. how many calls would be needed? ──');
const h=Math.abs(asin(a/n.written)-asin(c/n.shuffled));
const nNeeded=Math.ceil(Math.pow(1.959964+0.8416212,2)/(h*h));
console.log(`observed effect size h = ${h.toFixed(2)} → ${nNeeded} calls per condition for 80% power at p<0.05`);
console.log(`you have ${n.written} and ${n.shuffled}`, (n.written>=nNeeded&&n.shuffled>=nNeeded)?'→ already enough for THIS effect size':'→ short of that');
for(const hw of [0.15,0.10,0.05]){
  console.log(`to pin the tie rate to ±${(100*hw).toFixed(0)} points: ${Math.ceil(1.96*1.96*0.25/(hw*hw))} calls`);
}
const small=[0.20,0.15,0.10];
console.log('\nif the true effect were smaller than what you saw (50% vs X%), calls needed per condition:');
small.forEach(diff=>{
  const hh=Math.abs(asin(0.5)-asin(0.5-diff));
  console.log(`  50% vs ${(100*(0.5-diff)).toFixed(0)}%: ${Math.ceil(Math.pow(2.8016,2)/(hh*hh))} per condition`);
});
console.log('\nnote: one batch and one judge model. These numbers say how many CALLS,');
console.log('not how many batches — generalising across tastes needs several batches.');
