'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const release = require('../skill-release.js');

test('refreshing count-skill release dates preserves patched charts and simulator provenance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uma-count-metadata-'));
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value)); };
  try {
    const global = path.join(dir,'global'), jp = path.join(dir,'jp'), variants = path.join(dir,'variants');
    const gt = path.join(dir,'gt'), cache = path.join(dir,'cache'), out = path.join(dir,'out');
    const name = 'jp-test', strategies = ['Nige','Senkou','Sasi','Oikomi'];
    for (const sim of [global,jp,path.join(variants,name)]) {
      write(path.join(sim,'skill_data.json'), {});
      write(path.join(sim,'skill_meta.json'), {});
    }
    const p = {id:'cmFixture', sim:'jp', course:{id:1}, racedef:{season:1}, stats:{speed:1500}};
    const presets = path.join(dir,'presets.json'); write(presets,[p]);
    write(path.join(variants,'variants.json'), {jpBuild:'2026-09-13',presets:{cmFixture:name},variants:{[name]:{syoubu:true,syoubuLong:false,changed:{},positions:{}}},firstSeen:{920051:'2025-03-01'}});
    write(path.join(gt,'skills.json'), [{id:120051,jpname:'Count unique',char:[777]}]);
    write(path.join(gt,'support-cards.json'), []);
    write(path.join(gt,'character-cards.json'), [{card_id:777,release:'2025-03-01'}]);
    write(path.join(gt,'scenarios.json'), []);
    const chart = path.join(out,'cmFixture.json');
    write(chart,Object.fromEntries(strategies.map(s=>[s,[[920051,20,25]]])));
    const before = fs.readFileSync(chart,'utf8');
    fs.writeFileSync(path.join(out,'index.js'),'module.exports = '+JSON.stringify({ready:['cmFixture'],skills:{920051:['Count unique (inherited)',200,9,0,null]},meta:{sims:{cmFixture:name},countSkills:'count clauses taken as met'}}));
    // Stale cached standalone values must not replace the count-skill pass.
    for (const strategy of strategies) {
      const spec = {sim:name,courseId:1,racedef:p.racedef,stats:p.stats,strategy};
      const key = crypto.createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0,12);
      write(path.join(cache,key+'.json'),{spec,values:{920051:[9,10]}});
    }
    execFileSync(process.execPath,[path.join(__dirname,'../tools/build_skillvalues.js'),presets,global,jp,cache,'--variants='+variants,'--compose='+out,'--gametora='+gt,'--metadata-only'],{timeout:10000,stdio:'pipe'});
    const updated = require(path.join(out,'index.js'));
    assert.equal(fs.readFileSync(chart,'utf8'),before);
    assert.equal(updated.meta.countSkills,'count clauses taken as met');
    assert.equal(updated.meta.sims.cmFixture,name);
    assert.equal(updated.skills[920051][4],'2025-03-01');
    assert.equal(release.outBy(updated.skills[920051],'2025-02-28'),false);
    assert.equal(release.outBy(updated.skills[920051],'2025-03-01'),true);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
