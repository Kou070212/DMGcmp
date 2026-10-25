'use strict';
// ver.0.3: ボス・デバフは後のバージョンで calculateDamage の enemy を拡張する。
const STORAGE_KEY='damageLab_v0_2';
const OLD_KEY='damageLab_v0_1';
const FIELDS=[
  {key:'critDamage',label:'クリティカルダメージ (%)',initial:50},
  {key:'baseAttack',label:'基礎攻撃力',initial:24057},
  {key:'equipmentAttack',label:'装備攻撃力',initial:0},
  {key:'attackBonus',label:'攻撃力増加率 (%)',initial:0},
  {key:'elementAttack',label:'属性攻撃力',initial:5851},
  {key:'elementAttackBonus',label:'属性攻撃力増加率 (%)',initial:75.32},
  {key:'elementDamageBonus',label:'属性ダメージ増加率 (%)',initial:13.53},
  {key:'skillDamageBonus',label:'スキルダメージ増加率 (%)',initial:0},
  {key:'skillMultiplier',label:'スキル倍率 (%)',initial:12},
  {key:'defenseIgnore',label:'防御無視 (%)',initial:0}
];
// スキル倍率は装備オプションではないため対象外。基礎攻撃力も対象外。
// オプションが装備攻撃力を直接付与するケースは「装備攻撃力」に記入する。
const OPTION_FIELDS=FIELDS.filter(f=>!['baseAttack','skillMultiplier'].includes(f.key));
const el=id=>document.getElementById(id);
const clone=o=>({...o});
const frac=x=>x/100;
const fmt=n=>Math.round(n).toLocaleString('ja-JP');
const defaultStats=()=>Object.fromEntries(FIELDS.map(f=>[f.key,f.initial]));
const emptyOptions=()=>Object.fromEntries(OPTION_FIELDS.map(f=>[f.key,0]));
function normalize(s,fields,defaults){const out={...defaults};for(const f of fields){const n=Number(s?.[f.key]);if(s?.[f.key]!==undefined&&Number.isFinite(n))out[f.key]=n;}return out;}
function initialState(){return{registered:false,mode:'stats',before:defaultStats(),after:defaultStats(),undo:null,optionsBefore:emptyOptions(),optionsAfter:emptyOptions(),optionsUndo:null};}
function load(){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
  if(!saved){try{saved=JSON.parse(localStorage.getItem(OLD_KEY));}catch{}}
  if(!saved)return initialState();
  const base=normalize(saved.before,FIELDS,defaultStats());
  return{
    registered:!!saved.registered,mode:saved.mode==='options'?'options':'stats',
    before:base,after:normalize(saved.after,FIELDS,base),
    undo:saved.undo?normalize(saved.undo,FIELDS,defaultStats()):null,
    optionsBefore:normalize(saved.optionsBefore,OPTION_FIELDS,emptyOptions()),
    optionsAfter:normalize(saved.optionsAfter,OPTION_FIELDS,emptyOptions()),
    optionsUndo:saved.optionsUndo?{
      before:normalize(saved.optionsUndo.before,OPTION_FIELDS,emptyOptions()),
      stats:normalize(saved.optionsUndo.stats,FIELDS,defaultStats())
    }:null
  };
}
let state=load();
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
function totalAttack(p){return(p.baseAttack+p.equipmentAttack)*(1+frac(p.attackBonus))+p.elementAttack*(1+frac(p.elementAttackBonus));}
function calculateDamage(p,enemy={defRatio:0,elementResistance:0,ignoreResistance:0,critDefense:0}){
  const attack=Math.max(0,totalAttack(p));
  const bonus=Math.max(0,1+frac(p.elementDamageBonus+p.skillDamageBonus)-(enemy.elementResistance||0));
  const defense=Math.min(1,1/(1+Math.max(0,enemy.defRatio||0))+Math.max(0,frac(p.defenseIgnore)-(enemy.ignoreResistance||0)));
  const crit=1+Math.max(0,frac(p.critDamage)-(enemy.critDefense||0));
  return attack*Math.max(0,frac(p.skillMultiplier))*bonus*defense*crit;
}
function adjustedStats(base,oldOpts,newOpts){
  const out=clone(base);
  for(const f of OPTION_FIELDS)out[f.key]=base[f.key]-oldOpts[f.key]+newOpts[f.key];
  return out;
}
function fieldHtml(group,f,value,disabled=false){
  return `<div class="field" id="field-${group}-${f.key}"><label for="${group}-${f.key}">${f.label}</label><input id="${group}-${f.key}" type="number" step="any" inputmode="decimal" value="${value}" data-group="${group}" data-key="${f.key}" ${disabled?'disabled':''} required></div>`;
}
function renderGroup(group,stats,fields,disabled=false){el(group+'Fields').innerHTML=fields.map(f=>fieldHtml(group,f,stats[f.key],disabled)).join('');}
function activeValues(){
  if(state.mode==='stats')return{before:state.before,after:state.after};
  return{before:state.before,after:adjustedStats(state.before,state.optionsBefore,state.optionsAfter)};
}
function renderAll(){
  const options=state.mode==='options';
  renderGroup('before',options?state.optionsBefore:state.before,options?OPTION_FIELDS:FIELDS,!options);
  renderGroup('after',options?state.optionsAfter:state.after,options?OPTION_FIELDS:FIELDS);
  renderGroup('setup',state.before,FIELDS);
  el('setupOverlay').hidden=state.registered;
  el('modeStats').classList.toggle('active',!options);
  el('modeOptions').classList.toggle('active',options);
  el('modeStats').setAttribute('aria-pressed',String(!options));
  el('modeOptions').setAttribute('aria-pressed',String(options));
  el('beforeHeading').textContent=options?'現在の魔法付与・刻印オプション':'変更前のステータス';
  el('afterHeading').textContent=options?'新しい魔法付与・刻印オプション':'変更後のステータス';
  el('beforeHint').textContent=options?'':'編集不可';
  el('afterHint').textContent=options?'新しいオプションを入力':'';
  el('modeHelp').textContent=options
    ?''
    :'変更前のステータスは固定です。変更後だけを編集し、確定すると新しい基準になります。';
  el('commit').textContent=options?'新しいオプションを確定（基準を更新）':'変更後を確定（基準を上書き）';
  el('restore').textContent=options?'新しいオプションを元に戻す':'変更後の入力をリセット';
  update();
}
function update(){
  const {before,after}=activeValues();
  const a=calculateDamage(before),b=calculateDamage(after);
  const change=a>0?(b/a-1)*100:null;
  el('beforeDamage').textContent=fmt(a);
  el('afterDamage').textContent=fmt(b);
  el('changeRate').textContent=change===null?'比較不可':`${change>=0?'+':''}${change.toFixed(2)}%`;
  el('changeRate').className=change===null?'':change>=0?'positive':'negative';
  el('changeAbsolute').textContent=`差分：${b-a>=0?'+':''}${fmt(b-a)} ダメージ`;
  el('undo').disabled=state.mode==='stats'?!state.undo:!state.optionsUndo;
  const opts=state.mode==='options';
  for(const f of (opts?OPTION_FIELDS:FIELDS)){
    const changed=opts?state.optionsBefore[f.key]!==state.optionsAfter[f.key]:state.before[f.key]!==state.after[f.key];
    el(`field-after-${f.key}`).classList.toggle('changed',changed);
  }
  save();
}
document.addEventListener('input',e=>{
  const input=e.target;
  if(!input.matches('input[data-group="after"],input[data-group="before"]'))return;
  if(input.dataset.group==='before'&&state.mode!=='options')return;
  if(input.value.trim()===''||!Number.isFinite(Number(input.value)))return;
  if(state.mode==='options'){
    if(input.dataset.group==='before')state.optionsBefore[input.dataset.key]=Number(input.value);
    else state.optionsAfter[input.dataset.key]=Number(input.value);
  }else state.after[input.dataset.key]=Number(input.value);
  update();
});
function validGroup(group,fields){
  for(const f of fields){const input=el(`${group}-${f.key}`);if(!input.checkValidity()||input.value.trim()===''){input.focus();return false;}}
  return true;
}
el('setupForm').addEventListener('submit',e=>{
  e.preventDefault();if(!validGroup('setup',FIELDS))return;
  const next={};for(const f of FIELDS)next[f.key]=Number(el('setup-'+f.key).value);
  state={...initialState(),registered:true,mode:state.mode,before:next,after:clone(next)};
  renderAll();
});
el('modeStats').addEventListener('click',()=>{state.mode='stats';renderAll();});
el('modeOptions').addEventListener('click',()=>{state.mode='options';renderAll();});
el('commit').addEventListener('click',()=>{
  if(!state.registered)return;
  if(state.mode==='stats'){
    if(!validGroup('after',FIELDS))return;
    state.undo=clone(state.before);
    state.optionsUndo=null;
    state.before=clone(state.after);
    state.after=clone(state.before);
    // ステータス確定後も登録中の現在オプションはそのまま維持する。
  }else{
    if(!validGroup('before',OPTION_FIELDS)||!validGroup('after',OPTION_FIELDS))return;
    state.optionsUndo={before:clone(state.optionsBefore),stats:clone(state.before)};
    state.before=adjustedStats(state.before,state.optionsBefore,state.optionsAfter);
    state.after=clone(state.before);
    state.optionsBefore=clone(state.optionsAfter);
    // ステータス比較モードのundoは異なる基準への復元を避けるため破棄する。
    state.undo=null;
  }
  renderAll();
});
el('undo').addEventListener('click',()=>{
  if(state.mode==='stats'){
    if(!state.undo)return;
    state.before=clone(state.undo);state.after=clone(state.before);state.undo=null;
  }else{
    if(!state.optionsUndo)return;
    state.before=clone(state.optionsUndo.stats);
    state.after=clone(state.before);
    state.optionsBefore=clone(state.optionsUndo.before);
    state.optionsAfter=clone(state.optionsBefore);
    state.optionsUndo=null;
  }
  renderAll();
});
el('restore').addEventListener('click',()=>{
  if(state.mode==='stats')state.after=clone(state.before);
  else state.optionsAfter=clone(state.optionsBefore);
  renderAll();
});
el('reset').addEventListener('click',()=>{
  if(!confirm('初期ステータス設定画面に戻ります。現在の登録内容を変更しますか？'))return;
  state.registered=false;state.undo=null;state.optionsUndo=null;
  state.after=clone(state.before);state.optionsBefore=emptyOptions();state.optionsAfter=emptyOptions();
  renderAll();
});
renderAll();
