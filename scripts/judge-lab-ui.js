/* Judge Lab — runtime layer: rendering, API calls, experiment runners, UI.
   Depends on the host app's globals: compileLogo, autoFitQueue, renderQueue,
   canvasB64, parseCritiqueJSON, CRITIC_SYS, callClaude, isArtifact
   and on JLCore (judge-lab-core.js). */
(function(){
'use strict';

const JL = {
  batches: [],
  rows: [],
  judges: [{id:'J1', company:'google', provider:'gemini', model:'gemini-3-flash-preview', key:''}],
  abort: false,
  running: false,
  delayMs: 1200
};
window.JL = JL;

const COMPANY_OF = {gemini:'google', openai:'openai', claude:'anthropic'};

/* ── rendering ─────────────────────────────────────────────── */
function jlRenderB64(code, size){
  size = size || 400;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.id = 'jl_tmp_' + Math.random().toString(36).slice(2);
  const res = compileLogo(code, size, size);
  const rawQ = res.queue || res;
  const q = autoFitQueue(rawQ, size, size);
  renderQueue(c, q, 0);                 // 0 = draw instantly, synchronously
  return canvasB64(c);
}

/* ── the critic message, copied from agentCritique (images mode) ── */
function jlBuildCriticUser(taste, iter, nImages){
  return 'Aesthetic taste: "' + taste + '"\nIteration: ' + iter + '\n\n'
    + 'Seeing ' + nImages + ' images. Image 0 = parent/base, Images 1-' + (nImages-1) + ' = variants.'
    + '\nScore purely on visual appearance — judge only what you see.'
    + '\nSuggest one specific visual improvement for the next iteration.';
}

/* If a judge row has no key of its own, borrow the one already typed into the
   app API PROVIDER panel — saves pasting the same key twice. */
function jlKeyFor(judge){
  if(judge.key) return judge.key;
  const el = document.getElementById('fallbackKey');
  return (el && el.value.trim()) || '';
}

/* ── provider calls with explicit key + model ───────────────── */
async function jlCallGemini(judge, system, userText, imgB64s){
  const parts = [{text: system + '\n\n' + userText}];
  imgB64s.forEach(function(b64){ parts.push({inlineData:{mimeType:'image/png', data:b64}}); });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + judge.model
            + ':generateContent?key=' + encodeURIComponent(jlKeyFor(judge));
  const gen = {
    temperature: (judge.temperature !== undefined && judge.temperature !== '') ? Number(judge.temperature) : 0.7,
    maxOutputTokens: 3000
  };
  // The host app sends thinkingLevel:'none' for non-gemini-2 models on Critic calls.
  // Gemini 3 models now reject that value with a 400, so we omit thinkingConfig
  // entirely unless a judge explicitly asks for a level.
  if(judge.model.indexOf('gemini-2') === 0) gen.thinkingConfig = {thinkingBudget:0};
  else if(judge.thinkingLevel) gen.thinkingConfig = {thinkingLevel: judge.thinkingLevel};
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'},
                               body: JSON.stringify({contents:[{role:'user',parts:parts}], generationConfig:gen})});
  if(!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0,160));
  const d = await res.json();
  const all = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return all.filter(function(p){return !p.thought;}).map(function(p){return p.text || '';}).join('');
}

async function jlCallOpenAI(judge, system, userText, imgB64s){
  const content = [{type:'text', text:userText}];
  imgB64s.forEach(function(b64){
    content.push({type:'image_url', image_url:{url:'data:image/png;base64,' + b64}}); });
  const body = {model: judge.model,
                messages: [{role:'system', content:system}, {role:'user', content:content}]};
  // Same rule as the app's own callOpenAI: gpt-5.x and o-series reject max_tokens
  // and any non-default temperature; older models take both.
  if(judge.model.indexOf('gpt-5') === 0 || /^o\d/.test(judge.model)){
    body.max_completion_tokens = 3000;
  } else {
    body.max_tokens = 3000;
    body.temperature = (judge.temperature !== undefined && judge.temperature !== '') ? Number(judge.temperature) : 0.7;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + jlKeyFor(judge)},
    body: JSON.stringify(body)});
  if(!res.ok) throw new Error('OpenAI ' + res.status + ': ' + (await res.text()).slice(0,160));
  const d = await res.json();
  return (d.choices && d.choices[0] && d.choices[0].message.content) || '';
}

/* OpenRouter: one key reaches models from every company, with an OpenAI-style
   request. Model ids carry the company (google/gemini-3.8-flash). Parameters a
   model does not take, such as temperature, are dropped by OpenRouter. The
   reply reports what the call cost, which is added up for the panel. */
JL.orSpend = 0;
function jlShowSpend(){
  const el = document.getElementById('jlSpend');
  if(el) el.textContent = JL.orSpend ? 'OpenRouter spend since this page loaded: $' + JL.orSpend.toFixed(3) : '';
}
async function jlOpenRouterChat(model, key, system, userText, imgB64s, maxTokens, temperature){
  if(!key) throw new Error('No OpenRouter API key');
  const content = [{type:'text', text:userText}];
  (imgB64s || []).forEach(function(b64){
    content.push({type:'image_url', image_url:{url:'data:image/png;base64,' + b64}}); });
  const body = {model: model, max_tokens: maxTokens, temperature: temperature, usage: {include: true},
                messages: [{role:'system', content:system}, {role:'user', content:content}]};
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + key},
    body: JSON.stringify(body)});
  if(!res.ok){
    const e = new Error('OpenRouter ' + res.status + ': ' + (await res.text()).slice(0,200));
    e.httpStatus = res.status; throw e;
  }
  const d = await res.json();
  if(d.error) throw new Error('OpenRouter: ' + String(d.error.message || JSON.stringify(d.error)).slice(0,200));
  if(d.usage && typeof d.usage.cost === 'number'){ JL.orSpend += d.usage.cost; jlShowSpend(); }
  const c0 = d.choices && d.choices[0];
  const mc = c0 && c0.message && c0.message.content;
  const text = (typeof mc === 'string') ? mc
             : Array.isArray(mc) ? mc.map(function(p){ return p.text || ''; }).join('') : '';
  if(!text) throw new Error('OpenRouter returned no text (finish reason: ' + ((c0 && c0.finish_reason) || 'none') + ')');
  return text;
}
function jlCompanyOf(judge){
  if(judge.provider === 'openrouter') return String(judge.model || '').split('/')[0] || 'openrouter';
  return COMPANY_OF[judge.provider] || judge.provider;
}

/* Published artifacts cannot fetch api.anthropic.com; they ask Claude through
   the sample capability instead, on the viewer own account. */
let _sampleFn = null, _sampleTried = false;
async function jlGetSample(){
  if(!_sampleTried){
    _sampleTried = true;
    try { _sampleFn = (window.claude && claude.use) ? await claude.use("sample") : null; }
    catch(e){ _sampleFn = null; }
  }
  return _sampleFn;
}
function jlB64ToBlob(b64, type){
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type: type || "image/png"});
}
async function jlCallSample(judge, system, userText, imgB64s){
  const s = await jlGetSample();
  if(!s) throw new Error("Claude sampling unavailable in this view");
  const lim = await s.limits().catch(function(){ return null; });
  if(lim && lim.images && imgB64s.length > lim.images.maxCount){
    throw new Error("This view allows only " + lim.images.maxCount + " images per call");
  }
  const images = imgB64s.map(function(b){ return jlB64ToBlob(b, "image/png"); });
  const tier = judge.modelTier || "default";
  // cache:false is essential — this experiment measures how much repeated
  // identical calls vary, and a replayed answer would fake perfect consistency.
  const r = await s(system + '\n\n' + userText,
                    {images: images, cache: false, modelTier: tier});
  judge.model = "claude-sample-" + (r.modelTierApplied || tier);
  return r.text;
}

/* Claude judge. Inside a Claude artifact the API needs no key — claude.ai
   proxies the call. Model comes from the judge row so it can be changed. */
async function jlCallClaude(judge, system, userText, imgB64s){
  const content = [{type:'text', text:userText}];
  imgB64s.forEach(function(b64){
    content.push({type:'image', source:{type:'base64', media_type:'image/png', data:b64}}); });
  const body = {model: judge.model || 'claude-sonnet-5', max_tokens: 3000,
                system: system, messages: [{role:'user', content: content}]};
  // With an Anthropic API key in this judge's own key box, call the API directly
  // (the extra header is what lets Anthropic accept a browser request). With no
  // key we are inside a Claude artifact, where the call is proxied and needs none.
  const headers = {'Content-Type':'application/json'};
  if(judge.key){
    headers['x-api-key'] = judge.key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers: headers, body: JSON.stringify(body)});
  if(!res.ok) throw new Error('Claude ' + res.status + ': ' + (await res.text()).slice(0,160));
  const d = await res.json();
  return (d.content || []).map(function(b){ return b.text || ''; }).join('');
}

async function jlCallJudge(judge, system, userText, imgB64s){
  if(judge.provider === 'gemini') return jlCallGemini(judge, system, userText, imgB64s);
  if(judge.provider === 'openai') return jlCallOpenAI(judge, system, userText, imgB64s);
  if(judge.provider === 'openrouter'){
    return jlOpenRouterChat(judge.model, jlKeyFor(judge), system, userText, imgB64s, 8000,
      (judge.temperature !== undefined && judge.temperature !== '') ? Number(judge.temperature) : 0.7);
  }
  if(judge.provider === 'claude'){
    // published artifact: sample capability; chat artifact: direct keyless API
    if(window.claude && claude.use) return jlCallSample(judge, system, userText, imgB64s);
    return jlCallClaude(judge, system, userText, imgB64s);
  }
  throw new Error('Unknown provider: ' + judge.provider);
}

function jlCriticSystem(){
  const el = document.getElementById('criticPromptEl');
  return (el && el.value) || CRITIC_SYS;
}

/* ── one scoring of one batch ───────────────────────────────── */
async function jlScoreOnce(batch, judge, order, opts){
  opts = opts || {};
  const imgs = [batch.parentImg].concat(order.map(function(i){ return batch.variantImgs[i]; }));
  const system = opts.criticSystem || jlCriticSystem();
  const userText = jlBuildCriticUser(opts.taste || batch.taste, opts.iter || 1, imgs.length);
  const t0 = performance.now();
  let raw = '', err = null, parsed = {evaluations:[], suggestedImprovement:''};
  try {
    if(opts.rank){
      raw = await jlCallJudge(judge, JL_RANK_SYS, userText, imgs);
      const pr = JLCore.jlParseRanking(raw, imgs.length);
      // positions stay as presented here; jlMapEvaluations below undoes the shuffle
      parsed = {evaluations: JLCore.jlRankingToEvaluations(pr), suggestedImprovement: pr.suggestedImprovement};
    } else {
      raw = await jlCallJudge(judge, system, userText, imgs);
      parsed = parseCritiqueJSON(raw);
    }
  } catch(e){ err = e.message; }
  const latency = Math.round(performance.now() - t0);
  const mapped = JLCore.jlMapEvaluations(parsed.evaluations, order);
  return {mapped: mapped, winner: JLCore.jlWinnerOf(mapped), raw: raw, err: err,
          latency: latency, parseOk: (!err && mapped.length > 0),
          suggestion: parsed.suggestedImprovement || ''};
}

/* ── experiment runner ──────────────────────────────────────── */
async function jlRun(config){
  JL.abort = false; JL.running = true;
  const started = JL.rows.length;
  const batches = JL.batches.filter(function(b){ return config.batchIds.indexOf(b.id) >= 0; });
  const judges  = JL.judges.filter(function(j){ return config.judgeIds.indexOf(j.id) >= 0; });
  const total = batches.length * judges.length * config.repeats;
  let done = 0;
  for(const batch of batches){
    for(const judge of judges){
      for(let rep = 1; rep <= config.repeats; rep++){
        if(JL.abort){
          JL.running = false;
          jlStatus('Stopped after ' + done + ' of ' + total + ' calls.');
          jlRenderResults(); return;
        }
        const order = config.shuffle ? JLCore.jlShuffled(batch.variantCodes.length)
                                     : JLCore.jlIdentityOrder(batch.variantCodes.length);
        jlStatus('Call ' + (done+1) + ' of ' + total + ' — ' + batch.name
                 + ' / ' + judge.model + ' / repeat ' + rep);
        const r = await jlScoreOnce(batch, judge, order,
                                    {taste: config.taste, criticSystem: config.criticSystem,
                                     rank: config.precision === 'rank'});
        const stamp = new Date().toISOString();
        const callId = 'c' + (JL.callSeq = (JL.callSeq || 0) + 1) + '-' + stamp;
        if(r.mapped.length === 0){
          JL.rows.push({ts:stamp, callId:callId, batchId:batch.id, batchName:batch.name,
            makerCompany:batch.makerCompany||'', makerModel:batch.makerModel||'',
            judgeId:judge.id, judgeCompany:judge.company, judgeModel:judge.model,
            repeat:rep, precision:(config.precision||'app'), order:order.join('-'), target:'', variantIndex:'', position:'',
            aes:null, nov:null, score:null, winner:'', parseOk:false,
            error:(r.err || 'no evaluations parsed'), latencyMs:r.latency, reason:''});
        } else {
          r.mapped.forEach(function(m){
            JL.rows.push({ts:stamp, callId:callId, batchId:batch.id, batchName:batch.name,
              makerCompany:batch.makerCompany||'', makerModel:batch.makerModel||'',
              judgeId:judge.id, judgeCompany:judge.company, judgeModel:judge.model,
              repeat:rep, precision:(config.precision||'app'), order:order.join('-'), target:m.target,
              variantIndex:(m.variantIndex === null ? '' : m.variantIndex),
              position:m.position, aes:m.aes, nov:m.nov, score:m.score,
              winner:(r.winner || ''), parseOk:r.parseOk, error:(r.err || ''),
              latencyMs:r.latency, reason:(m.reason || '').slice(0,200)});
          });
        }
        done++;
        jlRenderResults();
        if(done < total) await new Promise(function(res){ setTimeout(res, JL.delayMs); });
      }
    }
  }
  JL.running = false;
  jlStatus('Finished — ' + (JL.rows.length - started) + ' rows added (' + total + ' calls).');
  jlRenderResults();
}

/* ── analysis over collected rows ───────────────────────────── */
function jlAnalyse(rows){
  const out = {spread:{}, stability:{}, position:{}, agreement:{}};
  const byBatchJudge = {};
  rows.forEach(function(r){
    if(!r.target) return;
    const k = r.batchId + ' | ' + r.judgeModel + (r.precision === 'decimal' ? ' | decimals' : r.precision === 'rank' ? ' | ranking (points: best of n gets n)' : ' | whole numbers');
    (byBatchJudge[k] = byBatchJudge[k] || []).push(r);
  });
  for(const k in byBatchJudge){
    const rs = byBatchJudge[k];
    out.spread[k] = JLCore.jlStats(rs);
    // One call = all rows sharing a timestamp. (Grouping by repeat number was wrong:
    // repeat numbers restart at 1 every run, so calls from different runs collided.)
    const callTs = [];
    rs.forEach(function(r){ const id = r.callId || r.ts; if(callTs.indexOf(id) < 0) callTs.push(id); });
    let ties = 0; const tieWinners = {};
    const winners = callTs.map(function(ts){
      const inCall = rs.filter(function(r){ return (r.callId || r.ts) === ts && r.score !== null; });
      if(!inCall.length) return null;
      const top = Math.max.apply(null, inCall.map(function(r){ return r.score; }));
      const atTop = inCall.filter(function(r){ return r.score === top; }).length;
      const w = inCall[0].winner || null;
      if(atTop > 1){ ties++; if(w) tieWinners[w] = (tieWinners[w] || 0) + 1; }
      return w;
    });
    out.stability[k] = JLCore.jlWinnerStability(winners);
    out.stability[k].ties = ties;
    out.stability[k].tieWinners = tieWinners;
    out.position[k] = JLCore.jlPositionEffect(rs);
  }
  // judge agreement: average repeats per picture first, then correlate judges
  const judges = [];
  rows.forEach(function(r){ if(r.target && judges.indexOf(r.judgeModel) < 0) judges.push(r.judgeModel); });
  if(judges.length > 1){
    const key = function(r){ return r.batchId + '|' + (r.target === 'parent' ? 'parent' : 'v' + r.variantIndex); };
    const meanBy = {}, pics = [];
    rows.forEach(function(r){
      if(!r.target || r.score === null) return;
      const p = key(r);
      if(pics.indexOf(p) < 0) pics.push(p);
      const kk = r.judgeModel + '||' + p;
      (meanBy[kk] = meanBy[kk] || []).push(r.score);
    });
    for(let i = 0; i < judges.length; i++){
      for(let j = i+1; j < judges.length; j++){
        const a = [], b = [];
        pics.forEach(function(p){
          const ka = meanBy[judges[i] + '||' + p], kb = meanBy[judges[j] + '||' + p];
          if(ka && kb){ a.push(JLCore.jlMean(ka)); b.push(JLCore.jlMean(kb)); }
        });
        out.agreement[judges[i] + ' vs ' + judges[j]] = {n:a.length, r:JLCore.jlCorrelation(a,b)};
      }
    }
  }
  out.favouritism = JLCore.jlFavouritism(rows.filter(function(r){ return r.target && r.makerCompany; }));
  return out;
}
window.jlAnalyse = jlAnalyse;

/* ── batches ────────────────────────────────────────────────── */
function jlFreezeBatch(name, taste, parentCode, variantCodes, makerCompany, makerModel){
  const batch = {
    id: 'B' + Date.now().toString(36),
    name: name || ('batch ' + (JL.batches.length + 1)),
    taste: taste || '',
    parentCode: parentCode,
    variantCodes: variantCodes,
    parentImg: jlRenderB64(parentCode),
    variantImgs: variantCodes.map(function(c){ return jlRenderB64(c); }),
    makerCompany: makerCompany || '',
    makerModel: makerModel || '',
    created: new Date().toISOString()
  };
  JL.batches.push(batch);
  jlRenderBatches();   // keep the selectable list in step with JL.batches
  return batch;
}
window.jlFreezeBatch = jlFreezeBatch;

function jlDownload(filename, text, mime){
  // Always show the copy box: artifact viewers block downloads, and a blocked
  // download gives no error at all, so the text must be reachable some other way.
  const box = document.getElementById('jlCopyBox');
  if(box){ box.style.display='block'; box.querySelector('textarea').value = text; }
  if(isArtifact()){
    // downloads are blocked inside artifacts — show the text to copy instead
    const w = document.getElementById('jlCopyBox');
    w.style.display = 'block';
    w.querySelector('textarea').value = text;
    return;
  }
  const blob = new Blob([text], {type: mime || 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

const CSV_COLS = ['ts','callId','batchId','batchName','makerCompany','makerModel','judgeId','judgeCompany',
  'judgeModel','repeat','precision','order','target','variantIndex','position','aes','nov','score','winner',
  'parseOk','error','latencyMs','reason'];

/* ── UI ─────────────────────────────────────────────────────── */
function jlStatus(t){ const el = document.getElementById('jlStatus'); if(el) el.textContent = t; }

function jlRenderResults(){
  const el = document.getElementById('jlResults'); if(!el) return;
  if(!JL.rows.length){ el.innerHTML = '<div style="opacity:.6">No results yet.</div>'; return; }
  const a = jlAnalyse(JL.rows);
  let h = '<div style="font-weight:700;margin-bottom:4px">Score spread (identical input)</div>';
  for(const k in a.spread){
    h += '<div style="margin:4px 0 2px;opacity:.8">' + k + '</div>'
       + '<table style="width:100%;font-size:.68rem;border-collapse:collapse">'
       + '<tr><th align="left">picture</th><th>n</th><th>mean</th><th>SD</th><th>min</th><th>max</th></tr>';
    for(const t in a.spread[k]){
      const s = a.spread[k][t];
      h += '<tr><td>' + t + '</td><td align="center">' + s.n + '</td><td align="center">'
         + s.scoreMean.toFixed(2) + '</td><td align="center">' + s.scoreSD.toFixed(2)
         + '</td><td align="center">' + (+s.scoreMin.toFixed(2)) + '</td><td align="center">'
         + (+s.scoreMax.toFixed(2)) + '</td></tr>';
    }
    h += '</table>';
    const st = a.stability[k];
    h += '<div style="margin:3px 0 8px">winner: <b>' + (st.modalWinner || 'n/a') + '</b> in '
       + (isNaN(st.modalShare) ? '-' : (st.modalShare*100).toFixed(0) + '%') + ' of calls · '
       + st.distinctWinners + ' distinct winner(s) · changed ' + st.changed + ' of ' + st.total + ' call(s)</div>';
    if(st.ties){
      const tw = Object.keys(st.tieWinners).map(function(w){ return w + ' ×' + st.tieWinners[w]; }).join(', ');
      h += '<div style="margin:-4px 0 8px;color:#f59e0b">tie for top score in ' + st.ties + ' of ' + st.total
         + ' call(s), ties went to: ' + tw + ' (the app keeps the earliest candidate on a tie)</div>';
    }
  }
  // position effect: is a slot worth points regardless of which picture lands in it?
  var posKeys=Object.keys(a.position);
  if(posKeys.length){
    var anyPos=false;
    posKeys.forEach(function(k){ if(Object.keys(a.position[k]).length>1) anyPos=true; });
    if(anyPos){
      h += '<div style="font-weight:700;margin-top:6px">Position effect (adjusted for which picture it is)</div>';
      posKeys.forEach(function(k){
        var p=a.position[k], slots=Object.keys(p).sort(function(x,y){return x-y;});
        if(slots.length<2) return;
        h += '<div style="opacity:.8;margin-top:2px">'+k+'</div>';
        h += slots.map(function(s2){ var v=p[s2].adjustedMean;
          return 'slot '+s2+': '+(v>=0?'+':'')+v.toFixed(2)+' (n='+p[s2].n+')'; }).join(' &middot; ');
      });
    }
  }
  if(Object.keys(a.agreement).length){
    h += '<div style="font-weight:700;margin-top:6px">Judge agreement (r over picture means)</div>';
    for(const k in a.agreement){
      h += '<div>' + k + ': r = ' + (isNaN(a.agreement[k].r) ? 'n/a' : a.agreement[k].r.toFixed(3))
         + ' (n=' + a.agreement[k].n + ')</div>';
    }
  }
  if(Object.keys(a.favouritism).length){
    h += '<div style="font-weight:700;margin-top:6px">Deviation from panel average</div>';
    for(const k in a.favouritism){
      const f = a.favouritism[k];
      h += '<div' + (f.sameCompany ? ' style="color:#f59e0b"' : '') + '>' + k + ': '
         + (f.meanDeviation >= 0 ? '+' : '') + f.meanDeviation.toFixed(2) + ' (n=' + f.n + ')'
         + (f.sameCompany ? '  ← same company' : '') + '</div>';
    }
  }
  const badRows = JL.rows.filter(function(r){ return !r.parseOk; });
  if(badRows.length){
    h += '<div style="margin-top:6px;color:#ef4444">' + badRows.length + ' row(s) from failed/unparsed calls</div>';
    const errs = {};
    badRows.forEach(function(r){
      const e = (r.error || 'unknown error').slice(0, 400);
      errs[e] = (errs[e] || 0) + 1;
    });
    for(const e in errs){
      const safe = (typeof escHtml === 'function') ? escHtml(e)
                 : e.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      h += '<div style="color:#fca5a5;font-size:.62rem;word-break:break-word;margin-top:2px">'
         + safe + (errs[e] > 1 ? ' (&times;' + errs[e] + ')' : '') + '</div>';
    }
  }
  el.innerHTML = h;
}

function jlRenderBatches(){
  const el = document.getElementById('jlBatchList'); if(!el) return;
  el.innerHTML = JL.batches.length
    ? JL.batches.map(function(b){
        return '<label style="display:block"><input type="checkbox" class="jlBatchCb" value="' + b.id
             + '" checked> ' + b.name + ' — ' + b.variantCodes.length + ' variants'
             + (b.makerCompany ? ' · made by ' + b.makerCompany : '') + '</label>';
      }).join('')
    : '<div style="opacity:.6">No frozen batches yet.</div>';
}

function jlRenderJudges(){
  const el = document.getElementById('jlJudgeList'); if(!el) return;
  el.innerHTML = JL.judges.map(function(j, i){
    const provOpts = ['gemini','openai','claude','openrouter'].map(function(p){
      return '<option value="' + p + '"' + (j.provider === p ? ' selected' : '') + '>' + p + '</option>';
    }).join('');
    return '<div style="display:flex;gap:4px;margin-bottom:3px;align-items:center">'
      + '<input type="checkbox" class="jlJudgeCb" value="' + j.id + '" checked>'
      + '<select onchange="JLui.setJudge(' + i + ',\'provider\',this.value)" style="font-size:.65rem">' + provOpts + '</select>'
      + '<input value="' + j.model + '" onchange="JLui.setJudge(' + i + ',\'model\',this.value)" style="width:130px;font-size:.65rem" placeholder="model">'
      + '<input value="' + j.key + '" onchange="JLui.setJudge(' + i + ',\'key\',this.value)" type="password" style="width:90px;font-size:.65rem" placeholder="key (optional)">'
      + '<button onclick="JLui.removeJudge(' + i + ')" style="font-size:.65rem">×</button></div>';
  }).join('');
}


/* ── preset experiments ─────────────────────────────────────
   Each preset sets every control and runs, so an experiment is one click.
   'calls' is roughly how many API calls it spends, for budgeting. */
const JL_PRESETS = {
  ties_by_taste: {
    label: '1. Tie rate on both tastes (20 calls each, whole numbers)',
    calls: 40,
    tests: 'Whether ties depend on how far apart the variants are. Expect many ties on Mondrian (top two 0.47 apart) and none on wild flowers (2.17 apart).',
    batches: 'original', repeats: 20, precision: 'app', shuffle: false
  },
  decimal_fix: {
    label: '2. Does the decimal fix hold on both tastes? (20 + 20 each)',
    calls: 80,
    tests: 'Whether asking for one decimal place removes ties. Expect ties to vanish wherever they occurred.',
    batches: 'original', repeats: 20, precision: 'both', shuffle: false
  },
  order_decides: {
    label: '3. Does list order decide the winner? (20 fixed + 20 shuffled, Mondrian)',
    calls: 40,
    tests: 'Whether shuffling changes who wins. Expect the first-listed variant to lose its advantage once shuffled.',
    batches: 'mondrian', repeats: 20, precision: 'app', shuffle: 'both'
  },
  across_models: {
    label: '4. Same pictures, every judge you have (10 calls per judge per batch)',
    calls: 0,
    tests: 'Whether this behaviour is particular to one company. Add one judge per provider first, then run.',
    batches: 'original', repeats: 10, precision: 'app', shuffle: false
  },
  close_vs_far: {
    label: '5. New categories: close vs far (10 calls per judge per batch)',
    calls: 0,
    tests: 'Six new batches: snowflake, city skyline and spiral galaxy, each as a close set (three near-identical variants) and a far set (one clearly strongest, listed last). Expect whole-number ties on the close sets and none on the far ones. Tick every judge you want; about 60 calls per judge.',
    batches: 'new', repeats: 10, precision: 'app', shuffle: false
  },
  ranking: {
    label: '6. Ranking instead of scoring (every batch, shuffled, 10 calls each)',
    calls: 80,
    tests: 'The critic orders the pictures best to worst instead of scoring each, with the variants in a fresh random order every call. On the far sets the strongest should come first every time. On the close sets and Mondrian, watch whether the same variant keeps winning (it can tell them apart) or whichever lands in a given slot (the position table).',
    batches: 'all', repeats: 10, precision: 'rank', shuffle: true
  }
};

async function jlRunPreset(key){
  const p = JL_PRESETS[key];
  if(!p){ jlStatus('Unknown preset.'); return; }
  if(JL.running){ jlStatus('Already running — press Stop first.'); return; }
  const want = function(b){
    return p.batches === 'all' ? b.makerCompany !== 'evolution'
         : p.batches === 'original' ? /mondrian|flower/i.test(b.name)
         : p.batches === 'new' ? / - (close|far)$/.test(b.name)
         : p.batches === 'mondrian' ? /mondrian/i.test(b.name)
         : /flower/i.test(b.name);
  };
  const ids = JL.batches.filter(want).map(function(b){ return b.id; });
  if(!ids.length){ jlStatus('The batches this experiment needs are not loaded.'); return; }
  [].slice.call(document.querySelectorAll('.jlBatchCb')).forEach(function(c){
    c.checked = ids.indexOf(c.value) >= 0; });
  document.getElementById('jlRepeats').value = p.repeats;
  JL.delayMs = Math.max(0, parseInt(document.getElementById('jlDelay').value) || 0);
  const judges = [].slice.call(document.querySelectorAll('.jlJudgeCb:checked')).map(function(c){ return c.value; });
  if(!judges.length){ jlStatus('Tick at least one judge first.'); return; }

  const base = {batchIds: ids, judgeIds: judges, repeats: p.repeats,
                taste: '', criticSystem: null, precision: 'app', shuffle: false};
  const decSys = ((document.getElementById('criticPromptEl') || {}).value || CRITIC_SYS)
    + '\n\nSCORING PRECISION: give aestheticScore and noveltyScore to one decimal place '
    + '(for example 7.4 or 8.1). Do not round to whole numbers.';

  const runs = [];
  if(p.precision === 'both'){
    runs.push(Object.assign({}, base));
    runs.push(Object.assign({}, base, {precision: 'decimal', criticSystem: decSys}));
  } else if(p.shuffle === 'both'){
    runs.push(Object.assign({}, base));
    runs.push(Object.assign({}, base, {shuffle: true}));
  } else if(p.precision === 'rank'){
    runs.push(Object.assign({}, base, {precision: 'rank', shuffle: !!p.shuffle}));
  } else {
    runs.push(Object.assign({}, base, {shuffle: !!p.shuffle}));
  }
  for(const r of runs){ if(JL.abort) break; await jlRun(r); }
  jlStatus('Finished: ' + p.label + ' — press Export CSV.');
}
window.jlRunPreset = jlRunPreset;

/* ── gap report ─────────────────────────────────────────────
   Reads the app's own evolution history and reports, per round, the gap between
   the best and second-best variant. Tests the prediction that gaps shrink as a
   run converges, so ties — and order deciding the winner — get more common. */
function jlGapReport(){
  if(typeof S === 'undefined' || !S.historyLog || !S.historyLog.length){
    jlStatus('Run the app for a few rounds first, then press this.'); return;
  }
  const rows = S.historyLog.map(function(h, i){
    const vs = h.variants.filter(function(v){ return v.title !== 'Parent'; })
                         .map(function(v){ return v.score; })
                         .sort(function(a, b){ return b - a; });
    return {round: i + 1, taste: h.taste, magnitude: h.mag, variants: vs.length,
            best: vs[0], second: (vs.length > 1 ? vs[1] : ''),
            gap: (vs.length > 1 ? +(vs[0] - vs[1]).toFixed(3) : ''),
            tiedAtTop: (vs.length > 1 && vs[0] === vs[1])};
  });
  const withGap = rows.filter(function(r){ return r.gap !== ''; });
  const tied = withGap.filter(function(r){ return r.tiedAtTop; }).length;
  const half = Math.ceil(withGap.length / 2);
  const avg = function(a){ return a.length ? a.reduce(function(s, r){ return s + r.gap; }, 0) / a.length : NaN; };
  jlDownload('gap-report.csv', JLCore.jlCSV(rows,
    ['round','taste','magnitude','variants','best','second','gap','tiedAtTop']), 'text/csv');
  jlStatus('Gap report over ' + withGap.length + ' rounds: tied at top in ' + tied
    + ' of them; mean gap ' + avg(withGap.slice(0, half)).toFixed(2) + ' in the first half vs '
    + avg(withGap.slice(half)).toFixed(2) + ' in the second. CSV is in the box below.');
}
window.jlGapReport = jlGapReport;

/* ── enhancements, and evolution A/B ────────────────────────
   Two switches change how the app itself evolves, not just how a frozen batch
   is scored:
   - decimal: the Critic is asked for one decimal place (fewer ties)
   - fairTie: a tie for the top score is broken at random, not by list order
   They hook the host's callAI and selectWinner, so a normal Start run uses them
   too. "Compare evolution" runs the same start program with both off, then
   with the ticked ones on, and logs every round. */
const JL_DECIMAL_SUFFIX = '\n\nSCORING PRECISION: give aestheticScore and noveltyScore to one decimal place '
  + '(for example 7.4 or 8.1). Do not round to whole numbers.';
/* Ranking critic: same inputs as CRITIC_SYS, but the pictures are compared with
   each other and ordered, not scored one by one. It keeps the app's weighting
   (taste first, distinctness from the parent second) so that only the form of
   the judgement changes. */
const JL_RANK_SYS = "You are an expert generative art critic evaluating Logo turtle graphics artwork.\n\n"
  + "TASK: Compare the canvas images with each other and rank them, to guide the next evolution iteration.\n\n"
  + "INPUTS (supplied in the user message each call):\n"
  + "- Aesthetic taste: the user's stated preference for what makes art good\n"
  + "- Iteration number: which round of evolution this is\n"
  + "- Canvas images: Image 0 = parent/base, Images 1+ = new variants (sent as base64 PNG)\n\n"
  + "RANKING: order ALL the images, including Image 0, from the one that should be the parent of the next "
  + "iteration to the one that least should be. Judge mainly how well each image embodies the aesthetic "
  + "taste; as a secondary consideration, about half as important, prefer images that are visually distinct "
  + "from Image 0. Compare the images directly with each other. No ties: every image gets its own place.\n\n"
  + "Also provide suggestedImprovement: one specific, actionable Logo-level change for the next iteration - be concrete.\n\n"
  + "Return ONLY valid JSON - no markdown, no backticks, no preamble:\n"
  + "{\n  \"ranking\": [2, 0, 3, 1],\n  \"reason\": \"one sentence on why the first beats the second\",\n"
  + "  \"suggestedImprovement\": \"specific actionable Logo suggestion\"\n}\n"
  + "ranking lists the image numbers, best first, and must contain every image number exactly once.";
window.JL_RANK_SYS = JL_RANK_SYS;
JL.enh = {decimal:true, fairTie:true, rank:false, criticModel:''};   // the panel checkboxes mirror this
JL.evo = null;          // set while a comparison is running
JL.evoRows = [];        // one row per evolution round
JL.evoFinals = [];      // which final picture came from which arm

const _hostCallAI = window.callAI;
window.callAI = function(system, userText, imgB64s, maxTokens, label){
  const send = function(sys, imgs){
    const prov = document.getElementById('providerSelect');
    if(prov && prov.value === 'openrouter'){
      // the host only knows Gemini and OpenAI; route OpenRouter here. The extra
      // tokens leave room for models that think before answering.
      // a separate critic model, if one is set, judges; the model in the panel generates
      const model = (label === 'Critic' && JL.enh.criticModel) ? JL.enh.criticModel
                  : document.getElementById('fallbackModel').value;
      return jlOpenRouterChat(model,
        document.getElementById('fallbackKey').value.trim(), sys, userText, imgs || [],
        (maxTokens || 1400) + 4096, 0.7);
    }
    return _hostCallAI(sys, userText, imgs, maxTokens, label);
  };
  if(label === 'Critic' && JL.enh.rank && imgB64s && imgB64s.length > 1){
    // Ranking critic. Variants are shown in a fresh random order so that a habit
    // of favouring a slot cannot favour a variant; only possible when the critic
    // sees images alone, because the code listing in the message is in fixed order.
    const n = imgB64s.length;
    const imagesOnly = ((document.getElementById('criticMode') || {}).value || 'images') === 'images';
    const order = imagesOnly ? JLCore.jlShuffled(n - 1) : JLCore.jlIdentityOrder(n - 1);
    const shown = [imgB64s[0]].concat(order.map(function(i){ return imgB64s[i + 1]; }));
    return Promise.resolve(send(JL_RANK_SYS, shown)).then(function(raw){
      const pr = JLCore.jlParseRanking(raw, n);
      return JSON.stringify({evaluations: JLCore.jlRankingToEvaluations(pr, order),
                             suggestedImprovement: pr.suggestedImprovement});
    });
  }
  if(label === 'Critic' && JL.enh.decimal) system = system + JL_DECIMAL_SUFFIX;
  return send(system, imgB64s);
};

const _hostSelectWinner = window.selectWinner;
window.selectWinner = function(pool){
  const roulette = document.getElementById('rouletteToggle').checked;
  let w;
  if(JL.enh.fairTie && !roulette){
    const i = JLCore.jlPickWinner(pool, true);
    w = (i >= 0) ? pool[i] : _hostSelectWinner(pool);
  } else {
    w = _hostSelectWinner(pool);
  }
  if(JL.evo){
    const row = JLCore.jlRoundSummary(pool, pool.indexOf(w));
    row.ts = new Date().toISOString();
    row.arm = JL.evo.arm; row.run = JL.evo.run; row.round = S.iteration + 1;
    row.decimal = JL.enh.decimal && !JL.enh.rank; row.fairTie = JL.enh.fairTie; row.rankCritic = !!JL.enh.rank;
    row.criticModel = JL.enh.criticModel || JL.evo.model;
    row.provider = JL.evo.provider; row.model = JL.evo.model;
    row.taste = JL.evo.taste; row.magnitude = JL.evo.magnitude;
    row.winnerCode = w.code || '';
    JL.evoRows.push(row);
  }
  return w;
};

const EVO_COLS = ['ts','arm','run','round','decimal','fairTie','rankCritic','provider','model','criticModel','taste','magnitude',
  'candidates','parentScore','variantScores','best','second','gap','tiedAtTop','tieWentToFirstListed',
  'winner','parentKept','winnerAes','winnerNov','winnerScore','decimalsUsed','criticFailed','winnerCode'];

function jlEvoStatus(t){
  const el = document.getElementById('jlEvoStatus'); if(el) el.textContent = t;
  jlStatus(t);
}
function jlWait(seconds, why){
  return new Promise(function(res){
    let left = seconds;
    (function tick(){
      if(JL.abort || left <= 0){ res(); return; }
      jlEvoStatus(why + ' — trying again in ' + left + 's (press Stop to give up)');
      left--; setTimeout(tick, 1000);
    })();
  });
}

function jlEvoSummary(){
  const el = document.getElementById('jlEvoOut'); if(!el) return;
  if(!JL.evoRows.length){ el.innerHTML = ''; return; }
  const pct = function(a, b){ return b ? a + ' of ' + b : '-'; };
  const meanGap = function(rs){
    const g = rs.filter(function(r){ return r.gap !== ''; }).map(function(r){ return r.gap; });
    return g.length ? JLCore.jlMean(g).toFixed(2) : '-';
  };
  const half = Math.ceil((JL.evoRoundsPlanned || 2) / 2);
  let h = '<table style="width:100%;font-size:.66rem;border-collapse:collapse"><tr><th align="left"></th>'
        + '<th>original</th><th>enhanced</th></tr>';
  const arms = ['original','enhanced'].map(function(a){
    const rs = JL.evoRows.filter(function(r){ return r.arm === a; });
    const early = rs.filter(function(r){ return r.round <= half; });
    const late  = rs.filter(function(r){ return r.round >  half; });
    const n = function(list, f){ return list.filter(f).length; };
    const tie = function(r){ return r.tiedAtTop; };
    return {rounds: rs.length,
      ties: pct(n(rs, tie), rs.length),
      tiesEarly: pct(n(early, tie), early.length), tiesLate: pct(n(late, tie), late.length),
      toFirst: pct(n(rs, function(r){ return r.tieWentToFirstListed; }), n(rs, tie)),
      parentKept: pct(n(rs, function(r){ return r.parentKept; }), rs.length),
      gapEarly: meanGap(early), gapLate: meanGap(late),
      failed: n(rs, function(r){ return r.criticFailed; })};
  });
  [['rounds logged','rounds'], ['rounds with a tie for top score','ties'],
   ['&nbsp;&nbsp;in the first half','tiesEarly'], ['&nbsp;&nbsp;in the second half','tiesLate'],
   ['ties won by the first-listed','toFirst'], ['rounds where the parent was kept','parentKept'],
   ['mean gap, first half','gapEarly'], ['mean gap, second half','gapLate'],
   ['rounds where the critic reply failed','failed']].forEach(function(line){
    h += '<tr><td>' + line[0] + '</td><td align="center">' + arms[0][line[1]]
       + '</td><td align="center">' + arms[1][line[1]] + '</td></tr>';
  });
  h += '</table>';
  // final pictures, judged together in shuffled order
  const armOf = {};   // batchId|variantIndex -> arm
  JL.evoFinals.forEach(function(f){ armOf[f.batchId + '|' + f.variantIndex] = f.arm; });
  const finalRows = JL.rows.filter(function(r){
    return r.target === 'variant' && r.score !== null && armOf[r.batchId + '|' + r.variantIndex]; });
  const finalStats = function(rs){
    const calls = {};
    rs.forEach(function(r){ calls[r.callId] = r.batchId + '|' + String(r.winner).slice(1); });
    return ['original','enhanced'].map(function(a){
      const mine = rs.filter(function(r){ return armOf[r.batchId + '|' + r.variantIndex] === a; });
      return {aes: mine.length ? JLCore.jlMean(mine.map(function(r){ return r.aes; })) : NaN,
              score: mine.length ? JLCore.jlMean(mine.map(function(r){ return r.score; })) : NaN,
              wins: Object.keys(calls).filter(function(c){ return armOf[calls[c]] === a; }).length,
              calls: Object.keys(calls).length};
    });
  };
  if(finalRows.length){
    const fs2 = finalStats(finalRows);
    h += '<div style="margin-top:4px"><b>Final pictures, judged side by side:</b><br>'
       + ['original','enhanced'].map(function(a, i){
           return a + ': mean aesthetic ' + fs2[i].aes.toFixed(2) + ', mean score ' + fs2[i].score.toFixed(2)
                + ', best picture in ' + fs2[i].wins + ' of ' + fs2[i].calls + ' calls'; }).join('<br>') + '</div>';
    const judgeModels = [];
    finalRows.forEach(function(r){ if(judgeModels.indexOf(r.judgeModel) < 0) judgeModels.push(r.judgeModel); });
    if(judgeModels.length > 1){
      h += '<div style="margin-top:3px">' + judgeModels.map(function(jm){
        const f = finalStats(finalRows.filter(function(r){ return r.judgeModel === jm; }));
        return 'judge ' + jm + ': original ' + f[0].aes.toFixed(2) + ' (best in ' + f[0].wins + '), enhanced '
             + f[1].aes.toFixed(2) + ' (best in ' + f[1].wins + ') of ' + f[0].calls + ' calls'; }).join('<br>') + '</div>';
    }
  }
  // one line per taste, when more than one was run
  const tastes = [];
  JL.evoRows.forEach(function(r){ if(tastes.indexOf(r.taste) < 0) tastes.push(r.taste); });
  if(tastes.length > 1){
    h += '<div style="margin-top:6px"><b>By taste</b> (ties = rounds tied for top; last parent = critic\'s aesthetic score for the parent in the final round)</div>'
       + '<table style="width:100%;font-size:.62rem;border-collapse:collapse"><tr><th align="left">taste</th>'
       + '<th>ties orig</th><th>ties enh</th><th>gap orig</th><th>last parent o / e</th><th>final aes o / e</th></tr>';
    tastes.forEach(function(t){
      const rs = JL.evoRows.filter(function(r){ return r.taste === t; });
      const of = function(a){ return rs.filter(function(r){ return r.arm === a; }); };
      const ties = function(a){ const x = of(a); return x.filter(function(r){ return r.tiedAtTop; }).length + '/' + x.length; };
      const lastParent = function(a){
        const x = of(a); if(!x.length) return '-';
        const top = Math.max.apply(null, x.map(function(r){ return r.round; }));
        const v = x.filter(function(r){ return r.round === top && r.parentScore !== ''; }).map(function(r){ return +r.parentScore; });
        return v.length ? JLCore.jlMean(v).toFixed(1) : '-';
      };
      const bids = JL.evoFinals.filter(function(f){ return f.taste === t; }).map(function(f){ return f.batchId; });
      const fr = finalStats(finalRows.filter(function(r){ return bids.indexOf(r.batchId) >= 0; }));
      const fa = function(i){ return isNaN(fr[i].aes) ? '-' : fr[i].aes.toFixed(2); };
      h += '<tr><td>' + ((typeof escHtml === 'function') ? escHtml(t) : t).slice(0, 34) + '</td><td align="center">' + ties('original')
         + '</td><td align="center">' + ties('enhanced') + '</td><td align="center">' + meanGap(of('original'))
         + '</td><td align="center">' + lastParent('original') + ' / ' + lastParent('enhanced')
         + '</td><td align="center">' + fa(0) + ' / ' + fa(1) + '</td></tr>';
    });
    h += '</table>';
  }
  el.innerHTML = h;
}

async function jlEvoAB(){
  if(JL.running || S.autoRunning){ jlEvoStatus('Something is already running — press Stop first.'); return; }
  const enhDef = {decimal: document.getElementById('jlEnhDecimal').checked,
                  fairTie: document.getElementById('jlEnhFair').checked,
                  rank: document.getElementById('jlEnhRank').checked,
                  criticModel: ((document.getElementById('jlEvoCritic') || {}).value || '').trim()};
  if(!enhDef.decimal && !enhDef.fairTie && !enhDef.rank && !enhDef.criticModel){
    jlEvoStatus('Tick at least one enhancement, or name a different critic model, to compare against the original.'); return; }
  if(enhDef.criticModel && (document.getElementById('providerSelect') || {}).value !== 'openrouter'){
    jlEvoStatus('A separate critic model needs OpenRouter as the provider in the app\'s API PROVIDER panel.'); return; }
  const startCode = document.getElementById('codeInput').value.trim();
  if(!startCode){ jlEvoStatus('Type a starting Logo program in the app first.'); return; }
  // Outside an artifact the host only uses a pasted key while its provider panel is open.
  if(typeof isArtifact === 'function' && !isArtifact()){
    const key = ((document.getElementById('fallbackKey') || {}).value || '').trim();
    if(!key){ jlEvoStatus('Paste an API key into the app\'s API PROVIDER panel first — the evolution rounds use that provider and model.'); return; }
    if(document.getElementById('fallbackBody').style.display !== 'grid' && typeof toggleFallback === 'function') toggleFallback(true);
  }
  const rounds =Math.max(2, parseInt(document.getElementById('jlEvoRounds').value) || 10);
  const runs   = Math.max(1, parseInt(document.getElementById('jlEvoRuns').value) || 1);
  const judgeCalls = Math.max(0, parseInt(document.getElementById('jlEvoJudge').value) || 0);
  const judgeIds = [].slice.call(document.querySelectorAll('.jlJudgeCb:checked')).map(function(c){ return c.value; });

  // hold the host still: Best mode, no story call, no auto-retry of its own
  const roulette = document.getElementById('rouletteToggle');
  const numRounds = document.getElementById('numRounds');
  const saved = {roulette: roulette.checked, numRounds: numRounds.value,
                 story: window.generateStory, retry: window.startRetryCountdown};
  roulette.checked = false;
  window.generateStory = function(){ return Promise.resolve(); };
  window.startRetryCountdown = function(){};

  // one taste per line in the box; empty means the taste already in the app
  const tasteEl = document.getElementById('tasteInput');
  const listed = ((document.getElementById('jlEvoTastes') || {}).value || '').split('\n')
    .map(function(t){ return t.trim(); }).filter(Boolean);
  const tastes = listed.length ? listed : [tasteEl.value];
  saved.taste = tasteEl.value;

  JL.running = true; JL.abort = false;
  JL.evoRows = []; JL.evoFinals = []; JL.evoRoundsPlanned = rounds;
  const base = (document.getElementById('criticPromptEl') || {}).value || CRITIC_SYS;
  let judged = 0, lastBatch = '';
  for(let ti = 0; ti < tastes.length && !JL.abort; ti++){
  const tag = tastes.length > 1 ? 'Taste ' + (ti + 1) + ' of ' + tastes.length + ' (' + tastes[ti].slice(0, 24) + '), ' : '';
  tasteEl.value = tastes[ti];
  const finals = [];
  const meta = {provider: (document.getElementById('providerSelect') || {}).value || '',
                model: (document.getElementById('fallbackModel') || {}).value || '',
                taste: tastes[ti],
                magnitude: document.getElementById('magSlider').value};
  JL.running = true;
  try {
    for(let run = 1; run <= runs && !JL.abort; run++){
      // alternate which arm goes first, so neither always gets the fresher quota
      const order = (run % 2) ? ['original','enhanced'] : ['enhanced','original'];
      for(const arm of order){
        if(JL.abort) break;
        JL.enh = (arm === 'enhanced') ? enhDef : {decimal:false, fairTie:false, rank:false, criticModel:''};
        JL.evo = Object.assign({arm: arm, run: run}, meta);
        clearHistory();
        document.getElementById('codeInput').value = startCode;
        let stuck = 0;
        while(S.historyLog.length < rounds && !JL.abort && stuck < 6){
          const before = S.historyLog.length;
          numRounds.value = rounds - before;
          jlEvoStatus(tag + 'run ' + run + ' of ' + runs + ', ' + arm + ' — round ' + (before + 1) + ' of ' + rounds);
          await handleMain();
          if(S.historyLog.length === before && !JL.abort){ stuck++; await jlWait(30, 'A call failed'); }
          else stuck = 0;
          jlEvoSummary();
        }
        // drop rows from rounds the host did not keep (a call failed after selection)
        const kept = S.historyLog.length;
        JL.evoRows = JL.evoRows.filter(function(r){
          return !(r.taste === meta.taste && r.arm === arm && r.run === run && r.round > kept); });
        finals.push({arm: arm, run: run, rounds: kept, code: S.modCode || startCode});
      }
    }
  } finally {
    JL.evo = null; JL.enh = enhDef;
    JL.running = false;
  }
  jlEvoSummary();
  const done = finals.filter(function(f){ return f.rounds > 0; });
  if(done.length < 2) continue;

  // freeze this taste's final pictures as one batch and judge them together, shuffled
  const b = jlFreezeBatch('Evolution finals ' + new Date().toISOString().slice(0,16).replace('T',' ')
                          + (tastes.length > 1 ? ' - ' + meta.taste.slice(0, 30) : ''),
                          meta.taste, startCode, done.map(function(f){ return f.code; }), 'evolution', meta.model);
  lastBatch = b.name;
  done.forEach(function(f, i){
    JL.evoFinals.push({batchId: b.id, taste: meta.taste, variantIndex: i, arm: f.arm, run: f.run, rounds: f.rounds}); });
  if(JL.abort || !judgeCalls || !judgeIds.length) continue;
  jlEvoStatus(tag + 'judging the final pictures side by side…');
  JL.delayMs = Math.max(0, parseInt(document.getElementById('jlDelay').value) || 0);
  await jlRun({batchIds: [b.id], judgeIds: judgeIds, repeats: judgeCalls, shuffle: true,
               taste: '', criticSystem: base + JL_DECIMAL_SUFFIX, precision: 'decimal'});
  judged++;
  jlEvoSummary();
  }
  // put the host back as it was
  roulette.checked = saved.roulette; numRounds.value = saved.numRounds; tasteEl.value = saved.taste;
  window.generateStory = saved.story; window.startRetryCountdown = saved.retry;
  JL.running = false;
  jlEvoSummary();
  if(!JL.evoFinals.length){ jlEvoStatus('Stopped before both versions had run. Rounds so far are kept — Export evolution CSV.'); return; }
  if(!judged){
    jlEvoStatus('Evolution finished. Final pictures are frozen as "' + lastBatch + '" (not judged: '
      + (judgeIds.length ? 'judging calls set to 0, or stopped' : 'no judge ticked') + ').');
    return;
  }
  jlEvoStatus((JL.abort ? 'Stopped early. ' : 'Done. ') + 'Press Export evolution CSV (the rounds) and Export CSV (the final judging).');
}
window.jlEvoAB = jlEvoAB;

function jlEvoExport(){
  if(!JL.evoRows.length){ jlEvoStatus('No evolution rounds logged yet.'); return; }
  const key = JL.evoFinals.map(function(f){
    return '# final picture v' + f.variantIndex + ' of batch ' + f.batchId + ' = ' + f.arm + ', run ' + f.run
         + ' (' + f.rounds + ' rounds), taste: ' + (f.taste || ''); });
  jlDownload('judge-lab-evolution.csv',
    JLCore.jlCSV(JL.evoRows, EVO_COLS) + (key.length ? '\n' + key.join('\n') : ''), 'text/csv');
}
window.jlEvoExport = jlEvoExport;

const JLui = {
  setJudge: function(i, field, value){
    JL.judges[i][field] = value;
    // OpenRouter model ids are company/model; give a sensible one when switching to it
    if(field === 'provider' && value === 'openrouter' && JL.judges[i].model.indexOf('/') < 0){
      JL.judges[i].model = 'google/gemini-3.8-flash';
    }
    if(field === 'provider' || field === 'model') JL.judges[i].company = jlCompanyOf(JL.judges[i]);
    jlRenderJudges();
  },
  addJudge: function(){
    JL.judges.push({id:'J' + (JL.judges.length + 1), company:'openai',
                    provider:'openai', model:'gpt-5.4-mini', key:''});
    jlRenderJudges();
  },
  removeJudge: function(i){ JL.judges.splice(i,1); jlRenderJudges(); },
  freezeFromFields: function(){
    const parent = document.getElementById('jlParent').value.trim();
    const variants = document.getElementById('jlVariants').value.split(/^---+$/m)
      .map(function(s){ return s.trim(); }).filter(Boolean);
    if(!parent || !variants.length){ jlStatus('Need a parent program and at least one variant.'); return; }
    // Position test: put the SAME picture in every slot. Any slot that wins more
    // than its fair share is pure position bias, with the picture held constant.
    const dupEl = document.getElementById('jlDuplicate');
    if(dupEl && dupEl.checked){
      const copies = Math.max(2, Math.min(5, parseInt(document.getElementById('jlDupCount').value) || 3));
      for(let i = variants.length; i < copies; i++) variants.push(variants[0]);
      variants.length = copies;
      for(let i = 1; i < copies; i++) variants[i] = variants[0];
    }
    const b = jlFreezeBatch(document.getElementById('jlBatchName').value.trim(),
                            document.getElementById('jlTaste').value.trim(),
                            parent, variants,
                            document.getElementById('jlMakerCompany').value.trim(),
                            document.getElementById('jlMakerModel').value.trim());
    jlRenderBatches();
    jlStatus('Froze "' + b.name + '" with ' + b.variantCodes.length + ' variants (images rendered and stored).');
  },
  grabLastRound: function(){
    if(typeof S==='undefined' || !S.historyLog || !S.historyLog.length){
      jlStatus('No rounds yet — run the app for at least one round first.'); return; }
    var h = S.historyLog[S.historyLog.length-1];
    var vs = h.variants.filter(function(v){ return v.title !== 'Parent'; })
                       .map(function(v){ return v.code; });
    if(!vs.length){ jlStatus('That round has no variants to freeze.'); return; }
    document.getElementById('jlParent').value = h.baseCode;
    document.getElementById('jlVariants').value = vs.join('\n---\n');
    document.getElementById('jlTaste').value = h.taste || '';
    document.getElementById('jlBatchName').value = 'round ' + S.historyLog.length;
    jlStatus('Pulled ' + vs.length + ' variants from ' + h.stage + ' — press Render & freeze.');
  },
  saveBatches: function(){ jlDownload('judge-lab-batches.json', JSON.stringify(JL.batches, null, 1), 'application/json'); },
  loadBatches: function(ev){
    const f = ev.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = function(){
      try {
        const arr = JSON.parse(r.result);
        arr.forEach(function(b){ JL.batches.push(b); });
        jlRenderBatches(); jlStatus('Loaded ' + arr.length + ' batch(es).');
      } catch(e){ jlStatus('Could not read that file: ' + e.message); }
    };
    r.readAsText(f);
  },
  exportCSV: function(){ jlDownload('judge-lab-rows.csv', JLCore.jlCSV(JL.rows, CSV_COLS), 'text/csv'); },
  clearRows: function(){ JL.rows = []; jlRenderResults(); jlStatus('Cleared results.'); },
  stop: function(){ JL.abort = true; if(JL.evo && typeof S !== 'undefined') S.stopRequested = true; },
  // Build a run config from the panel. precision: 'app' (1-10 whole numbers, as the
  // app asks) or 'decimal' (one decimal place — tests whether the tie rate comes
  // from the coarse integer scale). Recorded on every row so conditions stay apart.
  _config: function(shuffle, precision){
    const batchIds = [].slice.call(document.querySelectorAll('.jlBatchCb:checked')).map(function(c){ return c.value; });
    const judgeIds = [].slice.call(document.querySelectorAll('.jlJudgeCb:checked')).map(function(c){ return c.value; });
    if(!batchIds.length || !judgeIds.length){ jlStatus('Select at least one batch and one judge.'); return null; }
    const repeats = Math.max(1, parseInt(document.getElementById('jlRepeats').value) || 1);
    JL.delayMs = Math.max(0, parseInt(document.getElementById('jlDelay').value) || 0);
    let criticSystem = null;
    if(precision === 'decimal'){
      const base = (document.getElementById('criticPromptEl') || {}).value || CRITIC_SYS;
      criticSystem = base + '\n\nSCORING PRECISION: give aestheticScore and noveltyScore '
        + 'to one decimal place (for example 7.4 or 8.1). Do not round to whole numbers.';
    }
    return {batchIds:batchIds, judgeIds:judgeIds, repeats:repeats, shuffle:shuffle,
            taste:document.getElementById('jlTaste').value.trim(),
            criticSystem:criticSystem, precision:precision};
  },
  run: function(shuffle){
    if(JL.running){ jlStatus('Already running — press Stop first.'); return; }
    const prec = document.getElementById('jlPrecision');
    const cfg = JLui._config(shuffle, (prec && (prec.value === 'decimal' || prec.value === 'rank')) ? prec.value : 'app');
    if(cfg) jlRun(cfg);
  },
  // Day-in-one-click: N calls with whole-number scores, then N with decimals,
  // same batch, same judge, same order.
  runBoth: async function(){
    if(JL.running){ jlStatus('Already running — press Stop first.'); return; }
    const a = JLui._config(false, 'app'); if(!a) return;
    await jlRun(a);
    if(JL.abort) return;
    const b = JLui._config(false, 'decimal'); if(!b) return;
    await jlRun(b);
    jlStatus('Both conditions finished — ' + a.repeats + ' whole-number calls, then '
             + b.repeats + ' decimal calls. Export CSV now.');
  },
  toggle: function(){
    const p = document.getElementById('jlPanel');
    p.style.display = (p.style.display === 'none') ? 'block' : 'none';
  }
};
window.JLui = JLui;

function jlBuildPanel(){
  const d = document.createElement('div');
  d.innerHTML =
    '<button onclick="JLui.toggle()" style="position:fixed;right:14px;bottom:14px;z-index:9998;background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:8px 12px;font-weight:700;cursor:pointer">Judge Lab</button>'
  + '<div id="jlPanel" style="display:none;position:fixed;right:14px;bottom:56px;width:430px;max-height:78vh;overflow:auto;z-index:9999;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:12px;font-size:.72rem;font-family:system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)">'
  + '<div style="font-weight:800;font-size:.85rem;margin-bottom:6px">Judge Lab — is the critic\'s score reliable?</div>'
  + '<div style="opacity:.7;margin-bottom:8px">Freeze a batch of pictures, then score it again and again, with one judge or several.</div>'
  + '<div style="font-weight:700;margin-top:6px">1 &middot; Batch</div>'
  + '<input id="jlBatchName" placeholder="batch name" style="width:100%;margin:2px 0">'
  + '<input id="jlTaste" placeholder="aesthetic taste (e.g. Mondrian)" style="width:100%;margin:2px 0">'
  + '<div style="display:flex;gap:4px"><input id="jlMakerCompany" placeholder="made by (google/openai/anthropic)" style="flex:1"><input id="jlMakerModel" placeholder="maker model" style="flex:1"></div>'
  + '<textarea id="jlParent" placeholder="parent Logo program" style="width:100%;height:46px;margin:3px 0;font-family:monospace;font-size:.65rem"></textarea>'
  + '<textarea id="jlVariants" placeholder="variant programs, separated by a line containing only ---" style="width:100%;height:70px;font-family:monospace;font-size:.65rem"></textarea>'
  + '<label style="display:block;margin:3px 0"><input type="checkbox" id="jlDuplicate"> position test: put the FIRST variant in every slot '
  + '<input type="number" id="jlDupCount" value="3" min="2" max="5" style="width:42px"> times</label>'
  + '<div style="display:flex;gap:4px;margin:4px 0"><button onclick="JLui.freezeFromFields()">Render &amp; freeze</button>'
  + '<button onclick="JLui.grabLastRound()">Grab last round</button>'
  + '<button onclick="JLui.saveBatches()">Save batches</button>'
  + '<label style="cursor:pointer;border:1px solid #475569;border-radius:4px;padding:2px 6px">Load<input type="file" accept="application/json" style="display:none" onchange="JLui.loadBatches(event)"></label></div>'
  + '<div id="jlBatchList" style="max-height:80px;overflow:auto;border:1px solid #1e293b;padding:4px;border-radius:4px"></div>'
  + '<div style="font-weight:700;margin-top:8px">2 &middot; Judges</div>'
  + '<div id="jlJudgeList"></div>'
  + '<button onclick="JLui.addJudge()">+ judge</button>'
  + '<div id="jlSpend" style="opacity:.75;font-size:.66rem;margin-top:2px"></div>'
  + '<div style="font-weight:700;margin-top:8px">3 &middot; One-click experiments</div>'
  + '<select id="jlPreset" style="width:100%;font-size:.65rem;margin:2px 0"></select>'
  + '<div style="display:flex;gap:4px;flex-wrap:wrap"><button onclick="jlRunPreset(document.getElementById(\'jlPreset\').value)" style="background:#7c3aed;color:#fff">Run this experiment</button>'
  + '<button onclick="jlGapReport()">Gap report from the app rounds</button></div>'
  + '<div id="jlPresetWhat" style="opacity:.75;font-size:.66rem;margin:3px 0"></div>'
  + '<div style="font-weight:700;margin-top:8px">4 &middot; Evolution: original vs enhanced</div>'
  + '<label style="display:block"><input type="checkbox" id="jlEnhDecimal" checked onchange="JL.enh.decimal=this.checked"> enhancement: ask the critic for one decimal place</label>'
  + '<label style="display:block"><input type="checkbox" id="jlEnhFair" checked onchange="JL.enh.fairTie=this.checked"> enhancement: break ties at random, not by list order</label>'
  + '<label style="display:block"><input type="checkbox" id="jlEnhRank" onchange="JL.enh.rank=this.checked"> enhancement: the critic ranks the pictures (best to worst) instead of scoring them — replaces the two above while ticked</label>'
  + '<div style="opacity:.75;font-size:.66rem;margin:3px 0">While ticked, an enhancement also applies to the app\'s own Start button. Compare evolution runs the starting program twice per run (original app, then with the ticked enhancements) using the app\'s own taste, magnitude, variants per round and API PROVIDER settings, then asks the ticked judges to score the final pictures together. About rounds &times; 4 &times; runs calls, plus the judging.</div>'
  + '<div style="display:flex;gap:6px;align-items:center;margin:3px 0">rounds <input id="jlEvoRounds" type="number" value="10" min="2" max="100" style="width:48px"> runs <input id="jlEvoRuns" type="number" value="2" min="1" max="20" style="width:44px"> final judging calls <input id="jlEvoJudge" type="number" value="10" min="0" max="50" style="width:48px"></div>'
  + '<input id="jlEvoCritic" onchange="JL.enh.criticModel=this.value.trim()" placeholder="optional: a different critic model for the enhanced version, e.g. openai/gpt-5.6-luna (OpenRouter only)" style="width:100%;font-size:.65rem;margin:2px 0">'
  + '<textarea id="jlEvoTastes" placeholder="optional: several tastes, one per line — runs the whole comparison once for each. Leave empty to use the taste in the app." style="width:100%;height:52px;font-size:.65rem;margin:2px 0"></textarea>'
  + '<div style="display:flex;gap:4px;flex-wrap:wrap"><button onclick="jlEvoAB()" style="background:#7c3aed;color:#fff">Compare evolution</button><button onclick="JLui.stop()">Stop</button><button onclick="jlEvoExport()">Export evolution CSV</button></div>'
  + '<div id="jlEvoStatus" style="margin:4px 0;min-height:14px;opacity:.85"></div>'
  + '<div id="jlEvoOut"></div>'
  + '<div style="font-weight:700;margin-top:8px">5 &middot; Or set it up by hand</div>'
  + '<div style="display:flex;gap:6px;align-items:center;margin:3px 0">'
  + 'scores <select id="jlPrecision" style="font-size:.65rem"><option value="app">as the app asks (1-10)</option><option value="decimal">one decimal place</option><option value="rank">ranking, no scores</option></select> '
  + 'repeats <input id="jlRepeats" type="number" value="10" min="1" max="200" style="width:52px">'
  + 'delay ms <input id="jlDelay" type="number" value="1200" min="0" step="100" style="width:64px"></div>'
  + '<div style="display:flex;gap:4px;flex-wrap:wrap">'
  + '<button onclick="JLui.run(false)">Repeat, same order</button>'
  + '<button onclick="JLui.run(true)">Repeat, shuffled order</button>'
  + '<button onclick="JLui.runBoth()" style="background:#7c3aed;color:#fff">Run both (whole, then decimal)</button>'
  + '<button onclick="JLui.stop()">Stop</button></div>'
  + '<div id="jlStatus" style="margin:6px 0;min-height:16px;opacity:.85"></div>'
  + '<div style="font-weight:700;margin-top:4px">6 &middot; Results</div>'
  + '<div id="jlResults" style="border:1px solid #1e293b;padding:6px;border-radius:4px;max-height:230px;overflow:auto"></div>'
  + '<div style="display:flex;gap:4px;margin-top:4px"><button onclick="JLui.exportCSV()">Export CSV</button><button onclick="JLui.clearRows()">Clear results</button></div>'
  + '<div id="jlCopyBox" style="display:none;margin-top:6px"><div style="opacity:.7">If the download did not start (it cannot inside a Claude artifact), copy from here:</div><textarea style="width:100%;height:90px;font-size:.6rem"></textarea></div>'
  + '</div>';
  document.body.appendChild(d);
  const onClaude = (typeof isArtifact === 'function' && isArtifact())
    || /claude.ai|claudeusercontent|artifact/i.test(location.hostname + location.pathname)
    || window.self !== window.top;
  if(onClaude){
    JL.judges = [{id:'J1', company:'anthropic', provider:'claude', model:'claude-sonnet-5', key:''}];
  }
  // OpenRouter in the app's own API PROVIDER panel (the host lists two providers)
  const provSel = document.getElementById('providerSelect');
  if(provSel && typeof FALLBACK_MODELS !== 'undefined' && !FALLBACK_MODELS.openrouter){
    FALLBACK_MODELS.openrouter = [
      {id:'google/gemini-3.8-flash', name:'Gemini 3.8 Flash (Google)'},
      {id:'google/gemini-3-flash-preview', name:'Gemini 3 Flash Preview (Google)'},
      {id:'openai/gpt-6-luna', name:'GPT-6 Luna (OpenAI)'},
      {id:'openai/gpt-5.6-luna', name:'GPT-5.6 Luna (OpenAI)'},
      {id:'openai/gpt-5.4', name:'GPT-5.4 (OpenAI)'},
      {id:'anthropic/claude-haiku-4.5', name:'Claude Haiku 4.5 (Anthropic)'},
      {id:'anthropic/claude-sonnet-5', name:'Claude Sonnet 5 (Anthropic)'}];
    const o = document.createElement('option');
    o.value = 'openrouter'; o.textContent = 'OpenRouter (any company)';
    provSel.appendChild(o);
    try {
      if(typeof LS_PROV !== 'undefined' && localStorage.getItem(LS_PROV) === 'openrouter'){
        provSel.value = 'openrouter'; updateFallbackModels(); loadKeyForProvider('openrouter');
      }
    } catch(e){}
  }
  if(window.JL_BUILTIN_BATCHES){
    window.JL_BUILTIN_BATCHES.forEach(function(b){
      if(!JL.batches.some(function(x){ return x.name === b.name; })) JL.batches.push(b);
    });
  }
  var sel = document.getElementById('jlPreset');
  if(sel){
    Object.keys(JL_PRESETS).forEach(function(k){
      var o = document.createElement('option');
      o.value = k; o.textContent = JL_PRESETS[k].label; sel.appendChild(o);
    });
    var describe = function(){
      var p = JL_PRESETS[sel.value];
      document.getElementById('jlPresetWhat').textContent =
        p.tests + (p.calls ? '  (about ' + p.calls + ' calls)' : '');
    };
    sel.onchange = describe; describe();
  }
  jlRenderBatches(); jlRenderJudges(); jlRenderResults();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', jlBuildPanel);
else jlBuildPanel();

})();
