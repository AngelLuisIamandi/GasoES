/**
 * ==========================================================================
 * cookieConsent.js - Sistema de Gestión del Consentimiento de Cookies (CMP)
 * Conforme a RGPD (UE 2016/679), LOPDGDD (LO 3/2018), Directrices AEPD
 * y Requisitos de Google EU User Consent Policy (Google AdSense / Analytics).
 * ==========================================================================
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'gaso_cookies_consent';
    const CONSENT_VERSION = '1.0';

    /**
     * Estado por defecto del consentimiento
     */
    const defaultConsent = {
        version: CONSENT_VERSION,
        consentDate: null,
        tecnicas: true,       // Obligatorias y exentas de consentimiento previo (Art. 22.2 LSSI)
        analiticas: false,    // Opcionales (requieren consentimiento activo)
        publicidad: false     // Opcionales (Google AdSense / DoubleClick, requieren consentimiento)
    };

    /**
     * Obtiene el consentimiento almacenado en localStorage
     * @returns {Object|null}
     */
    function getStoredConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === CONSENT_VERSION && parsed.consentDate) {
                return parsed;
            }
        } catch (e) {
            console.warn('[CookieConsent] Error al leer localStorage:', e);
        }
        return null;
    }

    /**
     * Guarda el consentimiento en localStorage y despacha el evento para tags externos
     * @param {Object} consent 
     */
    function saveConsent(consent) {
        const payload = {
            version: CONSENT_VERSION,
            consentDate: new Date().toISOString(),
            tecnicas: true,
            analiticas: Boolean(consent.analiticas),
            publicidad: Boolean(consent.publicidad)
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[CookieConsent] Error al guardar en localStorage:', e);
        }

        // Aplicar configuraciones a servicios externos
        applyConsentToVendors(payload);

        // Despachar evento para componentes o scripts interesados
        window.dispatchEvent(new CustomEvent('gaso_cookie_consent_updated', {
            detail: payload
        }));

        // Ocultar banner si está visible
        hideBanner();

        // Ocultar botón flotante tras aceptar o guardar preferencias
        const btnFloating = document.getElementById('btnGasoCookieFloating');
        if (btnFloating) {
            btnFloating.style.display = 'none';
        }

        // Notificación opcional si ui-loader está activo
        if (typeof window.showNotify === 'function') {
            window.showNotify('Preferencias de privacidad y cookies guardadas.', 'success', 'Privacidad');
        }

        return payload;
    }

    /**
     * Configura proveedores de terceros (Google AdSense, Analytics) según el consentimiento
     * @param {Object} consent 
     */
    function applyConsentToVendors(consent) {
        // Soporte Google AdSense: Non-personalized ads (NPA)
        if (typeof window.adsbygoogle !== 'undefined') {
            window.adsbygoogle = window.adsbygoogle || [];
            if (!consent.publicidad) {
                // Solicitar anuncios no personalizados conforme a la directiva europea
                (window.adsbygoogle.requestNonPersonalizedAds = 1);
            } else {
                (window.adsbygoogle.requestNonPersonalizedAds = 0);
            }
        }

        // Soporte Google Consent Mode v2 (si se integra gtag en el futuro)
        if (typeof window.gtag === 'function') {
            window.gtag('consent', 'update', {
                'analytics_storage': consent.analiticas ? 'granted' : 'denied',
                'ad_storage': consent.publicidad ? 'granted' : 'denied',
                'ad_user_data': consent.publicidad ? 'granted' : 'denied',
                'ad_personalization': consent.publicidad ? 'granted' : 'denied'
            });
        }
    }

    /**
     * Inyecta la plantilla del Banner y del Modal en el DOM
     */
    function injectElements() {
        if (document.getElementById('gasoCookieBanner')) return;

        const html = `
        <!-- Banner de Cookies Inferior -->
        <div id="gasoCookieBanner" class="gaso-cookie-banner" role="dialog" aria-labelledby="gasoCookieTitle" aria-describedby="gasoCookieDesc" aria-modal="true">
            <div class="row align-items-center g-3">
                <div class="col-12 col-lg-8 d-flex align-items-start gap-3">
                    <div class="gaso-cookie-icon-wrapper d-none d-sm-flex">
                        <i class="bi bi-cookie"></i>
                    </div>
                    <div>
                        <h5 class="gaso-cookie-title" id="gasoCookieTitle">
                            <i class="bi bi-shield-check text-primary me-1"></i> Control de Cookies y Privacidad en GasoES
                        </h5>
                        <p class="gaso-cookie-text" id="gasoCookieDesc">
                            Utilizamos cookies técnicas necesarias para el funcionamiento del mapa y temas visuales, y cookies opcionales 
                            analíticas y de publicidad personalizada (<strong>Google AdSense</strong>) que financian el mantenimiento de este comparador gratuito. 
                            Puedes aceptarlas todas, rechazarlas o configurar tus preferencias. 
                            Consulta nuestra <a href="politica-cookies.html">Política de Cookies</a> y <a href="politica-privacidad.html">Privacidad</a>.
                        </p>
                    </div>
                </div>
                <div class="col-12 col-lg-4">
                    <div class="gaso-cookie-actions justify-content-lg-end">
                        <button type="button" class="btn btn-outline-secondary btn-sm px-3" id="btnGasoCookieConfigurar">
                            <i class="bi bi-sliders me-1"></i> Configurar
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm px-3" id="btnGasoCookieRechazar">
                            Rechazar no esenciales
                        </button>
                        <button type="button" class="btn btn-primary btn-sm px-3 fw-bold" id="btnGasoCookieAceptarTodo">
                            Aceptar todas
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Botón flotante accesible permanente para reabrir preferencias (Exigencia AEPD) -->
        <button type="button" class="gaso-cookie-floating-btn" id="btnGasoCookieFloating" title="Configurar cookies y privacidad" aria-label="Configurar cookies">
            <i class="bi bi-cookie"></i>
            <span>Cookies</span>
        </button>

        <!-- Modal de Configuración Detallada de Cookies -->
        <div class="modal fade gaso-cookie-modal" id="gasoCookieModal" tabindex="-1" aria-labelledby="gasoCookieModalTitle" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="d-flex align-items-center gap-2">
                            <div class="gaso-cookie-icon-wrapper" style="width: 40px; height: 40px; font-size: 1.25rem;">
                                <i class="bi bi-shield-lock-fill"></i>
                            </div>
                            <div>
                                <h5 class="modal-title fw-bold mb-0" id="gasoCookieModalTitle">Panel de Preferencias de Privacidad</h5>
                                <span class="small text-muted">Gestión de consentimiento conforme a RGPD y directrices AEPD</span>
                            </div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body py-3">
                        <p class="small text-muted mb-4">
                            En GasoES respetamos tu derecho a la privacidad. Puedes elegir qué categorías de cookies permites. 
                            Las cookies necesarias no pueden desactivarse ya que aseguran el correcto funcionamiento de la plataforma.
                        </p>

                        <!-- Categoría 1: Técnicas y Necesarias -->
                        <div class="gaso-cookie-category-card">
                            <div class="gaso-cookie-category-header">
                                <h6 class="gaso-cookie-category-title">
                                    <i class="bi bi-gear-wide-connected text-primary"></i> Cookies Técnicas y Esenciales
                                </h6>
                                <span class="gaso-cookie-badge-obligatoria">Siempre activas</span>
                            </div>
                            <p class="gaso-cookie-category-desc">
                                Son imprescindibles para navegar por el sitio, recordar tus estaciones de servicio favoritas en el navegador 
                                (IndexedDB/localStorage), guardar la elección de tema claro/oscuro y garantizar la seguridad técnica.
                            </p>
                        </div>

                        <!-- Categoría 2: Analíticas y Rendimiento -->
                        <div class="gaso-cookie-category-card">
                            <div class="gaso-cookie-category-header">
                                <h6 class="gaso-cookie-category-title">
                                    <i class="bi bi-graph-up-arrow text-info"></i> Cookies Analíticas y Rendimiento
                                </h6>
                                <div class="form-check form-switch m-0">
                                    <input class="form-check-input" type="checkbox" id="switchCookieAnaliticas" role="switch">
                                </div>
                            </div>
                            <p class="gaso-cookie-category-desc">
                                Nos ayudan a recopilar métricas anónimas de navegación para comprender cómo se utiliza el comparador, 
                                qué filtros son más útiles y detectar posibles errores o lentitud en las cargas.
                            </p>
                        </div>

                        <!-- Categoría 3: Publicidad de Terceros (Google AdSense) -->
                        <div class="gaso-cookie-category-card">
                            <div class="gaso-cookie-category-header">
                                <h6 class="gaso-cookie-category-title">
                                    <i class="bi bi-badge-ad text-warning"></i> Cookies de Publicidad y Personalización (Google AdSense)
                                </h6>
                                <div class="form-check form-switch m-0">
                                    <input class="form-check-input" type="checkbox" id="switchCookiePublicidad" role="switch">
                                </div>
                            </div>
                            <p class="gaso-cookie-category-desc">
                                Permiten a Google y a sus socios publicitarios mostrar anuncios contextuales o personalizados según tus intereses. 
                                Los ingresos publicitarios permiten mantener los servidores y la API de GasoES completamente gratuita para todos los usuarios.
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer d-flex flex-wrap justify-content-between">
                        <button type="button" class="btn btn-outline-danger btn-sm" id="btnModalCookieRechazar">
                            Rechazar no esenciales
                        </button>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-outline-primary btn-sm" id="btnModalCookieGuardar">
                                Guardar preferencias
                            </button>
                            <button type="button" class="btn btn-primary btn-sm fw-bold" id="btnModalCookieAceptarTodo">
                                Aceptar todas
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Muestra el banner flotante con animación suave
     */
    function showBanner() {
        const banner = document.getElementById('gasoCookieBanner');
        if (banner) {
            banner.classList.add('gaso-cookie-visible');
        }
    }

    /**
     * Oculta el banner flotante
     */
    function hideBanner() {
        const banner = document.getElementById('gasoCookieBanner');
        if (banner) {
            banner.classList.remove('gaso-cookie-visible');
        }
    }

    /**
     * Abre el modal de configuración de cookies
     */
    function openConfigModal() {
        hideBanner();

        const current = getStoredConsent() || defaultConsent;
        const switchAnaliticas = document.getElementById('switchCookieAnaliticas');
        const switchPublicidad = document.getElementById('switchCookiePublicidad');

        if (switchAnaliticas) switchAnaliticas.checked = Boolean(current.analiticas);
        if (switchPublicidad) switchPublicidad.checked = Boolean(current.publicidad);

        const modalEl = document.getElementById('gasoCookieModal');
        if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        }
    }

    /**
     * Cierra el modal de configuración
     */
    function closeConfigModal() {
        const modalEl = document.getElementById('gasoCookieModal');
        if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            const modalInstance = window.bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
        }
    }

    /**
     * Inicializa los listeners y el ciclo de vida del CMP
     */
    function init() {
        injectElements();

        const stored = getStoredConsent();
        const btnFloating = document.getElementById('btnGasoCookieFloating');

        // Si ya hay consentimiento previo registrado, aplicar de inmediato y ocultar botón flotante
        if (stored) {
            applyConsentToVendors(stored);
            if (btnFloating) btnFloating.style.display = 'none';
        } else {
            // Mostrar banner con un breve retardo para una experiencia fluida
            setTimeout(() => {
                showBanner();
            }, 500);
            if (btnFloating) btnFloating.style.display = 'none';
        }

        // Listener: Aceptar todas desde el banner
        const btnAceptarTodo = document.getElementById('btnGasoCookieAceptarTodo');
        if (btnAceptarTodo) {
            btnAceptarTodo.addEventListener('click', () => {
                saveConsent({ analiticas: true, publicidad: true });
            });
        }

        // Listener: Rechazar no esenciales desde el banner
        const btnRechazar = document.getElementById('btnGasoCookieRechazar');
        if (btnRechazar) {
            btnRechazar.addEventListener('click', () => {
                saveConsent({ analiticas: false, publicidad: false });
            });
        }

        // Listener: Abrir configuración desde el banner
        const btnConfigurar = document.getElementById('btnGasoCookieConfigurar');
        if (btnConfigurar) {
            btnConfigurar.addEventListener('click', () => {
                openConfigModal();
            });
        }

        // Listener: Botón flotante permanente
        if (btnFloating) {
            btnFloating.addEventListener('click', () => {
                openConfigModal();
            });
        }

        // Listener: Guardar preferencias desde el modal
        const btnModalGuardar = document.getElementById('btnModalCookieGuardar');
        if (btnModalGuardar) {
            btnModalGuardar.addEventListener('click', () => {
                const analiticas = document.getElementById('switchCookieAnaliticas')?.checked || false;
                const publicidad = document.getElementById('switchCookiePublicidad')?.checked || false;
                saveConsent({ analiticas, publicidad });
                closeConfigModal();
            });
        }

        // Listener: Aceptar todas desde el modal
        const btnModalAceptarTodo = document.getElementById('btnModalCookieAceptarTodo');
        if (btnModalAceptarTodo) {
            btnModalAceptarTodo.addEventListener('click', () => {
                saveConsent({ analiticas: true, publicidad: true });
                closeConfigModal();
            });
        }

        // Listener: Rechazar no esenciales desde el modal
        const btnModalRechazar = document.getElementById('btnModalCookieRechazar');
        if (btnModalRechazar) {
            btnModalRechazar.addEventListener('click', () => {
                saveConsent({ analiticas: false, publicidad: false });
                closeConfigModal();
            });
        }

        // Si se cierra el modal sin guardar preferencias y aún no hay consentimiento, volver a mostrar el banner
        const modalEl = document.getElementById('gasoCookieModal');
        if (modalEl) {
            modalEl.addEventListener('hidden.bs.modal', () => {
                if (!getStoredConsent()) {
                    showBanner();
                }
            });
        }
    }

    // Exponer API global
    window.abrirConfiguracionCookies = openConfigModal;
    window.obtenerConsentimientoCookies = getStoredConsent;

    // Inicializar al cargar el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
