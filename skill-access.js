// Skill acquisition routes, distinct from race value and purchase cost. All probabilities
// below are model estimates; a card offer or an inspiration roll is never a learned skill.
(function(root) {
  const B=root.UmaSkillBudget || (typeof require!=="undefined" ? require("./skill-budget.js") : null);
  const F=root.UmaFamily || (typeof require!=="undefined" ? require("./family.js") : null);
  const R=root.UmaRating || (typeof require!=="undefined" ? require("./rating.js") : null);
  const clamp=p=>Math.max(0,Math.min(1,+p||0));
  function create(metadata=B.DATA.skills) {
    const routes=B.create({metadata}), family=id=>metadata[id] && metadata[id][0];
    const white=id=>{const c=routes.chain(id);return c && c.find(x=>metadata[x][3]===1 && x[0]!=="9") || null;};
    function build(o) {
      const byId={}, source=(id,s)=>{
        // An inheritance white can unlock its ordinary upgrades, never a gold. Gold hints
        // unlock their canonical prerequisites; no relationship is guessed from names.
        const unlocked=routes.unlocks(id);
        (unlocked.length ? unlocked : [String(id)]).forEach(to=>{
          const row=byId[to] || (byId[to]={id:to,sources:[]});
          const key=s.key+":"+(family(to)||to), old=row.sources.find(x=>x.key===key);
          const value=Object.assign({},s,{key,via:String(id),hint:String(to)===String(id)?s.hint:0});
          if(!old)row.sources.push(value);else if(value.p>old.p)Object.assign(old,value);
        });
      };
      const trainee=o.trainee || {};
      (trainee.is||[]).forEach(id=>source(id,{key:"innate:"+id,kind:"trainee",name:"Trainee's innate skill",p:1,hint:0}));
      (trainee.as||[]).forEach(id=>source(id,{key:"awakening:"+id,kind:"trainee",name:"Awakening (assumed unlocked)",p:1,hint:0,conditional:true}));
      (o.cards||[]).forEach(card=>Object.entries(card.offers||{}).forEach(([id,p])=>{
        if(p>0)source(id,{key:"card:"+card.id,kind:"deck",name:(card.borrowed?"Borrow: ":card.planned?"Planned card: ":"Card: ")+card.name,p:clamp(p),hint:1,conditional:!!card.planned});
      }));
      Object.entries(o.offers||{}).forEach(([id,p])=>{if(p>0)source(id,{key:"deck:"+(family(id)||id),kind:"deck",name:"Parent training deck",p:clamp(p),hint:1});});
      const f=o.family||{}, aff=o.affinity||{};
      F.SLOTS.forEach(slot=>{
        const m=f[slot];if(!m || !m.cid)return;
        const label=(F.PARENT_OF[slot]?"Grandparent ":"Parent ")+slot+" · "+(m.name||m.tid||m.cid), scale=F.slotScale(slot);
        (m.white||[]).forEach(([id,stars])=>{const base=white(id);if(base)source(base,{key:"spark:"+slot+":"+family(base),kind:"parent",slot,name:label+" white spark",p:F.twice(F.WHITE,stars,aff[slot],scale),hint:1,conditional:true});});
        if(m.green && m.unique)source(m.unique,{key:"unique:"+slot,kind:"parent",slot,name:label+" inherited unique",p:F.PARENT_OF[slot]?F.twice(F.GREEN,m.green,aff[slot],scale):1,hint:1,conditional:!!F.PARENT_OF[slot] || !!m.planned});
        // A planned X has not produced these sparks yet. Keep that full chain of chances
        // explicit and separate from actual veterans' white arrays.
        if(m.planned && !m.manual)(m.projectedWhite||[]).forEach(w=>{
          const base=white(w.id);if(!base)return;
          const stars=w.stars||[0.2,0.7,0.1], fire=stars.reduce((n,p,i)=>n+p*F.twice(F.WHITE,i+1,aff[slot],scale),0);
          source(base,{key:"projected:"+slot+":"+family(base),kind:"parent",slot,name:label+" · train, generate spark, inherit",p:clamp(w.spark)*fire,hint:1,conditional:true,learn:w.learn,spark:w.spark});
        });
      });
      if(o.mode==="finished")(o.entered||[]).forEach(x=>source(x.id,{key:"entered:"+x.id,kind:"entered",name:x.learned?"Reported equipped":"Reported skill shop",p:1,hint:+x.hint||0}));
      Object.values(byId).forEach(row=>{
        row.p=1-row.sources.reduce((miss,s)=>miss*(1-clamp(s.p)),1);
        row.deck=1-row.sources.filter(s=>s.kind!=="parent").reduce((miss,s)=>miss*(1-clamp(s.p)),1);
      });
      return {byId,missing:(o.entered||[]).filter(x=>!byId[x.id]).map(x=>String(x.id))};
    }
    function sample(graph,seed,kinds) {
      let state=seed>>>0 || 1;const rolls=new Map(),available=[],hints={};
      const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
      Object.keys(graph.byId).sort().forEach(id=>{
        const row=graph.byId[id];let hit=false,hint=0;
        row.sources.filter(s=>!kinds || kinds.includes(s.kind)).forEach(s=>{
          if(!rolls.has(s.key))rolls.set(s.key,random());
          if(rolls.get(s.key)<s.p){hit=true;hint=Math.min(5,hint+(s.hint||0));}
        });
        if(hit){available.push(id);if(hint)hints[id]=hint;}
      });
      return {available,hints};
    }
    function parentRel(rel,plan) {
      if(!plan || !plan.parentValues)return rel;
      const targets={},why={};
      Object.entries(plan.parentValues).forEach(([id,value])=>{const base=white(id);if(base && value>0){targets[base]=Math.max(targets[base]||0,value);why[base]="purchase";}});
      return {targets,why,L:Object.assign({},rel.L||{},plan.raceL||{})};
    }
    // Parent buys: SS first, then expected useful white-spark value. The race model's
    // parent targets supply weights; the parent's own aptitudes supply rating points.
    function project(o) {
      const t=o.trainee, weights=o.weights||{}, graph=build({trainee:t,offers:o.offers,family:o.family,affinity:o.affinity});
      const values=Object.fromEntries(Object.keys(graph.byId).filter(id=>metadata[id]).map(id=>[id,R.skillScore(id,t.apt)]));
      const relevant={};Object.keys(weights).forEach(id=>{const w=white(id);if(w)relevant[w]=weights[id];});
      const ws={};Object.keys(relevant).forEach(id=>{ws[family(id)]=Math.max(ws[family(id)]||0,relevant[id]);});
      const spark=id=>metadata[id] && metadata[id][3]===2?0.4:metadata[id] && metadata[id][2]?0.25:0.2;
      const finals=o.finals && o.finals.length?o.finals:Array.from({length:o.runs||16},()=>({stats:o.stats,sp:o.sp}));
      const out={families:{},ss:0,of:finals.length,spent:0,rating:0,plans:[],model:"sampled offers; Lv1 hints for unobserved routes"};
      finals.forEach((career,i)=>{
        const shop=sample(graph,(o.seed||91823)+i*7919), costs=B.create({metadata,skills:values,available:shop.available,must:o.must||[],lengthValue:1,spValue:0});
        const minimum=o.minimum==null?R.SS:o.minimum, base=R.statsScore(career.stats)+R.uniqueBonus(t.r,t.r), gap=minimum-base;
        let buy=costs.solveSS(shop.hints,career.sp,{gap,relevant});
        const optionGroups=costs.options(shop.hints);
        const key=selected=>{
          const spent=selected.reduce((n,x)=>n+x.cost,0), rating=selected.reduce((n,x)=>n+x.value,0), must=new Set(selected.flatMap(x=>x.required)).size;
          const worth=selected.reduce((n,x)=>n+(ws[x.family]||0)*spark(x.id),0), reached=rating>=gap;
          return {selected,spent,rating,worth,reached,key:[must,+reached,reached?worth:rating,reached?rating:worth,-spent]};
        };
        const better=(a,b)=>{const k=a.key.findIndex((v,i)=>Math.abs(v-b.key[i])>1e-9);return k>=0 && a.key[k]>b.key[k];};
        let best=key(buy.selected);
        for(let pass=0;pass<2;pass++){
          let next=best;
          optionGroups.flat().forEach(option=>{
            const rest=best.selected.filter(x=>x.family!==option.family);
            const try_=list=>{const c=key(list);if(c.spent<=career.sp && better(c,next))next=c;};
            try_(rest.concat(option));
            best.selected.forEach(old=>try_(rest.filter(x=>x.id!==old.id).concat(option)));
          });
          if(next===best)break;best=next;
        }
        out.ss+=+best.reached;out.spent+=best.spent;out.rating+=base+best.rating;
        best.selected.forEach(x=>{
          if(!(ws[x.family]>0))return;
          const row=out.families[x.family]||(out.families[x.family]={id:white(x.id),learn:0,spark:0,gold:0});
          row.learn+=1/finals.length;row.spark+=spark(x.id)/finals.length;row.gold+=+(metadata[x.id][3]===2)/finals.length;
        });
        out.plans.push({spent:best.spent,budget:career.sp,rating:base+best.rating,reached:best.reached,ids:best.selected.map(x=>x.id)});
      });
      out.spent/=finals.length;out.rating/=finals.length;out.ssShare=out.ss/out.of;
      return out;
    }
    return {build,sample,parentRel,project,white,family};
  }
  const api={create};if(typeof module!=="undefined" && module.exports)module.exports=api;else root.UmaSkillAccess=api;
})(typeof window!=="undefined"?window:globalThis);
