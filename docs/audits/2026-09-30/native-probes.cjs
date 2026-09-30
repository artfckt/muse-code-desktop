// Read-only application audit, apart from synthetic files in an isolated temporary home.
const { _electron: electron } = require("playwright");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {DesktopServices}=require("../../../electron/desktop-services.cjs");
const {DesktopEngine}=require("../../../electron/desktop-engine.cjs");
const out=__dirname,root=path.resolve(out,"../../..");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"muse-audit-isolated-"));
const results=[];
function add(id,observation){results.push({id,observation});fs.writeFileSync(path.join(out,"native-observations.json"),JSON.stringify({baseCommit:"ab7f3658f8c509b984de0310b632f0d2be390da9",results},null,2));console.log(id,JSON.stringify(observation));}
(async()=>{
 const s=new DesktopServices(path.join(tmp,"service-data"),{});
 const text="x".repeat(100001)+"AUDIT_END_MARKER";
 const a=s.saveAttachment({name:"large.txt",mediaType:"text/plain",base64Data:Buffer.from(text).toString("base64")});
 add("text-excerpt",{originalLength:text.length,excerptLength:a.text.length,excerptContainsEnd:a.text.includes("AUDIT_END_MARKER"),originalFileContainsEnd:fs.readFileSync(a.path,"utf8").includes("AUDIT_END_MARKER"),hasTruncationField:Object.keys(a).some(k=>/trunc/i.test(k))});
 fs.writeFileSync(s.manifestPath,"{corrupted");
 const recovered=new DesktopServices(path.join(tmp,"service-data"),{});
 add("corrupt-attachment-manifest",{savedFileStillExists:fs.existsSync(a.path),filesRecognized:Object.keys(recovered.manifest.files).length,sessionsRecognized:Object.keys(recovered.manifest.sessions).length});
 let created=0,closed=0;
 const hostFactory=()=>({profile:"standard",setOwner(){},async close(){closed++},async command(method,p){return {session:{sessionId:p.sessionId,workspaceRoot:tmp},history:{items:[]}}},async query(){return{};}});
 const e=new DesktopEngine({hostFactory:()=>{created++;return hostFactory()}});
 for(let i=0;i<20;i++) await e.command("session/resume",{sessionId:"audit-"+i});
 add("retained-hosts",{visitedChats:20,createdHosts:created,retainedSessionHosts:e.sessions.size,closedWhileBrowsing:closed});
 await e.close();
 fs.mkdirSync(path.join(tmp,".config","muse"),{recursive:true});
 fs.writeFileSync(path.join(tmp,".config","muse","settings.json"),JSON.stringify({schema_version:1,provider:"echo"}));
 const project=path.join(tmp,"project-A");fs.mkdirSync(project);
 const fixture=path.join(tmp,"outside-private-root.png");
 const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GZAAAAAASUVORK5CYII=","base64");
 fs.writeFileSync(fixture,bytes);
 const env={...process.env,HOME:tmp,USERPROFILE:tmp,XDG_CONFIG_HOME:path.join(tmp,".config"),TBH_CREDENTIAL_BACKEND:"file",TBH_DISABLE_TELEMETRY:"1",MUSE_BINARY:"/tmp/muse-beta-cli/muse",MUSE_DESKTOP_DATA_DIR:path.join(tmp,"desktop-data"),VITE_DEV_SERVER_URL:"http://127.0.0.1:5174"};
 let app;
 try {
  app=await electron.launch({args:["--no-sandbox",root],env});
  const page=await app.firstWindow();
  await page.waitForSelector(".app-shell",{timeout:20000});
  await page.waitForFunction(()=>document.querySelector(".session-list")?.getAttribute("aria-busy")!=="true",{timeout:20000}).catch(()=>{});
  const versions=await app.evaluate(()=>({electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node}));
  add("native-versions",versions);
  await app.evaluate(({app})=>{
   const{createRequire}=process.getBuiltinModule("node:module");const path=process.getBuiltinModule("node:path");
   createRequire(path.join(app.getAppPath(),"package.json"))("./electron/muse-host.cjs").MuseHost.prototype.requireSubscription=async()=>({});
  });
  const noFolder=await page.evaluate(()=>window.muse.startSession({noFolder:true}));
  await page.evaluate(root=>window.muse.connectWorkspace(root),project);
  const result=await page.evaluate(id=>window.muse.resumeSession(id),noFolder.sessionId);
  const terminal=await page.evaluate(()=>window.muse.terminalStart({cols:90,rows:24}));
  add("no-folder-terminal-context",{resumedNoFolder:result.session?.noFolder,resumedWorkspace:result.session?.workspaceRoot,terminalCwd:terminal.cwd,previousProject:project,matchesPreviousProject:terminal.cwd===project});
  const crossOrigin=await app.evaluate(async({BrowserWindow},file)=>{
   const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
   try {
    await w.loadURL("data:text/html,<h1>Synthetic cross-origin audit fixture</h1>");
    const url="muse-media://local/?path="+encodeURIComponent(file);
    return await w.webContents.executeJavaScript("fetch("+JSON.stringify(url)+").then(async r=>({origin:location.origin,status:r.status,bytes:(await r.arrayBuffer()).byteLength})).catch(e=>({origin:location.origin,error:e.message}))");
   } finally {w.destroy();}
  },fixture);
  add("cross-origin-local-media-read",{...crossOrigin,fixtureBytes:bytes.length,fixtureOutsideSavedAttachments:true});
 }catch(err){add("native-probe-error",{error:err.stack});process.exitCode=1;}
 finally{await app?.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
