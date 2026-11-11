// Shared harness: loads the pinned Umalator worker headless. Usage: node tools/research/bench.js [cupId] [mood]
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..','..');
global.window=undefined;
const RS=require(root+'/race-skills.js');
const C=JSON.parse(fs.readFileSync(root+'/data/race-skills.json','utf8'));
let handler=null,last=null;
const sb={console:{log(){},warn(){},error(){},assert(){}},addEventListener(t,f){if(t==='message')handler=f},postMessage(m){last=m},Math,Date,Map,Set,Array,Object,JSON,Number,String,Symbol,Error,Float64Array,Uint32Array,Int32Array,Uint8Array,ArrayBuffer,DataView,BigInt,isNaN,isFinite,parseInt,parseFloat,Infinity,NaN};
sb.self=sb;sb.globalThis=sb;vm.createContext(sb);
vm.runInContext(fs.readFileSync(root+'/vendor/umalator/simulator.worker.js','utf8'),sb);
const src=fs.readFileSync(root+'/data/presets.js','utf8');const P=JSON.parse(src.match(/const PRESETS = (\{.*?\});\n/s)[1]);
const preset=P.list.find(c=>c.id===(process.argv[2]||'cm23'));
const golds=Object.keys(C.skills).filter(id=>C.meta[id]&&/^20[0-9]{4}$/.test(id)).slice(0,12);
module.exports={RS,C,preset,run:(input,before,after,n,seed)=>{const m=RS.request(preset,input,before,after,C,n,seed);last=null;handler({data:m});return last;}};
if(require.main===module){
const input=Object.assign({strategy:'Senkou',speed:1500,stamina:1000,power:1150,guts:700,wisdom:1050,mood:+(process.argv[3]||2)});
const t=Date.now();let ok=0;
for(let i=0;i<golds.length;i++){try{const r=module.exports.run(input,[],[golds[i]],24,271828);ok++;}catch(e){}}
console.log('per compare(24) ms',(Date.now()-t)/golds.length,'ok',ok, Object.keys(last||{}));
const r=module.exports.run(input,[],golds.slice(0,6),96,1);console.log(Object.keys(r), JSON.stringify(r).slice(0,300));
}
