const palettes={black:{color:'#121212',symbolColor:'#e2e2e2',page:'#090909'},white:{color:'#eff0ed',symbolColor:'#17212b',page:'#e8e9e6'}};
function windowChromeOptions(platform){return platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:{color:palettes.black.color,symbolColor:palettes.black.symbolColor,height:34}}:{}}
function applyWindowTheme(window,theme){
 if(typeof theme!=='string'||!Object.hasOwn(palettes,theme))throw Error('Неизвестная тема окна.');
 const {color,symbolColor,page}=palettes[theme];window.setTitleBarOverlay({color,symbolColor,height:34});window.setBackgroundColor(page);
}
module.exports={windowChromeOptions,applyWindowTheme};
