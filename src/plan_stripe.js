// n8n Code node: "Plan Stripe search" (mode: Run Once for All Items)
// Stripe's charge search cannot filter by email, so we (1) find Stripe customers by email, then
// (2) search charges by customer id OR by the order number stored in charge metadata.
// The email comes from the request, or from the Shopify order when the caller sent an order number.
const p = $('Parse query').first().json;
const shop = $input.first().json;
const orders = (shop && shop.data && shop.data.orders && shop.data.orders.nodes) || [];
const emails = new Set();
if (p.email) emails.add(p.email);
for (const o of orders) if (o.email) emails.add(String(o.email).toLowerCase());
const orderNos = new Set(orders.map(o => String(o.name || '').replace(/^#/, '')).filter(Boolean));
if (p.orderNumber) orderNos.add(p.orderNumber.replace(/^#/, ''));
const em = [...emails].slice(0, 5);
const q = s => '"' + String(s).replace(/["\\]/g, '') + '"';
return [{ json: {
  emails: em,
  orderNumbers: [...orderNos].slice(0, 5),
  // A query must not be empty; the fallback clause simply matches nothing.
  customerQuery: em.length ? em.map(e => 'email:' + q(e)).join(' OR ') : 'email:"no-email@invalid.invalid"',
  orderClauses: [...orderNos].slice(0, 5).map(n => `metadata[${q(p.stripeOrderMetadataKey)}]:${q(n)}`),
} }];
