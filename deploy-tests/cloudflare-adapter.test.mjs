import test from "node:test";
import assert from "node:assert/strict";
import { shouldFallbackToAsset } from "../worker/index.js";

function req(path, method = "GET") {
  return new Request("https://factory-control-web.juancho-dlfr.workers.dev" + path, { method });
}

test("asset fallback is restricted to exact candidate static paths", () => {
  const miss = new Response("", { status: 404 });
  for (const path of ["/", "/index.html", "/src/app.mjs", "/src/api.mjs", "/src/model.mjs", "/src/styles.css"]) {
    assert.equal(shouldFallbackToAsset(req(path), miss), true, path);
  }
  assert.equal(shouldFallbackToAsset(req("/server.mjs"), miss), false);
  assert.equal(shouldFallbackToAsset(req("/src/../../secrets.txt"), miss), false);
  assert.equal(shouldFallbackToAsset(req("/api/factory-control/factory_control_v020_board_read"), miss), false);
  assert.equal(shouldFallbackToAsset(req("/", "POST"), miss), false);
  assert.equal(shouldFallbackToAsset(req("/"), new Response("", { status: 401 })), false);
});


test("Wrangler configuration is present for both supported Cloudflare build roots", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const nested = JSON.parse(await readFile(new URL("../worker/wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(root.main, "./worker/index.js");
  assert.equal(root.assets.directory, "./dist");
  assert.equal(root.assets.run_worker_first, true);
  assert.equal(nested.main, "./index.js");
  assert.equal(nested.assets.directory, "../dist");
  assert.equal(nested.assets.run_worker_first, true);
});


test("Wrangler deploy redirect resolves canonical root config from nested build cwd", async () => {
  const { readFile } = await import("node:fs/promises");
  const redirect = JSON.parse(await readFile(new URL("../.wrangler/deploy/config.json", import.meta.url), "utf8"));
  assert.equal(redirect.configPath, "../../wrangler.jsonc");
});
