/* Agent Town: minimal service worker. It exists so browsers offer "Install app".
   It does not cache anything, so updates always arrive immediately. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
