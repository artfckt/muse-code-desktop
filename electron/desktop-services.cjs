const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");

const documentExtensions = new Set(
  ".pdf .txt .md .json .csv .ts .tsx .js .jsx .py .c .cpp .h .cs .go .rs .java .css .html .yaml .yml .xml .log .sql .sh .docx .xlsx .zip".split(
    " ",
  ),
);
const textExtensions = new Set(
  ".txt .md .json .csv .ts .tsx .js .jsx .py .c .cpp .h .cs .go .rs .java .css .html .yaml .yml .xml .log .sql .sh".split(
    " ",
  ),
);
const mediaTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".svg": "image/svg+xml",
};
function localPath(value, decode = true) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error("Invalid local path.");
  let result = value;
  if (result.startsWith("file:")) {
    result = require("node:url").fileURLToPath(result);
    decode = false;
  }
  if (decode)
    try {
      result = decodeURIComponent(result);
    } catch {}
  if (/^\/[a-z]:[\\/]/i.test(result)) result = result.slice(1);
  if (/^\\\\/.test(result))
    throw new Error("Network file paths must be opened outside the desktop.");
  return path.resolve(result);
}
function mediaUrl(file) {
  return `muse-media://local/?path=${encodeURIComponent(file)}`;
}

class DesktopServices {
  constructor(directory, engine) {
    this.directory = path.join(directory, "media");
    this.engine = engine;
    this.recoveries = new Map();
    fs.mkdirSync(this.directory, { recursive: true });
    this.manifestPath = path.join(this.directory, "manifest.json");
    try {
      this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
    } catch {
      this.manifest = { files: {}, sessions: {} };
    }
  }
  writeManifest() {
    const staged = `${this.manifestPath}.tmp`;
    fs.writeFileSync(staged, JSON.stringify(this.manifest));
    fs.renameSync(staged, this.manifestPath);
  }
  saveAttachment(input) {
    const namedExtension = path.extname(String(input.name || "")).toLowerCase();
    const document = documentExtensions.has(namedExtension);
    const extension = document
      ? namedExtension
      : Object.keys(mediaTypes).find(
          (ext) => mediaTypes[ext] === input.mediaType,
        );
    if (
      !extension ||
      (!document && !/^(image|video)\//.test(input.mediaType)) ||
      typeof input.base64Data !== "string"
    )
      throw new Error("Unsupported attachment.");
    const limit = document
      ? 25 * 1024 * 1024
      : input.mediaType.startsWith("video/")
        ? 50 * 1024 * 1024
        : 10 * 1024 * 1024;
    if (input.base64Data.length > Math.ceil((limit * 4) / 3) + 4)
      throw new Error("Attachment is too large.");
    const bytes = Buffer.from(input.base64Data, "base64");
    if (!bytes.length || bytes.length > limit)
      throw new Error("Invalid or oversized attachment.");
    const id = randomUUID();
    const file = path.join(this.directory, `${id}${extension}`);
    fs.writeFileSync(file, bytes);
    const attachment = {
      id,
      name: path
        .basename(String(input.name || "Attachment").replace(/\\/g, "/"))
        .slice(0, 200),
      mediaType: document
        ? textExtensions.has(extension)
          ? "text/plain"
          : "application/octet-stream"
        : input.mediaType,
      size: bytes.length,
      ...(textExtensions.has(extension)
        ? { text: bytes.toString("utf8").slice(0, 100000) }
        : {}),
      path: file,
      url: mediaUrl(file),
    };
    this.manifest.files[id] = attachment;
    this.writeManifest();
    return attachment;
  }
  rememberMedia(sessionId, commandId, ids) {
    if (!commandId || !ids?.length) return;
    const media = ids.map((id) => this.manifest.files[id]).filter(Boolean);
    this.manifest.sessions[sessionId] ||= {};
    this.manifest.sessions[sessionId][commandId] = media;
    this.writeManifest();
    return media;
  }
  sessionMedia(id) {
    return this.manifest.sessions[id] || {};
  }
  async recoverMedia(id, session) {
    if (this.recoveries.has(id)) return this.recoveries.get(id);
    const recovery = (async () => {
      try {
        session ||= (
          await this.engine.query("session/read", {
            sessionId: id,
            excludeItems: true,
          })
        ).session;
        if (!session?.path) return this.sessionMedia(id);
        const stat = fs.statSync(session.path);
        if (!stat.isFile() || stat.size > 256 * 1024 * 1024)
          return this.sessionMedia(id);
        const lines = require("node:readline").createInterface({
          input: fs.createReadStream(session.path),
          crlfDelay: Infinity,
        });
        for await (const line of lines) {
          if (!line.includes('"attachments"') || line.length > 60 * 1024 * 1024)
            continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          // Known durable native intake format; do not scrape arbitrary strings
          // or fabricate bytes when the native view only has image metadata.
          const record =
            event.payload?.kind === "command_intake"
              ? event.payload.record
              : null;
          const command = record?.command_id;
          if (!command || this.sessionMedia(id)[command]) continue;
          const attachments = record.command?.payload?.attachments || [];
          const ids = [];
          for (const [index, attachment] of attachments.entries()) {
            const value = attachment.value;
            if (
              attachment.kind !== "image" ||
              !value?.base64_data ||
              !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                value.media_type,
              )
            )
              continue;
            try {
              ids.push(
                this.saveAttachment({
                  name: `Image ${index + 1}`,
                  mediaType: value.media_type,
                  base64Data: value.base64_data,
                }).id,
              );
            } catch {}
          }
          if (ids.length) this.rememberMedia(id, command, ids);
        }
      } catch {
        /* A missing native log does not prevent reading the conversation. */
      }
      return this.sessionMedia(id);
    })();
    this.recoveries.set(id, recovery);
    try {
      return await recovery;
    } finally {
      this.recoveries.delete(id);
    }
  }
  async mcpInventory() {
    const configPath = path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
      "muse",
      "settings.json",
    );
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { servers: [] };
      throw new Error(
        "Muse settings could not be read. Check its JSON in the native CLI.",
      );
    }
    const servers = Object.entries(
      config.mcpServers || config.mcp_servers || {},
    ).map(([name, value]) => ({
      name,
      transport:
        value.transport || (value.command ? "stdio" : "streamableHttp"),
      mode: value.mode || "required",
      enabled: value.enabled !== false,
      status: value.enabled === false ? "disabled" : "configured",
      source: "Muse Code settings",
    }));
    return { servers };
  }
  async serveMedia(request) {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "local")
        return new Response("Not found", { status: 404 });
      const file = localPath(url.searchParams.get("path"), false);
      const mime = mediaTypes[path.extname(file).toLowerCase()];
      if (!mime) return new Response("Unsupported media", { status: 415 });
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size === 0 || stat.size > 512 * 1024 * 1024)
        return new Response("Media is empty or too large", { status: 413 });
      const range = request.headers.get("range");
      let start = 0,
        end = stat.size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) return new Response(null, { status: 416 });
        if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), end);
        }
        if (start > end || start >= stat.size)
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
      }
      const headers = {
        "Content-Type": mime,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "X-Content-Type-Options": "nosniff",
      };
      if (range)
        headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      return new Response(
        Readable.toWeb(fs.createReadStream(file, { start, end })),
        { status: range ? 206 : 200, headers },
      );
    } catch {
      return new Response("Local media is unavailable", { status: 404 });
    }
  }
}
module.exports = { DesktopServices, localPath, mediaUrl, mediaTypes };
