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
