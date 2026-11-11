/**
 * sw.js - Service Worker de GasoES
 * Proporciona soporte offline, almacenamiento en caché del App Shell y experiencia PWA.
 */

const CACHE_NAME = 'gasoes-v5.2.3';

// Recursos críticos de la aplicación (App Shell)
const APP_SHELL = [
    './',
    'index.html',
    'mapa.html',
    'listado.html',
    'historico.html',
    'aviso-legal.html',
    'politica-privacidad.html',
    'politica-cookies.html',
    'manifest.json',
    'img/favicon.png',
    'img/gasolinera-moderna.jpg',
    'img/petrolera-refineria.jpg',
    'img/repostaje-combustible.jpg',
    'img/ahorro-viaje-carretera.jpg',
    'img/tanque-combustible-fondo.jpg',
    'img/faq-fondo-carretera.jpg',
    'css/style.css',
    'css/home.css',
    'css/listado.css',
    'css/historico.css',
    'css/legal.css',
    'css/cookieConsent.css',
    'js/dataManager.js',
    'js/utils.js',
    'js/ui-loader.js',
    'js/cookieConsent.js',
    'js/home.js',
    'js/main.js',
    'js/listado.js',
    'js/historico.js',
    // Librerías externas esenciales (CDN)
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js',
    'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css',
    'https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

/**
 * Instalación: Precacheo del App Shell
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Precachando App Shell...');
            // Precachamos de forma resiliente para evitar que un fallo externo aborte la instalación
            await Promise.allSettled(
                APP_SHELL.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[SW] Aviso: No se pudo precachear:', url, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

/**
 * Activación: Limpieza de versiones obsoletas de caché
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

/**
 * Intercepción de peticiones (Fetch)
 * - Navegación: Network First con fallback a caché (y finalmente index.html)
 * - Recursos estáticos: Stale-While-Revalidate (retorna caché y actualiza en segundo plano)
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Solo gestionamos solicitudes GET con esquemas http / https
    if (request.method !== 'GET' || !request.url.startsWith('http')) {
        return;
    }

    // 1. Peticiones de Navegación (HTML de páginas): Network First con fallback a Caché
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    // Si no hay red, buscamos la página solicitada en caché
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fallback genérico a index.html
                    return caches.match('index.html');
                })
        );
        return;
    }

    // 2. Recursos de la API del Ministerio: Network First (los datos en vivo son prioritarios, DataManager tiene IndexedDB)
    if (request.url.includes('minetur.gob.es')) {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // 3. Recursos Estáticos (CSS, JS, Fuentes, Imágenes, Iconos, CDNs): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    // Válido tanto para status 200 como respuestas opacas (CDN sin CORS)
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Fallo silencioso en actualización de fondo si está offline
                });

            // Si está en caché, responder de inmediato; si no, esperar la descarga de red
            return cachedResponse || networkFetch;
        })
    );
});
