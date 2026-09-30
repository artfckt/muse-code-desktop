const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  randomUUID,
  randomBytes,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");
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
    this.mediaSecret = randomBytes(32);
    this.mediaGrants = new Map();
    this.outputFiles = new Map();
    fs.mkdirSync(this.directory, { recursive: true });
    this.manifestPath = path.join(this.directory, "manifest.json");
    const valid = (value) =>
      value &&
      typeof value.files === "object" &&
      typeof value.sessions === "object";
    this.manifest = { files: {}, sessions: {} };
    let loaded = false;
    for (const file of [this.manifestPath, `${this.manifestPath}.bak`]) {
      try {
        const recovered = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!valid(recovered)) throw new Error("Invalid attachment index");
        this.manifest = recovered;
        loaded = true;
        break;
      } catch (error) {
        if (file === this.manifestPath && error.code !== "ENOENT") {
          try {
            fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
          } catch {}
          this.storageWarning =
            "Attachment index recovered from backup. The damaged index was preserved.";
        }
      }
    }
    if (!loaded) {
      for (const name of fs.readdirSync(this.directory)) {
        const match = /^([a-f0-9-]{36})(\.[a-z0-9]+)$/i.exec(name);
        if (
          !match ||
          (!mediaTypes[match[2]] && !documentExtensions.has(match[2]))
        )
          continue;
        const file = path.join(this.directory, name),
          stat = fs.statSync(file);
        if (!stat.isFile()) continue;
        this.manifest.files[match[1]] = {
          id: match[1],
          name: `Recovered attachment${match[2]}`,
          path: file,
          size: stat.size,
          mediaType: mediaTypes[match[2]] || "application/octet-stream",
          recovered: true,
        };
      }
      if (Object.keys(this.manifest.files).length || this.storageWarning)
        this.storageWarning =
          "The attachment index is unavailable. Existing files were preserved; conversation associations may need recovery.";
    }
  }
  writeManifest() {
    const staged = `${this.manifestPath}.tmp`;
    fs.writeFileSync(staged, JSON.stringify(this.manifest));
    // Both files contain the latest complete transaction, so the newest chat's
    // attachments survive corruption of the primary index.
    fs.copyFileSync(staged, `${this.manifestPath}.bak.tmp`);
    fs.renameSync(`${this.manifestPath}.bak.tmp`, `${this.manifestPath}.bak`);
    fs.renameSync(staged, this.manifestPath);
  }
  signMedia(file, sessionId = "") {
    file = fs.realpathSync(localPath(file, false));
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error("Media is not a regular file.");
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    const signature = createHmac("sha256", this.mediaSecret)
      .update(`${file}\0${sessionId}\0${identity}`)
      .digest("hex");
    this.mediaGrants.set(signature, {
      file,
      sessionId,
      dev: stat.dev,
      ino: stat.ino,
      birthtimeMs: stat.birthtimeMs,
    });
    return `${mediaUrl(file)}&session=${encodeURIComponent(sessionId)}&token=${signature}`;
  }
  within(file, root) {
    if (!root) return false;
    const relative = path.relative(fs.realpathSync(root), file);
    return (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  }
  observeItems(sessionId, items) {
    if (!sessionId) return;
    const files = this.outputFiles.get(sessionId) || new Set();
    for (const item of items || [])
      for (const entry of item?.modelVisibleContent || []) {
        if (
          entry.path &&
          (/^(image|audio|video)\//.test(entry.mediaType || entry.mime || "") ||
            ["image", "audio", "video"].includes(entry.kind))
        ) {
          try {
            files.add(fs.realpathSync(localPath(entry.path, false)));
          } catch {}
        }
      }
    this.outputFiles.set(sessionId, files);
  }
  async approvedPath(value, sessionId, agentOnly = false) {
    const root = sessionId
      ? await this.engine.workspaceForSession(sessionId)
      : null;
    let file = value;
    if (!path.isAbsolute(file) && !/^file:|^[a-z]:[\\/]/i.test(file)) {
      if (!root)
        throw new Error("A local image needs a conversation workspace.");
      file = path.resolve(root, file);
    }
    file = fs.realpathSync(localPath(file, false));
    const attachment = Object.values(
      this.manifest.sessions[sessionId] || {},
    ).some((files) =>
      files.some((entry) => {
        try {
          return fs.realpathSync(entry.path) === file;
        } catch {
          return false;
        }
      }),
    );
    if (
      !(agentOnly ? attachment : this.within(file, this.directory)) &&
      !this.within(file, root) &&
      !this.outputFiles.get(sessionId)?.has(file)
    )
      throw new Error(
        "This media file is outside the conversation's approved locations.",
      );
    return file;
  }
  async resolveMedia(value, sessionId, agentOnly = false) {
    const file = await this.approvedPath(value, sessionId, agentOnly);
    if (!mediaTypes[path.extname(file).toLowerCase()])
      throw new Error("Unsupported local media.");
    return this.signMedia(file, sessionId);
  }
  discardAttachment(id) {
    if (
      Object.values(this.manifest.sessions).some((commands) =>
        Object.values(commands).some((media) =>
          media.some((entry) => entry.id === id),
        ),
      )
    )
      return { removed: false };
    const entry = this.manifest.files[id];
    if (!entry) return { removed: false };
    const file = localPath(entry.path, false);
    if (path.dirname(file) !== this.directory)
      throw new Error("Invalid attachment storage path.");
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    delete this.manifest.files[id];
    this.writeManifest();
    return { removed: true };
  }
  unusedAttachments(retained = []) {
    const used = new Set(retained);
    for (const commands of Object.values(this.manifest.sessions))
      for (const files of Object.values(commands))
        for (const file of files) used.add(file.id);
    return Object.values(this.manifest.files).filter(
      (file) => !used.has(file.id) && !file.recovered,
    );
  }
  purgeAttachments(retained = [], selected) {
    let removed = 0;
    for (const file of this.unusedAttachments(retained).filter(
      (file) => !selected || selected.includes(file.id),
    ))
      if (this.discardAttachment(file.id).removed) removed++;
    return { removed };
  }
  storageStats() {
    const files = Object.values(this.manifest.files);
    return {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + (file.size || 0), 0),
      warning: this.storageWarning || null,
    };
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
        ? {
            text: bytes.toString("utf8").slice(0, 100000),
            textTruncated: bytes.toString("utf8").length > 100000,
            textLength: bytes.toString("utf8").length,
          }
        : {}),
      path: file,
      url: this.signMedia(file),
      createdAt: Date.now(),
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
    return Object.fromEntries(
      Object.entries(this.manifest.sessions[id] || {}).map(
        ([command, media]) => [
          command,
          media.map((entry) => {
            let url;
            try {
              url = this.signMedia(entry.path, id);
            } catch {}
            return { ...entry, url };
          }),
        ],
      ),
    );
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
      if (
        url.hostname !== "local" ||
        url.protocol !== "muse-media:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.searchParams.getAll("path").length !== 1 ||
        url.searchParams.getAll("token").length !== 1
      )
        return new Response("Not found", { status: 404 });
      const file = localPath(url.searchParams.get("path"), false);
      const supplied = url.searchParams.get("token") || "";
      const grant = this.mediaGrants.get(supplied);
      if (
        !grant ||
        grant.file !== file ||
        grant.sessionId !== (url.searchParams.get("session") || "") ||
        fs.realpathSync(file) !== file
      )
        return new Response("Media access denied", { status: 403 });
      const expected = createHmac("sha256", this.mediaSecret)
        .update(
          `${file}\0${grant.sessionId}\0${grant.dev}:${grant.ino}:${grant.birthtimeMs}`,
        )
        .digest("hex");
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        return new Response("Media access denied", { status: 403 });
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405 });
      const mime = mediaTypes[path.extname(file).toLowerCase()];
      if (!mime) return new Response("Unsupported media", { status: 415 });
      const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
      );
      const stat = fs.fstatSync(descriptor);
      if (
        stat.dev !== grant.dev ||
        stat.ino !== grant.ino ||
        stat.birthtimeMs !== grant.birthtimeMs ||
        fs.realpathSync(file) !== file
      ) {
        fs.closeSync(descriptor);
        return new Response("Media file changed; request a new preview", {
          status: 403,
        });
      }
      if (!stat.isFile() || stat.size === 0 || stat.size > 512 * 1024 * 1024) {
        fs.closeSync(descriptor);
        return new Response("Media is empty or too large", { status: 413 });
      }
      const range = request.headers.get("range");
      let start = 0,
        end = stat.size - 1;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          fs.closeSync(descriptor);
          return new Response(null, { status: 416 });
        }
        if (!match[1] && !match[2]) {
          fs.closeSync(descriptor);
          return new Response(null, { status: 416 });
        }
        if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), end);
        }
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          start >= stat.size
        ) {
          fs.closeSync(descriptor);
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }
      }
      const headers = {
        "Content-Type": mime,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
      };
      if (range)
        headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      if (request.method === "HEAD") {
        fs.closeSync(descriptor);
        return new Response(null, { status: range ? 206 : 200, headers });
      }
      return new Response(
        Readable.toWeb(
          fs.createReadStream(file, {
            fd: descriptor,
            autoClose: true,
            start,
            end,
          }),
        ),
        { status: range ? 206 : 200, headers },
      );
    } catch {
      return new Response("Local media is unavailable", { status: 404 });
    }
  }
}
module.exports = { DesktopServices, localPath, mediaUrl, mediaTypes };
