const catalog = require('../shared/optimization.json');
const {supportsWindows}=require('../shared/windows-compatibility.mjs');
function buildPlan(input, selected, actual, gamePath = null, actualBuild = undefined) {
  if (!['10','11'].includes(selected) || selected !== actual) throw new Error('Выбранная Windows не совпадает с установленной.');
  if(actualBuild!==undefined&&(!Number.isInteger(actualBuild)||actualBuild<10240||(actualBuild>=22000?'11':'10')!==selected))throw new Error('Сборка Windows не соответствует выбранной системе.');
  if (!input || typeof input !== 'object') throw new Error('Некорректный профиль');
  if(input.scope!==undefined&&!['game','power'].includes(input.scope))throw new Error('Неизвестный режим оптимизации');
  if(input.scope==='power'&&(input.game!=='none'||input.selected?.length!==1||input.selected[0]!=='power'))throw new Error('Режим питания принимает только план питания');
  const profile = catalog.profiles.find(p=>p.id===input.profile);
  if (!profile || !['keep','balanced','high','ultimate','lagophone'].includes(input.power) || !catalog.games.some(g=>g.id===input.game)) throw new Error('Неизвестный профиль, план питания или игра');
  if (!input.uses || catalog.features.some(f=>typeof input.uses[f.id] !== 'boolean') || typeof input.sysmain !== 'boolean') throw new Error('Ответьте на вопросы об использовании функций');
  const steps=catalog.steps.filter(s=>{
    if(s.level>profile.level||!supportsWindows(s,selected,actualBuild)) return false;
    if(s.special==='power') return input.power!=='keep';
    if(s.special==='game') return input.game!=='none' && !!gamePath;
    if(s.id==='sysmain') return input.sysmain===true;
    return !s.feature || input.uses[s.feature]===false;
  });
  if (!Array.isArray(input.selected) || new Set(input.selected).size!==input.selected.length || input.selected.some(id=>!steps.some(s=>s.id===id))) throw new Error('Список действий не соответствует вашим ответам');
  if(input.scope==='game'&&(input.power!=='keep'||input.selected.some(id=>!catalog.steps.some(s=>s.id===id&&s.special==='game'))))throw new Error('Игровой режим принимает только настройки выбранной игры');
  const chosen=steps.filter(s=>input.selected.includes(s.id));
  if(!chosen.length) throw new Error('Выберите хотя бы одно действие');
  const ratingIds=['game','power'].includes(input.scope)?[]:steps.filter(s=>!s.special&&!s.experimental&&s.defaultSelected!==false&&s.category!=='Экспериментальные').map(s=>s.id);
  return {scope:input.scope,game:input.game,ratingPlan:{basis:'profiles-v2',ids:ratingIds},profile:profile.id, version:selected, ids:chosen.map(s=>s.id), power:input.power, gamePath:chosen.some(s=>s.special==='game')?gamePath:null};
}
module.exports={catalog, buildPlan};
