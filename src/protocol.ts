export type MuseItem = {
  itemId: string;
  revision: number;
  kind: string;
  status: string;
  [key: string]: any;
};
export type MuseEvent = { method: string; params?: Record<string, any> };

// First-opened order, revision guards and authoritative completion are MSP rules.
export class Transcript {
  private items = new Map<string, MuseItem>();
  private cursors = new Set<string>();
  seed(items: MuseItem[]) {
    this.items = new Map(items.map((item) => [item.itemId, item]));
    this.cursors.clear();
  }
  apply(event: MuseEvent) {
    const p = event.params || {};
    if (p.viewCursor && this.cursors.has(p.viewCursor)) return;
    if (p.viewCursor) this.cursors.add(p.viewCursor);
    if (
      ["item/started", "item/updated", "item/completed"].includes(
        event.method,
      ) &&
      p.item
    ) {
      const held = this.items.get(p.item.itemId);
      if (!held || p.item.revision > held.revision)
        this.items.set(p.item.itemId, { ...p.item });
    }
    if (event.method === "item/delta") {
      const held = this.items.get(p.itemId);
      if (!held || held.status !== "inProgress") return;
      const next = { ...held };
      const field = p.field || "text";
      if (field.startsWith("summary.")) {
        const index = Number(field.split(".")[1]);
        if (Number.isInteger(index) && index >= 0 && index < 1000) {
          next.summary = [...(held.summary || [])];
          next.summary[index] = (next.summary[index] || "") + p.delta;
        }
      } else if (["text", "output", "visibleOutput"].includes(field)) {
        const target = field === "output" ? "visibleOutput" : field;
        next[target] = (held[target] || "") + p.delta;
      }
      this.items.set(p.itemId, next);
    }
  }
  list() {
    return [...this.items.values()];
  }
}
export function historyItems(raw: any): MuseItem[] | null {
  return raw?.history?.items || raw?.history?.snapshot?.state?.items || null;
}
export function itemText(item: MuseItem) {
  if (item.kind === "reasoning")
    return (item.summary || []).join("\n\n") || item.text || "";
  return (
    item.displayText ||
    item.text ||
    item.visibleOutput ||
    item.message ||
    item.failureReason ||
    item.fallbackText ||
    item.objective ||
    ""
  );
}
export function sessionTitle(row: any) {
  return (
    row.name ||
    row.title ||
    row.firstUserPrompt ||
    `Session ${row.sessionId.slice(0, 8)}`
  );
}
export function subscriptionUsage(raw: any) {
  return raw?.usage?.observedAtMs ? raw.usage : null;
}
