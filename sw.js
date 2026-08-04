/* EatGuard Service Worker v2
 * 安全更新策略（修复旧版 cache-first 导致的"永远旧版"问题）：
 * - HTML（index.html / 导航请求）：network-first —— 有网就拿最新，离线才回退缓存
 * - 静态资源（js/css/图片）：stale-while-revalidate —— 先显示缓存、后台更新
 * - 版本升级时自动清理旧缓存，并通知页面刷新
 */
const CACHE_VERSION = "eatguard-v2.0.0";
const HTML_CACHE = CACHE_VERSION + "-html";
const ASSET_CACHE = CACHE_VERSION + "-assets";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", async (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // 通知所有打开的页面：新 SW 已接管，请刷新获取最新版本
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "EATGUARD_SW_UPDATED" }));
    })(),
  );
});

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isHTML(req) {
  return req.mode === "navigate" || req.destination === "document";
}

async function networkFirst(req) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const fetchPromise = fetch(req)
    .then((fresh) => {
      cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // API 请求不拦截（后端转发）
  if (req.url.indexOf("/api/") >= 0) return;

  if (isSameOrigin(req)) {
    if (isHTML(req)) {
      event.respondWith(networkFirst(req));
    } else {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  // CDN（Tailwind / Supabase）：stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});
