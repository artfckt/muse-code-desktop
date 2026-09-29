const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("muse", {
  diagnose: () => ipcRenderer.invoke("muse:diagnose"),
  login: () => ipcRenderer.invoke("muse:login"),
  chooseWorkspace: () => ipcRenderer.invoke("muse:choose-workspace"),
  connectWorkspace: (cwd) => ipcRenderer.invoke("muse:connect-workspace", cwd),
  listSessions: () => ipcRenderer.invoke("muse:list-sessions"),
  startSession: (options) => ipcRenderer.invoke("muse:start-session", options),
  resumeSession: (sessionId) => ipcRenderer.invoke("muse:resume-session", sessionId),
  readSession: (sessionId) => ipcRenderer.invoke("muse:read-session", sessionId),
  viewPage: (sessionId) => ipcRenderer.invoke("muse:view-page", sessionId),
  sendTurn: (payload) => ipcRenderer.invoke("muse:send-turn", payload),
  interrupt: (sessionId, turnId) => ipcRenderer.invoke("muse:interrupt", sessionId, turnId),
  listModels: (sessionId) => ipcRenderer.invoke("muse:list-models", sessionId),
  usage: () => ipcRenderer.invoke("muse:usage"),
  pending: (sessionId) => ipcRenderer.invoke("muse:pending", sessionId),
  decideApproval: (decision) => ipcRenderer.invoke("muse:decide-approval", decision),
  setModel: (sessionId, model) => ipcRenderer.invoke("muse:set-model", sessionId, model),
  setApprovalMode: (sessionId, mode) => ipcRenderer.invoke("muse:set-approval-mode", sessionId, mode),
  userShell: (sessionId, commandText) => ipcRenderer.invoke("muse:user-shell", sessionId, commandText),

  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("muse:event", handler);
    return () => ipcRenderer.removeListener("muse:event", handler);
  },
  onStderr: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("muse:stderr", handler);
    return () => ipcRenderer.removeListener("muse:stderr", handler);
  },
  onHostExit: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("muse:host-exit", handler);
    return () => ipcRenderer.removeListener("muse:host-exit", handler);
  },
  onProtocolError: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("muse:protocol-error", handler);
    return () => ipcRenderer.removeListener("muse:protocol-error", handler);
  },
});
