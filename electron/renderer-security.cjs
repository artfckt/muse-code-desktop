const { pathToFileURL } = require("node:url");
const path = require("node:path");

function trustedDocument(value, options = {}) {
  try {
    const url = new URL(value);
    const expected = new URL(
      options.devUrl ||
        pathToFileURL(path.join(options.appRoot, "dist", "index.html")).href,
    );
    if (
      options.devUrl &&
      !["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname)
    )
      return false;
    if (
      url.protocol !== expected.protocol ||
      url.host !== expected.host ||
      url.pathname !== expected.pathname
    )
      return false;
    if (url.username || url.password) return false;
    return [...url.searchParams.keys()].every((key) =>
      ["agent", "parent"].includes(key),
    );
  } catch {
    return false;
  }
}
function trustedWindow(windows, sender, frame, options) {
  const target = [...windows].find(
    (window) => !window.isDestroyed() && window.webContents === sender,
  );
  if (
    !target ||
    !frame ||
    frame !== sender.mainFrame ||
    !trustedDocument(frame.url, options)
  )
    throw new Error("Untrusted desktop renderer.");
  const url = new URL(frame.url);
  if (
    (url.searchParams.get("agent") || "") !== (target.agentSessionId || "") ||
    (url.searchParams.get("parent") || "") !== (target.parentSessionId || "")
  )
    throw new Error("Invalid desktop window identity.");
  return target;
}
function authorizeAgent(target, channel, args, engine) {
  if (!target.agentSessionId) return;
  const id = target.agentSessionId;
  if (["window-theme", "open-external", "agent-appearance"].includes(channel))
    return;
  if (channel === "open-conversation" && args[0] === target.parentSessionId)
    return;
  if (
    [
      "read-session",
      "view-page",
      "session-media",
      "subscribe-session",
      "read-output",
    ].includes(channel) &&
    args[0] === id
  )
    return;
  if (channel === "resolve-media" && args[1] === id) return;
  if (channel === "open-local") return; // explicit reveal in Finder/Explorer, never file execution
  if (["agent-available", "open-agent"].includes(channel)) {
    const child = channel === "open-agent" ? args[0]?.sessionId : args[0];
    if (engine.isDescendant?.(child, id)) return;
  }
  throw new Error("This agent window cannot perform that action.");
}
module.exports = { trustedDocument, trustedWindow, authorizeAgent };
