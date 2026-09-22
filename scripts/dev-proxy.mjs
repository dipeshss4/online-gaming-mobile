import http from 'node:http';
import https from 'node:https';

// Loopback-only development bridge. Never deploy this as a public proxy.
export function startProxy() {
  const previewPort = process.env.PREVIEW_PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '8081');
  const allowedOrigins = [`http://localhost:${previewPort}`, `http://127.0.0.1:${previewPort}`];
  const target = new URL(process.env.MOBILE_API_UPSTREAM || process.env.EXPO_PUBLIC_API_URL || 'https://d3m8fr7e7xbses.cloudfront.net');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('API upstream must be an HTTP(S) origin without credentials or a path.');
  const transport = target.protocol === 'https:' ? https : http;
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    // The preview's own origin. It follows the port Expo was started on, so a busy 8081 does not block testing.
    if (origin && !allowedOrigins.includes(origin)) {
      res.writeHead(403); res.end('Preview origin not allowed'); return;
    }
    if (!req.url?.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!['GET', 'POST', 'PUT'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const headers = {};
    for (const key of ['authorization', 'content-type', 'accept']) {
      if (req.headers[key]) headers[key] = req.headers[key];
    }
    // Fixed configured origin, never a client-supplied destination. HTTPS verifies certificates.
    const upstream = transport.request({ hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: req.url, method: req.method, headers }, response => {
      res.statusCode = response.statusCode || 502;
      if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
      response.pipe(res);
    });
    upstream.setTimeout(15000, () => upstream.destroy(new Error('Timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({message:'Configured demo backend is unavailable. Please retry.'})); }
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.listen(8082, '127.0.0.1', () => console.log(`Mobile preview API bridge: 127.0.0.1:8082 → ${target.origin}`));
  return server;
}
