/**
 * main.js - Lógica principal del mapa interactivo de GasoES, tiles con modo oscuro,
 * popups modernos y Bottom Sheet móvil con Top 5 estaciones.
 */

import { getGasolineras } from './dataManager.js';
import { 
    toNum, 
    formatPrecio, 
    estaAbiertaAhora, 
    esFavorito, 
    toggleFavorito, 
    showNotify,
    clasificarMarca 
} from './utils.js';

// Inicialización del mapa Leaflet
const map = L.map('map', { 
    zoomControl: false,
    preferCanvas: true,
    zoomAnimation: true,
    markerZoomAnimation: false,
    wheelDebounceTime: 40,
    wheelPxPerZoomLevel: 100
}).setView([40.4167, -3.7037], 6);
let todasLasEstaciones = [];
let stationMarkers = [];
let mediasZona = { p95: 0, p98: 0, pDiesel: 0, pDieselPre: 0, pGLP: 0 };
let userMarker = null;
let combustibleSeleccionado = 'doble';
let tankLitersStats = 50;
let debounceIconTimer = null;
let debounceBottomSheetTimer = null;

const FUEL_MAP = {
    p95: { field: 'Precio Gasolina 95 E5', label: 'Gasolina 95', short: '95', tagBg: 'bg-success' },
    p98: { field: 'Precio Gasolina 98 E5', label: 'Gasolina 98', short: '98', tagBg: 'bg-success' },
    pDiesel: { field: 'Precio Gasoleo A', label: 'Diésel A', short: 'D', tagBg: 'bg-dark' },
    pDieselPre: { field: 'Precio Gasoleo Premium', label: 'Diésel+', short: 'D+', tagBg: 'bg-warning text-dark' },
    pGLP: { field: 'Precio Gases licuados del petróleo', label: 'GLP', short: 'GLP', tagBg: 'bg-info text-dark' }
};

// --- Capa de Tiles de Leaflet (OpenStreetMap 100% libre sin API Key ni marcas de agua) ---
const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

L.control.zoom({ position: 'topright' }).addTo(map);

const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: "Buscar ciudad o calle...",
    errorMessage: "No se encontró la ubicación."
})
.on('markgeocode', function (e) {
    const bbox = e.geocode.bbox;
    map.fitBounds(bbox);
})
.addTo(map);

const markers = L.markerClusterGroup({
    chunkedLoading: true,
    chunkedInterval: 100,
    chunkedDelay: 25,
    animate: false,
    animateAddingMarkers: false,
    removeOutsideVisibleBounds: true,
    maxClusterRadius: function (zoom) {
        if (zoom <= 6) return 90;
        if (zoom <= 8) return 70;
        if (zoom <= 10) return 55;
        if (zoom <= 12) return 45;
        if (zoom <= 14) return 35;
        return 28;
    },
    disableClusteringAtZoom: 17,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function (cluster) {
        const childMarkers = cluster.getAllChildMarkers();
        const count = cluster.getChildCount();

        // --- CASO 1: SELECCIÓN DOBLE (Gasolina 95 + Diésel A) ---
        if (combustibleSeleccionado === 'doble') {
            let sum95 = 0, count95 = 0;
            let sumDiesel = 0, countDiesel = 0;

            for (let i = 0; i < childMarkers.length; i++) {
                const m = childMarkers[i];
                if (m.p95 && m.p95 > 0) {
                    sum95 += m.p95;
                    count95++;
                }
                if (m.pDiesel && m.pDiesel > 0) {
                    sumDiesel += m.pDiesel;
                    countDiesel++;
                }
            }

            const avg95 = count95 > 0 ? (sum95 / count95) : null;
            const avgDiesel = countDiesel > 0 ? (sumDiesel / countDiesel) : null;

            const calcPct = (p) => {
                if (!p) return 35;
                const minP = 1.25, maxP = 1.90;
                const ratio = (p - minP) / (maxP - minP);
                return Math.min(95, Math.max(18, Math.round(ratio * 100)));
            };

            const pct95 = calcPct(avg95);
            const pctDiesel = calcPct(avgDiesel);

            const label95 = avg95 ? avg95.toFixed(2) : '--';
            const labelDiesel = avgDiesel ? avgDiesel.toFixed(2) : '--';

            // Siempre Matraz Circular para grupos de gasolineras
            const html = `
                <div class="matraz-circular-cluster" title="${count} gasolineras agrupadas | Medias: G95: ${label95}€ - Diésel: ${labelDiesel}€">
                    <div class="matraz-glass-orb">
                        <div class="matraz-half half-g95">
                            <div class="matraz-liquid liquid-g95" style="height: ${pct95}%;"></div>
                        </div>
                        <div class="matraz-half half-diesel">
                            <div class="matraz-liquid liquid-diesel" style="height: ${pctDiesel}%;"></div>
                        </div>
                        <div class="matraz-specular"></div>
                    </div>
                    <div class="matraz-center-badge">
                        <i class="bi bi-fuel-pump-fill"></i>
                        <span>${count}</span>
                    </div>
                </div>
            `;

            return L.divIcon({
                html: html,
                className: 'probeta-cluster-icon',
                iconSize: [46, 46],
                iconAnchor: [23, 23]
            });
        }

        // --- CASO 2: SELECCIÓN DE COMBUSTIBLE ESPECÍFICO (p95, p98, pDiesel, pDieselPre, pGLP) ---
        const fuelKey = combustibleSeleccionado;
        const meta = FUEL_MAP[fuelKey] || { label: 'Combustible', short: 'Comb' };

        let sumFuel = 0, countFuel = 0;
        for (let i = 0; i < childMarkers.length; i++) {
            const m = childMarkers[i];
            const val = m[fuelKey];
            if (val && val > 0) {
                sumFuel += val;
                countFuel++;
            }
        }

        const avgFuel = countFuel > 0 ? (sumFuel / countFuel) : null;
        const labelFuel = avgFuel ? avgFuel.toFixed(2) : '--';

        let minP = 1.25, maxP = 1.90;
        if (fuelKey === 'pGLP') { minP = 0.70; maxP = 1.25; }
        else if (fuelKey === 'p98' || fuelKey === 'pDieselPre') { minP = 1.40; maxP = 2.10; }

        const calcPctSingle = (p) => {
            if (!p) return 35;
            const ratio = (p - minP) / (maxP - minP);
            return Math.min(95, Math.max(18, Math.round(ratio * 100)));
        };

        const pctFuel = calcPctSingle(avgFuel);
        const liquidClass = `liquid-${fuelKey}`;

        // Matraz circular estilizado con el color temático del combustible
        const html = `
            <div class="matraz-circular-cluster" title="${count} gasolineras agrupadas | ${meta.label} medio: ${labelFuel}€">
                <div class="matraz-glass-orb">
                    <div class="matraz-full-orb">
                        <div class="matraz-liquid ${liquidClass}" style="height: ${pctFuel}%;"></div>
                    </div>
                    <div class="matraz-specular"></div>
                </div>
                <div class="matraz-center-badge">
                    <i class="bi bi-fuel-pump-fill"></i>
                    <span>${count}</span>
                </div>
            </div>
        `;

        return L.divIcon({
            html: html,
            className: 'probeta-cluster-icon',
            iconSize: [46, 46],
            iconAnchor: [23, 23]
        });
    }
});

function getColor(precio, media) {
    if (!precio || !media || media === 0) return 'bg-secondary';
    const dif = precio - media;
    if (dif < -0.02) return 'bg-success';
    if (dif > 0.02) return 'bg-danger';
    return 'bg-warning text-dark';
}

function crearIconoDoble(p95Str, pDieselStr, rotulo = '') {
    const p95 = toNum(p95Str);
    const pDiesel = toNum(pDieselStr);
    const col95 = getColor(p95, mediasZona.p95);
    const colDiesel = getColor(pDiesel, mediasZona.pDiesel);

    const calcPct = (p) => {
        if (!p) return 30;
        const minP = 1.25, maxP = 1.90;
        const ratio = (p - minP) / (maxP - minP);
        return Math.min(95, Math.max(18, Math.round(ratio * 100)));
    };

    const pct95 = calcPct(p95);
    const pctDiesel = calcPct(pDiesel);
    const label95 = p95 ? p95.toFixed(2) : '--';
    const labelDiesel = pDiesel ? pDiesel.toFixed(2) : '--';
    const brandName = (rotulo || '').trim() || 'Estación';

    // Probetas verticales de laboratorio: marcador final para 1 gasolinera individual
    const html = `
        <div class="probeta-station" title="${brandName} | G95: ${label95}€ - Diésel: ${labelDiesel}€">
            <div class="probetas-pair">
                <!-- Probeta Gasolina 95 -->
                <div class="probeta-col">
                    <span class="probeta-price-tag ${col95}">${label95}</span>
                    <div class="probeta-cylinder">
                        <div class="probeta-glass-rim"></div>
                        <div class="probeta-ticks">
                            <span></span><span></span><span></span>
                        </div>
                        <div class="probeta-liquid liquid-g95" style="height: ${pct95}%;">
                            <div class="probeta-meniscus"></div>
                        </div>
                        <div class="probeta-glass-reflection"></div>
                    </div>
                    <span class="probeta-fuel-pill pill-g95">G95</span>
                </div>

                <!-- Probeta Diésel A -->
                <div class="probeta-col">
                    <span class="probeta-price-tag ${colDiesel}">${labelDiesel}</span>
                    <div class="probeta-cylinder">
                        <div class="probeta-glass-rim"></div>
                        <div class="probeta-ticks">
                            <span></span><span></span><span></span>
                        </div>
                        <div class="probeta-liquid liquid-diesel" style="height: ${pctDiesel}%;">
                            <div class="probeta-meniscus"></div>
                        </div>
                        <div class="probeta-glass-reflection"></div>
                    </div>
                    <span class="probeta-fuel-pill pill-diesel">Diésel</span>
                </div>
            </div>

            <!-- Peana de laboratorio con marca de la gasolinera -->
            <div class="probeta-rack-base station-base" title="${brandName}">
                <span class="probeta-brand-name">${brandName}</span>
            </div>
        </div>
    `;

    return L.divIcon({
        html: html,
        className: 'probeta-station-icon',
        iconSize: [56, 70],
        iconAnchor: [28, 66]
    });
}

function crearIconoSimple(fuelKey, precioStr, rotulo = '') {
    const precio = toNum(precioStr);
    const media = mediasZona[fuelKey] || 0;
    const col = getColor(precio, media);
    const meta = FUEL_MAP[fuelKey] || { short: 'Comb', label: 'Combustible' };
    const labelFuel = precio ? precio.toFixed(2) : '--';
    const brandName = (rotulo || '').trim() || 'Estación';

    let minP = 1.25, maxP = 1.90;
    if (fuelKey === 'pGLP') { minP = 0.70; maxP = 1.25; }
    else if (fuelKey === 'p98' || fuelKey === 'pDieselPre') { minP = 1.40; maxP = 2.10; }

    const calcPct = (p) => {
        if (!p) return 30;
        const ratio = (p - minP) / (maxP - minP);
        return Math.min(95, Math.max(18, Math.round(ratio * 100)));
    };

    const pctFuel = calcPct(precio);
    const liquidClass = `liquid-${fuelKey}`;

    // Probeta individual de laboratorio: marcador final para 1 gasolinera
    const html = `
        <div class="probeta-station" title="${brandName} | ${meta.label}: ${labelFuel}€">
            <div class="probetas-pair" style="justify-content: center;">
                <div class="probeta-col">
                    <span class="probeta-price-tag ${col}">${labelFuel}</span>
                    <div class="probeta-cylinder">
                        <div class="probeta-glass-rim"></div>
                        <div class="probeta-ticks">
                            <span></span><span></span><span></span>
                        </div>
                        <div class="probeta-liquid ${liquidClass}" style="height: ${pctFuel}%;">
                            <div class="probeta-meniscus"></div>
                        </div>
                        <div class="probeta-glass-reflection"></div>
                    </div>
                    <span class="probeta-fuel-pill pill-${fuelKey}">${meta.short}</span>
                </div>
            </div>

            <div class="probeta-rack-base station-base" title="${brandName}">
                <span class="probeta-brand-name">${brandName}</span>
            </div>
        </div>
    `;

    return L.divIcon({
        html: html,
        className: 'probeta-station-icon',
        iconSize: [44, 70],
        iconAnchor: [22, 66]
    });
}

function actualizarIconosMapa() {
    stationMarkers.forEach(({ marker, data }) => {
        if (combustibleSeleccionado === 'doble') {
            marker.setIcon(crearIconoDoble(data['Precio Gasolina 95 E5'], data['Precio Gasoleo A'], data['Rótulo']));
        } else {
            const field = FUEL_MAP[combustibleSeleccionado]?.field;
            marker.setIcon(crearIconoSimple(combustibleSeleccionado, data[field], data['Rótulo']));
        }
    });

    if (markers && markers.refreshClusters) {
        markers.refreshClusters();
    }
}

// debounceActualizarIconos eliminado por rendimiento: actualizarIconosMapa solo se ejecuta al cambiar combustible

const botonInfo = document.querySelector('.btn-info-flotante');
const elOffcanvas = document.getElementById('offcanvasStats');

if (elOffcanvas && botonInfo) {
    elOffcanvas.addEventListener('show.bs.offcanvas', () => {
        botonInfo.classList.add('hidden');
    });

    elOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
        botonInfo.classList.remove('hidden');
    });
}

export function abrirPanelStats() {
    const myOffcanvas = document.getElementById('offcanvasStats');
    if (!myOffcanvas) return;
    const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(myOffcanvas);
    actualizarLeyenda();
    bsOffcanvas.show();
}

function actualizarLeyenda() {
    const limites = map.getBounds();
    let acumuladores = {
        p95: { sum: 0, count: 0 },
        p98: { sum: 0, count: 0 },
        pDiesel: { sum: 0, count: 0 },
        pDieselPre: { sum: 0, count: 0 },
        pGLP: { sum: 0, count: 0 }
    };

    let estacionesVisibles = 0;

    todasLasEstaciones.forEach(e => {
        const lat = toNum(e['Latitud']);
        const lng = toNum(e['Longitud (WGS84)']);

        if (lat && lng && limites.contains([lat, lng])) {
            estacionesVisibles++;
            const vals = [
                { key: 'p95', val: toNum(e['Precio Gasolina 95 E5']) },
                { key: 'p98', val: toNum(e['Precio Gasolina 98 E5']) },
                { key: 'pDiesel', val: toNum(e['Precio Gasoleo A']) },
                { key: 'pDieselPre', val: toNum(e['Precio Gasoleo Premium']) },
                { key: 'pGLP', val: toNum(e['Precio Gases licuados del petróleo']) }
            ];
            vals.forEach(item => {
                if (item.val) { 
                    acumuladores[item.key].sum += item.val; 
                    acumuladores[item.key].count++; 
                }
            });
        }
    });

    mediasZona.p95 = acumuladores.p95.count > 0 ? (acumuladores.p95.sum / acumuladores.p95.count) : 0;
    mediasZona.p98 = acumuladores.p98.count > 0 ? (acumuladores.p98.sum / acumuladores.p98.count) : 0;
    mediasZona.pDiesel = acumuladores.pDiesel.count > 0 ? (acumuladores.pDiesel.sum / acumuladores.pDiesel.count) : 0;
    mediasZona.pDieselPre = acumuladores.pDieselPre.count > 0 ? (acumuladores.pDieselPre.sum / acumuladores.pDieselPre.count) : 0;
    mediasZona.pGLP = acumuladores.pGLP.count > 0 ? (acumuladores.pGLP.sum / acumuladores.pGLP.count) : 0;

    const getM = (key) => acumuladores[key].count > 0 ? (acumuladores[key].sum / acumuladores[key].count).toFixed(3) : '--';
    const getFillCost = (key) => acumuladores[key].count > 0 ? ((acumuladores[key].sum / acumuladores[key].count) * tankLitersStats).toFixed(2) + ' €' : '--';

    const container = document.getElementById('leyenda-container');
    if (!container) return;

    container.innerHTML = `
        <p class="text-muted small mb-3">Promedio de las <b>${estacionesVisibles}</b> estaciones en esta zona del mapa.</p>
        
        <div class="list-group list-group-flush mb-4 shadow-sm bg-body rounded p-2 border">
            ${renderStatRow('Gasolina 95 E5', getM('p95'), 'text-success')}
            ${renderStatRow('Gasolina 98 E5', getM('p98'), 'text-success')}
            ${renderStatRow('Gasóleo A', getM('pDiesel'), 'text-primary')}
            ${renderStatRow('Gasóleo Premium', getM('pDieselPre'), 'text-warning')}
            ${renderStatRow('GLP', getM('pGLP'), 'text-info')}
        </div>

        <!-- Calculadora de Llenado de Depósito en Stats -->
        <div class="p-3 bg-body rounded shadow-sm border mb-4">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="fw-bold small text-uppercase mb-0" style="font-size: 0.72rem;">
                    <i class="bi bi-calculator text-primary me-1"></i> Llenar Depósito
                </h6>
                <div class="input-group input-group-sm" style="width: 105px;">
                    <input type="number" id="statsTankInput" class="form-control form-control-sm text-center py-0" value="${tankLitersStats}" min="10" max="150" step="5">
                    <span class="input-group-text py-0 px-2 text-muted small">L</span>
                </div>
            </div>
            <p class="text-muted small mb-2" style="font-size: 0.72rem;">Coste medio estimado para <b id="lblTankLiters">${tankLitersStats} litros</b>:</p>
            <div class="d-flex justify-content-between align-items-center py-1 border-bottom border-light-subtle">
                <span class="text-secondary small">Gasolina 95:</span>
                <span class="fw-bold text-success" id="costeFillG95">${getFillCost('p95')}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center py-1">
                <span class="text-secondary small">Gasóleo A:</span>
                <span class="fw-bold text-primary" id="costeFillDiesel">${getFillCost('pDiesel')}</span>
            </div>
        </div>

        <div class="p-3 bg-body-tertiary rounded border mb-3">
            <h6 class="fw-bold small text-uppercase mb-2" style="font-size: 0.65rem;">Referencias de Color</h6>
            <div class="d-flex flex-column gap-2 small">
                <span><i class="bi bi-circle-fill text-success me-1"></i> Barato (inferior a la media)</span>
                <span><i class="bi bi-circle-fill text-warning me-1"></i> Precio Medio</span>
                <span><i class="bi bi-circle-fill text-danger me-1"></i> Caro (superior a la media)</span>
            </div>
        </div>

        <div class="pt-2 border-top text-center" style="font-size: 0.75rem;">
            <a href="aviso-legal.html" class="text-muted text-decoration-none me-2">Aviso Legal</a>
            <span class="text-muted">·</span>
            <a href="politica-privacidad.html" class="text-muted text-decoration-none mx-2">Privacidad</a>
            <span class="text-muted">·</span>
            <a href="#" onclick="if(window.abrirConfiguracionCookies){window.abrirConfiguracionCookies();} return false;" class="text-muted text-decoration-none ms-2">Configurar Cookies</a>
        </div>
    `;

    const inputTank = document.getElementById('statsTankInput');
    if (inputTank) {
        inputTank.addEventListener('input', (ev) => {
            const val = parseFloat(ev.target.value) || 50;
            tankLitersStats = val;
            const lbl = document.getElementById('lblTankLiters');
            if (lbl) lbl.textContent = `${val} litros`;
            const elG95 = document.getElementById('costeFillG95');
            if (elG95) elG95.textContent = getFillCost('p95');
            const elDiesel = document.getElementById('costeFillDiesel');
            if (elDiesel) elDiesel.textContent = getFillCost('pDiesel');
        });
    }
}

function renderStatRow(label, precio, colorClass) {
    return `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-light-subtle">
            <span class="text-secondary small">${label}</span>
            <span class="fw-bold ${colorClass}">${precio} €</span>
        </div>
    `;
}

// Favoritos en Mapa
export function toggleFavMapa(id, btnEl) {
    const isNowFav = toggleFavorito(id);

    if (btnEl) {
        const icon = btnEl.querySelector('i');
        if (icon) {
            icon.className = isNowFav ? 'bi bi-star-fill text-warning' : 'bi bi-star text-muted';
        }
        btnEl.title = isNowFav ? 'Quitar de favoritos' : 'Añadir a favoritos';
    }
}

// Rediseño Moderno de Popups Leaflet
function renderPopupPriceRow(label, valStr, colorClass) {
    const val = toNum(valStr);
    const formatted = val ? `${val.toFixed(3)} €` : '--';
    const badgeStyle = val ? colorClass : 'text-muted';
    return `
        <tr>
            <td>${label}</td>
            <td class="${badgeStyle}">${formatted}</td>
        </tr>
    `;
}

function generarPopupHtml(e) {
    const lat = toNum(e['Latitud']), lng = toNum(e['Longitud (WGS84)']);
    const isFav = esFavorito(e.IDEESS);
    const abierta = estaAbiertaAhora(e['Horario']);
    const horarioStr = e['Horario'] || 'Consultar horario';
    const es24h = /24\s*h/i.test(horarioStr) || /24\s*horas/i.test(horarioStr);

    // Clasificación de la marca
    const cat = clasificarMarca(e['Rótulo']);
    let badgeMarcaHtml = '';
    if (cat === 'tradicionales') {
        badgeMarcaHtml = '<span class="popup-brand-badge bg-primary-subtle text-primary border border-primary-subtle">Red Principal</span>';
    } else if (cat === 'lowcost') {
        badgeMarcaHtml = '<span class="popup-brand-badge bg-success-subtle text-success border border-success-subtle">Low Cost</span>';
    } else {
        badgeMarcaHtml = '<span class="popup-brand-badge bg-secondary-subtle text-secondary border border-secondary-subtle">Independiente</span>';
    }

    const p95 = toNum(e['Precio Gasolina 95 E5']);
    const pDiesel = toNum(e['Precio Gasoleo A']);
    const costeG95_50 = p95 ? (p95 * 50).toFixed(2) : null;
    const costeDiesel_50 = pDiesel ? (pDiesel * 50).toFixed(2) : null;

    return `
        <div class="popup-card">
            <!-- Cabecera Limpia: Marca + Badge + Botón Favorito -->
            <div class="popup-header">
                <div>
                    <h5 class="popup-brand-title text-primary">${e['Rótulo']}</h5>
                    ${badgeMarcaHtml}
                </div>
                <button type="button" class="popup-fav-btn" onclick="toggleFavMapa('${e.IDEESS}', this)" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
                    <i class="bi ${isFav ? 'bi-star-fill text-warning' : 'bi-star text-muted'}"></i>
                </button>
            </div>

            <!-- Ubicación -->
            <p class="small text-muted mb-2 text-truncate" style="font-size: 0.76rem;" title="${e['Dirección']}, ${e['Municipio']}">
                <i class="bi bi-geo-alt-fill text-danger me-1"></i> ${e['Dirección']}
            </p>

            <!-- Horario estilizado con punto verde pulsante -->
            <div class="popup-schedule-row">
                <span class="status-indicator ${abierta ? 'open' : 'closed'}">
                    <span class="${abierta ? 'pulse-dot' : 'status-dot-closed'}"></span>
                    ${abierta ? 'Abierto ahora' : 'Cerrado ahora'}
                </span>
                ${es24h ? '<span class="badge bg-info-subtle text-info border border-info-subtle" style="font-size: 0.65rem;">24 Horas</span>' : ''}
                <span class="text-muted small text-truncate" style="font-size: 0.72rem; max-width: 135px;" title="${horarioStr}">
                    <i class="bi bi-clock me-1"></i> ${horarioStr}
                </span>
            </div>

            <!-- Tabla de Precios Moderna -->
            <table class="popup-price-table">
                <tbody>
                    ${renderPopupPriceRow('Gasolina 95', e['Precio Gasolina 95 E5'], 'text-success')}
                    ${renderPopupPriceRow('Gasolina 98', e['Precio Gasolina 98 E5'], 'text-success')}
                    ${renderPopupPriceRow('Diésel A', e['Precio Gasoleo A'], 'text-primary')}
                    ${renderPopupPriceRow('Diésel+', e['Precio Gasoleo Premium'], 'text-warning')}
                    ${renderPopupPriceRow('GLP', e['Precio Gases licuados del petróleo'], 'text-info')}
                </tbody>
            </table>

            <!-- Calculadora de Llenado de Depósito (50L) -->
            <div class="popup-calc-box">
                <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="small fw-bold text-muted text-uppercase" style="font-size: 0.65rem;">
                        <i class="bi bi-fuel-pump text-primary me-1"></i> Llenar 50 Litros (aprox.):
                    </span>
                </div>
                <div class="d-flex justify-content-around text-center py-1">
                    <div>
                        <span class="text-muted d-block" style="font-size: 0.68rem;">Gasolina 95</span>
                        <strong class="text-success small">${costeG95_50 ? costeG95_50 + ' €' : '--'}</strong>
                    </div>
                    <div class="vr opacity-25"></div>
                    <div>
                        <span class="text-muted d-block" style="font-size: 0.68rem;">Diésel A</span>
                        <strong class="text-primary small">${costeDiesel_50 ? costeDiesel_50 + ' €' : '--'}</strong>
                    </div>
                </div>
            </div>

            <!-- Botón Cómo llegar con Google Maps -->
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="btn-directions">
                <i class="bi bi-cursor-fill"></i> Cómo llegar (Google Maps)
            </a>
        </div>
    `;
}

// --- Bottom Sheet Móvil: Top 5 más baratas de la zona visible ---
const bottomSheet = document.getElementById('mobileBottomSheet');
const bottomSheetHeader = document.getElementById('bottomSheetHeader');
const bottomSheetList = document.getElementById('bottomSheetList');
const bottomSheetFuelBadge = document.getElementById('bottomSheetFuelBadge');

if (bottomSheetHeader && bottomSheet) {
    bottomSheetHeader.addEventListener('click', () => {
        const isExpanded = bottomSheet.classList.toggle('expanded');
        bottomSheetHeader.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });
}

function actualizarBottomSheet() {
    if (!bottomSheetList || !map) return;

    const bounds = map.getBounds();
    const fuelKey = combustibleSeleccionado === 'doble' ? 'p95' : combustibleSeleccionado;
    const fuelMeta = FUEL_MAP[fuelKey] || FUEL_MAP.p95;

    if (bottomSheetFuelBadge) {
        bottomSheetFuelBadge.textContent = combustibleSeleccionado === 'doble' ? 'G95 / Diésel' : fuelMeta.label;
    }

    const field = fuelMeta.field;
    const candidatas = [];

    todasLasEstaciones.forEach(e => {
        const lat = toNum(e['Latitud']), lng = toNum(e['Longitud (WGS84)']);
        if (!lat || !lng || !bounds.contains([lat, lng])) return;

        const precio = toNum(e[field]);
        if (precio && precio > 0) {
            candidatas.push({ data: e, lat, lng, precio });
        }
    });

    // Ordenar de más barata a más cara
    candidatas.sort((a, b) => a.precio - b.precio);
    const top5 = candidatas.slice(0, 5);

    if (top5.length === 0) {
        bottomSheetList.innerHTML = `
            <div class="text-center py-3 text-muted small">
                <i class="bi bi-info-circle me-1"></i> No hay estaciones con precios de <b>${fuelMeta.label}</b> visibles en esta zona del mapa.
            </div>
        `;
        return;
    }

    let html = '';
    top5.forEach((item, index) => {
        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-other';
        const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const cat = clasificarMarca(item.data['Rótulo']);
        const abierta = estaAbiertaAhora(item.data['Horario']);

        html += `
            <div class="bottom-sheet-item d-flex align-items-center justify-content-between" onclick="volarAEstacion('${item.data.IDEESS}', ${item.lat}, ${item.lng})">
                <div class="d-flex align-items-center gap-2 overflow-hidden pe-2">
                    <span class="rank-badge ${rankClass} flex-shrink-0">${rankIcon}</span>
                    <div class="overflow-hidden">
                        <div class="fw-bold small text-truncate d-flex align-items-center gap-1">
                            <span class="text-truncate">${item.data['Rótulo']}</span>
                            ${abierta ? '<span class="pulse-dot flex-shrink-0" title="Abierto ahora"></span>' : ''}
                        </div>
                        <div class="text-muted text-truncate" style="font-size: 0.7rem;">
                            ${item.data['Dirección']}, ${item.data['Municipio']}
                        </div>
                    </div>
                </div>
                <div class="text-end flex-shrink-0">
                    <span class="badge bg-success text-white shadow-sm" style="font-size: 0.8rem;">
                        ${item.precio.toFixed(3)} €
                    </span>
                    <div class="text-muted text-uppercase" style="font-size: 0.65rem;">${fuelMeta.short}</div>
                </div>
            </div>
        `;
    });

    bottomSheetList.innerHTML = html;
}

export function volarAEstacion(id, lat, lng) {
    if (!map) return;

    // Vuelo animado hacia la estación
    map.flyTo([lat, lng], 16, { duration: 0.8 });

    // Buscar el marcador correspondiente y desplegar su popup
    const target = stationMarkers.find(item => item.data.IDEESS === id);
    if (target) {
        setTimeout(() => {
            markers.zoomToShowLayer(target.marker, () => {
                target.marker.openPopup();
            });
        }, 500);
    }

    // Colapsar el panel inferior en móvil para dejar ver el mapa y popup
    if (bottomSheet) {
        bottomSheet.classList.remove('expanded');
        bottomSheetHeader?.setAttribute('aria-expanded', 'false');
    }
}

function debounceActualizarBottomSheet() {
    clearTimeout(debounceBottomSheetTimer);
    debounceBottomSheetTimer = setTimeout(() => {
        actualizarBottomSheet();
    }, 300);
}

async function cargar() {
    try {
        todasLasEstaciones = await getGasolineras();

        actualizarLeyenda();
        actualizarBottomSheet();

        stationMarkers = [];
        todasLasEstaciones.forEach(e => {
            const lat = toNum(e['Latitud']), lng = toNum(e['Longitud (WGS84)']);
            if (lat && lng) {
                const marker = L.marker([lat, lng], {
                    icon: crearIconoDoble(e['Precio Gasolina 95 E5'], e['Precio Gasoleo A'], e['Rótulo'])
                });
                marker.p95 = toNum(e['Precio Gasolina 95 E5']);
                marker.p98 = toNum(e['Precio Gasolina 98 E5']);
                marker.pDiesel = toNum(e['Precio Gasoleo A']);
                marker.pDieselPre = toNum(e['Precio Gasoleo Premium']);
                marker.pGLP = toNum(e['Precio Gases licuados del petróleo']) || toNum(e['Precio Gases licuados del petroleo']);
                marker.bindPopup(() => generarPopupHtml(e), {
                    maxWidth: 320,
                    className: 'custom-leaflet-popup'
                });
                markers.addLayer(marker);
                stationMarkers.push({ marker, data: e });
            }
        });

        map.addLayer(markers);
        const loader = document.getElementById('loader');
        if (loader) loader.remove();

        // Conexión interactiva: comprobar si venimos de listado.html con ?id=...&lat=...&lng=...
        const urlParams = new URLSearchParams(window.location.search);
        const targetId = urlParams.get('id');
        const targetLat = toNum(urlParams.get('lat'));
        const targetLng = toNum(urlParams.get('lng'));

        // Conexión interactiva: filtro de combustible por URL (?fuel=p95, pDiesel, etc.)
        const targetFuel = urlParams.get('fuel');
        if (targetFuel && FUEL_MAP[targetFuel] && mapFuelSelect) {
            mapFuelSelect.value = targetFuel;
            combustibleSeleccionado = targetFuel;
            actualizarIconosMapa();
            actualizarLeyenda();
            actualizarBottomSheet();
        }

        if (targetLat && targetLng) {
            map.setView([targetLat, targetLng], 16);
            if (targetId) {
                const targetObj = stationMarkers.find(item => item.data.IDEESS === targetId);
                if (targetObj) {
                    setTimeout(() => {
                        markers.zoomToShowLayer(targetObj.marker, () => {
                            targetObj.marker.openPopup();
                        });
                    }, 400);
                }
            }
        }

    } catch (e) { 
        console.error("Error al cargar estaciones:", e); 
    }
}

export function miUbicacion() {
    if (!navigator.geolocation) {
        showNotify("GPS no soportado", "error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;

            if (userMarker) map.removeLayer(userMarker);

            const userIcon = L.divIcon({
                className: 'user-location-marker',
                html: '<div style="width: 15px; height: 15px; background: #0d6efd; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>',
                iconSize: [15, 15]
            });

            userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
            map.setView([lat, lng], 14);
        },
        (error) => {
            console.error("Error GPS:", error);
            showNotify("No se pudo obtener tu ubicación", "error");
        },
        { enableHighAccuracy: true }
    );
}

// Selector de combustible flotante en mapa
const mapFuelSelect = document.getElementById('mapFuelSelect');
if (mapFuelSelect) {
    mapFuelSelect.addEventListener('change', (e) => {
        combustibleSeleccionado = e.target.value;
        actualizarIconosMapa();
        actualizarLeyenda();
        actualizarBottomSheet();
    });
}

// Control de transparencia de marcadores para ver el mapa con claridad
const btnToggleTransparencia = document.getElementById('btnToggleTransparencia');
const iconTransparencia = document.getElementById('iconTransparencia');
const lblTransparencia = document.getElementById('lblTransparencia');
const mapEl = document.getElementById('map');

if (btnToggleTransparencia && mapEl) {
    let modoTransparente = false;
    btnToggleTransparencia.addEventListener('click', () => {
        modoTransparente = !modoTransparente;
        if (modoTransparente) {
            mapEl.classList.add('map-transparente');
            btnToggleTransparencia.classList.add('active');
            if (iconTransparencia) {
                iconTransparencia.className = 'bi bi-eye-slash-fill';
            }
            if (lblTransparencia) {
                lblTransparencia.textContent = 'Ver precios';
            }
            btnToggleTransparencia.setAttribute('title', 'Restaurar opacidad de gasolineras');
        } else {
            mapEl.classList.remove('map-transparente');
            btnToggleTransparencia.classList.remove('active');
            if (iconTransparencia) {
                iconTransparencia.className = 'bi bi-eye text-primary';
            }
            if (lblTransparencia) {
                lblTransparencia.textContent = 'Ver mapa';
            }
            btnToggleTransparencia.setAttribute('title', 'Hacer transparentes las gasolineras para ver el mapa');
        }
    });
}

let debounceMoveTimer = null;
map.on('moveend', () => {
    clearTimeout(debounceMoveTimer);
    debounceMoveTimer = setTimeout(() => {
        actualizarLeyenda();
        actualizarBottomSheet();
    }, 250);
});

// Exposición global explícita para interactividad en HTML
window.miUbicacion = miUbicacion;
window.abrirPanelStats = abrirPanelStats;
window.toggleFavMapa = toggleFavMapa;
window.volarAEstacion = volarAEstacion;

cargar();
