import http from 'node:http';

// Loopback-only development bridge. Never deploy this as a public proxy.
export function startProxy() {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && !['http://localhost:8081', 'http://127.0.0.1:8081'].includes(origin)) {
      res.writeHead(403); res.end('Preview origin not allowed'); return;
    }
    if (!req.url?.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const headers = {};
    for (const key of ['authorization', 'content-type', 'accept']) {
      if (req.headers[key]) headers[key] = req.headers[key];
    }
    // Keep upstream fixed; preserve bearer authentication, not browser Origin.
    const upstream = http.request({ hostname: '127.0.0.1', port: 8080, path: req.url, method: req.method, headers }, response => {
      res.statusCode = response.statusCode || 502;
      if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
      response.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('Timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({message:'Local backend is unavailable on port 8080.'})); }
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.listen(8082, '127.0.0.1', () => console.log('Mobile preview API bridge: 127.0.0.1:8082 → localhost:8080'));
  return server;
}
