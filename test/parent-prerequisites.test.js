const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../deck.js');
const T = require('../tiers.js');
const S = require('../data/skillvalues/index.js');
const M = require('../data/skill-purchases.js').skills;
const I = require('../parent-skills.js');
const E = require('../data/card-events.js');
const white='202402',gold='202401',ruby=30114;
const opts={scenario:'GL',must:[white],parent:{targets:{[white]:1},statsWeight:0.1,globalOnly:true,today:'2026-10-18'}};
test('Leap Forward is a canonical Lightning Surge prerequisite and Ruby gold-only route covers it for parents',()=>{
 assert.equal(S.skills[white][0],'Leap Forward');assert.equal(M[gold][2],white);
 const card=D.card(ruby);assert.ok(!card.hs.includes(+white)&&!card.es.includes(+white));
 const deck=[{id:ruby,lb:4}],r=T.describeDeck(opts,deck,deck,[]);
 assert.ok(r.must[0].p>0&&r.must[0].p<1,'gold event must cover the white without guaranteeing it');
 const offer=r.skills.find(s=>s.id===white);assert.ok(offer,'gold-only white must contribute to parent target score');
 assert.equal(offer.lv,0);assert.equal(offer.expectedDiscount,0);
 assert.ok(T.deckSkills(opts,deck).value>0);
 const inv=I.build([card],{skills:S.skills,purchases:M,events:E,targets:{[white]:1},must:[white],globalOnly:true,today:'2026-10-18'});
 assert.equal(inv.skills.filter(s=>s.id===white).length,1);assert.deepEqual(inv.missingMust,[]);
});
const P = require('../parent-prerequisites.js');
const SE = require('../skill-events.js');
const B = require('../skill-budget.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const metadata={w:['f',100,null,1],g:['f',200,'w',2]};
const context=(extra={})=>Object.assign({skills:{w:2},costs:{w:100,g:200},must:['w'],known:new Set()},extra);

test('a gold-only source preserves its chance but grants no separate white hint or discount',()=>{
 const r=P.create(metadata),offers=r.offers(context());offers.add('g',.4,5,7);
 const w=offers.values().find(s=>s.id==='w'),g=offers.values().find(s=>s.id==='g');
 close(w.p,.4);close(w.prerequisiteSources[0].p,g.p);assert.equal(w.lv,0);assert.equal(w.hintP,0);
 assert.equal(w.expectedDiscount,0);assert.equal(w.conditionalDiscount,0);close(g.conditionalDiscount,.4);
 assert.deepEqual(w.src,[7]);
});
test('mutually exclusive direct-white and gold outcomes form one availability union',()=>{
 const offers=P.create(metadata).offers(context());
 offers.exclusive([{p:.5,levels:{w:2}},{p:.5,levels:{g:5}}],7);
 const ws=offers.values().filter(s=>s.id==='w');assert.equal(ws.length,1);
 const w=ws[0];close(w.p,1);close(w.hintP,.5);close(w.expectedDiscount,.1);close(w.conditionalDiscount,.1);
});
test('simultaneous white and gold hints do not count one opportunity twice or add the gold discount',()=>{
 const offers=P.create(metadata).offers(context());
 offers.exclusive([{p:.5,levels:{w:2,g:5}},{p:.5,levels:{}}],7);
 const w=offers.values().find(s=>s.id==='w');close(w.p,.5);close(w.expectedDiscount,.1);close(w.conditionalDiscount,.2);
 assert.equal(w.lv,2);assert.deepEqual(w.src,[7]);
});
test('independent sources combine while the original white hint discount remains unchanged',()=>{
 const r=P.create(metadata),offers=r.offers(context()),direct=D.skillOffers();
 offers.trainingHints('w',1,2,1);direct.trainingHints('w',1,2,1);offers.add('g',.5,5,2);
 const w=offers.values().find(s=>s.id==='w'),h=direct.values()[0];
 close(w.p,1-(1-h.p)*.5);close(w.expectedDiscount,h.expectedDiscount);close(w.hintP,h.p);
 assert.deepEqual(w.src,[1,2]);
});
test('gold training opportunities can unlock the prerequisite without producing a white training hint',()=>{
 const offers=P.create(metadata).offers(context());offers.trainingHints('g',1,3,1);
 const w=offers.values().find(s=>s.id==='w');close(w.p,1-Math.exp(-1));assert.equal(w.lv,0);assert.equal(w.hintP,0);
});
test('zero-chance and release-excluded gold routes do not cover the white',()=>{
 for(const ctx of [context(),context({allowSkill:id=>id!=='g'})]){
  const offers=P.create(metadata).offers(ctx);offers.add('g',ctx.allowSkill?1:0,5,1);
  assert.ok(!offers.values().some(s=>s.id==='w'));
  offers.add('w',.3,2,2);const w=offers.values().find(s=>s.id==='w');close(w.p,.3);close(w.expectedDiscount,.06);
 }
});
test('missing, cyclic, and cross-family prerequisites never infer a same-family white unlock',()=>{
 for(const g of [['f',200,'missing',2],['f',200,'g',2],['other',200,'w',2],['f',200,null,2]]){
  const r=P.create({...metadata,g});const offers=r.offers(context());offers.add('g',1,3,1);
  assert.deepEqual(r.whites('g'),[]);assert.ok(!offers.values().some(s=>s.id==='w'));
  const inventory=I.build([{id:1,hs:[],es:['g']}],{skills:{g:['Gold',200,2,1],w:['White',100,1,1]},purchases:{...metadata,g}});
  assert.ok(!inventory.skills.some(s=>s.id==='w'),'inventory cannot infer an unlinked white from a family alone');
 }
});
function synthetic(id,events,skills=['g']){
 const chain=events.map((e,i)=>id*10+i);E.cards[id]={chain};chain.forEach((eid,i)=>E.events[eid]=events[i]);
 return {card:{id,r:3,ty:'power',es:skills},cleanup(){delete E.cards[id];chain.forEach(eid=>delete E.events[eid]);}};
}
test('conditional gold success uses the existing event probability rather than a guaranteed unlock',()=>{
 const s=synthetic(998001,[{c:[{ok:{h:[['g',5]]},ng:{}}]}]);
 try{
  const r=P.create(metadata),ctx=context(),offers=r.offers(ctx);
  SE.add(offers,s.card,r.eventContext(ctx,s.card),{completion:1,success:.25});
  const w=offers.values().find(s=>s.id==='w');close(w.p,.25);assert.equal(w.expectedDiscount,0);
 }finally{s.cleanup();}
});
test('an ended chain cannot provide a later gold prerequisite route',()=>{
 const s=synthetic(998002,[{c:[{end:true}]},{c:[{h:[['g',5]]}]}]);
 try{
  const r=P.create(metadata),ctx=context(),offers=r.offers(ctx);
  SE.add(offers,s.card,r.eventContext(ctx,s.card),{completion:1,success:1});
  assert.ok(!offers.values().some(s=>s.id==='w'));
 }finally{s.cleanup();}
});
test('parent event choices see derived white must-haves and cache distinct target preferences',()=>{
 const meta={...metadata,a:['a',100,null,1]},r=P.create(meta);
 const s=synthetic(998003,[{c:[{h:[['a',1]]},{h:[['g',5]]}]}],['g','a']);
 try{
  const ctx=context(),offers=r.offers(ctx);SE.add(offers,s.card,r.eventContext(ctx,s.card),{completion:1});
  close(offers.values().find(s=>s.id==='w').p,1);
  const other=context({skills:{a:3},must:['a']}),o=r.offers(other);
  SE.add(o,s.card,r.eventContext(other,s.card),{completion:1});
  assert.ok(!o.values().some(s=>s.id==='w'));close(o.values().find(s=>s.id==='a').p,1);
  const low=context({skills:{w:.2},must:[]}),lowOffers=r.offers(low);
  SE.add(lowOffers,s.card,r.eventContext(low,s.card),{completion:1});
  close(lowOffers.values().find(s=>s.id==='w')?.p||0,1);
 }finally{s.cleanup();}
});
test('inventory blocks an unreleased gold from fabricating a released white route and reports missing metadata',()=>{
 const info={w:['White',100,1,1],g:['Gold',200,2,0]},card={id:1,n:'Card',en:'2020-01-01',hs:[],es:['g']};
 const config={skills:info,purchases:metadata,events:{cards:{},events:{}},globalOnly:true,today:'2026-10-18',must:['w']};
 const blocked=I.build([card],config);assert.ok(!blocked.skills.some(s=>s.id==='w'));assert.deepEqual(blocked.missingMust,['w']);
 const broken=I.build([card],{...config,globalOnly:false,purchases:{w:metadata.w}});
 assert.ok(!broken.skills.some(s=>s.id==='w'));assert.equal(broken.unresolvedPrerequisites.length,1);
 const mismatch=I.build([card],{...config,globalOnly:false,purchases:{...metadata,g:['f',200,null,1]}});
 assert.ok(!mismatch.skills.some(s=>s.id==='w'));assert.equal(mismatch.unresolvedPrerequisites.length,1);
 const conditional=I.build([card],{...config,skills:{...info,g:['Gold',200,2,1]},events:{cards:{1:{chain:[10]}},events:{10:{n:'Gold condition',c:[{ok:{h:[['g',3]],x:'requires condition'}}]}}}});
 const route=conditional.skills.find(s=>s.id==='w').sources[0].routes[0];
 assert.equal(route.purchase,'prerequisite');assert.equal(route.conditional,true);assert.equal(route.note,'requires condition');
});
test('an actual direct-plus-gold card values a parent target once, its gold route weighted by the 40% spark chance',()=>{
 const w='200332',g='200331',deck=[{id:30111,lb:2}],o={scenario:'GL',must:[w],parent:{targets:{[w]:1},statsWeight:.1}};
 const r=T.describeDeck(o,deck,deck,[]);const skills=r.skills.filter(s=>s.id===w);
 assert.equal(skills.length,1);assert.equal(r.skills.some(s=>s.id===g),false);assert.ok(r.expected<=1);
 const s=skills[0];assert.equal(s.prerequisiteSources.length,1);
 // The white's spark: 20%, or 40% when she learns the gold (GameTora), so the gold share of its availability doubles it.
 const viaGold=Math.min(1,s.prerequisiteSources[0].p/s.p);assert.ok(viaGold>0);close(s.surplus,60*(1+viaGold)+s.cost*s.conditionalDiscount);
 const inv=I.build([D.card(30111)],{skills:S.skills,purchases:M,events:E});
 assert.equal(inv.skills.find(s=>s.id===g).spark,false);assert.equal(inv.skills.filter(s=>s.id===w).length,1);
});
test('parent trainee, candidate-character, and Global restrictions survive prerequisite expansion',()=>{
 const t=D.DATA.trainees.find(t=>t.cid===D.card(ruby).cid);assert.ok(t);
 const ranked=T.rank({...opts,trainee:t.id},'power',[],[{id:ruby,lb:4}]);assert.equal(ranked.length,0);
 const empty=T.describeDeck({...opts,parent:{...opts.parent,today:'2020-01-01'}},[{id:ruby,lb:4}],[{id:ruby,lb:4}],[]);
 assert.equal(empty.must[0].p,0);assert.equal(empty.expected,0);
 const tr=D.DATA.trainees.find(t=>(t.is||[]).concat(t.as||[]).includes(+gold));
 assert.ok(tr,'a real trainee has the gold awakening/innate');
 assert.equal(T.deckSkills({...opts,trainee:tr.id},[{id:ruby,lb:4}]).value,0,'trainee availability already includes its white prerequisite');
});
test('ace purchase solver still unlocks the white at its own undiscounted cost',()=>{
 const b=B.create({skills:{[white]:2},must:[white]});
 const options=b.options({[gold]:5});const w=options.flat().find(s=>s.id===white);
 assert.ok(w);assert.equal(w.cost,180);assert.equal(w.tiers.find(t=>t.id===white).hint,0);
 const race=T.describeDeck({scenario:'GL',skills:{[white]:1},must:[white]},[{id:ruby,lb:4}],[{id:ruby,lb:4}],[]);
 assert.equal(race.must[0].p,0,'legacy static ace path is unchanged; career solver handles purchase unlocks');
});
