// n8n Code node: "Build charge query" (mode: Run Once for All Items)
const plan = $('Plan Stripe search').first().json;
const res = $input.first().json;
const customers = (res && Array.isArray(res.data)) ? res.data : [];
const clauses = [...customers.slice(0, 5).map(c => `customer:"${c.id}"`), ...plan.orderClauses].slice(0, 10); // Stripe max 10 clauses
return [{ json: {
  customerIds: customers.map(c => c.id),
  chargeQuery: clauses.length ? clauses.join(' OR ') : 'metadata["order_number"]:"no-match-0"',
} }];
