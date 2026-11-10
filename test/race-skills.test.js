const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../race-skills.js'),B=require('../skill-budget.js'),C=require('../data/race-skills.json'),P=require('../data/presets.js');
const meta={1:['a',100,null],2:['b',100,null],3:['c',100,null]};
// Synthetic purchase families use real public skill IDs, with a controlled comparison oracle.
const available=['200332','200512','200732'];
test('joint set search can select a synergy missed by standalone L/SP',async()=>{
 const [a,b,c]=available;
 const out=await R.optimize({catalog:C,available,learned:[],hints:{},sp:500,values:{[a]:0,[b]:0,[c]:1},maxEvaluations:80,
  compare:async(before,after)=>R.summary([after.includes(a)&&after.includes(b)?10:after.includes(c)?1:0])});
 assert.ok(out.selected.some(x=>x.id===a)&&out.selected.some(x=>x.id===b));
 assert.ok(out.spent<=500);assert.equal(out.result.mean,10);
});
test('hint discounts, equipped prerequisites and missing race data stay explicit',async()=>{
 const out=await R.optimize({catalog:C,available:['200331','missing'],learned:['200332'],hints:{200331:3},sp:126,values:{200331:4,200332:1},compare:async()=>R.summary([2])});
 assert.deepEqual(out.selected.map(x=>x.id),['200331']);assert.equal(out.spent,126);assert.deepEqual(out.excluded,['missing']);
 const h=R.horse({strategy:'Senkou'},['200331','200332'],C);assert.deepEqual([...h.skills.values()],['200331']);
 await assert.rejects(R.optimize({catalog:C,learned:['missing'],available:[],values:{},sp:100,compare:async()=>R.summary([0])}),/Equipped skills lack/);
});
test('each candidate uses the equipped baseline and contributions use the final set',async()=>{
 const calls=[];const out=await R.optimize({catalog:C,available:['200332','200512'],learned:['100011'],hints:{200332:5},sp:200,values:{200332:1,200512:2},
  compare:async(before,after,n,seed)=>{calls.push({before,after,n,seed});assert.ok(before.includes('100011'));return R.summary([after.length-before.length]);}});
 assert.ok(out.selected.length);assert.ok(calls.some(x=>x.n===96&&x.seed===314159));
 assert.ok(out.selected.every(x=>Number.isFinite(x.marginal.mean)&&x.per100>0));
});
test('race format and future rules never silently use unsupported physics',()=>{
 const p=P.list.find(p=>p.id==='cm21'),loh=Object.assign({},p,{kind:'loh'}),input={...p.stats,strategy:'Sasi'};
 assert.equal(R.request(p,input,[],[],C).data.racedef.numUmas,9);
 assert.equal(R.request(loh,input,[],[],C).data.racedef.numUmas,12);
 assert.deepEqual(R.request(loh,input,[],[],C).data.racedef.orderRange,[5,12]);
 assert.match(R.supported(p,{syoubu:true},C),/later race-engine/);assert.equal(R.supported(p,{},C),null);
 assert.equal(R.request(p,input,[],[],C).data.options.useIntChecks,true);
});
test('pinned Umalator runs real equipped-set comparisons with finite paired results',()=>{
 let handler,last;const sandbox={console:{assert(){},log(){},warn(){},error(){}},addEventListener:(type,f)=>handler=f,postMessage:m=>last=m};sandbox.self=sandbox;
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../vendor/umalator/simulator.worker.js'),'utf8'),sandbox);
 const p=P.list.find(p=>p.id==='cm21'),input={...p.stats,strategy:'Oikomi',outfitId:'100101'};
 handler({data:R.request(p,input,['100011'],['100011','200331'],C,24)});
 const result=R.summary(Array.from(last.results.results));assert.equal(result.samples,24);assert.ok(result.mean>0);assert.ok(result.max>=result.min);
 handler({data:R.request(p,input,['100011'],['100011'],C,24)});assert.equal(R.summary(Array.from(last.results.results)).mean,0);
});
