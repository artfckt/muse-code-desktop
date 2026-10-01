const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UpdateChecker,
  compareVersions,
  selectRelease,
} = require("../electron/update-checker.cjs");
const repo = "https://github.com/artfckt/muse-code-desktop";
const release = (tag, patch = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: tag.includes("-"),
  assets: [],
  ...patch,
});
test("release selection orders numeric prereleases, follows the installed channel and ignores drafts", () => {
  assert.ok(compareVersions("0.7.0-beta.10", "0.7.0-beta.2") > 0);
  assert.ok(compareVersions("0.7.0", "0.7.0-beta.10") > 0);
  assert.equal(compareVersions("v0.7.0+build", "0.7.0"), 0);
  const rows = [
    release("v0.7.0-beta.2"),
    release("v0.7.0-beta.10"),
    release("v0.8.0", { draft: true }),
    release("v0.6.1"),
    release("bad"),
  ];
  assert.equal(selectRelease(rows, "0.7.0-beta.1").version, "0.7.0-beta.10");
  assert.equal(selectRelease(rows, "0.6.0").version, "0.6.1");
  assert.throws(() => compareVersions("v0.7.0-beta.01", "0.7.0"));
});
test("untrusted download links are discarded while official installer assets are supported", () => {
  const tag = "v0.7.0-beta.2",
    name = "Muse-Desktop-0.7.0-beta.2-Windows-x64.exe";
  const row = release(tag, {
    assets: [
      {
        name,
        state: "uploaded",
        browser_download_url: "https://evil.example/app.exe",
      },
    ],
  });
  assert.equal(
    selectRelease([row], "0.7.0-beta.1").downloadUrl,
    `${repo}/releases/tag/${tag}`,
  );
  row.assets[0].browser_download_url = `${repo}/releases/download/${tag}/${name}`;
  assert.equal(
    selectRelease([row], "0.7.0-beta.1").downloadUrl,
    row.assets[0].browser_download_url,
  );
});
test("parallel checks share a request, cache with ETag and keep the last release offline", async () => {
  let saved = {},
    calls = 0,
    resolve;
  const response = new Promise((r) => {
    resolve = r;
  });
  const checker = new UpdateChecker({
    currentVersion: "0.7.0-beta.1",
    fetch: async () => {
      calls++;
      return response;
    },
    read: () => saved,
    save: (value) => {
      saved = value;
    },
    now: () => 1000,
  });
  const a = checker.check(true),
    b = checker.check(true);
  assert.equal(a, b);
  resolve(
    new Response(JSON.stringify([release("v0.7.0-beta.2")]), {
      headers: { etag: '"abc"' },
    }),
  );
  assert.equal((await a).available, true);
  assert.equal(calls, 1);
  assert.equal((await checker.check()).cached, true);
  checker.fetch = async (_url, options) => {
    assert.equal(options.headers["If-None-Match"], '"abc"');
    return new Response(null, { status: 304 });
  };
  assert.equal((await checker.check(true)).version, "0.7.0-beta.2");
  checker.fetch = async () => {
    throw new Error("offline");
  };
  const offline = await checker.check(true);
  assert.equal(offline.stale, true);
  assert.equal(offline.available, true);
  assert.equal(offline.error, "offline");
});
test("GitHub rate limits and malformed feeds are recoverable and never create an update", async () => {
  const checker = new UpdateChecker({
    currentVersion: "0.7.0-beta.1",
    fetch: async () => new Response("{}", { status: 403 }),
  });
  assert.match((await checker.check(true)).error, /rate limit/);
  checker.fetch = async () => new Response("{");
  assert.equal((await checker.check(true)).available, false);
});
