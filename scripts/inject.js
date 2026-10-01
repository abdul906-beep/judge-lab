const fs=require('fs');
let html=fs.readFileSync('logo-evolution-lab-ORIGINAL.html','utf8');

// 1. the one-line fix: make the editable Critic prompt actually take effect
const before="const raw=await callAI(CRITIC_SYS,userText,imgs,3000,'Critic');";
const after ="const raw=await callAI((document.getElementById('criticPromptEl')||{}).value||CRITIC_SYS,userText,imgs,3000,'Critic');";
if(html.indexOf(before)<0) throw new Error('critic call site not found');
html=html.replace(before,after);

// 2. tidy the malformed closing tag left in the published file
html=html.replace(/<\/html\s+const htmlFinal[\s\S]*?>\s*$/,'</html>');

// 2b. Gemini 3 models reject thinkingLevel:'none' with a 400, and the host app
//     sends it on every Critic call for non-gemini-2 models. Drop it.
const tl = ": {thinkingConfig:{thinkingLevel:'none'}})";
if(html.indexOf(tl)<0) throw new Error('thinkingLevel site not found');
html = html.replace(tl, ': {})');

// 2c. Newer Flash models the user's key can call (the hosted list predates them).
const fm = "gemini:[{id:'gemini-3.1-pro-preview'";
if(html.indexOf(fm)<0) throw new Error('model list not found');
html = html.replace(fm, "gemini:[{id:'gemini-3.8-flash',name:'Gemini 3.8 Flash'},{id:'gemini-3.7-flash',name:'Gemini 3.7 Flash'},{id:'gemini-3.6-flash',name:'Gemini 3.6 Flash'},{id:'gemini-3.5-flash',name:'Gemini 3.5 Flash'},{id:'gemini-3.1-pro-preview'");

// 2d. The hosted file pins an older Claude model for its keyless calls. Make it
//     settable so the artifact version can use a current one.
const cm = "  const model='claude-sonnet-4-6';";
if(html.indexOf(cm)<0) throw new Error('claude model line not found');
html = html.replace(cm, "  const model=(window.__claudeModel||'claude-sonnet-5');");

// 2e. The hosted isArtifact() only recognises chat artifacts (about:srcdoc).
//     Published artifacts run on a sandbox host inside an iframe, where the
//     keyless Claude API also works — detect those too.
const ia = "function isArtifact(){try{return window.location.href==='about:srcdoc'||window.location.protocol==='about:';}catch(e){return true;}}";
if(html.indexOf(ia)<0) throw new Error('isArtifact not found');
html = html.replace(ia, "function isArtifact(){try{return window.location.href==='about:srcdoc'||window.location.protocol==='about:'||/claude\.ai|claudeusercontent|artifact/i.test(location.hostname+location.pathname)||window.self!==window.top;}catch(e){return true;}}");

// 2f. Embed the two frozen batches so nothing has to be pasted or loaded.
const builtin = fs.readFileSync('data/builtin-batches.json','utf8');

// 3. inject Judge Lab before </body>
const core=fs.readFileSync('judge-lab-core.js','utf8');
const ui=fs.readFileSync('judge-lab-ui.js','utf8');
const bridge='\nwindow.JLCore={jlPickWinner,jlRoundSummary,jlMean,jlSD,jlScore,jlIdentityOrder,jlShuffled,jlMapEvaluations,'
  +'jlWinnerOf,jlStats,jlWinnerStability,jlPositionEffect,jlCorrelation,jlFavouritism,jlCSV};\n';
const block='\n<!-- ===== Judge Lab (added for the critic-reliability study) ===== -->\n'
  +'<script>window.JL_BUILTIN_BATCHES='+builtin+';</'+'script>\n'
  +'<script>\n'+core.replace(/if \(typeof module[\s\S]*$/,'')+bridge+'</'+'script>\n'
  +'<script>\n'+ui+'</'+'script>\n';
const idx=html.lastIndexOf('</body>');
if(idx<0) throw new Error('no </body>');
html=html.slice(0,idx)+block+html.slice(idx);
fs.writeFileSync('judge-lab.html',html);
console.log('written judge-lab.html:',html.length,'chars,',html.split('\n').length,'lines');
console.log('critic fix present:',html.indexOf(after)>0);
console.log('JLCore bridge present:',html.indexOf('window.JLCore=')>0);
console.log('panel builder present:',html.indexOf('jlBuildPanel')>0);
console.log('tail:',JSON.stringify(html.slice(-60)));
