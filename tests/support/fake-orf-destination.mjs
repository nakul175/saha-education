// A LOCAL FAKE of an external oral-reading-fluency app, for tests only.
//
// It listens on 127.0.0.1 over HTTPS with a throwaway self-signed certificate that
// exists only in a temporary directory for the life of the process, and records every
// request it receives so a test can prove exactly what a launch handed over: path,
// query, headers and cookies. It is NOT a copy of Language Studio or any real service,
// holds only fictional results and never makes an outbound request.
import { createServer, get } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startFakeOrf({ port = 0, basePath = '/reading' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'saha-fake-orf-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
      '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error('The local fake destination needs the openssl command to create a throwaway certificate: ' + error.message);
  }
  const key = readFileSync(join(directory, 'key.pem')), cert = readFileSync(join(directory, 'cert.pem'));
  rmSync(directory, { recursive: true, force: true });
  const requests = [];
  // Fictional results a person at the fake app would copy into a normalized envelope.
  let results = [];
  const server = createServer({ key, cert }, (request, response) => {
    const url = new URL(request.url, 'https://127.0.0.1');
    requests.push({ method: request.method, path: url.pathname, query: url.search, headers: { ...request.headers } });
    if (request.method === 'GET' && url.pathname === basePath) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake reading app (test double)</title></head><body><h1>Fake oral reading app</h1><p>Local test double. Sign in with this app\'s own account.</p></body></html>');
      return;
    }
    if (request.method === 'GET' && url.pathname === basePath + '/export') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(results));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const actualPort = server.address().port;
  return {
    port: actualPort,
    origin: 'https://127.0.0.1:' + actualPort,
    url: 'https://127.0.0.1:' + actualPort + basePath,
    basePath,
    requests,
    setResults(value) { results = value; },
    /** The fake app's own export, as a person would download it from that app. */
    async fetchExport() {
      const body = await new Promise((resolve, reject) => {
        get({ host: '127.0.0.1', port: actualPort, path: basePath + '/export', rejectUnauthorized: false }, response => {
          const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
      });
      return JSON.parse(body);
    },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }); },
  };
}
