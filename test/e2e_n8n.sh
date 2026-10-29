#!/usr/bin/env bash
# End-to-end test: run the real workflow in a throwaway local n8n against test/mock_server.js (SAMPLE data, fake keys).
# Usage: N8N_BIN=/path/to/n8n bash test/e2e_n8n.sh
set -euo pipefail
# n8n 2.x needs Node >= 24; set NODE24_BIN_DIR if your default node is older.
cd "$(dirname "$0")/.."
[ -n "${NODE24_BIN_DIR:-}" ] && export PATH="$NODE24_BIN_DIR:$PATH"
N8N_BIN=${N8N_BIN:-n8n}; PORT=18555; TMP=$(mktemp -d)
export N8N_USER_FOLDER=$TMP N8N_DIAGNOSTICS_ENABLED=false N8N_RUNNERS_ENABLED=false N8N_ENCRYPTION_KEY=e2e-sample-only
node test/mock_server.js $PORT & MOCK=$!; trap 'kill $MOCK 2>/dev/null; [ -n "${KEEP_TMP:-}" ] || rm -rf "$TMP"' EXIT; sleep 1
python3 - "$TMP" "$PORT" <<'PY'
import json, sys
tmp, port = sys.argv[1], sys.argv[2]
wf = json.load(open("shopify_stripe_order_lookup.workflow.json"))
wf["id"] = "e2eOrderLookup01"; wf["active"] = False
for n in wf["nodes"]:
    if n["name"] == "Config":
        for a in n["parameters"]["assignments"]["assignments"]:
            if a["name"] in ("shopifyBaseUrl", "stripeBaseUrl"): a["value"] = f"http://127.0.0.1:{port}"
            if a["name"] == "nowOverride": a["value"] = "2026-10-29T12:00:00Z"
    if n["name"] == "Sample request (SAMPLE)":
        n["parameters"]["assignments"]["assignments"][0]["value"] = "maria.sample@shop-customer.example"
    if n["name"] == "Shopify: find orders": n["credentials"] = {"shopifyAccessTokenApi": {"id": "credShopSample", "name": "Shopify SAMPLE"}}
    if n["name"].startswith("Stripe"): n["credentials"] = {"stripeApi": {"id": "credStripeSample", "name": "Stripe SAMPLE"}}
json.dump(wf, open(f"{tmp}/wf.json", "w"))
json.dump([
  {"id": "credShopSample", "name": "Shopify SAMPLE", "type": "shopifyAccessTokenApi", "data": {"shopSubdomain": "sample", "accessToken": "shpat_SAMPLE_TOKEN", "appSecretKey": "SAMPLE"}},
  {"id": "credStripeSample", "name": "Stripe SAMPLE", "type": "stripeApi", "data": {"secretKey": "sk_test_SAMPLE"}},
], open(f"{tmp}/creds.json", "w"))
PY
"$N8N_BIN" import:credentials --input="$TMP/creds.json" >/dev/null
"$N8N_BIN" import:workflow --input="$TMP/wf.json" >/dev/null
"$N8N_BIN" execute --id=e2eOrderLookup01 > "$TMP/out.txt" 2>"$TMP/err.txt" || { cat "$TMP/err.txt" "$TMP/out.txt"; exit 1; }
curl -s http://127.0.0.1:$PORT/__log > "$TMP/log.json"
python3 - "$TMP" <<'PY'
import json, sys, re
tmp = sys.argv[1]
raw = open(f"{tmp}/out.txt").read()
i = raw.index("\n{") + 1 if not raw.startswith("{") else 0
data = json.loads(raw[i:raw.rindex("}") + 1])
assert data.get("status") == "success", data.get("status")
run = data["data"]["resultData"]["runData"]
merged = run["Merge order + payment status"][0]["data"]["main"][0][0]["json"]
log = json.load(open(f"{tmp}/log.json"))
assert merged["ok"] is True, merged["sources"]
checks = {o["order_number"]: o["payment_check"] for o in merged["orders"]}
assert checks["#1001"] == "ok" and checks["#1002"] == "partially_refunded" and checks["#1003"].startswith("not_a_stripe"), checks
assert "POST /admin/api/2025-10/graphql.json" in log and "GET /v1/customers/search" in log and "GET /v1/charges/search" in log, log
json.dump({"_note": "SAMPLE: output of a real n8n execution against a local mock API with invented data.", "result": merged},
          open("test/e2e_output.SAMPLE.json", "w"), indent=2)
print("E2E OK via real n8n:", checks, "| mock saw:", log)
PY
