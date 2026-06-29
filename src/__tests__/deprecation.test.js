const request = require('supertest');
const express = require('express');
const { deprecate } = require('../middleware/deprecation');

function createAppWithRoute(path, middleware) {
  const app = express();
  app.get(path, middleware, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('Deprecation Middleware', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.get('/old-api', deprecate({
      sunset: '2026-12-31T23:59:59Z',
      link: 'https://docs.example.com/v2',
    }), (req, res) => res.status(200).json({ ok: true }));

    app.get('/new-api', (req, res) => res.status(200).json({ ok: true }));
  });

  test('should include Deprecation header set to true', async () => {
    const res = await request(app).get('/old-api');
    expect(res.headers.deprecation).toBe('true');
  });

  test('should include Sunset header in UTC format', async () => {
    const res = await request(app).get('/old-api');
    expect(res.headers.sunset).toBe('Thu, 31 Dec 2026 23:59:59 GMT');
  });

  test('should include Link header with rel="deprecation"', async () => {
    const res = await request(app).get('/old-api');
    expect(res.headers.link).toBe('<https://docs.example.com/v2>; rel="deprecation"');
  });

  test('should omit Sunset when the supplied sunset date is invalid', async () => {
    const invalidDateApp = createAppWithRoute('/invalid-sunset', deprecate({
      sunset: 'not-a-date',
      link: 'https://docs.example.com/v2',
    }));

    const res = await request(invalidDateApp).get('/invalid-sunset');

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeUndefined();
    expect(res.headers.link).toBe('<https://docs.example.com/v2>; rel="deprecation"');
  });

  test('should omit Link when no link option is provided', async () => {
    const noLinkApp = createAppWithRoute('/no-link', deprecate({
      sunset: '2026-12-31T23:59:59Z',
    }));

    const res = await request(noLinkApp).get('/no-link');

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBe('Thu, 31 Dec 2026 23:59:59 GMT');
    expect(res.headers.link).toBeUndefined();
  });

  test('should support no-options usage with only Deprecation set', async () => {
    const noOptionsApp = createAppWithRoute('/no-options', deprecate());

    const res = await request(noOptionsApp).get('/no-options');

    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
  });

  test('should always call next after setting deprecation headers', () => {
    const req = {};
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    deprecate({ sunset: 'bad-date', link: 'https://docs.example.com/v2' })(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('Link', '<https://docs.example.com/v2>; rel="deprecation"');
    expect(res.setHeader).not.toHaveBeenCalledWith('Sunset', expect.any(String));
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('should NOT include deprecation headers on standard routes', async () => {
    const res = await request(app).get('/new-api');
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.sunset).toBeUndefined();
  });
});