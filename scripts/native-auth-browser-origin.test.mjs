import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

// Execute the real renderer and Origin guard. Only browser HTTP is substituted;
// this is not a live authentication, database or Android-device test.
const source = readFileSync(new URL('../server/nativeAuthHttp.ts', import.meta.url), 'utf8');
function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, 'production function boundaries missing');
  return stripTypeScriptTypes(source.slice(start, end));
}
const browserPage = new Function(functionSource('browserPage', 'confirmOriginIsTrusted') + ';return browserPage;')();
const guard = new Function('const CANONICAL_BROWSER_ORIGIN="https://arelogic.space";' +
  functionSource('confirmOriginIsTrusted', 'refuseBrowser') + ';return confirmOriginIsTrusted;')();
const consentRoute = source.split('app.get(BASE_PATH + "/browser/:transactionId"')[1]
  .split('app.post(BASE_PATH + "/browser/:transactionId/confirm"')[0];
const policies = [...consentRoute.matchAll(/res\.setHeader\("Referrer-Policy", "([a-z-]+)"\)/g)];
// The unchanged native-auth middleware defaults to no-referrer. The consent
// document alone must override it, otherwise Chromium posts Origin: null.
const policy = policies.at(-1)?.[1] ?? 'no-referrer';
const fixturePath = '/api/native-auth/browser/SYNTHETIC_TRANSACTION_PLACEHOLDER';
const fixtureOrigin = 'https://arelogic.space';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || '@playwright/test');

test('real Chromium consent form keeps canonical Origin and an origin-only Referer', async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  const context = await browser.newContext();
  const observed = [];
  try {
    // Every request is fulfilled locally. Never contact the production host.
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        assert.equal(request.url(), fixtureOrigin + fixturePath);
        return route.fulfill({ status: 200, contentType: 'text/html', headers: {
          'Referrer-Policy': policy,
          'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        }, body: browserPage('SYNTHETIC_TRANSACTION_PLACEHOLDER', 'SYNTHETIC_CSRF_PLACEHOLDER') });
      }
      assert.equal(request.method(), 'POST');
      assert.equal(request.url(), fixtureOrigin + fixturePath + '/confirm');
      const headers = await request.allHeaders();
      observed.push({ canonicalOrigin: headers.origin === fixtureOrigin,
        originOnlyReferer: headers.referer === fixtureOrigin + '/', accepted: guard({ headers }) });
      await route.fulfill({ status: guard({ headers }) ? 200 : 403,
        contentType: 'application/json', body: JSON.stringify({ accepted: guard({ headers }) }) });
    });
    const page = await context.newPage();
    await page.goto(fixtureOrigin + fixturePath);
    await Promise.all([
      page.waitForURL(fixtureOrigin + fixturePath + '/confirm'),
      page.getByRole('button', { name: 'Diese Anmeldung einmalig bestätigen' }).click(),
    ]);
    assert.deepEqual(observed, [{ canonicalOrigin: true, originOnlyReferer: true, accepted: true }]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test('null, absent, foreign, authenticated and cross-site origins remain rejected', () => {
  for (const headers of [
    { origin: 'null' }, {}, { origin: 'https://foreign.example' },
    { origin: fixtureOrigin, authorization: 'SYNTHETIC_AUTHORIZATION' },
    { origin: fixtureOrigin, 'sec-fetch-site': 'cross-site' },
    { origin: fixtureOrigin, 'sec-fetch-site': 'same-site' },
  ]) assert.equal(guard({ headers }), false);
  assert.equal(guard({ headers: { origin: fixtureOrigin, 'sec-fetch-site': 'same-origin' } }), true);
});

test('callback and native JSON middleware retain no-referrer', () => {
  const middleware = source.split('app.use(BASE_PATH, (_req, res, next) => {')[1].split('next();')[0];
  const callback = source.split('app.get("/app/auth/callback"')[1].split('app.post(BASE_PATH + "/exchange"')[0];
  for (const section of [middleware, callback]) {
    assert.ok(section.includes('res.setHeader("Referrer-Policy", "no-referrer")'));
    assert.equal(section.includes('"strict-origin"'), false);
  }
});
