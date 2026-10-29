// n8n Code node: "Parse query" (mode: Run Once for All Items)
// Accepts POST {"query": "..."} (or {"email": ...} / {"order": ...}) or GET ?q=...
// Decides whether the caller gave an email or an order number and builds the Shopify search string.
const j = $input.first().json;
const b = (j.body && typeof j.body === 'object') ? j.body : {};
const q = (j.query && typeof j.query === 'object') ? j.query : {};
const raw = String(b.query ?? b.email ?? b.order ?? b.order_number ?? q.q ?? q.email ?? q.order ?? '').trim();
const cfg = j; // Config fields are passed through (includeOtherFields)

let kind = null, email = '', orderNumber = '';
if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) { kind = 'email'; email = raw.toLowerCase(); }
else {
  const m = raw.match(/^(?:order\s*)?#?\s*([A-Za-z]{0,6}-?\d{1,12})$/i);
  if (m) { kind = 'order_number'; orderNumber = m[1].toUpperCase(); }
}
if (!kind) {
  return [{ json: { ok: false, status: 400, error: 'Send {"query": "<customer email or order number like #1001>"}', received: raw.slice(0, 80) } }];
}
const GQL = `query OrderLookup($q: String!, $first: Int!) {
  orders(first: $first, query: $q, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name createdAt email cancelledAt statusPageUrl
      displayFinancialStatus displayFulfillmentStatus paymentGatewayNames
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { displayName }
      lineItems(first: 10) { nodes { title quantity } }
      fulfillments(first: 5) { status displayStatus trackingInfo(first: 3) { company number url } }
    }
  }
}`;
const esc = s => s.replace(/["\\]/g, '');
const shopifySearch = kind === 'email' ? `email:"${esc(email)}"` : `name:"#${esc(orderNumber.replace(/^#/, ''))}"`;
return [{ json: {
  ok: true, kind, email, orderNumber, raw,
  shopifySearch,
  shopifyGraphql: GQL,
  nowOverride: cfg.nowOverride || '',
  maxOrders: Number(cfg.maxOrders) || 5,
  shopifyBaseUrl: String(cfg.shopifyBaseUrl || '').replace(/\/+$/, ''),
  shopifyApiVersion: cfg.shopifyApiVersion || '2025-10',
  stripeBaseUrl: String(cfg.stripeBaseUrl || 'https://api.stripe.com').replace(/\/+$/, ''),
  stripeOrderMetadataKey: cfg.stripeOrderMetadataKey || 'order_number',
} }];
