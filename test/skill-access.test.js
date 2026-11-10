const test=require('node:test'),assert=require('node:assert/strict');
const Access=require('../skill-access.js'),F=require('../family.js'),B=require('../skill-budget.js'),D=require('../deck.js'),R=require('../rating.js');
const A=Access.create();
test('planning cannot manufacture a skill source from a typed wish',()=>{
 const graph=A.build({trainee:{},entered:[{id:'200331',hint:5}]});
 assert.equal(graph.byId['200331'],undefined);assert.deepEqual(graph.missing,['200331']);
 const shop=A.build({mode:'finished',entered:[{id:'200331',hint:3}]});
 assert.equal(shop.byId['200331'].p,1);assert.equal(A.sample(shop,1).hints['200331'],3);
});
test('white inheritance unlocks ordinary upgrades, never the gold; a gold source does not grant a white hint',()=>{
 const white=A.build({family:{p1:{cid:1,white:[['200332',3]]}},affinity:{p1:100}});
 assert.ok(white.byId['200332']);assert.ok(white.byId['200331']==null);
 const gold=A.build({cards:[{id:1,name:'Card',offers:{200331:1}}]});
 assert.equal(gold.byId['200332'].p,1);const s=A.sample(gold,12);
 assert.equal(s.hints['200331'],1);assert.equal(s.hints['200332'],undefined);
});
test('each actual family slot contributes at its affinity, with no great-grandparent access',()=>{
 const f={p1:{cid:1,green:2,unique:'900011',white:[]},g11:{cid:2,green:3,unique:'900021',white:[['200332',3]]},great:{cid:3,white:[['200512',3]]}};
 const g=A.build({family:f,affinity:{p1:50,g11:100}});
 assert.equal(g.byId['900011'].p,1);assert.equal(g.byId['900021'].p,F.twice(F.GREEN,3,100,F.GRAND));
 assert.ok(Math.abs(g.byId['200332'].p-F.twice(F.WHITE,3,100,F.GRAND))<1e-12);assert.equal(g.byId['200512'],undefined);
});
test('projected parent sources retain learning, generation and inspiration uncertainty',()=>{
 const g=A.build({family:{p1:{cid:1,planned:true,projectedWhite:[{id:'200332',learn:0.5,spark:0.1,stars:[0,1,0]}]}},affinity:{p1:50}});
 assert.ok(Math.abs(g.byId['200332'].p-0.1*F.twice(F.WHITE,2,50))<1e-12);
 assert.equal(g.byId['200332'].sources[0].conditional,true);
 assert.equal(A.build({family:{p1:{cid:1,planned:false,projectedWhite:[{id:'200332',spark:1}]}}}).byId['200332'],undefined);
});
test('parent learning obeys actual SP and SS before spark value',()=>{
 const t=D.trainee(100101),weights={200332:2,200512:1};
 const poor=A.project({trainee:t,stats:[300,300,300,300,300],sp:100,offers:{200331:1,200512:1},weights,minimum:R.SS,runs:4});
 assert.equal(poor.ss,0);assert.ok(poor.plans.every(p=>p.spent<=100));
 assert.equal(poor.families[B.DATA.skills[200332][0]],undefined,'an unaffordable white cannot leave a projected spark');
 const strong=A.project({trainee:t,stats:[1200,1200,1200,1200,1200],sp:1000,offers:{200331:1,200512:1},weights,minimum:R.SS,runs:4});
 assert.equal(strong.ssShare,1);assert.ok(strong.plans.every(p=>p.spent<=1000 && p.rating>=R.SS));
 const w=strong.families[B.DATA.skills[200332][0]];assert.ok(w.learn>0);assert.ok(w.spark<=w.learn*0.4+1e-9);
});
test('purchase-driven parent targets use canonical white families and retain race metadata',()=>{
 const rel=A.parentRel({targets:{200512:3},why:{200512:'L'},L:{900011:2}}, {parentValues:{200331:0.8,900011:10}});
 assert.deepEqual(rel.targets,{'200332':0.8});assert.equal(rel.L[900011],2);
});
test('related hints from one card share an access roll without inflating the white hint',()=>{
 const g=A.build({cards:[{id:1,name:'Card',offers:{200331:0.5,200332:0.5}}]});
 assert.equal(g.byId['200332'].p,0.5,'a prerequisite is not an independent extra source');
 const hit=Array.from({length:100},(_,i)=>A.sample(g,i+1)).find(s=>s.available.includes('200331'));
 assert.ok(hit);assert.equal(hit.hints['200332'],1,'a real white offer keeps its own discount');
 assert.equal(hit.hints['200331'],1);
 const both=A.build({cards:[{id:1,name:'A',offers:{200332:1}},{id:2,name:'B',offers:{200332:1}}]});
 assert.equal(A.sample(both,1).hints['200332'],2,'independent card hints can add');
});
test('career hints cannot bypass a rejected source, including golds and ordinary upgrades',()=>{
 const graph=A.build({cards:[{id:1,name:'Card',offers:{200332:1,200282:1}}]});
 const shop=A.restrict(graph,['200332','200282','200512'],{200332:1,200282:1,200331:5,200512:5});
 assert.deepEqual(shop.available,['200332','200282']);
 assert.deepEqual(shop.hints,{'200282':1,'200332':1});
 const purchase=B.create({available:shop.available,skills:{200331:100,200512:100,200332:1,200281:2}}).solve(shop.hints,1000);
 assert.ok(!purchase.selected.some(x=>['200331','200512'].includes(x.id)));
 assert.ok(purchase.selected.some(x=>x.id==='200281'),'the sourced white permits its ordinary upgrade');
 assert.ok(purchase.selected.every(x=>graph.byId[x.id]),'every actual purchase has a source row');
});
