// Runs the workflow's Code nodes in sequence with SAMPLE data (no network). Usage: node test/unit_test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const D = require('./sample_data.SAMPLE.js');
const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shopify_stripe_order_lookup.workflow.json'), 'utf8'));
const codeOf = n => wf.nodes.find(x => x.name === n).parameters.jsCode;
function run(nodeName, input, outputs) {
  const $input = { first: () => ({ json: input }), all: () => [{ json: input }] };
  const $ = name => ({ first: () => ({ json: outputs[name] }) });
  return new Function('$input', '$', codeOf(nodeName))($input, $)[0].json;
}
const config = { shopifyBaseUrl: 'https://sample.myshopify.com', shopifyApiVersion: '2025-10', stripeBaseUrl: 'https://api.stripe.com',
                 stripeOrderMetadataKey: 'order_number', maxOrders: 5, nowOverride: '2026-10-29T12:00:00Z' };
function lookup(body, { stripeDown = false } = {}) {
  const o = {};
  o['Parse query'] = run('Parse query', { ...config, body }, o);
  if (!o['Parse query'].ok) return o['Parse query'];
  o['Shopify: find orders'] = { data: { orders: { nodes: D.shopifySearch(o['Parse query'].shopifySearch, 5) } } };
  o['Plan Stripe search'] = run('Plan Stripe search', o['Shopify: find orders'], o);
  o['Stripe: find customers'] = stripeDown ? { error: { message: '401 - Invalid API Key provided (SAMPLE)' } }
    : { data: D.stripeSearch(D.customers, o['Plan Stripe search'].customerQuery) };
  o['Build charge query'] = run('Build charge query', o['Stripe: find customers'], o);
  const ch = stripeDown ? { error: { message: '401' } } : { data: D.stripeSearch(D.charges, o['Build charge query'].chargeQuery) };
  return run('Merge order + payment status', ch, o);
}
// 1) by email: 3 orders, metadata match, email+amount match, PayPal order, 1 unmatched failed charge
const a = lookup({ query: 'Maria.Sample@shop-customer.example' });
assert.strictEqual(a.summary.orders, 3);
const by = Object.fromEntries(a.orders.map(o => [o.order_number, o]));
assert.strictEqual(by['#1001'].payment_check, 'ok'); assert.strictEqual(by['#1001'].stripe.matched_by, 'metadata');
assert.strictEqual(by['#1001'].tracking[0].number, '1ZSAMPLE0000000001');
assert.strictEqual(by['#1002'].payment_check, 'partially_refunded'); assert.strictEqual(by['#1002'].stripe.matched_by, 'email+amount+date');
assert.ok(by['#1003'].payment_check.startsWith('not_a_stripe_payment'));
assert.strictEqual(a.unmatched_stripe_charges.length, 1); assert.strictEqual(a.unmatched_stripe_charges[0].charge_id, 'ch_SAMPLE_extra');
assert.ok(a.summary.needs_attention); assert.ok(a.ok);
assert.ok(!a.slack_text.includes('maria.sample@'), 'email masked in chat text');
// 2) by order number with disputed charge
const b = lookup({ query: 'order #1004' });
assert.strictEqual(b.orders.length, 1); assert.strictEqual(b.orders[0].payment_check, 'disputed');
// 3) invalid input
const c = lookup({ query: 'hello?' }); assert.strictEqual(c.ok, false); assert.strictEqual(c.status, 400);
// 4) not found
const d = lookup({ query: '#9999' }); assert.strictEqual(d.summary.orders, 0); assert.ok(d.slack_text.includes('No Shopify order found'));
// 5) Stripe down -> still answers, flags source
const e = lookup({ query: '#1001' }, { stripeDown: true });
assert.strictEqual(e.ok, false); assert.ok(e.sources.stripe.startsWith('error')); assert.strictEqual(e.orders[0].payment_check, 'stripe_charge_not_found');
fs.writeFileSync(path.join(__dirname, 'sample_output.SAMPLE.json'),
  JSON.stringify({ _note: 'SAMPLE output generated from invented test data (test/sample_data.SAMPLE.js). Not a client result.', by_email: a, by_order_number: b }, null, 2));
console.log('OK: email lookup (3 orders, metadata + email/amount match, PayPal, unmatched charge) | order# lookup (disputed) | 400 | not found | Stripe outage');
console.log(a.slack_text);
