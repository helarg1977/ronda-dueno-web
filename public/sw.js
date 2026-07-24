// Service worker mínimo — su única función es cumplir el requisito
// de Chrome/Edge para poder "Instalar" la página como app de escritorio.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {}) // sin caché especial, siempre va a la red
