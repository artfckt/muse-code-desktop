export {};

declare global {
  interface Window {
    muse: {
      diagnose: () => Promise<any>;
      login: () => Promise<any>;
      chooseWorkspace: () => Promise<any>;
      connectWorkspace: (cwd: string) => Promise<any>;
      listSessions: () => Promise<any>;
      startSession: (options?: any) => Promise<any>;
      resumeSession: (sessionId: string) => Promise<any>;
      readSession: (sessionId: string) => Promise<any>;
      viewPage: (sessionId: string) => Promise<any>;
      sendTurn: (payload: any) => Promise<any>;
      interrupt: (sessionId: string, turnId?: string | null) => Promise<any>;
      listModels: (sessionId?: string | null) => Promise<any>;
      usage: () => Promise<any>;
      pending: (sessionId: string) => Promise<any>;
      decideApproval: (decision: any) => Promise<any>;
      setModel: (sessionId: string, model: any) => Promise<any>;
      setApprovalMode: (sessionId: string, mode: string) => Promise<any>;
      userShell: (sessionId: string, commandText: string) => Promise<any>;
      onEvent: (listener: (payload: any) => void) => () => void;
      onStderr: (listener: (payload: string) => void) => () => void;
      onHostExit: (listener: (payload: any) => void) => () => void;
      onProtocolError: (listener: (payload: string) => void) => () => void;
    };
  }
}
