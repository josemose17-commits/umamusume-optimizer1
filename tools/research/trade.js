// Head-to-head stat lines (speed vs stamina), no skills. Usage: node tools/research/trade.js cm22
const B=require('./bench.js');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
// reuse bench's handler through run with a patched request
const RS=B.RS; const orig=RS.request;
function h2h(st,base,alt){
  RS.request=(p,i,b,a,c,n,s)=>{const m=orig(p,i,b,a,c,n,s);Object.assign(m.data.uma2,alt);return m;};
  const r=B.run(Object.assign({strategy:st,mood:0},base),[],[],120,11).results;RS.request=orig;
  return mean(r.results);
}
const base={speed:1450,stamina:850,power:1300,guts:700,wisdom:1050};
for(const st of ['Nige','Senkou','Sasi','Oikomi']){
  const out=[];
  for(const [lbl,alt] of [['+200spd/-200stam',{speed:1650,stamina:650}],['+100spd/-100stam',{speed:1550,stamina:750}],['JP line 1600/650/1200/750/1100',{speed:1600,stamina:650,power:1200,guts:750,wisdom:1100}],['+150spd/-150stam',{speed:1600,stamina:700}]])
    out.push(lbl+': '+h2h(st,base,alt).toFixed(2)+'L');
  console.log(st,out.join(' | '));
}
