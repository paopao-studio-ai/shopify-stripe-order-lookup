// Local stand-in for the Shopify GraphQL Admin API and Stripe search API, serving SAMPLE data only.
// Usage: node test/mock_server.js [port]   (checks that n8n sends the credential headers)
const http = require('http'); const D = require('./sample_data.SAMPLE.js');
const port = Number(process.argv[2] || 18555); const seen = [];
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    seen.push(`${req.method} ${u.pathname}`);
    if (u.pathname === '/__log') return send(200, seen);
    if (u.pathname === '/admin/api/2025-10/graphql.json' && req.method === 'POST') {
      if (req.headers['x-shopify-access-token'] !== 'shpat_SAMPLE_TOKEN') return send(401, { errors: '[API] Invalid API key or access token' });
      const { variables } = JSON.parse(body || '{}');
      return send(200, { data: { orders: { nodes: D.shopifySearch(variables.q, variables.first) } } });
    }
    if (u.pathname.startsWith('/v1/')) {
      if (req.headers.authorization !== 'Bearer sk_test_SAMPLE') return send(401, { error: { message: 'Invalid API Key provided' } });
      const q = u.searchParams.get('query') || '';
      if (u.pathname === '/v1/customers/search') return send(200, { object: 'search_result', data: D.stripeSearch(D.customers, q), has_more: false });
      if (u.pathname === '/v1/charges/search') return send(200, { object: 'search_result', data: D.stripeSearch(D.charges, q), has_more: false });
    }
    send(404, { error: 'not found' });
  });
}).listen(port, '127.0.0.1', () => console.log('mock listening on', port));
