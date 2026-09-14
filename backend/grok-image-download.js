'use strict';

const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');
const { Agent, fetch: undiciFetch } = require('undici');

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MEDIA_PATH = /^\/v1\/media\/images\/[A-Za-z0-9_-]{1,256}$/;
const CDN_PATH = /^\/xai-imgen\/[A-Za-z0-9/_-]+\.(?:png|jpe?g|webp)$/i;
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(network, prefix, 'ipv4');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // Restrict CDN IPv6 to global unicast. This also rejects mapped IPv4,
  // loopback, unique-local, link-local, multicast and unspecified addresses.
  return family === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, 'ipv6');
}

function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
      return callback(new Error('图片地址解析到了禁止访问的网络'));
    }
    // Hand the validated addresses directly to the socket, with no second DNS lookup.
    if (options?.all) return callback(null, addresses);
    const address = addresses.find(item => !options?.family || item.family === options.family) || addresses[0];
    callback(null, address.address, address.family);
  });
}

function parseMediaBase(value) {
  if (!value) return null;
  const base = new URL(value);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Grok 图片媒体地址配置无效');
  }
  base.pathname = base.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') + '/';
  return base;
}

/** Only server-recorded result URLs are passed here; there is no URL query proxy. */
function resolveGrokImageUrl(value, mediaBaseUrl = '') {
  if (typeof value !== 'string' || value.length > 4096 || /[\\\r\n]/.test(value)) {
    throw new Error('上游图片地址无效');
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('上游图片地址无效'); }
  if (url.username || url.password || url.hash) throw new Error('上游图片地址无效');
  const mediaBase = parseMediaBase(mediaBaseUrl);
  const isConfiguredMedia = candidate => mediaBase && candidate.origin === mediaBase.origin && !candidate.search
    && candidate.pathname.startsWith(mediaBase.pathname)
    && MEDIA_PATH.test('/' + candidate.pathname.slice(mediaBase.pathname.length));
  if (isConfiguredMedia(url)) return { url, trustedPrivateNetwork: true };
  if (LOOPBACK_NAMES.has(url.hostname)) {
    if (url.protocol !== 'http:' || url.port !== '8000' || !MEDIA_PATH.test(url.pathname) || url.search) {
      throw new Error('上游图片地址不在允许范围');
    }
    if (!mediaBase) throw new Error('上游返回了本机图片地址，尚未配置 Grok 媒体来源');
    url = new URL(url.pathname.slice(1), mediaBase);
  }
  if (url.protocol === 'https:' && url.hostname === 'imgen.x.ai' && !url.port && !url.search && CDN_PATH.test(url.pathname)) {
    return { url, trustedPrivateNetwork: false };
  }
  if (isConfiguredMedia(url)) return { url, trustedPrivateNetwork: true };
  throw new Error('上游图片地址不在允许范围');
}

function detectImageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function createGrokImageDownloader({ getMediaBaseUrl = () => '', fetchImpl = undiciFetch, timeoutMs = DOWNLOAD_TIMEOUT_MS, maxBytes = MAX_IMAGE_BYTES } = {}) {
  const publicAgent = new Agent({ connect: { lookup: publicLookup }, connections: 4 });
  const configuredAgent = new Agent({ connections: 4 });
  let active = 0;
  async function download(sourceUrl) {
    if (active >= 4) throw new Error('图片取回繁忙，请稍后重新取回');
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let currentUrl = sourceUrl;
      for (let redirects = 0; redirects <= 3; redirects++) {
        const target = resolveGrokImageUrl(currentUrl, getMediaBaseUrl());
        const response = await fetchImpl(target.url, {
          method: 'GET', redirect: 'manual', signal: controller.signal,
          dispatcher: target.trustedPrivateNetwork ? configuredAgent : publicAgent,
          headers: { Accept: 'image/png,image/jpeg,image/webp' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || redirects === 3) throw new Error('图片下载重定向次数过多');
          currentUrl = new URL(location, target.url).href;
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`远程图片下载失败: HTTP ${response.status}`);
        }
        const declaredType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const declaredSize = Number(response.headers.get('content-length'));
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(declaredType)) {
          await response.body?.cancel();
          throw new Error('上游返回的内容不是支持的图片');
        }
        if (declaredSize > maxBytes) {
          await response.body?.cancel();
          throw new Error('上游图片超过 32 MB 下载限制');
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > maxBytes) {
            controller.abort();
            throw new Error('上游图片超过 32 MB 下载限制');
          }
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks, size);
        const mimeType = detectImageType(buffer);
        if (!mimeType || (declaredType.replace('image/jpg', 'image/jpeg') !== mimeType)) {
          throw new Error('上游返回的图片内容无效');
        }
        return { buffer, mimeType };
      }
    } catch (error) {
      if (controller.signal.aborted && error?.name === 'AbortError') {
        throw new Error('图片取回超时，请重新取回', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      active--;
    }
  }
  return { download, close: () => Promise.all([publicAgent.close(), configuredAgent.close()]) };
}

module.exports = { createGrokImageDownloader, resolveGrokImageUrl, isPublicAddress, detectImageType };
