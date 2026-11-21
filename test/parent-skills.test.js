const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../parent-skills.js');
const skills = {w:['White',100,1,1],g:['Gold',200,2,1],o:['Other white',100,1,1],j:['JP',100,1,0],u:['Unique',200,9,1]};
const purchases={w:['f',100,null,1],g:['f',200,'w',2],o:['f',100,'w',1]};
const cards=[{id:1,n:'A',en:'2020-01-01',hs:['w','j','mystery'],es:['g']},{id:2,n:'B',en:'2020-01-01',hs:['w'],es:['w']}];
const options={skills,purchases,events:{cards:{},events:{}},globalOnly:true,today:'2026-10-18',targets:{w:1},must:['w','absent']};
test('complete pool groups duplicate hints/events per skill and card, independently of target scoring',()=>{
 const r=P.build(cards,options); const w=r.skills.find(s=>s.id==='w');
 assert.equal(r.skills.filter(s=>s.id==='w').length,1); assert.equal(w.sources.length,2);
 assert.ok(w.sources.find(s=>s.card===2).routes.some(r=>r.kind==='event'));
 assert.ok(w.target && w.must && w.spark); assert.ok(r.skills.some(s=>s.id==='g'&&!s.spark));
 assert.ok(r.skills.some(s=>s.id==='o'&&!s.target)); assert.ok(r.missingMust.includes('absent'));
});
test('release unknowns and unreleased skills remain explicit without claiming availability',()=>{
 const r=P.build(cards,options);
 assert.ok(!r.skills.some(s=>['j','mystery'].includes(s.id)));
 assert.ok(r.restricted.some(s=>s.id==='j')); assert.ok(r.restricted.some(s=>s.id==='mystery'));
 assert.ok(P.build(cards,{...options,globalOnly:false}).skills.some(s=>s.id==='j'));
});
test('event branches and direct grants are unioned, not reduced to the chosen scoring route',()=>{
 const events={cards:{1:{chain:[10]}},events:{10:{c:[{h:[['w',1]],ok:{g:['u']},ng:{h:[['o',1]]},when:[{h:[['g',1]]}]}]}}};
 const r=P.build(cards,{...options,events});
 assert.ok(r.skills.find(s=>s.id==='u').sources[0].routes.some(r=>r.kind==='event'&&r.event===10));
 assert.equal(r.skills.find(s=>s.id==='u').spark,false);
 assert.ok(r.skills.find(s=>s.id==='o').sources[0].routes.some(r=>r.event===10));
});
test('unreleased source cards cannot provide even Global skills',()=>{
 const r=P.build([{...cards[0],en:'2099-01-01'}],options);
 assert.equal(r.skills.length,0); assert.equal(r.unavailableCards.length,1);
});
test('gold prerequisite and ordinary upgrade coverage retain the original source and no invented probabilities',()=>{
 const r=P.build([{...cards[0],hs:[],es:['g']}],options);
 for(const id of ['g','w','o']) assert.ok(r.skills.some(s=>s.id===id));
 const w=r.skills.find(s=>s.id==='w');assert.equal(w.sources[0].routes[0].via,'g');
 assert.equal(w.p,undefined);assert.equal(w.learned,undefined);assert.equal(w.affordable,undefined);
});
test('a white with no simulator entry (lane/vision/wit skills) is still a released white spark when the purchase data has it',()=>{
 const r=P.build([{id:3,n:'C',en:'2020-01-01',hs:['pp'],es:[]}],{...options,purchases:{...purchases,pp:['pp',120,null,1]},targets:{pp:1}});
 const pp=r.skills.find(s=>s.id==='pp');
 assert.ok(pp && pp.spark && pp.release===true && pp.target);
});
