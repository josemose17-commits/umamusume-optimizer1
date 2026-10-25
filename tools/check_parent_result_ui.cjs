// Handler-level DOM diagnostics only. No real browser, network, or production edits.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Uses an already available jsdom installation; no browser or network.
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function fixture() {
  return {
    v: 2, scenario: 'grandlive', turn: 24, energy: 80, maxEnergy: 100, mood: 3,
    build: 'medium', risk: 12, resetMode: 'off', trackStats: true,
    meFix: 1, fcalFix: 1, strengthFix: 1, caps: {}, sparks: {}, targets: {},
    stats: {speed: 300, stamina: 200, power: 250, guts: 150, wit: 200},
    goals: [], goalsOff: [], goalRace: false, extras: {}, calib: [], fcal: [], log: [],
    race: '', fans: 0, tab: 'parents', cm: {goal: 'ace', preset: 'cm1', style: 'Senkou', ownedOnly: true, borrow: false, locked: [30101,30052,20033,30078,30111,30054], must: [201322]}, conditions: {}, facLevels: {},
    gl: {songs: {}, tokens: [100, 100, 100, 100, 100], lessons: {}, shop: {}, focus: 'songs'},
    deck: {trainee: null, globalOnly: true, slots: [null, null, null, null, null, null]},
    facilities: ['speed', 'stamina', 'power', 'guts', 'wit'].map(stat => ({stat, gain: 20, fail: 0, cards: 0, members: [], hints: [], extra: 0, extras: {}}))
  };
}
function load(state, owned = {30101:4,30052:4,20033:4,30078:4,30111:2,30054:4}, prepare) {
  const dom = new JSDOM(html, {url: 'https://coach.example/', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.matchMedia = () => ({matches: false, addEventListener() {}});
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.fetch = async url => {
    const p = path.resolve(root, String(url).split('?')[0]);
    if (!p.startsWith(root + path.sep) || !fs.existsSync(p)) return {ok: false, status: 404};
    return {ok: true, json: async () => JSON.parse(fs.readFileSync(p, 'utf8'))};
  };
  w.localStorage.setItem('uma-owned-v1', JSON.stringify(owned));
  w.localStorage.setItem('uma-turn-coach-v2', JSON.stringify(state));
  for (const match of html.matchAll(/<script src="([^"?]+)(?:[^"]*)"/g)) {
    if (match[1] === 'app.js') w.eval(fs.readFileSync(path.join(root, 'data/euophrys-cards.js'), 'utf8'));
    if (match[1] === 'app.js' && prepare) prepare(w);
    w.eval(fs.readFileSync(path.join(root, match[1]), 'utf8'));
  }
  return {dom, w, doc: w.document, saved: () => JSON.parse(w.localStorage.getItem('uma-turn-coach-v2'))};
}

async function result(ui) {
  await new Promise(resolve => setTimeout(resolve, 10));
  ui.doc.querySelector('#cmRun').click();
  for(let i=0;i<200;i++) {
    await new Promise(resolve=>setTimeout(resolve,25));
    if(ui.doc.querySelector('.opt-result') && !ui.doc.querySelector('#cmRun').disabled) return ui.doc.querySelector('.opt-result');
  }
  throw new Error('No rendered optimizer result: '+ui.doc.body.textContent.slice(-1200));
}
test('parent result includes every direct deck skill once and must-have only as status', async()=>{
  const ui=load(fixture());
  try {
    const rendered=await result(ui);
    const cards=[30101,30052,20033,30078,30111,30054].map(id=>ui.w.UmaDeck.card(id));
    const direct=[...new Set(cards.flatMap(c=>[...(c.hs||[]),...(c.es||[])]).map(String))].filter(id=>ui.w.UmaSkillValues.skills[id]?.[3]);
    // Reproduction evidence: 37 direct Global skills, only 12 pills before the fix.
    assert.ok(rendered.querySelector('#parentSkillPool'),'complete factual pool must render separately from scored target offers');
    assert.equal(rendered.querySelectorAll('.must-gives,.must-result,.opt-skills').length,0,'parent must-haves must not repeat across cards and separate lists');
    for(const id of direct) assert.equal(rendered.querySelectorAll(`[data-parent-skill="${id}"]`).length,1,'one row for '+id);
  }finally{ui.w.close();}
});

for (const goal of ['ace','debuff']) for(const must of [[],[201322]]) {
 test(`${goal} parent / ${must.length ? 'must-have' : 'no must-have'} renders complete grouped sources`,async()=>{
  const state=fixture();state.cm.goal=goal;state.cm.must=must;
  let built,opts;
  const ui=load(state,undefined,w=>{
    const real=w.UmaTiers.buildDeck;
    w.UmaTiers.buildDeck=(o,...args)=>{opts=o;built=real(o,...args);return built;};
  });
  try{
    const el=await result(ui);const pool=el.querySelector('#parentSkillPool');assert.ok(pool);
    const ids=built.cards.map(x=>x.id);
    assert.deepEqual([...ids].sort(),[30101,30052,20033,30078,30111,30054].sort());
    const direct=[...new Set(ids.flatMap(id=>{const c=ui.w.UmaDeck.card(id);return [...c.hs,...c.es];}).map(String))].filter(id=>ui.w.UmaSkillValues.skills[id]?.[3]);
    for(const id of direct)assert.equal(pool.querySelectorAll(`[data-parent-skill="${id}"]`).length,1,id);
    const all=[...pool.querySelectorAll('[data-parent-skill]')];assert.equal(all.length,new Set(all.map(x=>x.dataset.parentSkill)).size);
    const relevant=pool.querySelector('details');
    for(const row of relevant.querySelectorAll('[data-parent-skill]'))assert.ok(opts.parent.targets[row.dataset.parentSkill]>0);
    const row=pool.querySelector('[data-parent-skill="201322"]');
    assert.equal(row.querySelectorAll('.skillpill').length,must.length);
    for(const id of ids.filter(id=>ui.w.UmaDeck.card(id).hs.includes(201322)||ui.w.UmaDeck.card(id).es.includes(201322)))assert.ok(row.textContent.includes(ui.w.UmaDeck.card(id).n));
    assert.match(pool.textContent,/not an acquisition probability/);assert.match(pool.textContent,/Gold · does not itself/);
    assert.ok(pool.querySelectorAll('details').length>=3);
  }finally{ui.w.close();}
 });
}
test('borrowed parent sources come from the selected borrow; owned slots and locks stay constrained',async()=>{
 const state=fixture();state.cm.borrow=true;state.cm.locked=state.cm.locked.slice(0,5);
 const owned={30101:4,30052:4,20033:4,30078:4,30111:2};let built;
 const ui=load(state,owned,w=>{const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(...args)=>(built=real(...args));});
 try{
  const el=await result(ui);assert.equal(built.cards.length,6);
  assert.equal(built.cards.filter(c=>c.borrowed).length,1);
  for(const c of built.cards.filter(c=>!c.borrowed)){assert.ok(c.id in owned);assert.equal(c.lb,owned[c.id]);}
  const chars=built.cards.map(c=>ui.w.UmaDeck.card(c.id).cid);assert.equal(new Set(chars).size,6);
  assert.match(el.querySelector('#parentSkillPool').textContent,/borrowed/);
 }finally{ui.w.close();}
});
test('Global parent search excludes an unreleased owned card and unreleased skill targets',async()=>{
 const state=fixture();let captured;
 const ui=load(state,{30101:4,30052:4,20033:4,30078:4,30111:2,30054:4,30028:4},w=>{
   w.UmaDeck.card(30101).en='2099-01-01';
   const future=Object.keys(w.UmaSkillValues.skills).find(id=>w.UmaSkillValues.skills[id][2]===1&&!w.UmaSkillValues.skills[id][3]);
   assert.ok(future);
   const stored=JSON.parse(w.localStorage.getItem('uma-turn-coach-v2'));stored.cm.must=[+future];
   w.localStorage.setItem('uma-turn-coach-v2',JSON.stringify(stored));
   w.localStorage.setItem('uma-skillpaste-v1',JSON.stringify({cm1:{Senkou:{[future]:2,201322:1}}}));
   const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(o,p,b)=>{captured={o,p};return real(o,p,b);};
 });
 try{
  await result(ui);
  assert.ok(!captured.p.some(c=>c.id===30101),'unreleased owned source must not enter Global parent search');
  assert.ok(Object.keys(captured.o.parent.targets).every(id=>ui.w.UmaSkillValues.skills[id]?.[3]));
  assert.ok(captured.o.must.every(id=>ui.w.UmaSkillValues.skills[id]?.[3]),'unreleased must-haves must not drive a Global parent recommendation');
 }finally{ui.w.close();}
});
test('ace racing result retains actual affordable-career output instead of the parent inventory',async()=>{
 const state=fixture();state.cm.goal='race';state.tab='cm';let simulation;
 const ui=load(state,undefined,w=>{
   const real=w.UmaOptimizer.targetSearch;
   w.UmaOptimizer.targetSearch=(...args)=>{const search=real(...args), finish=search.result; search.result=()=>{const fit=finish();simulation=fit.after;return fit;};return search;};
 });
 try{
  const el=await result(ui);
  assert.equal(el.querySelector('#parentSkillPool'),null);
  assert.ok(el.querySelector('#skillBudget'));
  assert.ok(el.querySelector('#skillBudgetExample'));
  assert.ok(simulation.skillBudget.careers>0);
  assert.ok(simulation.skillBudget.example.budget>=simulation.skillBudget.example.spent);
  assert.match(el.textContent,/simulated careers/);
 }finally{ui.w.close();}
});
test('changing release restriction marks result stale and preserves the searched pool until rerun',async()=>{
 const ui=load(fixture());
 try{
  const el=await result(ui);const before=el.querySelector('#parentSkillPool').innerHTML;
  const toggle=ui.doc.querySelector('[data-cm="globalSkills"]');toggle.checked=false;
  toggle.dispatchEvent(new ui.w.Event('input',{bubbles:true}));
  assert.match(ui.doc.querySelector('.opt-result').textContent,/Settings or cards changed/);
  assert.equal(ui.doc.querySelector('#parentSkillPool').innerHTML,before);
  await result(ui);
  // Wait for Run to finish before inspecting the replacement result.
  assert.match(ui.doc.querySelector('#parentSkillPool').textContent,/All skill releases/);
 }finally{ui.w.close();}
});
test('uncovered and unknown must-haves remain warnings rather than fabricated sources',async()=>{
 const state=fixture();state.cm.must=[99999999];const ui=load(state);
 try{
  const el=await result(ui);assert.match(el.textContent,/Must-have source not covered/);
  assert.match(el.textContent,/unknown in the data/);
  assert.equal(el.querySelector('[data-parent-skill="99999999"]'),null);
 }finally{ui.w.close();}
});
