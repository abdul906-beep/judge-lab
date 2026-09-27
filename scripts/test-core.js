const J=require('./judge-lab-core.js');
let pass=0, fail=0;
const ok=(name,cond,extra)=>{ if(cond){pass++;console.log('  PASS '+name);} else {fail++;console.log('  FAIL '+name+(extra!==undefined?' -> '+JSON.stringify(extra):''));} };
const close=(a,b,t)=>Math.abs(a-b)<(t||1e-9);

console.log('score formula matches buildPool');
ok('8 + 6*0.5 = 11', J.jlScore(8,6)===11);

console.log('permutation mapping (the easiest thing to get wrong)');
const order=[2,0,1];
const evals=[{imageNumber:0,aestheticScore:7,noveltyScore:0},
             {imageNumber:1,aestheticScore:9,noveltyScore:4},
             {imageNumber:2,aestheticScore:5,noveltyScore:2},
             {imageNumber:3,aestheticScore:6,noveltyScore:8}];
const m=J.jlMapEvaluations(evals,order);
ok('parent recorded, novelty forced 0', m[0].target==='parent'&&m[0].nov===0&&m[0].score===7);
ok('presented image 1 -> variant 2', m[1].variantIndex===2&&m[1].position===1);
ok('presented image 2 -> variant 0', m[2].variantIndex===0&&m[2].position===2);
ok('presented image 3 -> variant 1', m[3].variantIndex===1&&m[3].position===3);
ok('variant 1 score = 6 + 8*0.5 = 10', m[3].score===10);
ok('out-of-range image ignored', J.jlMapEvaluations([{imageNumber:9,aestheticScore:5,noveltyScore:5}],order).length===0);
ok('missing scores survive as null', J.jlMapEvaluations([{imageNumber:1}],order)[0].score===null);

console.log('winner selection matches deterministic mode');
ok('highest score wins', J.jlWinnerOf(m)==='v2');
ok('tie goes to the earlier candidate',
   J.jlWinnerOf([{target:'variant',variantIndex:0,score:9},{target:'variant',variantIndex:1,score:9}])==='v0');
ok('parent can win', J.jlWinnerOf([{target:'parent',variantIndex:null,score:12},{target:'variant',variantIndex:0,score:3}])==='parent');
ok('all-null returns null', J.jlWinnerOf([{target:'variant',variantIndex:0,score:null}])===null);

console.log('spread statistics');
const rows=[{target:'variant',variantIndex:0,position:1,aes:8,nov:4,score:10},
            {target:'variant',variantIndex:0,position:1,aes:6,nov:4,score:8},
            {target:'variant',variantIndex:0,position:1,aes:7,nov:4,score:9}];
const st=J.jlStats(rows);
ok('mean of 10,8,9 = 9', close(st.v0.scoreMean,9));
ok('sample SD of 10,8,9 = 1', close(st.v0.scoreSD,1));
ok('min/max captured', st.v0.scoreMin===8&&st.v0.scoreMax===10);

console.log('winner stability');
const ws=J.jlWinnerStability(['v1','v1','v0','v1']);
ok('modal winner v1', ws.modalWinner==='v1');
ok('modal share 3/4', close(ws.modalShare,0.75));
ok('changed on 1 of 4', ws.changed===1);
ok('2 distinct winners', ws.distinctWinners===2);

console.log('position effect separates slot from picture');
// no real position effect: same picture always scores the same, but moves slots
const noEffect=[{target:'variant',variantIndex:0,position:1,score:10},
                {target:'variant',variantIndex:0,position:2,score:10},
                {target:'variant',variantIndex:1,position:2,score:4},
                {target:'variant',variantIndex:1,position:1,score:4}];
const pe1=J.jlPositionEffect(noEffect);
ok('raw slot means differ (7 both here)', close(pe1['1'].mean,7)&&close(pe1['2'].mean,7));
ok('adjusted effect is zero', close(pe1['1'].adjustedMean,0)&&close(pe1['2'].adjustedMean,0));
// real effect: whatever sits in slot 1 gains a point
const effect=[{target:'variant',variantIndex:0,position:1,score:11},
              {target:'variant',variantIndex:0,position:2,score:10},
              {target:'variant',variantIndex:1,position:1,score:5},
              {target:'variant',variantIndex:1,position:2,score:4}];
const pe2=J.jlPositionEffect(effect);
ok('slot 1 gains +0.5 relative to its own mean', close(pe2['1'].adjustedMean,0.5));
ok('slot 2 loses 0.5', close(pe2['2'].adjustedMean,-0.5));

console.log('judge agreement');
ok('identical judges r = 1', close(J.jlCorrelation([1,2,3,4],[1,2,3,4]),1));
ok('opposite judges r = -1', close(J.jlCorrelation([1,2,3,4],[4,3,2,1]),-1));
ok('flat judge gives NaN', Number.isNaN(J.jlCorrelation([1,2,3],[5,5,5])));

console.log('same-company favouritism, using deviation from the panel');
const fav=[];
// three judges score two pictures; picture A made by GOOGLE, picture B by OPENAI
// the GOOGLE judge inflates the GOOGLE-made picture by 2 points
[['google',2],['openai',0],['anthropic',0]].forEach(([jc,boost])=>{
  fav.push({batchId:'b1',target:'variant',variantIndex:0,makerCompany:'google',judgeCompany:jc,score:8+(jc==='google'?boost:0)});
  fav.push({batchId:'b1',target:'variant',variantIndex:1,makerCompany:'openai',judgeCompany:jc,score:8});
});
const f=J.jlFavouritism(fav);
ok('google judging google is inflated', f['google judging google'].meanDeviation>0.5, f['google judging google']);
ok('flagged as same company', f['google judging google'].sameCompany===true);
ok('neutral pairing shows no inflation', close(f['openai judging openai'].meanDeviation,0));
ok('others pushed negative by the panel mean', f['anthropic judging google'].meanDeviation<0);

console.log('CSV escaping');
const csv=J.jlCSV([{a:'plain',b:'has,comma',c:'has "quote"',d:null}],['a','b','c','d']);
ok('header + escaping', csv==='a,b,c,d\nplain,"has,comma","has ""quote""",', csv);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
