const path=require('node:path');
function configureBranding(app){
 // Preserve Chromium storage, saved game paths, history and pending operations
 // from the existing `lagophone` Electron profile during the name change.
 const profile=path.join(app.getPath('appData'),'lagophone');
 app.setName('GTM PC');app.setPath('userData',profile);app.setPath('sessionData',profile);
 return profile;
}
module.exports={configureBranding};
