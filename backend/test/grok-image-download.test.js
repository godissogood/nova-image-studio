const assert = require('node:assert/strict');
const test = require('node:test');
const { createGrokImageDownloader, resolveGrokImageUrl, isPublicAddress } = require('../grok-image-download');

test('accepts only known Grok CDN image paths', () => {
  const resolved = resolveGrokImageUrl(
    'https://imgen.x.ai/xai-imgen/xai-tmp-imgen-abc-123.jpeg',
  );
  assert.equal(resolved.url.hostname, 'imgen.x.ai');
  assert.equal(resolved.trustedPrivateNetwork, false);
  assert.throws(() => resolveGrokImageUrl('https://evil.example/xai-tmp-imgen-abc.jpeg'));
  assert.throws(() => resolveGrokImageUrl('https://imgen.x.ai/xai-imgen/a.png?redirect=https://evil.example'));
});

test('maps the relay loopback media URL only with an explicit configured base', () => {
  const resolved = resolveGrokImageUrl(
    'http://127.0.0.1:8000/v1/media/images/img_ABC-123',
    'http://sub2api:8080/v1',
  );
  assert.equal(resolved.url.href, 'http://sub2api:8080/v1/media/images/img_ABC-123');
  assert.equal(resolved.trustedPrivateNetwork, true);
  assert.throws(() => resolveGrokImageUrl('http://127.0.0.1:8000/v1/media/images/img_ABC-123'));
  assert.throws(() => resolveGrokImageUrl('http://127.0.0.1:8000/admin', 'https://relay.example'));
  assert.throws(() => resolveGrokImageUrl('http://127.0.0.1:9000/v1/media/images/img_ABC', 'https://relay.example'));
  assert.throws(() => resolveGrokImageUrl('https://relay.example/admin', 'https://relay.example'));
  assert.throws(() => resolveGrokImageUrl('https://user:secret@imgen.x.ai/xai-imgen/a.png'));
});

test('rejects non-public DNS addresses for the public CDN', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.20.0.3', '192.168.0.2', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700::1111'), true);
});

test('downloads bounded, validated image bytes', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const downloader = createGrokImageDownloader({
    fetchImpl: async () => new Response(png, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
    }),
  });
  const result = await downloader.download('https://imgen.x.ai/xai-imgen/test.png');
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual(result.buffer, png);
  await downloader.close();
});

test('rejects HTML and unsupported content types', async () => {
  const downloader = createGrokImageDownloader({
    fetchImpl: async () => new Response('<html>blocked</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  });
  await assert.rejects(
    downloader.download('https://imgen.x.ai/xai-imgen/test.png'),
    /不是支持的图片/,
  );
  await downloader.close();
});

test('validates every redirect and sends no API credentials', async t => {
  const requests = [];
  const downloader = createGrokImageDownloader({
    fetchImpl: async (url, init) => {
      requests.push({ url: url.href, init });
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/secret' } });
    },
  });
  t.after(() => downloader.close());
  await assert.rejects(downloader.download('https://imgen.x.ai/xai-imgen/test.png'), /不在允许范围/);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].init.headers, { Accept: 'image/png,image/jpeg,image/webp' });
  assert.equal(requests[0].init.redirect, 'manual');
});

test('rejects mismatched image signatures and oversized streaming content', async t => {
  const wrongType = createGrokImageDownloader({
    fetchImpl: async () => new Response('<html>invalid</html>', { headers: { 'content-type': 'image/png' } }),
  });
  const oversized = createGrokImageDownloader({
    maxBytes: 4,
    fetchImpl: async () => new Response(Buffer.alloc(5), { headers: { 'content-type': 'image/png' } }),
  });
  t.after(() => Promise.all([wrongType.close(), oversized.close()]));
  await assert.rejects(wrongType.download('https://imgen.x.ai/xai-imgen/test.png'), /图片内容无效/);
  await assert.rejects(oversized.download('https://imgen.x.ai/xai-imgen/test.png'), /下载限制/);
});

test('download timeout covers response bytes, not only the headers', async t => {
  const downloader = createGrokImageDownloader({
    timeoutMs: 10,
    fetchImpl: async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
    }), { headers: { 'content-type': 'image/png' } }),
  });
  t.after(() => downloader.close());
  await assert.rejects(downloader.download('https://imgen.x.ai/xai-imgen/test.png'), /图片取回超时/);
});
