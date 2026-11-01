const {test}=require('node:test'),assert=require('node:assert/strict');
const {windowChromeOptions,applyWindowTheme}=require('./window-chrome.cjs');
test('Windows keeps native caption controls with a themed hidden title bar; other platforms keep their frame',()=>{
 assert.deepEqual(windowChromeOptions('linux'),{});assert.deepEqual(windowChromeOptions('darwin'),{});
 assert.equal(windowChromeOptions('win32').titleBarStyle,'hidden');assert.equal(windowChromeOptions('win32').titleBarOverlay.height,34);
 const changes=[],window={setTitleBarOverlay:value=>changes.push(value),setBackgroundColor:value=>changes.push(value)};
 applyWindowTheme(window,'white');assert.deepEqual(changes,[{color:'#e9dfc5',symbolColor:'#30291d',height:34},'#ded4b5']);
 changes.length=0;for(const value of ['__proto__','unknown',null,{},'#ffffff'])assert.throws(()=>applyWindowTheme(window,value));assert.deepEqual(changes,[]);
});
