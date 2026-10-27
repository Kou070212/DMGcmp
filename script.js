'use strict';
// ver.0.4: ボス・デバフは後のバージョンで calculateDamage の enemy を拡張する。
const STORAGE_KEY='damageLab_v0_2';
const LANG_KEY='damageLab_language';
let language=localStorage.getItem(LANG_KEY)==='en'?'en':'ja';
const OLD_KEY='damageLab_v0_1';

const I18N={
 ja:{title:'ダメージ比較シミュレーター',description:'登録ステータスを基準に、ステータス変更と魔法付与・刻印オプション変更を比較します。',reset:'ステータスリセット',statsMode:'ステータス比較モード',optionsMode:'魔法付与・刻印オプション比較モード',beforeDamage:'変更前の推定ダメージ',afterDamage:'変更後の推定ダメージ',changeRate:'火力変化率',undo:'一つ戻る',statsBeforeHeading:'変更前のステータス',statsAfterHeading:'変更後のステータス',optionsBeforeHeading:'現在の魔法付与・刻印オプション',optionsAfterHeading:'新しい魔法付与・刻印オプション',readOnly:'編集不可',newOptions:'新しいオプションを入力',modeHelp:'変更前のステータスは固定です。変更後だけを編集し、確定すると新しい基準になります。',commitStats:'変更後を確定（基準を上書き）',commitOptions:'新しいオプションを確定（基準を更新）',restoreStats:'変更後の入力をリセット',restoreOptions:'新しいオプションを元に戻す',footer:'入力データはこのブラウザー内に自動保存されます。',setupTitle:'初期ステータス登録',setupDescription:'現在のステータスを入力してください。登録後、変更前の欄は固定されます。',setupStart:'このステータスで開始',notComparable:'比較不可',difference:'差分：',damageUnit:'ダメージ',resetConfirm:'初期ステータス設定画面に戻ります。現在の登録内容を変更しますか？',fields:['クリティカルダメージ (%)','基礎攻撃力','装備攻撃力','攻撃力増加率 (%)','属性攻撃力','属性攻撃力増加率 (%)','属性ダメージ増加率 (%)','スキルダメージ増加率 (%)','スキル倍率 (%)','防御無視 (%)']},
 en:{title:'Damage Comparison Simulator',description:'Compare damage changes from character stats and enchantment / engraving options against your saved baseline.',reset:'Reset Base Stats',statsMode:'Stat Comparison',optionsMode:'Enchantment / Engraving Options',beforeDamage:'Estimated Damage Before',afterDamage:'Estimated Damage After',changeRate:'Damage Change',undo:'Undo Last Commit',statsBeforeHeading:'Current Stats',statsAfterHeading:'New Stats',optionsBeforeHeading:'Current Enchantment / Engraving Options',optionsAfterHeading:'New Enchantment / Engraving Options',readOnly:'Read-only',newOptions:'Enter new options',modeHelp:'Current stats are locked. Edit the new stats, then commit to make them your new baseline.',commitStats:'Commit New Stats',commitOptions:'Commit New Options',restoreStats:'Reset New Stats',restoreOptions:'Reset New Options',footer:'Your data is automatically saved in this browser.',setupTitle:'Set Up Base Stats',setupDescription:'Enter your current stats. They will be locked as your baseline after setup.',setupStart:'Start with These Stats',notComparable:'Cannot compare',difference:'Difference: ',damageUnit:'damage',resetConfirm:'Return to initial stat setup and edit your saved baseline?',fields:['Critical Damage (%)','Base Attack','Equipment Attack','Attack Bonus (%)','Elemental Attack','Elemental Attack Bonus (%)','Elemental Damage Bonus (%)','Skill Damage Bonus (%)','Skill Multiplier (%)','Defense Ignore (%)']}
};
function tr(key){return I18N[language][key]||key;}
function fieldLabel(field){return I18N[language].fields[FIELDS.findIndex(f=>f.key===field.key)];}
function translateStatic(){
 document.documentElement.lang=language;
 document.title=`${tr('title')} ver.0.4`;
 const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value;};
 set('header h1',tr('title'));set('header div > p:not(.eyebrow)',tr('description'));
 set('#reset',tr('reset'));set('#modeStats',tr('statsMode'));set('#modeOptions',tr('optionsMode'));
 set('.results .metric:nth-child(1) span',tr('beforeDamage'));set('.results .metric:nth-child(2) span',tr('afterDamage'));set('.results .metric:nth-child(3) span',tr('changeRate'));
 set('#undo',tr('undo'));set('footer',tr('footer'));set('#setupTitle',tr('setupTitle'));
 set('#setupOverlay .setup > p:not(.eyebrow)',tr('setupDescription'));
 set('#setupForm button[type="submit"]',tr('setupStart'));
 set('#langToggle',language==='ja'?'English':'日本語');
}

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
const fmt=n=>Math.round(n).toLocaleString(language==='en'?'en-US':'ja-JP');
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
  const bonus = Math.max(
    0,
    1 + frac(p.elementDamageBonus) - (enemy.elementResistance || 0)
) * (1 + frac(p.skillDamageBonus));
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
  return `<div class="field" id="field-${group}-${f.key}"><label for="${group}-${f.key}">${fieldLabel(f)}</label><input id="${group}-${f.key}" type="number" step="any" inputmode="decimal" value="${value}" data-group="${group}" data-key="${f.key}" ${disabled?'disabled':''} required></div>`;
}
function renderGroup(group,stats,fields,disabled=false){el(group+'Fields').innerHTML=fields.map(f=>fieldHtml(group,f,stats[f.key],disabled)).join('');}
function activeValues(){
  if(state.mode==='stats')return{before:state.before,after:state.after};
  return{before:state.before,after:adjustedStats(state.before,state.optionsBefore,state.optionsAfter)};
}
function renderAll(){
  translateStatic();
  const options=state.mode==='options';
  renderGroup('before',options?state.optionsBefore:state.before,options?OPTION_FIELDS:FIELDS,!options);
  renderGroup('after',options?state.optionsAfter:state.after,options?OPTION_FIELDS:FIELDS);
  renderGroup('setup',state.before,FIELDS);
  el('setupOverlay').hidden=state.registered;
  el('modeStats').classList.toggle('active',!options);
  el('modeOptions').classList.toggle('active',options);
  el('modeStats').setAttribute('aria-pressed',String(!options));
  el('modeOptions').setAttribute('aria-pressed',String(options));
  el('beforeHeading').textContent=options?tr('optionsBeforeHeading'):tr('statsBeforeHeading');
  el('afterHeading').textContent=options?tr('optionsAfterHeading'):tr('statsAfterHeading');
  el('beforeHint').textContent=options?'':tr('readOnly');
  el('afterHint').textContent=options?tr('newOptions'):'';
  el('modeHelp').textContent=options?'':tr('modeHelp');
  el('commit').textContent=options?tr('commitOptions'):tr('commitStats');
  el('restore').textContent=options?tr('restoreOptions'):tr('restoreStats');
  update();
}
function update(){
  const {before,after}=activeValues();
  const a=calculateDamage(before),b=calculateDamage(after);
  const change=a>0?(b/a-1)*100:null;
  el('beforeDamage').textContent=fmt(a);
  el('afterDamage').textContent=fmt(b);
  el('changeRate').textContent=change===null?tr('notComparable'):`${change>=0?'+':''}${change.toFixed(2)}%`;
  el('changeRate').className=change===null?'':change>=0?'positive':'negative';
  el('changeAbsolute').textContent=`${tr('difference')}${b-a>=0?'+':''}${fmt(b-a)} ${tr('damageUnit')}`;
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
  if(!confirm(tr('resetConfirm')))return;
  state.registered=false;state.undo=null;state.optionsUndo=null;
  state.after=clone(state.before);state.optionsBefore=emptyOptions();state.optionsAfter=emptyOptions();
  renderAll();
});
renderAll();

el('langToggle').addEventListener('click',()=>{language=language==='ja'?'en':'ja';localStorage.setItem(LANG_KEY,language);renderAll();});
