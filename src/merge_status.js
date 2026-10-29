// n8n Code node: "Merge order + payment status" (mode: Run Once for All Items)
// Joins Shopify orders with Stripe charges and returns one JSON answer plus Slack- and Telegram-ready text.
// A charge belongs to an order when its metadata carries the order number, or (fallback) when it was made
// by the same customer email for the same amount and currency within 3 days of the order.
const p = $('Parse query').first().json;
const shopRes = $('Shopify: find orders').first().json;
const custRes = $('Stripe: find customers').first().json;
const chargeRes = $input.first().json;
const nowIso = p.nowOverride || new Date().toISOString();

const errOf = r => (r && r.error) ? (r.error.message || r.error.description || JSON.stringify(r.error)).toString().slice(0, 200)
  : (r && Array.isArray(r.errors) && r.errors.length) ? String(r.errors[0].message || r.errors[0]).slice(0, 200) : null;
const sources = { shopify: errOf(shopRes) ? 'error: ' + errOf(shopRes) : 'ok',
                  stripe: (errOf(custRes) || errOf(chargeRes)) ? 'error: ' + (errOf(custRes) || errOf(chargeRes)) : 'ok' };

const orders = (shopRes && shopRes.data && shopRes.data.orders && shopRes.data.orders.nodes) || [];
const customers = (custRes && Array.isArray(custRes.data)) ? custRes.data : [];
const charges = (chargeRes && Array.isArray(chargeRes.data)) ? chargeRes.data : [];
const custEmail = Object.fromEntries(customers.map(c => [c.id, String(c.email || '').toLowerCase()]));
const ZERO_DEC = ['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf'];
const toMinor = (amount, cur) => Math.round(Number(amount) * (ZERO_DEC.includes(String(cur).toLowerCase()) ? 1 : 100));
const money = (minor, cur) => { const z = ZERO_DEC.includes(String(cur).toLowerCase()); return `${(z ? minor : minor / 100).toFixed(z ? 0 : 2)} ${String(cur).toUpperCase()}`; };
const mdKey = p.stripeOrderMetadataKey || 'order_number';
const used = new Set();

function paymentCheck(o, ch, totalMinor, cur) {
  if (!ch) {
    const gw = (o.paymentGatewayNames || []).join(', ');
    return /stripe/i.test(gw) ? 'stripe_charge_not_found' : `not_a_stripe_payment (gateway: ${gw || 'unknown'})`;
  }
  if (ch.disputed) return 'disputed';
  if (ch.status !== 'succeeded') return 'payment_' + ch.status;
  if (ch.refunded) return 'refunded';
  if (ch.amount_refunded > 0) return 'partially_refunded';
  if (ch.amount !== totalMinor || String(ch.currency).toLowerCase() !== String(cur).toLowerCase()) return 'amount_mismatch';
  return 'ok';
}

const merged = orders.map(o => {
  const no = String(o.name || '').replace(/^#/, '');
  const total = (o.totalPriceSet && o.totalPriceSet.shopMoney) || {};
  const cur = total.currencyCode || 'USD';
  const totalMinor = toMinor(total.amount || 0, cur);
  const created = new Date(o.createdAt).getTime() / 1000;
  let ch = charges.find(c => !used.has(c.id) && c.metadata && String(c.metadata[mdKey] || '').replace(/^#/, '') === no);
  let matchedBy = ch ? 'metadata' : null;
  if (!ch) {
    ch = charges.find(c => !used.has(c.id) && c.amount === totalMinor && String(c.currency).toLowerCase() === cur.toLowerCase()
      && Math.abs(c.created - created) < 3 * 86400 && (custEmail[c.customer] || '') === String(o.email || '').toLowerCase());
    if (ch) matchedBy = 'email+amount+date';
  }
  if (ch) used.add(ch.id);
  const tracking = (o.fulfillments || []).flatMap(f => (f.trackingInfo || []).map(t => ({ company: t.company || '', number: t.number || '', url: t.url || '', status: f.displayStatus || f.status || '' })));
  const check = paymentCheck(o, ch, totalMinor, cur);
  return {
    order_number: o.name, created_at: o.createdAt, email: o.email || '', customer: (o.customer && o.customer.displayName) || '',
    cancelled: !!o.cancelledAt,
    total: money(totalMinor, cur),
    shopify_payment_status: o.displayFinancialStatus || '', fulfillment_status: o.displayFulfillmentStatus || '',
    items: ((o.lineItems && o.lineItems.nodes) || []).map(li => `${li.quantity}× ${li.title}`),
    tracking, order_status_url: o.statusPageUrl || '',
    stripe: ch ? { charge_id: ch.id, matched_by: matchedBy, status: ch.status, amount: money(ch.amount, ch.currency),
                   refunded: money(ch.amount_refunded || 0, ch.currency), disputed: !!ch.disputed, receipt_url: ch.receipt_url || '',
                   created_at: new Date(ch.created * 1000).toISOString() } : null,
    payment_check: check,
  };
});
const unmatched = charges.filter(c => !used.has(c.id)).map(c => ({ charge_id: c.id, status: c.status, amount: money(c.amount, c.currency),
  refunded: money(c.amount_refunded || 0, c.currency), created_at: new Date(c.created * 1000).toISOString(), description: c.description || '' }));

const maskEmail = e => e ? e.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : '';
const line = o => {
  const t = o.tracking[0];
  const flag = o.payment_check === 'ok' ? '✅' : (/not_a_stripe/.test(o.payment_check) ? 'ℹ️' : '⚠️');
  return `${flag} Order ${o.order_number}${o.cancelled ? ' (CANCELLED)' : ''} · ${o.total} · Shopify: ${o.shopify_payment_status}/${o.fulfillment_status}` +
    ` · Stripe: ${o.stripe ? o.stripe.status + (o.stripe.refunded.startsWith('0.00') || o.stripe.refunded.startsWith('0 ') ? '' : ', refunded ' + o.stripe.refunded) : 'no charge'}` +
    ` · check: ${o.payment_check}` + (t ? ` · ${t.company} ${t.number}` : '');
};
const head = `Lookup "${p.kind === 'email' ? maskEmail(p.email) : '#' + p.orderNumber}": ${merged.length} order(s), ${unmatched.length} unmatched Stripe charge(s)`;
const body = merged.length ? merged.map(line) : ['No Shopify order found.'];
if (unmatched.length) body.push(...unmatched.map(c => `• Stripe charge ${c.charge_id} ${c.amount} ${c.status} (no matching order)`));
const warn = Object.entries(sources).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k} ${v}`);
if (warn.length) body.push('Source problem: ' + warn.join('; '));
const plain = [head, ...body].join('\n');
const needsAttention = merged.some(o => !['ok'].includes(o.payment_check) && !/not_a_stripe/.test(o.payment_check)) || warn.length > 0;

return [{ json: {
  ok: warn.length === 0, query: { kind: p.kind, value: p.kind === 'email' ? p.email : '#' + p.orderNumber },
  checked_at: nowIso, sources,
  summary: { orders: merged.length, stripe_charges: charges.length, unmatched_stripe_charges: unmatched.length, needs_attention: needsAttention },
  orders: merged, unmatched_stripe_charges: unmatched,
  slack_text: `*${head}*\n` + body.join('\n'),
  telegram_text: plain,
} }];
