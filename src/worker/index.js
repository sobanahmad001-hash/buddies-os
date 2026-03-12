// Custom service worker additions — bundled by next-pwa (customWorkerDir)
// These handlers extend the Workbox-generated service worker.

// Background sync for offline commands
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-commands') {
    event.waitUntil(syncPendingCommands());
  }
});

async function syncPendingCommands() {
  console.log('🔄 Syncing pending commands...');
  // IndexedDB access would happen here in a full implementation
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      data: data.url,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/app')
  );
});
