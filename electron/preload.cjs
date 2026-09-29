const { contextBridge, ipcRenderer } = require("electron");
const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(`muse:${channel}`, ...args);
const subscribe = (channel) => (listener) => {
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(`muse:${channel}`, handler);
  return () => ipcRenderer.removeListener(`muse:${channel}`, handler);
};
contextBridge.exposeInMainWorld("muse", {
  bootstrap: invoke("bootstrap"),
  diagnose: invoke("diagnose"),
  login: invoke("login"),
  cancelLogin: invoke("cancel-login"),
  openExternal: invoke("open-external"),
  openCli: invoke("open-cli"),
  chooseBinary: invoke("choose-binary"),
  chooseWorkspace: invoke("choose-workspace"),
  connectWorkspace: invoke("connect-workspace"),
  listSessions: invoke("list-sessions"),
  startSession: invoke("start-session"),
  resumeSession: invoke("resume-session"),
  readSession: invoke("read-session"),
  viewPage: invoke("view-page"),
  sendTurn: invoke("send-turn"),
  interrupt: invoke("interrupt"),
  listModels: invoke("list-models"),
  listSkills: invoke("list-skills"),
  usage: invoke("usage"),
  pending: invoke("pending"),
  decideApproval: invoke("decide-approval"),
  answerInput: invoke("answer-input"),
  cancelInput: invoke("cancel-input"),
  setModel: invoke("set-model"),
  setApprovalMode: invoke("set-approval-mode"),
  userShell: invoke("user-shell"),
  compact: invoke("compact"),
  rename: invoke("rename"),
  readOutput: invoke("read-output"),
  onEvent: subscribe("event"),
  terminalStart: invoke("terminal-start"),
  terminalWrite: invoke("terminal-write"),
  terminalResize: invoke("terminal-resize"),
  terminalRestart: invoke("terminal-restart"),
  onTerminalData: subscribe("terminal-data"),
  onTerminalExit: subscribe("terminal-exit"),
  onStderr: subscribe("stderr"),
  onHostExit: subscribe("host-exit"),
  onProtocolError: subscribe("protocol-error"),
});
