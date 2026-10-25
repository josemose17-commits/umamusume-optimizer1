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

test('real parent result and must-have editor recognize Ruby’s gold route to Leap Forward',async()=>{
 const state=fixture();state.cm.preset='cm16';state.cm.style='Sasi';state.cm.must=['202402'];
 state.cm.locked=[30101,30052,30114,30078,30111,30054];
 let built;
 const ui=load(state,{30101:4,30052:4,30114:4,30078:4,30111:2,30054:4},w=>{
  const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(...a)=>(built=real(...a));
 });
 try{
  const el=await result(ui),row=el.querySelector('[data-parent-skill="202402"]');assert.ok(row);
  assert.equal(el.querySelectorAll('[data-parent-skill="202402"]').length,1);
  assert.match(row.textContent,/Available through Lightning Surge from Daiichi Ruby/);
  assert.match(row.textContent,/To Conduct Oneself with Kindness/);
  assert.match(row.textContent,/No white hint discount/);
  assert.ok(built.must.find(m=>m.id==='202402').p>0);
  const chip=ui.doc.querySelector('[data-must-del="202402"]').closest('.lockchip');
  assert.ok(!chip.classList.contains('warnchip'),'editor source coverage must include gold unlocks');
  assert.ok(row.querySelector('.skillpill'));
 }finally{ui.w.close();}
});
test('direct white and gold routes share one parent row and one target value',async()=>{
 const state=fixture();state.cm.must=['200332'];let built;
 const ui=load(state,undefined,w=>{
  w.localStorage.setItem('uma-skillpaste-v1',JSON.stringify({cm1:{Senkou:{200332:1}}}));
  const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(...a)=>(built=real(...a));
 });
 try{
  const el=await result(ui),rows=el.querySelectorAll('[data-parent-skill="200332"]');assert.equal(rows.length,1);
  assert.match(rows[0].textContent,/Training hint/);assert.match(rows[0].textContent,/Available through Professor of Curvature/);
  assert.equal(built.skills.length,1);assert.ok(built.expected<=1);
  assert.equal([...ui.doc.querySelectorAll('#cmSkillList option')].filter(o=>o.value==='Corner Adept ○').length,1,'must-have suggestions must also deduplicate direct and gold-derived sources');
 }finally{ui.w.close();}
});
test('a borrowed Ruby covers Leap Forward while owned slots and character restrictions remain intact',async()=>{
 const state=fixture();state.cm.preset='cm16';state.cm.style='Sasi';state.cm.must=['202402'];state.cm.borrow=true;
 state.cm.locked=[30101,30052,30078,30111,30054];const owned={30101:4,30052:4,30078:4,30111:2,30054:4};let built;
 const ui=load(state,owned,w=>{const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(...a)=>(built=real(...a));});
 try{
  const el=await result(ui);const borrowed=built.cards.filter(c=>c.borrowed);
  assert.equal(borrowed.length,1);assert.equal(borrowed[0].id,30114);
  for(const c of built.cards.filter(c=>!c.borrowed))assert.equal(c.lb,owned[c.id]);
  assert.equal(new Set(built.cards.map(c=>ui.w.UmaDeck.card(c.id).cid)).size,6);
  assert.ok(built.must.find(m=>m.id==='202402').p>0);
  assert.match(el.querySelector('[data-parent-skill="202402"]').textContent,/borrowed/);
 }finally{ui.w.close();}
});
for(const mode of ['unreleased','missing metadata','zero success'])test(`parent result preserves warnings for ${mode} gold routes`,async()=>{
 const state=fixture();state.cm.preset='cm16';state.cm.style='Sasi';state.cm.must=['202402'];
 state.cm.locked=[30101,30052,30114,30078,30111,30054];if(mode==='zero success')state.cm.eventSuccessRate='0';let built;
 const ui=load(state,{30101:4,30052:4,30114:4,30078:4,30111:2,30054:4},w=>{
  if(mode==='unreleased')w.UmaSkillValues.skills[202401][3]=0;
  if(mode==='missing metadata')delete w.UmaSkillPurchases.skills[202401];
  if(mode==='zero success')w.UmaCardEvents.events[830114003].c=[{ok:{h:[[202401,1]],x:'conditional gold outcome'},ng:{}}];
  const real=w.UmaTiers.buildDeck;w.UmaTiers.buildDeck=(...a)=>(built=real(...a));
 });
 try{
  const el=await result(ui);assert.equal(built.must.find(m=>m.id==='202402').p,0);
  if(mode==='zero success'){
   const row=el.querySelector('[data-parent-skill="202402"]');assert.ok(row);
   assert.match(row.textContent,/conditional outcome/);assert.match(row.textContent,/Estimated offer\/unlock availability: 0%/);
  }else{
   assert.equal(el.querySelector('[data-parent-skill="202402"]'),null);
   assert.match(el.textContent,mode==='missing metadata'?/White prerequisite data missing or unsupported/:/Release exclusions/);
  }
 }finally{ui.w.close();}
});
test('parent must-have entry resolves a canonical white even when no card lists it directly',()=>{
 const state=fixture();state.cm.must=[];
 const ui=load(state,{30114:4,30101:4,30052:4,30078:4,30111:2,30054:4},w=>{
  w.UmaDeck.DATA.supports.forEach(c=>{c.hs=(c.hs||[]).filter(id=>id!==202402);c.es=(c.es||[]).filter(id=>id!==202402);});
 });
 try{
  assert.ok([...ui.doc.querySelectorAll('#cmSkillList option')].some(o=>o.value==='Leap Forward'));
  ui.doc.querySelector('#cmMust').value='Leap Forward';ui.doc.querySelector('#cmMustAdd').click();
  // Parent decks are set up in the Parents tab, saved as pcm.
  assert.ok(ui.saved().pcm.must.includes('202402'));
 }finally{ui.w.close();}
});
