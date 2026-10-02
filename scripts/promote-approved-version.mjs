// One-time owner-authorized promotion of the tested WorkBoard version.
// Runs only in Cloudflare Workers Builds on main, expires 2026-10-02 16:00 UTC.
// No credentials leave the build runner. Remove postbuild after this request.
const version = "96ca24c2-df93-45b6-bf38-1fc42654d929";
if (process.env.WORKERS_CI !== "1" || process.env.WORKERS_CI_BRANCH !== "main") {
  console.log("Approved production promotion: skipped outside Workers Builds/main.");
} else {
  if (Date.now() > Date.parse("2026-10-02T16:00:00Z")) throw Error("PROMOTION_REQUEST_EXPIRED");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw Error("EXISTING_BUILD_DEPLOY_CREDENTIAL_UNAVAILABLE");
  const base = "https://api.cloudflare.com/client/v4/accounts/34c6c75982b215646f23c117920c3e0f/workers/scripts/factory-control-web";
  async function request(path, method = "GET", payload) {
    const response = await fetch(base + path, {
      method, headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
      ...(payload ? {body: JSON.stringify(payload)} : {}),
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw Error("CLOUDFLARE_PROMOTION_API_FAILED:HTTP_" + response.status + ":CODES_" + (data.errors || []).map(x => x.code).join(","));
    return data.result;
  }
  const approved = await request("/versions/" + version);
  if (approved.id !== version) throw Error("APPROVED_VERSION_MISMATCH");
  const before = await request("/deployments");
  const previous = before.deployments?.[0] || (Array.isArray(before) ? before[0] : null);
  console.log(JSON.stringify({promotion_request: "WORKBOARD-CURRENT-ASSIGNMENT-20261002", approved_version: version, previous_deployment: previous?.id, previous_versions: previous?.versions}));
  const active = d => d?.versions?.length === 1 && d.versions[0].version_id === version && d.versions[0].percentage === 100;
  if (!active(previous)) {
    const deployment = await request("/deployments", "POST", {
      strategy: "percentage", versions: [{version_id: version, percentage: 100}],
      annotations: {"workers/message": "Owner authorized WorkBoard current-assignment fix; candidate 4ae824e7418a4f6475f1be5d230ed34ea5c76feb"}
    });
    if (!active(deployment)) throw Error("PROMOTION_RESPONSE_VERSION_MISMATCH");
    const verified = await request("/deployments/" + deployment.id);
    if (!active(verified)) throw Error("PROMOTION_READBACK_MISMATCH");
    console.log(JSON.stringify({production_promotion: "VERIFIED", deployment_id: deployment.id, version_id: version, percentage: 100}));
  } else {
    console.log(JSON.stringify({production_promotion: "ALREADY_ACTIVE", version_id: version, percentage: 100}));
  }
}
