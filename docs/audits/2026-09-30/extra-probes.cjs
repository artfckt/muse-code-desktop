const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path");
const out=__dirname,root=path.resolve(out,"../../..");
const results=[];
let browser;
async function open(setup){const c=await browser.newContext({viewport:{width:1440,height:940}});await c.addInitScript({path:path.join(root,"tests/ui/mock.cjs")});if(setup)await c.addInitScript(setup);const p=await c.newPage();const errors=[];p.on("pageerror",e=>errors.push(e.message));await p.goto(process.env.MUSE_AUDIT_URL || "http://127.0.0.1:5174");await p.getByText("Using your CLI sign-in").waitFor();return {c,p,errors};}
async function start(p){await p.getByRole("button",{name:"New conversation ＋"}).click();await p.getByRole("button",{name:"Create conversation"}).click();await p.locator(".new-conversation-dialog").waitFor({state:"detached"});}
async function probe(id,fn){try{results.push({id,observation:await fn()});}catch(e){results.push({id,probeError:e.stack});}fs.writeFileSync(path.join(out,"extra-observations.json"),JSON.stringify({baseCommit:"ab7f3658f8c509b984de0310b632f0d2be390da9",results},null,2));console.log(id,JSON.stringify(results.at(-1)));}
(async()=>{
browser=await chromium.launch({headless:true});
await probe("usage-after-native-logged-out",async()=>{
 const {c,p}=await open();
 const now=Date.now();
 await p.evaluate(now=>window.testBridge.emit({method:"usage/changed",params:{observedAtMs:now,tier:"synthetic-tier",window:{usedPercent:45,resetsAtMs:now+3600000,windowDurationMins:300},weekly:{usedPercent:75,resetsAtMs:now+86400000}}}),now);
 await p.locator(".usage-meter").first().waitFor();
 await p.evaluate(()=>window.testBridge.setAccount({state:"loggedOut",credentialRequired:true}));
 await p.waitForTimeout(100);
 const observation={account:await p.locator(".account-button").innerText(),usage:await p.locator(".usage-section").innerText()};
 await c.close();return observation;
});
await probe("failed-mixed-upload",async()=>{
 const {c,p}=await open();
 await p.evaluate(()=>window.muse.saveAttachment=async x=>{
   window.testBridge.calls.push(["saveAttachment",x.name]);
   if(x.name.endsWith(".exe"))throw Error("Unsupported attachment.");
   return{id:x.name,name:x.name,mediaType:"text/plain",path:"/audit/"+x.name,url:"muse-media://local/?path="+x.name};
 });
 await p.locator('input[type="file"]').setInputFiles([{name:"accepted.md",mimeType:"text/markdown",buffer:Buffer.from("Audit")},{name:"unsupported.exe",mimeType:"application/octet-stream",buffer:Buffer.from("Audit")}]);
 await p.getByRole("alert").waitFor();
 const observation={savedFiles:await p.evaluate(()=>window.testBridge.calls.filter(c=>c[0]==="saveAttachment")),visibleAttachments:await p.locator(".image-attachments").count(),error:await p.getByRole("alert").innerText()};
 await c.close();return observation;
});
await probe("settings-nested-select-escape",async()=>{
 const {c,p}=await open();
 await p.getByRole("button",{name:/^Settings/}).click();
 await p.getByRole("combobox",{name:"Interface font",exact:true}).click();
 const opened=await p.getByRole("listbox",{name:"Interface font",exact:true}).count();
 await p.keyboard.press("Escape");
 const after=await p.getByRole("dialog",{name:"Settings",exact:true}).count();
 await c.close();return {fontDropdownOpened:opened,settingsStillOpenAfterOneEscape:after};
});
await probe("no-cli-onboarding",async()=>{
 const {c,p}=await open();
 await p.evaluate(()=>{
  window.testBridge.setAccount({state:"unknown",credentialRequired:true});
  window.muse.diagnose=async()=>({cliInstalled:false,connected:false,error:"spawn muse ENOENT",account:{state:"unknown",credentialRequired:true}});
 });
 await p.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await p.waitForTimeout(150);
 await p.getByRole("textbox",{name:"Message Muse"}).fill("Start an audit");
 const observation={sendEnabled:await p.getByRole("button",{name:"Send message",exact:true}).isEnabled(),locateCliVisible:await p.getByRole("button",{name:"Locate CLI",exact:true}).count(),hero:await p.locator(".welcome").textContent().catch(()=>null),footer:await p.locator(".composer-footer").innerText()};
 await c.close();return observation;
});
for(const count of [100,500,2000]) await probe("performance-"+count,async()=>{
 const {c,p,errors}=await open();
 await p.evaluate(count=>{
  window.muse.listSessions=async()=>({sessions:[{sessionId:"perf",name:"Performance fixture",workspaceRoot:"/projects/studio",updatedAt:new Date().toISOString()}]});
  window.muse.resumeSession=async()=>({session:{sessionId:"perf",workspaceRoot:"/projects/studio"},history:{items:Array.from({length:count},(_,i)=>({itemId:"m-"+i,kind:i%2?"agentMessage":"userMessage",status:"completed",revision:1,text:i%2?"## Response "+i+"\n\nA synthetic answer with **emphasis**, a link and a small code block.\n\n\`\`\`js\nconst result = "+i+";\n\`\`\`":"Audit request "+i}))}});
  window.testBridge.emit({method:"session/listChanged",params:{}});
 },count);
 await p.getByRole("button",{name:/Performance fixture/}).waitFor();
 const begin=Date.now();
 await p.getByRole("button",{name:/Performance fixture/}).click();
 await p.waitForFunction(count=>document.querySelectorAll(".assistant-message,.user-message").length>=count,count,{timeout:30000});
 const openMs=Date.now()-begin;
 const box=p.getByRole("textbox",{name:"Message Muse"});
 const inputStart=Date.now();await box.fill("Typing performance test");const inputMs=Date.now()-inputStart;
 const delta=await p.evaluate(async()=>{
  window.testBridge.emit({method:"item/updated",params:{sessionId:"perf",item:{itemId:"m-1",kind:"agentMessage",status:"inProgress",revision:2,text:"Streaming update"}}});
  const start=performance.now();
  for(let i=0;i<30;i++)window.testBridge.emit({method:"item/delta",params:{sessionId:"perf",itemId:"m-1",field:"text",delta:" update-"+i,viewCursor:"audit-"+i}});
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return performance.now()-start;
 });
 const domNodes=await p.locator("*").count();
 await c.close();return {messages:count,openMs,inputMs,deltaBatchMs:Math.round(delta),domNodes,pageErrors:errors};
});
await probe("activity-layout-screenshot",async()=>{
 const {c,p}=await open();await start(p);
 await p.evaluate(()=>{
  for(let i=0;i<20;i++)window.testBridge.emit({method:"item/completed",params:{sessionId:"session-1",item:{itemId:"tool-"+i,kind:"toolCall",tool:i%2?"apply_patch":"read_file",text:"Synthetic audit result "+i,status:"completed",revision:1,durationMs:320}}});
 });
 await p.getByRole("button",{name:/^Activity/}).click();
 await p.screenshot({path:path.join(out,"activity-current.png")});
 const observation={detailsOutsideScroll:await p.locator(".session-details").evaluate(e=>!e.closest(".chat-scroll")),toolCards:await p.locator(".tool-card").count()};
 await c.close();return observation;
});
await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
