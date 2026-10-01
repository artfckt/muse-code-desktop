import type { MuseItem } from "./protocol";

export function conversationWindow(items: MuseItem[], limit: number) {
  const live = items.filter((item) => !item.retracted);
  const messageIndexes: number[] = [];
  live.forEach((item, index) => {
    if (item.kind === "userMessage" || item.kind === "agentMessage")
      messageIndexes.push(index);
  });
  const remaining = Math.max(0, messageIndexes.length - limit);
  return {
    visible: remaining ? live.slice(messageIndexes[remaining]) : live,
    remaining,
  };
}
export function nativeAgents(items: MuseItem[]) {
  const agents = new Map<string, MuseItem>();
  for (const item of items) {
    if (item.kind !== "subagent" || item.retracted) continue;
    const key = item.subagentId || item.childSessionId || item.itemId;
    const previous = agents.get(key);
    if (
      !previous ||
      previous.itemId !== item.itemId ||
      (item.revision ?? 0) >= (previous.revision ?? 0)
    )
      agents.set(key, item);
  }
  return [...agents.values()];
}
export function agentWorking(item: MuseItem) {
  if (item.controlStatus)
    return ["accepted", "starting", "running"].includes(item.controlStatus);
  return item.status === "inProgress";
}
export function activityLabel(item: MuseItem): string {
  const tool = String(item.tool || "").toLowerCase();
  let args: any = item.args;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  const path = args?.path || args?.file_path || args?.filename;
  const file = typeof path === "string" ? path.split(/[\\/]/).pop() : "";
  if (/read.*file/.test(tool)) return `Reading${file ? ` ${file}` : " files"}`;
  if (/edit|write|patch/.test(tool))
    return `Editing${file ? ` ${file}` : " files"}`;
  if (/search|grep|glob|find/.test(tool)) return "Searching the project";
  if (/shell|powershell|exec|terminal/.test(tool) || item.kind === "userShell")
    return "Running a command";
  if (item.kind === "reasoning") return "Thinking";
  if (item.kind === "subagent")
    return `Agent: ${item.role || "delegated task"}`;
  if (item.kind === "reminderChild") return "Agent update";
  return (
    item.fallbackText ||
    item.tool ||
    item.kind.replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}
export function nativeCommentary(items: MuseItem[]) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.kind === "reasoning" && Array.isArray(item.summary)) {
      const text = item.summary
        .filter((line: unknown) => typeof line === "string" && line.trim())
        .join("\n");
      if (text) return text;
    }
  }
  return "";
}

export function conversationPreview(items: MuseItem[]) {
  const live = items.filter((item) => !item.retracted);
  const messages = live.filter(
    (item) => item.kind === "userMessage" || item.kind === "agentMessage",
  );
  const activity = live.filter(
    (item) => item.kind !== "userMessage" && item.kind !== "agentMessage",
  );
  const selected = new Set([
    ...messages.slice(-200),
    ...activity.slice(-80),
    ...nativeAgents(live).slice(-20),
  ]);
  return live.filter((item) => selected.has(item));
}
