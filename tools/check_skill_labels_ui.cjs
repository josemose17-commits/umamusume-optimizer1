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

function stateFor(goal='ace') {
 const s=fixture();s.cm.goal=goal;s.cm.must=[];s.cm.globalSkills=false;s.tab=goal==='race'?'cm':'parents';return s;
}
function chart(w, values={900011:2,910011:1,900031:1,910031:1,91101351:1,901491:1,201322:1,900251:1}) {
 w.localStorage.setItem('uma-skillpaste-v1',JSON.stringify({cm1:{Senkou:values}}));
}
function skillRow(ui,id) {return ui.doc.querySelector(`[data-must="${id}"]`).closest('tr');}
test('real race skill list shows the exact Uma and variant beside each inherited name',()=>{
 const ui=load(stateFor(),undefined,w=>chart(w));
 try {
  for(const [id,owner] of [[900011,'Special Week [Special Dreamer]'],[910011,"Special Week [Hopp'n♪Happy Heart]"],[900031,'Tokai Teio [Peak Joy]'],[910031,'Tokai Teio [Beyond the Horizon]']]) {
   const row=skillRow(ui,id),cell=row.cells[0];
   assert.match(cell.textContent,/Source Uma:/);
   assert.ok(cell.textContent.includes(owner),id);
   assert.ok(cell.querySelector('.inherited-source'));
   assert.equal(ui.doc.querySelectorAll(`[data-must="${id}"]`).length,1);
  }
  assert.match(skillRow(ui,91101351).cells[0].textContent,/Source Uma unknown\./);
  assert.ok(skillRow(ui,901491).cells[0].textContent.includes('Phalaenopsis [Variant unknown]'));
  assert.ok(skillRow(ui,900251).cells[0].textContent.includes(ui.w.UmaSkillValues.skills[900251][0]),'keep the existing skill name when another list has an alias');
  const ordinary=skillRow(ui,201322);
  assert.equal(ordinary.querySelector('.inherited-source'),null);
  assert.equal(ordinary.cells[2].textContent,String(ui.w.UmaSkillBudget.baseCost(201322)));
 }finally{ui.w.close();}
});
test('shared variants stay grouped in one skill row, and source text is escaped',()=>{
 const ui=load(stateFor(),undefined,w=>{
  chart(w,{900011:2});
  const t=w.UmaDeck.DATA.trainees.find(t=>t.id===100101);
  w.UmaDeck.DATA.trainees.push({...t,id:999999,t:'Shared <festival> & variant'});
 });
 try{
  const cell=skillRow(ui,900011).cells[0];
  assert.match(cell.textContent,/Special Week \[Special Dreamer\]/);
  assert.ok(cell.textContent.includes('Special Week [Shared <festival> & variant]'));
  assert.equal(cell.querySelector('festival'),null);
  assert.equal(ui.doc.querySelectorAll('[data-must="900011"]').length,1);
 }finally{ui.w.close();}
});
test('no matching unique-owner data produces the explicit unknown label',()=>{
 const ui=load(stateFor(),undefined,w=>{
  chart(w,{900011:2});
  w.UmaDeck.DATA.trainees.forEach(t=>{t.us=(t.us||[]).filter(id=>id!==100011);});
 });
 try{assert.match(skillRow(ui,900011).cells[0].textContent,/Source Uma unknown\./);}
 finally{ui.w.close();}
});
for(const goal of ['ace','debuff','race'])test(`${goal} result uses the shared label without substituting the support card for the owner`,async()=>{
 const state=stateFor(goal);state.cm.must=[900011];
 if(goal==='race')state.deck.trainee=100201;
 const ui=load(state,undefined,w=>{
  chart(w,{900011:2,201322:1});
  // Synthetic hint route exercises an inherited unique in both result renderers.
  // No production data or inheritance rules are changed by this fixture.
  w.UmaDeck.card(30101).hs.push(900011);
  // Make this synthetic inherited skill available in every sample so the
  // complete purchase-example renderer is exercised deterministically too.
  if(goal==='race')w.UmaDeck.trainee(100201).is.push(900011);
 });
 try{
  const rendered=await result(ui);
  const scope=goal!=='race'?rendered.querySelector('[data-parent-skill="900011"]'):rendered.querySelector('#skillBudget');
  assert.ok(scope);assert.ok(scope.querySelector('.inherited-source'));
  assert.ok(scope.textContent.includes('Source Uma: Special Week [Special Dreamer]'));
  if(goal!=='race'){
   assert.match(scope.textContent,/not a white skill/);
   assert.ok(scope.textContent.includes('Agnes Tachyon'),'support route remains distinct');
   assert.equal(rendered.querySelectorAll('[data-parent-skill="900011"]').length,1);
  } else assert.ok(rendered.querySelector('#skillBudgetExample .inherited-source'));
 }finally{ui.w.close();}
});

test('tier best-skills list uses the same inherited owner label',()=>{
 const state=stateFor('race');state.tab='tiers';state.tier={ownedOnly:true,lbs:'own',show1:'score',show2:'skills'};
 const ui=load(state,undefined,w=>{chart(w,{900011:2});w.UmaDeck.card(30101).hs.push(900011);});
 try{
  const card=ui.doc.querySelector('[data-tier-add="30101"]');assert.ok(card);
  assert.ok(card.querySelector('.inherited-source'));
  assert.ok(card.textContent.includes('Source Uma: Special Week [Special Dreamer]'));
 }finally{ui.w.close();}
});

test('non-Grand-Concert racing result preserves its skill name and includes the owner label',async()=>{
 const state=stateFor('race');state.scenario='ura';
 const ui=load(state,undefined,w=>{chart(w,{900251:2});w.UmaDeck.card(30101).hs.push(900251);});
 try{
  const el=await result(ui),skills=el.querySelector('.opt-skills');assert.ok(skills);
  assert.ok(skills.textContent.includes(ui.w.UmaSkillValues.skills[900251][0]));
  assert.ok(skills.querySelector('.inherited-source'));
  assert.ok(skills.textContent.includes('Manhattan Cafe [Creeping Shadow]'));
 }finally{ui.w.close();}
});
