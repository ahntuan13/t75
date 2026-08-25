// Service Worker cho app T75 — mục đích chính là cho phép "Cài đặt ứng dụng" (PWA) và giữ lại khung
// giao diện (app shell) để mở app được ngay cả khi mạng chập chờn. KHÔNG cache dữ liệu Firebase/Firestore
// (Firestore đã tự có cơ chế cache riêng qua db.enablePersistence() trong firebase-config.js).
//
// LƯU Ý QUAN TRỌNG: mỗi khi sửa code (css/js/html), nên đổi CACHE_VERSION bên dưới lên 1 số mới —
// nếu không, người dùng đã cài app có thể vẫn thấy bản cũ do trình duyệt dùng lại cache.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `t75-app-shell-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './assets/logo-t75.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES).catch(()=>{}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // CHỈ can thiệp cache cho tài nguyên CÙNG GỐC (chính app này) — không đụng vào Firebase/Firestore/CDN
  // bên ngoài, tránh làm hỏng luồng dữ liệu thời gian thực hoặc dùng nhầm thư viện cache cũ.
  if(url.origin !== self.location.origin){
    return; // để trình duyệt tự xử lý bình thường, không qua service worker
  }

  // Trang HTML (điều hướng): ưu tiên lấy bản MỚI NHẤT từ mạng trước, chỉ dùng cache khi mất mạng —
  // đảm bảo người dùng luôn thấy bản cập nhật mới nhất khi có mạng, cache chỉ là phương án dự phòng.
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Tài nguyên tĩnh (css/js/ảnh...): lấy từ cache trước cho nhanh, đồng thời âm thầm cập nhật cache
  // bằng bản mới từ mạng cho lần sau (chiến lược "cache trước, làm mới ngầm").
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        if(res && res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
