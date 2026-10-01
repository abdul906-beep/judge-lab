/* Judge Lab — core logic (no DOM, no network) so it can be unit-tested.
   Mirrors logo-evolution-lab.html exactly where it matters:
   - score = aestheticScore + noveltyScore * 0.5      (buildPool, line 1503)
   - Image 0 is always the parent, novelty forced to 0 (CRITIC_SYS, line 1267) */

function jlMean(a){ return a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN; }
function jlSD(a){
  if(a.length<2) return 0;
  const m=jlMean(a);
  return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1)); // sample SD
}
function jlScore(aes,nov){ return aes + nov*0.5; }

/* An "order" is an array of original variant indices in the sequence they are
   shown to the judge. order=[2,0,1] means presented Image 1 is variant 2. */
function jlIdentityOrder(n){ return Array.from({length:n},(_,i)=>i); }
function jlShuffled(n, rnd){
  const a=jlIdentityOrder(n);
  for(let i=a.length-1;i>0;i--){ const j=Math.floor((rnd?rnd():Math.random())*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
/* Judge replies with imageNumber = presented position (0 = parent, 1..n = variants).
   Map each evaluation back to the original variant index. */
function jlMapEvaluations(evaluations, order){
  const out=[];
  for(const ev of evaluations||[]){
    const pos=Number(ev.imageNumber);
    if(!Number.isFinite(pos)) continue;
    const aes=Number(ev.aestheticScore), nov=Number(ev.noveltyScore);
    if(pos===0){
      out.push({target:'parent', variantIndex:null, position:0,
                aes:Number.isFinite(aes)?aes:null, nov:0,
                score:Number.isFinite(aes)?jlScore(aes,0):null, reason:ev.reason||''});
    } else {
      const vi=order[pos-1];
      if(vi===undefined) continue;
      out.push({target:'variant', variantIndex:vi, position:pos,
                aes:Number.isFinite(aes)?aes:null,
                nov:Number.isFinite(nov)?nov:null,
                score:(Number.isFinite(aes)&&Number.isFinite(nov))?jlScore(aes,nov):null,
                reason:ev.reason||''});
    }
  }
  return out;
}
/* Which candidate would the app have picked? Deterministic mode = highest score.
   Ties resolved to the earliest, matching the app's reduce(). */
function jlWinnerOf(mapped){
  let best=null;
  for(const m of mapped){
    if(m.score===null) continue;
    if(!best || m.score>best.score) best=m;
  }
  if(!best) return null;
  return best.target==='parent' ? 'parent' : 'v'+best.variantIndex;
}
/* Per-target spread across repeats of an identical batch. */
function jlStats(rows){
  const byTarget={};
  for(const r of rows){
    const key = r.target==='parent' ? 'parent' : 'v'+r.variantIndex;
    (byTarget[key] = byTarget[key] || {aes:[],nov:[],score:[],positions:[]});
    if(r.aes!==null) byTarget[key].aes.push(r.aes);
    if(r.nov!==null) byTarget[key].nov.push(r.nov);
    if(r.score!==null) byTarget[key].score.push(r.score);
    byTarget[key].positions.push(r.position);
  }
  const out={};
  for(const k in byTarget){
    const b=byTarget[k];
    out[k]={n:b.score.length, aesMean:jlMean(b.aes), aesSD:jlSD(b.aes),
            novMean:jlMean(b.nov), novSD:jlSD(b.nov),
            scoreMean:jlMean(b.score), scoreSD:jlSD(b.score),
            scoreMin:Math.min(...b.score), scoreMax:Math.max(...b.score)};
  }
  return out;
}
/* How often does the identical batch produce a different winner? */
function jlWinnerStability(winners){
  const counts={};
  winners.filter(Boolean).forEach(w=>counts[w]=(counts[w]||0)+1);
  const total=winners.filter(Boolean).length;
  let topW=null, topN=0;
  for(const w in counts) if(counts[w]>topN){topN=counts[w];topW=w;}
  return {counts, total, modalWinner:topW,
          modalShare: total?topN/total:NaN,
          changed: total?total-topN:0,
          distinctWinners:Object.keys(counts).length};
}
/* Does presented position predict score, independent of which picture it is?
   Mean score per position, and mean score per position after subtracting each
   picture's own mean (so a good picture landing in slot 1 does not fake an effect). */
function jlPositionEffect(rows){
  const pictureMean={};
  const byPic={};
  rows.forEach(r=>{ if(r.score===null)return;
    const k=r.target==='parent'?'parent':'v'+r.variantIndex;
    (byPic[k]=byPic[k]||[]).push(r.score); });
  for(const k in byPic) pictureMean[k]=jlMean(byPic[k]);
  const byPos={}, byPosAdj={};
  rows.forEach(r=>{ if(r.score===null||r.position===0)return;
    const k=r.target==='parent'?'parent':'v'+r.variantIndex;
    (byPos[r.position]=byPos[r.position]||[]).push(r.score);
    (byPosAdj[r.position]=byPosAdj[r.position]||[]).push(r.score-pictureMean[k]); });
  const out={};
  for(const p in byPos) out[p]={n:byPos[p].length, mean:jlMean(byPos[p]),
                                adjustedMean:jlMean(byPosAdj[p])};
  return out;
}
/* Judge agreement: Pearson r over the scores two judges gave the same pictures. */
function jlCorrelation(x,y){
  const n=Math.min(x.length,y.length);
  if(n<2) return NaN;
  const mx=jlMean(x.slice(0,n)), my=jlMean(y.slice(0,n));
  let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){ const a=x[i]-mx,b=y[i]-my; num+=a*b; dx+=a*a; dy+=b*b; }
  return (dx===0||dy===0) ? NaN : num/Math.sqrt(dx*dy);
}
/* Same-company favouritism: each judge's deviation from the panel average for
   the same picture, split by which company's model made that picture.
   Deviation from the panel cancels out real quality differences. */
function jlFavouritism(rows){
  const panel={};
  rows.forEach(r=>{ if(r.score===null)return;
    const k=r.batchId+'|'+(r.target==='parent'?'parent':'v'+r.variantIndex);
    (panel[k]=panel[k]||[]).push(r.score); });
  const panelMean={}; for(const k in panel) panelMean[k]=jlMean(panel[k]);
  const out={};
  rows.forEach(r=>{ if(r.score===null||!r.makerCompany||!r.judgeCompany)return;
    const k=r.batchId+'|'+(r.target==='parent'?'parent':'v'+r.variantIndex);
    const dev=r.score-panelMean[k];
    const cell=r.judgeCompany+' judging '+r.makerCompany;
    (out[cell]=out[cell]||{devs:[],same:r.judgeCompany===r.makerCompany}).devs.push(dev); });
  const summary={};
  for(const c in out) summary[c]={n:out[c].devs.length, meanDeviation:jlMean(out[c].devs),
                                  sameCompany:out[c].same};
  return summary;
}
function jlCSV(rows, columns){
  const cols=columns||Object.keys(rows[0]||{});
  const esc=v=>{ const s=v===null||v===undefined?'':String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  return [cols.join(',')].concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
}
/* ── evolution A/B ──────────────────────────────────────────────
   jlPickWinner mirrors selectWinner in "Best" mode. With fairTie off it is the
   app rule (strict >, so the earliest candidate keeps a tie); with fairTie on,
   one of the candidates sharing the top score is chosen at random.
   Returns an index into candidates, or -1 if none has a score above 0. */
function jlPickWinner(candidates, fairTie, rnd){
  let best=-1;
  candidates.forEach((c,i)=>{ if(c.score>0 && (best<0 || c.score>candidates[best].score)) best=i; });
  if(best<0 || !fairTie) return best;
  const top=candidates[best].score;
  const tied=candidates.map((c,i)=>c.score===top?i:-1).filter(i=>i>=0);
  return tied[Math.floor((rnd?rnd():Math.random())*tied.length)];
}
/* One evolution round, as the app saw it. pool[0] is normally the Parent. */
function jlRoundSummary(pool, winnerIdx){
  const scored=pool.map((c,i)=>({i,score:c.score})).filter(c=>c.score>0);
  const sorted=scored.map(c=>c.score).sort((a,b)=>b-a);
  const top=sorted.length?sorted[0]:null, second=sorted.length>1?sorted[1]:null;
  const atTop=scored.filter(c=>c.score===top);
  const w=pool[winnerIdx]||{};
  const isParent=c=>c.title==='Parent';
  const vars=pool.filter(c=>!isParent(c));
  return {
    candidates: pool.length,
    parentScore: (pool.find(isParent)||{score:''}).score,
    variantScores: vars.map(c=>+(+c.score).toFixed(3)).join('/'),
    best: top===null?'':+top.toFixed(3), second: second===null?'':+second.toFixed(3),
    gap: (top!==null&&second!==null) ? +(top-second).toFixed(3) : '',
    tiedAtTop: atTop.length>1,
    tieWentToFirstListed: atTop.length>1 && winnerIdx===atTop[0].i,
    winner: w.title||'',
    parentKept: isParent(w),
    winnerAes: w.aes, winnerNov: w.nov, winnerScore: w.score,
    decimalsUsed: vars.some(c=>Number.isFinite(c.aes)&&c.aes%1!==0),
    criticFailed: pool.some(c=>/critic failed|not scored/.test(c.reason||''))
  };
}
if (typeof module!=='undefined') module.exports={jlPickWinner,jlRoundSummary,jlMean,jlSD,jlScore,jlIdentityOrder,
  jlShuffled,jlMapEvaluations,jlWinnerOf,jlStats,jlWinnerStability,jlPositionEffect,
  jlCorrelation,jlFavouritism,jlCSV};
