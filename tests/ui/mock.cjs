// Test-only desktop bridge. Never loaded by the application build.
const listeners = [];
let account = {
  state: "accountLogin",
  credentialRequired: true,
  label: "Muse account",
};
let approvals = [],
  userInputs = [];
let sessions = [];
const workspace = "/projects/studio";
const diagnostic = () => ({
  cliInstalled: true,
  connected: true,
  version: "Muse Code 1.4.1",
  binary: "/usr/local/bin/muse",
  account,
});
const emit = (event) => listeners.forEach((fn) => fn(event));
const model = {
  modelId: "muse-spark-1.3",
  providerId: "meta",
  profileId: null,
  displayLabel: "Muse Spark 1.3",
  isDefault: true,
};
window.testBridge = {
  calls: [],
  emit,
  setAccount: (value) => {
    account = value;
    emit({ method: "account/changed", params: value });
  },
  requestApproval: (value) => {
    approvals = [value];
    emit({ method: "approval/requested", params: value });
  },
  requestInput: (value) => {
    userInputs = [value];
    emit({ method: "userInput/requested", params: value });
  },
};
window.muse = {
  setWindowTheme: async (colors) =>
    window.testBridge.calls.push(["setWindowTheme", colors]),
  terminalStart: async () => (
    window.testBridge.calls.push(["terminalStart"]),
    {
      cwd: workspace,
      buffer: "\x1b[32mMuse Code native terminal fixture\x1b[0m\r\n",
      reused: false,
    }
  ),
  terminalWrite: async (data) =>
    window.testBridge.calls.push(["terminalWrite", data]),
  terminalResize: async () => {},
  terminalRestart: async () => ({ cancelled: false }),
  onTerminalData: () => () => {},
  onTerminalExit: () => () => {},
  bootstrap: async () => ({
    diagnostic: diagnostic(),
    lastWorkspace: workspace,
  }),
  diagnose: async () => diagnostic(),
  chooseWorkspace: async () => ({ workspace }),
  connectWorkspace: async () => ({ workspace }),
  listSessions: async () => ({ sessions }),
  listModels: async () => ({ models: [model] }),
  listSkills: async () => ({
    skills: [
      {
        selector: "plan",
        displayName: "Plan",
        description: "Plan a task",
        source: "builtin",
      },
    ],
  }),
  usage: async () => ({}),
  startSession: async () => {
    const id = `session-${sessions.length + 1}`;
    sessions.unshift({
      sessionId: id,
      name: "New conversation",
      updatedAt: new Date().toISOString(),
      status: "idle",
      modelId: model.modelId,
    });
    return { sessionId: id };
  },
  resumeSession: async (id) => ({
    session: sessions.find((s) => s.sessionId === id),
    history: {
      items: [
        {
          itemId: "old-user",
          kind: "userMessage",
          revision: 1,
          status: "completed",
          text: "Earlier question",
        },
        {
          itemId: "old-answer",
          kind: "agentMessage",
          revision: 2,
          status: "completed",
          text: "Earlier answer",
        },
      ],
      mode: "inline",
    },
  }),
  readSession: async () => ({ history: { items: [] } }),
  viewPage: async () => ({ events: [], nextCursor: null }),
  sendTurn: async (payload) => {
    window.testBridge.calls.push(["sendTurn", payload]);
    const id = payload.sessionId,
      turnId = "turn-1";
    emit({ method: "turn/started", params: { sessionId: id, turnId } });
    emit({
      method: "item/started",
      params: {
        sessionId: id,
        viewCursor: "1",
        item: {
          itemId: "user-1",
          kind: "userMessage",
          revision: 1,
          status: "completed",
          text: payload.text,
        },
      },
    });
    emit({
      method: "item/started",
      params: {
        sessionId: id,
        viewCursor: "2",
        item: {
          itemId: "answer-1",
          kind: "agentMessage",
          revision: 1,
          status: "inProgress",
          text: "",
        },
      },
    });
    setTimeout(
      () =>
        emit({
          method: "item/delta",
          params: {
            sessionId: id,
            viewCursor: "3",
            itemId: "answer-1",
            field: "text",
            delta: "Live answer",
          },
        }),
      20,
    );
    setTimeout(() => {
      emit({
        method: "item/completed",
        params: {
          sessionId: id,
          viewCursor: "4",
          item: {
            itemId: "answer-1",
            kind: "agentMessage",
            revision: 2,
            status: "completed",
            text: "## Finished\n\nA clear answer with `code`.",
          },
        },
      });
      emit({
        method: "turn/completed",
        params: { sessionId: id, turnId, terminal: "completed" },
      });
    }, 120);
    return { turnId, disposition: "started" };
  },
  login: async () => ({
    mode: "device-code",
    verificationUrl: "https://auth.meta.com/device",
    userCode: "MUSE-1234",
  }),
  cancelLogin: async () => {
    emit({
      method: "account/loginCompleted",
      params: { outcome: "cancelled" },
    });
    return {};
  },
  openExternal: async (url) =>
    window.testBridge.calls.push(["openExternal", url]),
  openCli: async () => {},
  chooseBinary: async () => diagnostic(),
  pending: async () => ({ approvals, userInputs }),
  decideApproval: async (value) => {
    window.testBridge.calls.push(["decideApproval", value]);
    approvals = [];
  },
  answerInput: async (value) => {
    window.testBridge.calls.push(["answerInput", value]);
    userInputs = [];
  },
  cancelInput: async () => {
    userInputs = [];
  },
  interrupt: async () => {},
  setModel: async () => {},
  setApprovalMode: async () => {},
  userShell: async () => {},
  compact: async () => {},
  rename: async (id, name) => {
    sessions.find((row) => row.sessionId === id).name = name;
  },
  readOutput: async () => ({ content: "Full tool output", eof: true }),
  onEvent: (listener) => {
    listeners.push(listener);
    return () => listeners.splice(listeners.indexOf(listener), 1);
  },
  onStderr: () => () => {},
  onHostExit: () => () => {},
  onProtocolError: () => () => {},
};
