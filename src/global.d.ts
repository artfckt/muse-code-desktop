export {};
declare global {
  interface Window {
    muse: {
      resolveMedia(file: string, sessionId?: string): Promise<string>;
      discardAttachment(id: string): Promise<any>;
      purgeAttachments(retained: string[]): Promise<any>;
      storageStats(): Promise<any>;
      forgetWorkspace(root: string): Promise<any>;
      exportSession(id: string): Promise<any>;
      agentAppearance(): Promise<any>;
      syncAppearance(appearance: any): Promise<any>;
      onAppearance(listener: (appearance: any) => void): () => void;
      commands(): Promise<any[]>;
      mcpInventory(): Promise<any>;
      saveAttachment(attachment: {
        name: string;
        mediaType: string;
        base64Data: string;
      }): Promise<any>;
      sessionMedia(id: string): Promise<Record<string, any[]>>;
      openLocal(path: string): Promise<void>;
      notify(payload: {
        title: string;
        body: string;
        sessionId?: string;
        silent?: boolean;
      }): Promise<any>;
      openAgent(agent: {
        sessionId: string;
        parentSessionId?: string;
      }): Promise<any>;
      agentControl(action: string, payload: any): Promise<any>;
      openConversation(id: string): Promise<any>;
      setPermissions(id: string, profile: string, mode: string): Promise<any>;
      forkSession(id: string): Promise<any>;
      subscribeSession(id: string): Promise<any>;
      onNavigateSession(listener: (id: string) => void): () => void;
      setWindowTheme(colors: {
        background: string;
        foreground: string;
      }): Promise<void>;
      terminalStart(size: {
        cols: number;
        rows: number;
        sessionId?: string;
        workspaceRoot?: string;
      }): Promise<any>;
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
      openCli(context?: {
        sessionId?: string;
        workspaceRoot?: string;
      }): Promise<any>;
      chooseBinary(): Promise<any>;
      pickWorkspace(): Promise<string | null>;
      systemFonts(): Promise<string[]>;
      agentAvailable(id: string): Promise<boolean>;
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
