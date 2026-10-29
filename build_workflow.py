"""Builds shopify_stripe_order_lookup.workflow.json from src/*.js. Run: python3 build_workflow.py"""
import json, pathlib
here = pathlib.Path(__file__).parent
src = lambda n: (here / "src" / n).read_text()

def code(id_, name, file, pos):
    return {"id": id_, "name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos,
            "parameters": {"mode": "runOnceForAllItems", "language": "javaScript", "jsCode": src(file)}}
def http(id_, name, pos, cred, method, url, query=None, body=None):
    p = {"method": method, "url": url, "authentication": "predefinedCredentialType", "nodeCredentialType": cred, "options": {"timeout": 20000}}
    if query: p.update({"sendQuery": True, "queryParameters": {"parameters": [{"name": k, "value": v} for k, v in query]}})
    if body: p.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
    return {"id": id_, "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos, "parameters": p,
            "retryOnFail": True, "maxTries": 2, "waitBetweenTries": 2000, "onError": "continueRegularOutput"}
def a(i, name, value, typ="string"):
    return {"id": f"cfg-{i}", "name": name, "value": value, "type": typ}
P = "$('Parse query').first().json"
nodes = [
    {"id": "t-hook", "name": "Webhook: POST /order-lookup", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0],
     "webhookId": "5b0c2f4e-7d1a-4e8b-9a51-order-lookup", "parameters": {"httpMethod": "POST", "path": "order-lookup",
     "authentication": "headerAuth", "responseMode": "responseNode", "options": {}}},
    {"id": "t-manual", "name": "Test run", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [0, 220], "parameters": {}},
    {"id": "s-sample", "name": "Sample request (SAMPLE)", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [220, 220],
     "parameters": {"mode": "manual", "includeOtherFields": False, "options": {}, "assignments": {"assignments": [a(90, "body.query", "#1001")]}}},
    {"id": "s-config", "name": "Config", "type": "n8n-nodes-base.set", "typeVersion": 3.4, "position": [440, 100],
     "parameters": {"mode": "manual", "includeOtherFields": True, "options": {}, "assignments": {"assignments": [
         a(1, "shopifyBaseUrl", "https://YOUR-STORE.myshopify.com"), a(2, "shopifyApiVersion", "2025-10"),
         a(3, "stripeBaseUrl", "https://api.stripe.com"), a(4, "stripeOrderMetadataKey", "order_number"),
         a(5, "maxOrders", 5, "number"), a(6, "nowOverride", "")]}}},
    code("c-parse", "Parse query", "parse_query.js", [660, 100]),
    {"id": "i-valid", "name": "Valid query?", "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [880, 100],
     "parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                                   "conditions": [{"id": "v1", "leftValue": "={{ $json.ok }}", "rightValue": True,
                                                   "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                                   "combinator": "and"}, "options": {}}},
    http("h-shop", "Shopify: find orders", [1100, 0], "shopifyAccessTokenApi", "POST",
         "={{ $json.shopifyBaseUrl }}/admin/api/{{ $json.shopifyApiVersion }}/graphql.json",
         body="={{ JSON.stringify({ query: $json.shopifyGraphql, variables: { q: $json.shopifySearch, first: $json.maxOrders } }) }}"),
    code("c-plan", "Plan Stripe search", "plan_stripe.js", [1320, 0]),
    http("h-cust", "Stripe: find customers", [1540, 0], "stripeApi", "GET",
         f"={{{{ {P}.stripeBaseUrl }}}}/v1/customers/search", query=[("query", "={{ $json.customerQuery }}"), ("limit", "10")]),
    code("c-cq", "Build charge query", "charges_query.js", [1760, 0]),
    http("h-charges", "Stripe: search charges", [1980, 0], "stripeApi", "GET",
         f"={{{{ {P}.stripeBaseUrl }}}}/v1/charges/search", query=[("query", "={{ $json.chargeQuery }}"), ("limit", "20")]),
    code("c-merge", "Merge order + payment status", "merge_status.js", [2200, 0]),
    {"id": "r-ok", "name": "Respond 200", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [2420, 0],
     "parameters": {"respondWith": "json", "responseBody": "={{ JSON.stringify($json, null, 2) }}", "options": {"responseCode": 200}}},
    {"id": "r-bad", "name": "Respond 400", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1100, 240],
     "parameters": {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {"responseCode": 400}}},
    {"id": "sl-post", "name": "Post to Slack (optional)", "type": "n8n-nodes-base.slack", "typeVersion": 2.3, "position": [2420, 220], "disabled": True,
     "parameters": {"select": "channel", "channelId": {"__rl": True, "mode": "name", "value": "#orders"}, "text": "={{ $json.slack_text }}", "otherOptions": {}}},
    {"id": "tg-post", "name": "Send to Telegram (optional)", "type": "n8n-nodes-base.telegram", "typeVersion": 1.2, "position": [2420, 420], "disabled": True,
     "parameters": {"chatId": "YOUR_CHAT_ID", "text": "={{ $json.telegram_text }}", "additionalFields": {"appendAttribution": False}}},
    {"id": "n-1", "name": "About", "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": [-40, -420],
     "parameters": {"width": 640, "height": 380, "content":
        "## Shopify + Stripe order lookup (demo by Paopao Studio)\nPOST `{\"query\": \"#1001\"}` or `{\"query\": \"customer@email.com\"}` → one JSON with order, payment, refund, dispute and tracking status, plus `slack_text` / `telegram_text` ready for a support bot.\n\n**Credentials**: *Shopify Access Token API* (custom app, scope `read_orders`; older than 60 days needs `read_all_orders`), *Stripe API* (restricted key, read-only Customers + Charges), *Header Auth* on the webhook.\n\n**Config**: set `shopifyBaseUrl` to `https://<store>.myshopify.com`. If your checkout writes the order number into Stripe charge metadata, set `stripeOrderMetadataKey`; otherwise charges are matched by customer email + amount + date.\n\n**Test**: click *Test workflow* (uses *Sample request (SAMPLE)*)."}},
]
c = lambda n: [{"node": n, "type": "main", "index": 0}]
connections = {
    "Webhook: POST /order-lookup": {"main": [c("Config")]},
    "Test run": {"main": [c("Sample request (SAMPLE)")]},
    "Sample request (SAMPLE)": {"main": [c("Config")]},
    "Config": {"main": [c("Parse query")]},
    "Parse query": {"main": [c("Valid query?")]},
    "Valid query?": {"main": [c("Shopify: find orders"), c("Respond 400")]},
    "Shopify: find orders": {"main": [c("Plan Stripe search")]},
    "Plan Stripe search": {"main": [c("Stripe: find customers")]},
    "Stripe: find customers": {"main": [c("Build charge query")]},
    "Build charge query": {"main": [c("Stripe: search charges")]},
    "Stripe: search charges": {"main": [c("Merge order + payment status")]},
    "Merge order + payment status": {"main": [c("Respond 200") + c("Post to Slack (optional)") + c("Send to Telegram (optional)")]},
}
wf = {"name": "Shopify + Stripe order lookup (webhook → merged status JSON)", "nodes": nodes, "connections": connections,
      "settings": {"executionOrder": "v1"}, "pinData": {}, "meta": {"templateCredsSetupCompleted": False}, "tags": []}
(here / "shopify_stripe_order_lookup.workflow.json").write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n")
print("written", len(nodes), "nodes")
