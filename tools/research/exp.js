// Skill-value noise and mood check: 40 gold skills (every 7th), Pace Chaser; 24/96 races vs 400.
// Usage: node tools/research/exp.js [cupId]  (default cm23)
const B=require('./bench.js');
const ids=Object.keys(B.C.skills).filter(id=>B.C.meta[id]&&/^20\d{4}$/.test(id));
const pick=[];for(let i=0;i<ids.length&&pick.length<40;i+=7)pick.push(ids[i]);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function vals(mood,n,seed){const input={strategy:'Senkou',speed:1500,stamina:1000,power:1150,guts:700,wisdom:1050,mood};const o={};for(const id of pick){try{o[id]=mean(B.run(input,[],[id],n,seed).results.results)}catch(e){}}return o}
const rank=o=>Object.keys(o).sort((a,b)=>o[b]-o[a]);
const truth=vals(0,400,999), great=vals(2,400,999), s24a=vals(0,24,271828), s24b=vals(0,24,12345), s96=vals(0,96,314159);
const top=(o,k)=>rank(o).slice(0,k);
const overlap=(a,b,k)=>top(a,k).filter(x=>top(b,k).includes(x)).length;
const err=o=>mean(Object.keys(truth).map(k=>Math.abs((o[k]||0)-truth[k])));
console.log('n skills',Object.keys(truth).length,'top10 truth:',top(truth,10).map(k=>k+':'+truth[k].toFixed(2)).join(' '));
for(const [n,o] of Object.entries({great,s24a,s24b,s96})) console.log(n,'top10 overlap',overlap(o,truth,10),'top5',overlap(o,truth,5),'mean abs err L',err(o).toFixed(3));
const diff=Object.keys(truth).map(k=>[k,great[k]-truth[k]]).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,5);console.log('biggest Great-vs-Normal diffs',diff.map(([k,d])=>k+':'+d.toFixed(2)).join(' '));
