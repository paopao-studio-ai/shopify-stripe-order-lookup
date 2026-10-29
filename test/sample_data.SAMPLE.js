// SAMPLE DATA — invented for the demo. Not a real store, customer or payment. All emails use *.example domains.
const t = s => Math.floor(Date.parse(s) / 1000);
const orders = [
  { id: 'gid://shopify/Order/9001', name: '#1001', createdAt: '2026-10-20T15:02:11Z', email: 'maria.sample@shop-customer.example', cancelledAt: null,
    statusPageUrl: 'https://sample-store.example/orders/1001', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED',
    paymentGatewayNames: ['stripe'], totalPriceSet: { shopMoney: { amount: '84.50', currencyCode: 'USD' } }, customer: { displayName: 'Maria Sample' },
    lineItems: { nodes: [{ title: 'Ceramic mug (SAMPLE)', quantity: 2 }, { title: 'Gift wrap', quantity: 1 }] },
    fulfillments: [{ status: 'SUCCESS', displayStatus: 'IN_TRANSIT', trackingInfo: [{ company: 'UPS', number: '1ZSAMPLE0000000001', url: 'https://www.ups.com/track?tracknum=1ZSAMPLE0000000001' }] }] },
  { id: 'gid://shopify/Order/9002', name: '#1002', createdAt: '2026-10-25T09:40:00Z', email: 'maria.sample@shop-customer.example', cancelledAt: null,
    statusPageUrl: 'https://sample-store.example/orders/1002', displayFinancialStatus: 'PARTIALLY_REFUNDED', displayFulfillmentStatus: 'UNFULFILLED',
    paymentGatewayNames: ['stripe'], totalPriceSet: { shopMoney: { amount: '120.00', currencyCode: 'USD' } }, customer: { displayName: 'Maria Sample' },
    lineItems: { nodes: [{ title: 'Linen apron (SAMPLE)', quantity: 3 }] }, fulfillments: [] },
  { id: 'gid://shopify/Order/9003', name: '#1003', createdAt: '2026-10-27T18:15:00Z', email: 'maria.sample@shop-customer.example', cancelledAt: null,
    statusPageUrl: 'https://sample-store.example/orders/1003', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    paymentGatewayNames: ['paypal'], totalPriceSet: { shopMoney: { amount: '19.00', currencyCode: 'USD' } }, customer: { displayName: 'Maria Sample' },
    lineItems: { nodes: [{ title: 'Tea towel (SAMPLE)', quantity: 1 }] }, fulfillments: [] },
  { id: 'gid://shopify/Order/9004', name: '#1004', createdAt: '2026-10-28T11:00:00Z', email: 'leo.sample@other-customer.example', cancelledAt: null,
    statusPageUrl: '', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    paymentGatewayNames: ['stripe'], totalPriceSet: { shopMoney: { amount: '45.00', currencyCode: 'USD' } }, customer: { displayName: 'Leo Sample' },
    lineItems: { nodes: [{ title: 'Candle (SAMPLE)', quantity: 1 }] }, fulfillments: [] },
];
const customers = [
  { id: 'cus_SAMPLEmaria01', object: 'customer', email: 'maria.sample@shop-customer.example' },
  { id: 'cus_SAMPLEleo0001', object: 'customer', email: 'leo.sample@other-customer.example' },
];
const charges = [
  { id: 'ch_SAMPLE_1001', object: 'charge', amount: 8450, amount_refunded: 0, currency: 'usd', status: 'succeeded', refunded: false, disputed: false,
    customer: 'cus_SAMPLEmaria01', created: t('2026-10-20T15:02:30Z'), metadata: { order_number: '1001' }, receipt_url: 'https://pay.stripe.com/receipts/SAMPLE_1001', description: 'SAMPLE' },
  { id: 'ch_SAMPLE_1002', object: 'charge', amount: 12000, amount_refunded: 4000, currency: 'usd', status: 'succeeded', refunded: false, disputed: false,
    customer: 'cus_SAMPLEmaria01', created: t('2026-10-25T09:40:20Z'), metadata: {}, receipt_url: 'https://pay.stripe.com/receipts/SAMPLE_1002', description: 'SAMPLE' },
  { id: 'ch_SAMPLE_extra', object: 'charge', amount: 3900, amount_refunded: 0, currency: 'usd', status: 'failed', refunded: false, disputed: false,
    customer: 'cus_SAMPLEmaria01', created: t('2026-10-26T10:00:00Z'), metadata: {}, receipt_url: '', description: 'SAMPLE declined card' },
  { id: 'ch_SAMPLE_1004', object: 'charge', amount: 4500, amount_refunded: 0, currency: 'usd', status: 'succeeded', refunded: false, disputed: true,
    customer: 'cus_SAMPLEleo0001', created: t('2026-10-28T11:00:10Z'), metadata: { order_number: '1004' }, receipt_url: '', description: 'SAMPLE' },
];
// Tiny re-implementations of the search syntaxes the workflow uses (enough for the mock).
function shopifySearch(q, first) {
  let m = q.match(/^email:"?([^"]+)"?$/); if (m) return orders.filter(o => o.email === m[1].toLowerCase()).slice(0, first);
  m = q.match(/^name:"?#?([^"]+)"?$/); if (m) return orders.filter(o => o.name === '#' + m[1]).slice(0, first);
  return [];
}
function stripeSearch(list, query) {
  const clauses = query.split(' OR ');
  return list.filter(x => clauses.some(c => {
    let m = c.match(/^email:"(.*)"$/); if (m) return x.email === m[1];
    m = c.match(/^customer:"(.*)"$/); if (m) return x.customer === m[1];
    m = c.match(/^metadata\["(.*)"\]:"(.*)"$/); if (m) return x.metadata && x.metadata[m[1]] === m[2];
    return false;
  }));
}
module.exports = { orders, customers, charges, shopifySearch, stripeSearch };
