// Audit-only probes. Uses isolated browser contexts and synthetic bridge data.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const out = __dirname;
const root = path.resolve(out, "../../..");
const results = [];
let browser;
async function open(setup, viewport={width:1440,height:940}, ready=true, query="") {
  const context = await browser.newContext({viewport});
  await context.addInitScript({path:path.join(root,"tests/ui/mock.cjs")});
  if(setup) await context.addInitScript(setup);
  const page = await context.newPage();
  const pageErrors=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto((process.env.MUSE_AUDIT_URL || "http://127.0.0.1:5174")+"/"+query);
  if(ready) await page.getByText("Using your CLI sign-in").waitFor();
  await page.evaluate(()=>document.fonts.ready);
  return {context,page,pageErrors};
}
async function probe(id,fn) {
  const start=Date.now();
  try { const observation=await fn(); results.push({id,observation,durationMs:Date.now()-start});}
  catch(e) {results.push({id,probeError:e.stack,durationMs:Date.now()-start});}
  fs.writeFileSync(path.join(out,"observations.json"),JSON.stringify({generatedAt:new Date().toISOString(),baseCommit:"ab7f3658f8c509b984de0310b632f0d2be390da9",results},null,2));
  console.log(id,JSON.stringify(results.at(-1)));
}
async function start(page) {
 await page.getByRole("button",{name:"New conversation ＋"}).click();
 await page.getByRole("button",{name:"Create conversation"}).click();
 await page.locator(".new-conversation-dialog").waitFor({state:"detached"});
}
(async()=>{
 browser=await chromium.launch({headless:true});
 await probe("draft-cross-chat",async()=>{
  const {context,page}=await open();
  await page.evaluate(()=>window.testBridge.setSessions(["A","B"].map(id=>({sessionId:id,name:"Chat "+id,workspaceRoot:"/projects/"+id,updatedAt:new Date().toISOString(),status:"idle"}))));
  await page.getByRole("button",{name:/Chat A/}).click();
  await page.getByText("Earlier answer",{exact:true}).waitFor();
  await page.getByRole("textbox",{name:"Message Muse"}).fill("Private draft intended for project A");
  await page.locator('input[type="file"]').setInputFiles({name:"private-A.md",mimeType:"text/markdown",buffer:Buffer.from("Confidential project A requirements")});
  await page.locator(".image-attachments").waitFor();
  await page.getByRole("button",{name:/Chat B/}).click();
  await page.waitForFunction(()=>document.querySelector(".chat-scroll")?.getAttribute("aria-busy")==="false");
  const before=await page.getByRole("textbox",{name:"Message Muse"}).inputValue();
  const attachments=await page.locator(".image-attachments").innerText();
  await page.screenshot({path:path.join(out,"draft-cross-chat.png")});
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  const payload=await page.evaluate(()=>window.testBridge.calls.find(c=>c[0]==="sendTurn")[1]);
  await context.close(); return {draftInB:before,attachmentsInB:attachments,sentSessionId:payload.sessionId,sentText:payload.text};
 });
 await probe("draft-ack-loss",async()=>{
  const {context,page}=await open();
  await start(page);
  await page.evaluate(()=>window.muse.sendTurn=async p=>{window.testBridge.calls.push(["sendTurn",p]); return await new Promise(r=>window.auditRelease=()=>r({disposition:"started"}));});
  const box=page.getByRole("textbox",{name:"Message Muse"});
  await box.fill("First message");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await page.waitForFunction(()=>!!window.auditRelease);
  await box.fill("Next message typed while request is pending");
  const before=await box.inputValue();
  await page.evaluate(()=>window.auditRelease());
  await page.waitForTimeout(150);
  const after=await box.inputValue();
  await context.close();return {beforeAck:before,afterAck:after};
 });
 await probe("skill-document-payload",async()=>{
  const {context,page}=await open();
  await start(page);
  await page.locator('input[type="file"]').setInputFiles({name:"requirements.md",mimeType:"text/markdown",buffer:Buffer.from("Build an accessible dashboard")});
  await page.locator(".image-attachments").waitFor();
  await page.getByRole("textbox",{name:"Message Muse"}).fill("/plan follow requirements");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  const payload=await page.evaluate(()=>window.testBridge.calls.find(c=>c[0]==="sendTurn")[1]);
  await context.close();return payload;
 });
 await probe("activity-navigation",async()=>{
  const {context,page}=await open();
  await start(page);
  await page.getByRole("button",{name:"Activity",exact:true}).click();
  const before=await page.locator(".conversation-tabs > button.active").innerText();
  await page.evaluate(()=>window.testBridge.emit({method:"turn/completed",params:{sessionId:"session-1",turnId:"turn-1",terminal:"completed"}}));
  await page.waitForTimeout(100);
  const after=await page.locator(".conversation-tabs > button.active").innerText();
  await context.close();return {before,after};
 });
 await probe("bootstrap-failure-spinner",async()=>{
  const {context,page}=await open(()=>{window.muse.bootstrap=async()=>{throw new Error("Audit simulated unavailable bootstrap");};},undefined,false);
  await page.waitForTimeout(600);
  const data=await page.evaluate(()=>({loading:document.querySelector('[aria-busy="true"]')?.textContent,alert:document.querySelector('[role="alert"]')?.textContent}));
  await page.screenshot({path:path.join(out,"bootstrap-failure.png")});
  await context.close();return data;
 });
 await probe("deleted-project-spinner",async()=>{
  const {context,page}=await open(()=>{window.muse.connectWorkspace=async()=>{throw new Error("Audit simulated missing last project");};},undefined,false);
  await page.waitForTimeout(600);
  const data=await page.evaluate(()=>({loading:document.querySelector('[aria-busy="true"]')?.textContent,alert:document.querySelector('[role="alert"]')?.textContent}));
  await context.close();return data;
 });
 await probe("history-response-race",async()=>{
  const {context,page}=await open(()=>{
   window.muse.onNavigateSession=cb=>{window.auditNavigate=cb;return()=>{};};
   window.muse.resumeSession=async id=>{await new Promise(r=>setTimeout(r,id==="A"?550:50)); return {session:{sessionId:id,workspaceRoot:"/projects/"+id},history:{items:[{itemId:"answer-"+id,kind:"agentMessage",status:"completed",revision:1,text:"History belonging to "+id}]}};};
  });
  await page.evaluate(()=>window.testBridge.setSessions(["A","B"].map(id=>({sessionId:id,name:"Chat "+id,workspaceRoot:"/projects/"+id,updatedAt:new Date().toISOString()}))));
  await page.getByRole("button",{name:/Chat A/}).waitFor();
  await page.evaluate(()=>window.auditNavigate("A"));
  await page.waitForTimeout(100);
  await page.evaluate(()=>window.auditNavigate("B"));
  await page.waitForTimeout(700);
  const data=await page.evaluate(()=>({selected:document.querySelector(".session-row.active")?.textContent,breadcrumb:document.querySelector(".breadcrumb")?.textContent,transcript:document.querySelector(".transcript")?.textContent}));
  await page.screenshot({path:path.join(out,"history-race.png")});
  await context.close();return data;
 });
 await probe("usage-account-and-order",async()=>{
  const {context,page}=await open();
  await page.evaluate(()=>window.testBridge.emit({method:"usage/changed",params:{observedAtMs:2000,weekly:{usedPercent:75,resetsAtMs:Date.now()+86400000}}}));
  await page.locator(".usage-meter").waitFor();
  const first=await page.locator(".usage-meter").innerText();
  await page.evaluate(()=>window.testBridge.emit({method:"usage/changed",params:{observedAtMs:1000,weekly:{usedPercent:12,resetsAtMs:Date.now()+86400000}}}));
  await page.waitForTimeout(100);
  const older=await page.locator(".usage-meter").innerText();
  await page.evaluate(()=>window.testBridge.setAccount({state:"loggedOut",credentialRequired:true}));
  await page.waitForTimeout(100);
  const signedOut=await page.locator(".usage-section").innerText();
  await context.close();return {newObservation:first,olderObservation:older,afterSignout:signedOut};
 });
 await probe("settings-keyboard-focus",async()=>{
  const {context,page}=await open();
  await page.getByRole("button",{name:/^Settings/}).click();
  const initial=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent,insideDialog:!!document.activeElement.closest('[role="dialog"]')}));
  await page.getByRole("button",{name:"Close dialog"}).focus();
  await page.keyboard.press("Shift+Tab");
  const escaped=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent,insideDialog:!!document.activeElement.closest('[role="dialog"]')}));
  await context.close();return {initial,shiftTabFromClose:escaped};
 });
 await probe("slash-accessibility",async()=>{
  const {context,page}=await open(); await start(page);
  await page.getByRole("textbox",{name:"Message Muse"}).fill("/");
  await page.locator(".slash-menu").waitFor();
  await page.addScriptTag({path:"/tmp/muse-audit-tools/node_modules/axe-core/axe.min.js"});
  const data=await page.evaluate(async()=>({controlledId:document.querySelector('textarea[aria-label="Message Muse"]').getAttribute("aria-controls"),targetExists:!!document.getElementById("slash-menu"),violations:(await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa","wcag22aa"]}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}));
  await context.close();return data;
 });
 for(const theme of ["muse","graphite","paper","midnight","forest","rose"]) await probe("a11y-"+theme,async()=>{
  const {context,page}=await open();
  await page.evaluate(theme=>localStorage.setItem("muse-desktop-theme",theme),theme);
  await page.reload();
  await page.getByText("Using your CLI sign-in").waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await start(page);
  await page.evaluate(()=>window.testBridge.emit({method:"item/completed",params:{sessionId:"session-1",item:{itemId:"test",kind:"agentMessage",status:"completed",revision:1,text:"## Audit conversation\n\nThis is readable text with **emphasis**, a [web link](https://example.com) and \`code\`.\n\n\`\`\`js\nconst answer = 42;\n\`\`\`"}}}));
  await page.addScriptTag({path:"/tmp/muse-audit-tools/node_modules/axe-core/axe.min.js"});
  const data=await page.evaluate(async()=>({
   theme:document.documentElement.dataset.theme,
   fontReady:document.fonts.check('14px "DM Sans"'),
   violations:(await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa","wcag22aa"]}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),
   smallButtons:[...document.querySelectorAll("button")].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<24||r.height<24);}).map(e=>({label:e.getAttribute("aria-label")||e.title||e.textContent,rect:{w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}}))
  }));
  await page.screenshot({path:path.join(out,"theme-"+theme+".png")});
  await context.close();return data;
 });
 for(const width of [900,1100,1440]) await probe("layout-"+width,async()=>{
  const {context,page}=await open(()=>localStorage.setItem("muse-desktop-preferences",JSON.stringify({uiSize:16,chatSize:24,leftWidth:420,rightWidth:420})),{width,height:700});
  await start(page);
  await page.getByRole("textbox",{name:"Message Muse"}).fill("Window layout check");
  await page.evaluate(()=>window.testBridge.emit({method:"turn/started",params:{sessionId:"session-1",turnId:"t"}}));
  const data=await page.evaluate(()=>({
   viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   center:document.querySelector(".main-panel")?.getBoundingClientRect().toJSON(),
   composer:document.querySelector(".composer")?.getBoundingClientRect().toJSON(),
   send:document.querySelector(".send-button")?.getBoundingClientRect().toJSON(),
   controls:[...document.querySelectorAll(".composer-toolbar button,.composer-controls button,.composer-actions button")].map(e=>({label:e.title||e.getAttribute("aria-label")||e.textContent,rect:e.getBoundingClientRect().toJSON()})),
   overflow:[...document.querySelectorAll(".composer,.composer-left,.conversation-tabs,.topbar,.sidebar,.inspector")].map(e=>({class:e.className,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}))
  }));
  await page.screenshot({path:path.join(out,"layout-"+width+".png")});
  await context.close();return data;
 });
 await probe("agent-loading-and-system-theme",async()=>{
  const {context,page}=await open(()=>{
   localStorage.setItem("muse-desktop-theme","system");
   window.muse.readSession=async()=>{await new Promise(r=>setTimeout(r,1500));return {session:{sessionId:"child",workspaceRoot:"/projects/studio"},history:{items:[]}};};
  },undefined,false,"?agent=child&parent=root");
  await page.waitForTimeout(200);
  const loading=await page.evaluate(()=>({body:document.body.textContent,loaders:document.querySelectorAll('[aria-busy="true"],[role="status"],.spin').length,theme:document.documentElement.dataset.theme}));
  await page.emulateMedia({colorScheme:"dark"});
  await page.waitForTimeout(100);
  const dark=await page.evaluate(()=>document.documentElement.dataset.theme);
  await page.emulateMedia({colorScheme:"light"});
  await page.waitForTimeout(100);
  const light=await page.evaluate(()=>document.documentElement.dataset.theme);
  await context.close();return {loading,dark,light};
 });
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
