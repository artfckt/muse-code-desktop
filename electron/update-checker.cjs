const RELEASES_URL =
  "https://api.github.com/repos/artfckt/muse-code-desktop/releases?per_page=50";
const REPO_URL = "https://github.com/artfckt/muse-code-desktop";
function parseVersion(value) {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value || "",
    );
  if (
    !match ||
    match[4]
      ?.split(".")
      .some((p) => !p || (/^\d+$/.test(p) && p.length > 1 && p[0] === "0"))
  )
    return null;
  const core = match.slice(1, 4).map(Number);
  return core.every(Number.isSafeInteger)
    ? { core, pre: match[4]?.split(".") || [] }
    : null;
}
function compareVersions(a, b) {
  const left = parseVersion(a),
    right = parseVersion(b);
  if (!left || !right) throw new Error("Invalid release version");
  for (let i = 0; i < 3; i++)
    if (left.core[i] !== right.core[i])
      return left.core[i] > right.core[i] ? 1 : -1;
  if (!left.pre.length || !right.pre.length)
    return left.pre.length ? -1 : right.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i],
      y = right.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y);
    if (xn && yn)
      return x.length !== y.length
        ? x.length > y.length
          ? 1
          : -1
        : x > y
          ? 1
          : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
function selectRelease(releases, current) {
  const beta = !!parseVersion(current)?.pre.length;
  const valid = releases
    .filter(
      (r) =>
        !r.draft &&
        parseVersion(r.tag_name) &&
        (beta || (!r.prerelease && !parseVersion(r.tag_name).pre.length)),
    )
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  const row = valid[0];
  if (!row) return null;
  const tag = row.tag_name,
    url = `${REPO_URL}/releases/tag/${encodeURIComponent(tag)}`;
  const filename = `Muse-Desktop-${tag.replace(/^v/, "")}-Windows-x64.exe`;
  const asset = row.assets?.find(
    (a) =>
      a.name === filename &&
      a.state === "uploaded" &&
      a.browser_download_url ===
        `${REPO_URL}/releases/download/${tag}/${filename}`,
  );
  return {
    version: tag.replace(/^v/, ""),
    releaseUrl: url,
    downloadUrl: asset?.browser_download_url || url,
    publishedAt: row.published_at,
    notes: String(row.body || "").slice(0, 12000),
    available: compareVersions(tag, current) > 0,
  };
}
class UpdateChecker {
  constructor({
    currentVersion,
    fetch = globalThis.fetch,
    read = () => ({}),
    save = () => {},
    now = Date.now,
  }) {
    Object.assign(this, { currentVersion, fetch, read, save, now });
    this.pending = null;
  }
  check(force = false) {
    if (this.pending) return this.pending;
    const cached = this.read();
    if (
      !force &&
      cached.checkedAt &&
      this.now() - cached.checkedAt < 6 * 3600000
    )
      return Promise.resolve({
        ...cached,
        currentVersion: this.currentVersion,
        ...cached.release,
        available:
          !!cached.release &&
          compareVersions(cached.release.version, this.currentVersion) > 0,
        cached: true,
      });
    this.pending = this.request(cached).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async request(cached) {
    try {
      const response = await this.fetch(RELEASES_URL, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": `Muse-Desktop/${this.currentVersion}`,
          ...(cached.etag ? { "If-None-Match": cached.etag } : {}),
        },
        signal: AbortSignal.timeout(8000),
      });
      let release = cached.release || null;
      if (response.status !== 304) {
        if (!response.ok)
          throw new Error(
            response.status === 403 || response.status === 429
              ? "GitHub rate limit reached. Try again later."
              : `GitHub update check failed (${response.status}).`,
          );
        const text = await response.text();
        if (text.length > 1024 * 1024)
          throw new Error("Release response too large.");
        const rows = JSON.parse(text);
        if (!Array.isArray(rows)) throw new Error("Invalid release response.");
        release = selectRelease(rows, this.currentVersion);
      }
      const next = {
        checkedAt: this.now(),
        etag: response.headers.get("etag") || cached.etag,
        release,
      };
      this.save(next);
      return {
        ...next,
        ...release,
        currentVersion: this.currentVersion,
        available:
          !!release &&
          compareVersions(release.version, this.currentVersion) > 0,
        cached: false,
      };
    } catch (error) {
      return {
        currentVersion: this.currentVersion,
        ...cached,
        ...cached.release,
        available:
          !!cached.release &&
          compareVersions(cached.release.version, this.currentVersion) > 0,
        stale: true,
        error:
          error.name === "TimeoutError"
            ? "Update check timed out. Try again."
            : error.message,
      };
    }
  }
}
module.exports = { UpdateChecker, compareVersions, selectRelease };
