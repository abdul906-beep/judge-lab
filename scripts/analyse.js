// Analyse a Judge Lab CSV correctly: one "call" = all rows sharing a timestamp.
// (The in-panel summary grouped by repeat number, which collides across runs.)
const fs = require('fs');
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');

function parseCSV(t){
  const rows = []; let row = [], field = '', q = false;
  for(let i = 0; i < t.length; i++){
    const c = t[i];
    if(q){
      if(c === '"'){ if(t[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if(c === '"') q = true;
    else if(c === ','){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  return rows;
}

const [header, ...data] = parseCSV(text).filter(r => r.length > 1);
const rows = data.map(r => Object.fromEntries(header.map((h,i) => [h, r[i]])));
const mean = a => a.reduce((s,x)=>s+x,0)/a.length;
const sd = a => a.length<2 ? 0 : Math.sqrt(a.reduce((s,x)=>s+(x-mean(a))**2,0)/(a.length-1));

console.log('rows in file:', rows.length);

// group into calls
const calls = {};
rows.forEach(r => (calls[r.callId || r.ts] = calls[r.callId || r.ts] || []).push(r));
const all = Object.entries(calls).map(([ts, rs]) => ({
  ts, rs,
  batch: rs[0].batchId, name: rs[0].batchName, model: rs[0].judgeModel,
  order: rs[0].order, ok: rs.some(r => r.parseOk === 'true' && r.target),
  err: rs[0].error
}));
console.log('calls attempted:', all.length, '| succeeded:', all.filter(c=>c.ok).length,
            '| failed:', all.filter(c=>!c.ok).length);

// failure breakdown
const fails = {};
all.filter(c=>!c.ok).forEach(c => { const k = (c.err.match(/Gemini (\d+)/)||[])[1] || c.err.slice(0,40); fails[k]=(fails[k]||0)+1; });
console.log('failures by type:', fails);

// per batch x model
const groups = {};
all.filter(c=>c.ok).forEach(c => (groups[c.batch+' | '+c.name+' | '+c.model] = groups[c.batch+' | '+c.name+' | '+c.model] || []).push(c));

for(const [g, cs] of Object.entries(groups)){
  const nVar = Math.max(...cs.flatMap(c => c.rs.filter(r=>r.target==='variant').map(r => +r.variantIndex))) + 1;
  const identity = Array.from({length:nVar},(_,i)=>i).join('-');
  const fixed = cs.filter(c => c.order === identity), shuffled = cs.filter(c => c.order !== identity);
  console.log('\n══════ ' + g + ' ══════');
  console.log('successful calls:', cs.length, '(fixed order:', fixed.length, '| shuffled:', shuffled.length + ')');

  for(const [label, set] of [['FIXED ORDER', fixed], ['SHUFFLED', shuffled]]){
    if(!set.length) continue;
    console.log('\n  ' + label + ' — ' + set.length + ' calls');
    const byT = {};
    set.forEach(c => c.rs.forEach(r => { if(!r.target) return;
      const k = r.target==='parent' ? 'parent' : 'v'+r.variantIndex;
      (byT[k] = byT[k] || []).push(+r.score); }));
    console.log('  picture   n    mean    SD    min   max');
    Object.keys(byT).sort().forEach(k => { const a = byT[k];
      console.log('  ' + k.padEnd(8) + String(a.length).padStart(3) + mean(a).toFixed(2).padStart(8)
        + sd(a).toFixed(2).padStart(6) + String(Math.min(...a)).padStart(6) + String(Math.max(...a)).padStart(6)); });

    // winners, ties, and who wins ties
    const winners = {}; let ties = 0; const tieWins = {}; const tieDetail = {};
    set.forEach(c => {
      const scored = c.rs.filter(r => r.target && r.score !== '').map(r => ({
        k: r.target==='parent' ? 'parent' : 'v'+r.variantIndex, s: +r.score, pos: +r.position }));
      const top = Math.max(...scored.map(x=>x.s));
      const atTop = scored.filter(x => x.s === top);
      const w = c.rs.find(r => r.winner).winner;
      winners[w] = (winners[w]||0) + 1;
      if(atTop.length > 1){
        ties++;
        tieWins[w] = (tieWins[w]||0) + 1;
        const who = atTop.map(x=>x.k+'@slot'+x.pos).join(' = ');
        tieDetail[who] = (tieDetail[who]||0) + 1;
      }
    });
    const top = Object.entries(winners).sort((a,b)=>b[1]-a[1]);
    console.log('  winners:', winners,
      '→ modal', top[0][0], (100*top[0][1]/set.length).toFixed(0)+'%',
      '| changed', set.length - top[0][1], 'of', set.length);
    console.log('  calls with a tie for top score:', ties, 'of', set.length);
    if(ties){ console.log('  tie winners:', tieWins); console.log('  tied candidates:', tieDetail); }
    const bestMean = Object.entries(byT).filter(([k])=>k!=='parent').sort((a,b)=>mean(b[1])-mean(a[1]))[0];
    console.log('  highest mean variant:', bestMean[0], mean(bestMean[1]).toFixed(2),
      '| modal winner:', top[0][0], bestMean[0]===top[0][0] ? '(same)' : '(DIFFERENT)');
  }
}
