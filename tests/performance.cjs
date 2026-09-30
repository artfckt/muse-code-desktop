// Synthetic production-renderer benchmark; no account or model requests.
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  for(const count of [100,500,2000]) {
   const context=await browser.newContext({viewport:{width:1440,height:940}});
   await context.addInitScript({path:path.resolve('tests/ui/mock.cjs')});
   const page=await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.MUSE_PREVIEW_URL || 'http://127.0.0.1:5176');
   await page.getByText('Using your CLI sign-in').waitFor();
   await page.evaluate(count=>{
    window.muse.resumeSession=async()=>({session:{sessionId:'perf',workspaceRoot:'/projects/studio'},history:{items:Array.from({length:count},(_,i)=>({itemId:'m-'+i,kind:i%2?'agentMessage':'userMessage',status:'completed',revision:1,text:i%2?'## Response '+i+'\n\nA synthetic answer with **emphasis**, a link and a small code block.\n\n```js\nconst result = '+i+';\n```':'Audit request '+i}))}});
    window.testBridge.setSessions([{sessionId:'perf',name:'Performance fixture',workspaceRoot:'/projects/studio',updatedAt:new Date().toISOString()}]);
   },count);
   const start=Date.now();await page.locator('.session-row').click();
   await page.waitForFunction(count=>document.querySelectorAll('.assistant-message,.user-message').length===Math.min(count,200),count);
   const openMs=Date.now()-start;
   const inputStart=Date.now();await page.getByRole('textbox',{name:'Message Muse'}).fill('Typing performance test');
   const inputMs=Date.now()-inputStart;
   const deltaBatchMs=await page.evaluate(async count=>{
    const id='m-'+(count-1);window.testBridge.emit({method:'item/updated',params:{sessionId:'perf',item:{itemId:id,kind:'agentMessage',status:'inProgress',revision:2,text:'Streaming update'}}});
    const start=performance.now();for(let i=0;i<30;i++)window.testBridge.emit({method:'item/delta',params:{sessionId:'perf',itemId:id,field:'text',delta:' update-'+i,viewCursor:'bench-'+i}});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return Math.round(performance.now()-start);
   },count);
   const renderedMessages=await page.locator('.assistant-message,.user-message').count();
   assert.ok(renderedMessages<=200);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({messages:count,renderedMessages,openMs,inputMs,deltaBatchMs,domNodes:await page.locator('*').count(),pageErrors:errors}));
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
