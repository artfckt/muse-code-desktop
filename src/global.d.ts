export {};
declare global {
  interface Window {
    muse: {
      terminalStart(size: { cols: number; rows: number }): Promise<any>;
      terminalWrite(data: string): Promise<any>;
      terminalResize(cols: number, rows: number): Promise<any>;
      terminalRestart(): Promise<any>;
      onTerminalData(listener: (data: string) => void): () => void;
      onTerminalExit(listener: (exit: any) => void): () => void;
      bootstrap(): Promise<any>;
      diagnose(): Promise<any>;
      login(): Promise<any>;
      cancelLogin(): Promise<any>;
      openExternal(url: string): Promise<any>;
      openCli(): Promise<any>;
      chooseBinary(): Promise<any>;
      chooseWorkspace(): Promise<any>;
      connectWorkspace(cwd: string): Promise<any>;
      listSessions(): Promise<any>;
      startSession(options?: any): Promise<any>;
      resumeSession(id: string): Promise<any>;
      readSession(id: string): Promise<any>;
      viewPage(id: string, cursor?: string): Promise<any>;
      sendTurn(payload: any): Promise<any>;
      interrupt(id: string, turnId?: string | null): Promise<any>;
      listModels(id?: string | null): Promise<any>;
      listSkills(id: string): Promise<any>;
      usage(): Promise<any>;
      pending(id: string): Promise<any>;
      decideApproval(decision: any): Promise<any>;
      answerInput(answer: any): Promise<any>;
      cancelInput(answer: any): Promise<any>;
      setModel(id: string, model: any): Promise<any>;
      setApprovalMode(id: string, mode: string): Promise<any>;
      userShell(id: string, text: string): Promise<any>;
      compact(id: string): Promise<any>;
      rename(id: string, name: string): Promise<any>;
      readOutput(id: string, itemId: string, outputRef: string): Promise<any>;
      onEvent(listener: (event: any) => void): () => void;
      onStderr(listener: (text: string) => void): () => void;
      onHostExit(listener: (exit: any) => void): () => void;
      onProtocolError(listener: (text: string) => void): () => void;
    };
  }
}
