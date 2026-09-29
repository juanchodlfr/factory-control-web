import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "src"), { recursive: true });
await cp(resolve(root, "index.html"), resolve(dist, "index.html"));
for (const name of ["app.mjs", "api.mjs", "model.mjs", "styles.css"]) {
  await cp(resolve(root, "src", name), resolve(dist, "src", name));
}
console.log("factory_control_web_cloudflare_build=PASS");
