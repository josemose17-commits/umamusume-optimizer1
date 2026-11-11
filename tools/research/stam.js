// Full-spurt rate by stamina, no skills, Normal mood. Usage: node tools/research/stam.js cm22
const B=require('./bench.js');
const styles=['Nige','Senkou','Sasi','Oikomi'];
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
for(const st of styles){
  const row=[];
  for(const stam of [550,600,650,700,750,850]){
    const input={strategy:st,speed:1450,stamina:stam,power:1300,guts:700,wisdom:1050,mood:0,surfaceAptitude:'A',distanceAptitude:'A',strategyAptitude:'A'};
    const r=B.run(input,[],[],120,7).results; row.push(stam+':'+(r.runData.nspurt[1]/120*100).toFixed(0)+'%');
  }
  // speed vs stamina trade: 1650/650 vs 1450/850 head-to-head
  console.log(st,'full-spurt rate by stamina',row.join(' '));
}
