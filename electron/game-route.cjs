// There is currently no verified anonymous provider for the required foreign-region route.
// The previous transport is retained exclusively to recover our own old tunnel leases.
const BLOCKER='Подтверждённый бесплатный игровой узел без регистрации пока недоступен. Игра не запущена, настройки сети не менялись.';
function createGameRoute({legacyRecovery}){
 return {
  init:()=>legacyRecovery.init(),
  async status(){const old=await legacyRecovery.status();return {provider:'none',available:false,blocker:BLOCKER,owned:old.owned===true,connected:false,connecting:false,country:null,ipChanged:false,ipv6Policy:null,error:old.owned?old.error||'Нужно отключить прошлое подключение GTM PC.':'',matchStatus:'not-verified'}},
  assertAvailable(){throw Object.assign(Error(BLOCKER),{code:'ROUTE_UNAVAILABLE'})},
  async connect(){throw Object.assign(Error(BLOCKER),{code:'ROUTE_UNAVAILABLE'})},
  disconnect:()=>legacyRecovery.disconnect(),cancel:()=>legacyRecovery.cancel(),
 };
}
module.exports={createGameRoute,BLOCKER};
