const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

const BACKEND_DIR = path.resolve(__dirname, '..');
const IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ZcAAAAASUVORK5CYII=', 'base64');
const JPEG = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 255, 217]);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(resolve));
}

async function waitFor(predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate().catch(() => null);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('Timed out waiting for backend');
}

async function stopBackend(child) {
  if (child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await stopped;
}

test('Grok download retry keeps a completed task, survives restart, and never regenerates', async t => {
  const generatedRequests = [];
  let mediaRequests = 0;
  let mediaAvailable = false;
  const upstream = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      assert.match(req.url, /^\/v1\/media\/images\/img_/);
      assert.equal(req.headers.authorization, undefined);
      mediaRequests++;
      // Allow the two parallel browser fetches to overlap and exercise deduplication.
      await new Promise(resolve => setTimeout(resolve, 30));
      res.writeHead(mediaAvailable ? 200 : 503, { 'Content-Type': 'image/png' });
      res.end(mediaAvailable ? IMAGE : 'temporarily unavailable');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    generatedRequests.push({ path: req.url, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [body.image
      ? { b64_json: JPEG.toString('base64') }
      : { url: 'http://127.0.0.1:8000/v1/media/images/img_test' }] }));
  });
  const upstreamPort = await listen(upstream);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-grok-retrieval-'));
  const probe = http.createServer();
  const port = await listen(probe);
  await close(probe);
  const dbPath = path.join(tempDir, 'tasks.sqlite');
  const env = {
    ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
    NOVA_TASK_DB: dbPath, NOVA_IMAGE_DIR: path.join(tempDir, 'images'),
    NOVA_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    NOVA_GROK_MEDIA_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
  };
  let child;
  let output = '';
  const baseUrl = `http://127.0.0.1:${port}`;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    await waitFor(async () => (await fetch(`${baseUrl}/api/nova/queue-status`)).ok);
  }
  t.after(async () => {
    if (child) await stopBackend(child);
    await close(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  await start();

  async function createTask(mode = 'text-to-image') {
    const response = await fetch(`${baseUrl}/api/nova/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'test-key', baseUrl: 'http://untrusted-client.invalid', protocol: 'grok', mode,
        prompt: 'test image', model: 'grok-imagine-image-2.0', parallelCount: 1,
        outputSize: 'auto', aspectRatio: 'auto',
        images: mode === 'image-to-image' ? [{ data: IMAGE.toString('base64'), mimeType: 'image/png' }] : [],
      }),
    });
    assert.equal(response.status, 202, await response.clone().text());
    const { taskId } = await response.json();
    return waitFor(async () => {
      const task = await (await fetch(`${baseUrl}/api/nova/tasks/${taskId}`)).json();
      return ['completed', 'failed'].includes(task.status) ? task : null;
    });
  }
  const task = await createTask();
  assert.equal(task.status, 'completed', output);
  assert.deepEqual(task.result.images, [`URL:/api/nova/images/${task.id}/0`]);
  assert.equal(generatedRequests[0].body.response_format, 'b64_json');
  await waitFor(async () => output.includes('图片后台缓存未完成'));
  assert.equal(mediaRequests, 1, 'cache should start before any browser requests the image');
  const imageUrl = baseUrl + task.result.images[0].slice(4);
  const [first, duplicate] = await Promise.all([fetch(imageUrl), fetch(imageUrl)]);
  assert.equal(first.status, 502);
  assert.equal(duplicate.status, 502);
  assert.equal((await first.json()).code, 'IMAGE_RETRIEVAL_FAILED');
  assert.equal(mediaRequests, 2);
  assert.equal((await (await fetch(`${baseUrl}/api/nova/tasks/${task.id}`)).json()).status, 'completed');
  assert.equal(generatedRequests.length, 1);

  await stopBackend(child);
  mediaAvailable = true;
  await start();
  const retry = await fetch(imageUrl);
  assert.equal(retry.status, 200, output);
  assert.equal(retry.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await retry.arrayBuffer()), IMAGE);
  assert.equal(generatedRequests.length, 1);
  assert.equal(mediaRequests, 3);
  assert.equal((await fetch(imageUrl)).status, 200);
  assert.equal(mediaRequests, 3, 'cached fetch must not contact upstream');

  const editTask = await createTask('image-to-image');
  assert.equal(editTask.status, 'completed');
  assert.equal(generatedRequests[1].path, '/v1/images/edits');
  assert.equal(generatedRequests[1].body.response_format, 'b64_json');
  const editedImage = await fetch(baseUrl + editTask.result.images[0].slice(4));
  assert.equal(editedImage.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await editedImage.arrayBuffer()), JPEG);

  // Retained tasks from the old release are normalized when queried, including after restart.
  const db = new Database(dbPath);
  const legacyUrl = 'URL:http://127.0.0.1:8000/v1/media/images/img_legacy';
  db.prepare('DELETE FROM task_image_sources WHERE task_id = ?').run(editTask.id);
  db.prepare('UPDATE task_items SET image_data = ? WHERE task_id = ?').run(JSON.stringify([legacyUrl]), editTask.id);
  db.prepare('UPDATE tasks SET result_json = ? WHERE id = ?').run(JSON.stringify({ images: [legacyUrl] }), editTask.id);
  db.close();
  fs.unlinkSync(path.join(tempDir, 'images', `${editTask.id}-0-0.jpg`));
  const legacy = await (await fetch(`${baseUrl}/api/nova/tasks/${editTask.id}`)).json();
  assert.deepEqual(legacy.result.images, [`URL:/api/nova/images/${editTask.id}/0`]);
  assert.equal((await fetch(baseUrl + legacy.result.images[0].slice(4))).status, 200);
  assert.equal(generatedRequests.length, 2);
});
