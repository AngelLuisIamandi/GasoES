/**
 * ui-loader.js - Plantilla de navegación común, notificaciones y control de Modo Oscuro (Dark Mode).
 */

// Inicialización inmediata del tema para evitar parpadeos visuales al cargar la página
(function aplicarTemaInicial() {
    try {
        const stored = localStorage.getItem('gaso_theme');
        const theme = (stored === 'dark' || stored === 'light') 
            ? stored 
            : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-bs-theme', theme);
    } catch (e) {
        // Fallback por si localStorage está bloqueado
    }
})();

const uiTemplate = `
    <nav class="navbar navbar-expand-lg fixed-top border-0" id="mainNavbar">
        <div class="container-fluid">
            <a class="navbar-brand d-flex align-items-center fw-bold" href="index.html">
                <img src="img/favicon.png" alt="Logo GasoES" width="32" height="32" class="d-inline-block align-text-top me-2 nav-logo">
                <span class="brand-text">Gaso<span class="text-success">ES</span></span>
            </a>

            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Alternar navegación">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto mb-2 mb-lg-0 align-items-lg-center">
                    <li class="nav-item">
                        <a class="nav-link" id="nav-inicio" href="index.html">
                            <i class="bi bi-house-door me-1"></i> Inicio
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="nav-mapa" href="mapa.html">
                            <i class="bi bi-map me-1"></i> Mapa
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="nav-listado" href="listado.html">
                            <i class="bi bi-table me-1"></i> Listado
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="nav-historico" href="historico.html">
                            <i class="bi bi-graph-up-arrow me-1"></i> Histórico
                        </a>
                    </li>
                    <!-- Toggle de Modo Claro / Oscuro -->
                    <li class="nav-item ms-lg-2 mt-2 mt-lg-0">
                        <button class="btn btn-outline-light btn-sm rounded-pill d-flex align-items-center gap-2 px-3 py-1 shadow-sm" 
                                id="btnThemeToggle" 
                                type="button" 
                                title="Cambiar tema"
                                aria-label="Cambiar tema claro / oscuro">
                            <i class="bi bi-moon-stars" id="themeIcon"></i>
                            <span class="small fw-semibold" id="themeLabel">Tema</span>
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999">
        <div id="liveToast" class="toast hide shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <strong class="me-auto" id="toastTitle">Aviso</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body" id="toastMessage"></div>
        </div>
    </div>
`;

/**
 * Aplica el tema recibido y sincroniza el botón y eventos
 */
function setAppTheme(theme, save = true) {
    const safeTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', safeTheme);
    if (document.body) {
        document.body.setAttribute('data-bs-theme', safeTheme);
    }
    if (save) {
        try {
            localStorage.setItem('gaso_theme', safeTheme);
        } catch (e) {}
    }

    // Actualizar icono y texto del botón
    const iconEl = document.getElementById('themeIcon');
    const labelEl = document.getElementById('themeLabel');
    const btnEl = document.getElementById('btnThemeToggle');

    if (iconEl && labelEl && btnEl) {
        if (safeTheme === 'dark') {
            iconEl.className = 'bi bi-sun-fill text-warning';
            labelEl.textContent = 'Claro';
            btnEl.title = 'Cambiar a modo claro';
            btnEl.setAttribute('aria-label', 'Cambiar a modo claro');
        } else {
            iconEl.className = 'bi bi-moon-stars-fill text-info';
            labelEl.textContent = 'Oscuro';
            btnEl.title = 'Cambiar a modo oscuro';
            btnEl.setAttribute('aria-label', 'Cambiar a modo oscuro');
        }
    }

    // Despachar evento para componentes como el mapa de Leaflet o gráficas Chart.js
    window.dispatchEvent(new CustomEvent('gaso_theme_changed', { detail: { theme: safeTheme } }));
}

function initThemeToggle() {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;

    const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
    setAppTheme(currentTheme, false);

    btn.addEventListener('click', () => {
        const active = document.documentElement.getAttribute('data-bs-theme') || 'light';
        const nextTheme = active === 'dark' ? 'light' : 'dark';
        setAppTheme(nextTheme, true);
    });

    // Detectar cambios en la preferencia del sistema operativo si no hay elección manual guardada
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            const hasStored = localStorage.getItem('gaso_theme');
            if (!hasStored) {
                setAppTheme(e.matches ? 'dark' : 'light', false);
            }
        });
    }
}

// ==========================================
// GESTIÓN DE PWA: Prompt de Instalación y Service Worker
// ==========================================
let deferredInstallPrompt = null;

// Capturar el evento beforeinstallprompt inmediatamente
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installItem = document.getElementById('navItemInstall');
    if (installItem) {
        installItem.classList.remove('d-none');
    }
});

// Detectar cuando la app ha sido instalada satisfactoriamente
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installItem = document.getElementById('navItemInstall');
    if (installItem) {
        installItem.classList.add('d-none');
    }
    if (typeof showNotify === 'function') {
        showNotify('¡GasoES se ha instalado correctamente en tu dispositivo!', 'success', 'PWA Instalada');
    }
});

function initInstallPrompt() {
    const installItem = document.getElementById('navItemInstall');
    const btnInstall = document.getElementById('btnInstallPwa');
    if (!installItem || !btnInstall) return;

    if (deferredInstallPrompt) {
        installItem.classList.remove('d-none');
    }

    btnInstall.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        btnInstall.disabled = true;
        try {
            deferredInstallPrompt.prompt();
            const choiceResult = await deferredInstallPrompt.userChoice;
            if (choiceResult && choiceResult.outcome === 'accepted') {
                installItem.classList.add('d-none');
            }
        } catch (err) {
            console.warn('[PWA] Error durante el prompt de instalación:', err);
        } finally {
            btnInstall.disabled = false;
            deferredInstallPrompt = null;
        }
    });
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then((registration) => {
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    if (typeof showNotify === 'function') {
                                        showNotify('Nueva versión disponible. Recarga para actualizar.', 'info', 'Actualización');
                                    }
                                }
                            };
                        }
                    };
                })
                .catch((err) => {
                    console.warn('[SW] No se pudo registrar el Service Worker:', err);
                });
        });
    }
}

function ensureCookieConsentLoaded() {
    try {
        if (!document.querySelector('link[href*="cookieConsent.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/cookieConsent.css';
            document.head.appendChild(link);
        }
        if (!window.abrirConfiguracionCookies && !document.querySelector('script[src*="cookieConsent.js"]')) {
            const script = document.createElement('script');
            script.src = 'js/cookieConsent.js';
            document.body.appendChild(script);
        }
    } catch (e) {
        console.warn('[ui-loader] Error cargando cookieConsent:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', uiTemplate);

    const path = window.location.pathname;
    if (path.includes('historico')) {
        document.getElementById('nav-historico')?.classList.add('active');
    } else if (path.includes('listado')) {
        document.getElementById('nav-listado')?.classList.add('active');
    } else if (path.includes('mapa')) {
        document.getElementById('nav-mapa')?.classList.add('active');
    } else if (path.endsWith('index.html') || path.endsWith('/') || path === '' || !path.includes('.html')) {
        document.getElementById('nav-inicio')?.classList.add('active');
    }

    initThemeToggle();
    initInstallPrompt();
    ensureCookieConsentLoaded();
});

registerServiceWorker();

function showNotify(mensaje, tipo = 'info', titulo = 'Aviso') {
    const toastEl = document.getElementById('liveToast');
    if (!toastEl) return;
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastMessage');

    toastEl.className = `toast hide border-0`;

    const estilos = {
        'error': 'bg-danger text-white',
        'success': 'bg-success text-white',
        'info': 'bg-primary text-white',
        'warning': 'bg-warning text-dark'
    };

    toastEl.classList.add(...(estilos[tipo] || estilos.info).split(' '));
    if (toastTitle) toastTitle.innerText = titulo;
    if (toastBody) toastBody.innerText = mensaje;

    const bs = window.bootstrap;
    if (bs && bs.Toast) {
        const toast = new bs.Toast(toastEl, { delay: 3000 });
        toast.show();
    }
}

if (typeof window !== 'undefined') {
    if (!window.showNotify) window.showNotify = showNotify;
    window.setAppTheme = setAppTheme;
}
