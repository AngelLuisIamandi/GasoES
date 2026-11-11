/**
 * listado.js - Lógica del listado tabular, filtros avanzados y calculadora de repostaje de GasoES.
 */

import { getGasolineras } from './dataManager.js';
import { 
    toNum, 
    parsePrecio, 
    calcularDistancia, 
    estaAbiertaAhora, 
    coincideMarca,
    getFavoritos, 
    esFavorito, 
    toggleFavorito, 
    showNotify 
} from './utils.js';

let estaciones = [];
let estacionesFiltradas = [];
let favoritos = getFavoritos();
let itemsMostrados = 0;
let coordsReferencia = null;
let mediasCombustible = { p95: 0, p98: 0, pDiesel: 0, pDieselPre: 0, pGLP: 0 };
const PASO = 200;

const SORT_MAP = {
    'p95': 'Precio Gasolina 95 E5',
    'p98': 'Precio Gasolina 98 E5',
    'pDiesel': 'Precio Gasoleo A',
    'pDieselPre': 'Precio Gasoleo Premium',
    'pGLP': 'Precio Gases licuados del petróleo'
};

const elements = {
    tableBody: document.getElementById('tableBody'),
    tableContainer: document.querySelector('.table-container'),
    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    brandSelect: document.getElementById('brandSelect'),
    openNowFilter: document.getElementById('openNowFilter'),
    favFilter: document.getElementById('favFilter'),
    modeLiter: document.getElementById('modeLiter'),
    modeTank: document.getElementById('modeTank'),
    tankCapacity: document.getElementById('tankCapacity'),
    totalResultados: document.getElementById('totalResultados'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    loader: document.getElementById('loader-listado'),
    locationInput: document.getElementById('locationInput'),
    rangeInput: document.getElementById('rangeInput'),
    btnLocation: document.getElementById('btnLocation'),
    btnGPS: document.getElementById('btnGPS'),
    thG95: document.getElementById('thG95'),
    thG98: document.getElementById('thG98'),
    thDiesel: document.getElementById('thDiesel'),
    thDieselPre: document.getElementById('thDieselPre'),
    thGLP: document.getElementById('thGLP')
};

async function fetchData() {
    try {
        estaciones = await getGasolineras();
        if (elements.loader) elements.loader.style.display = 'none';

        // Comprobar parámetro ?q= en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam = urlParams.get('q');
        if (queryParam && elements.searchInput) {
            elements.searchInput.value = queryParam;
        }

        aplicarFiltros();
    } catch (error) {
        console.error("Error cargando estaciones:", error);
        if (elements.loader) elements.loader.innerHTML = "Error al cargar los datos.";
    }
}

function actualizarEncabezadosTabla() {
    const esModoTanque = elements.modeTank?.checked;
    const litros = parseInt(elements.tankCapacity?.value, 10) || 50;

    if (esModoTanque) {
        if (elements.thG95) elements.thG95.textContent = `G95 (${litros}L)`;
        if (elements.thG98) elements.thG98.textContent = `G98 (${litros}L)`;
        if (elements.thDiesel) elements.thDiesel.textContent = `Diésel A (${litros}L)`;
        if (elements.thDieselPre) elements.thDieselPre.textContent = `Diésel+ (${litros}L)`;
        if (elements.thGLP) elements.thGLP.textContent = `GLP (${litros}L)`;
    } else {
        if (elements.thG95) elements.thG95.textContent = 'G95';
        if (elements.thG98) elements.thG98.textContent = 'G98';
        if (elements.thDiesel) elements.thDiesel.textContent = 'Diésel A';
        if (elements.thDieselPre) elements.thDieselPre.textContent = 'Diésel+';
        if (elements.thGLP) elements.thGLP.textContent = 'GLP';
    }
}

function calcularMediasCombustible(lista) {
    const sumas = { p95: 0, p98: 0, pDiesel: 0, pDieselPre: 0, pGLP: 0 };
    const conteos = { p95: 0, p98: 0, pDiesel: 0, pDieselPre: 0, pGLP: 0 };

    lista.forEach(e => {
        Object.keys(SORT_MAP).forEach(k => {
            const p = parsePrecio(e[SORT_MAP[k]]);
            if (p) {
                sumas[k] += p;
                conteos[k]++;
            }
        });
    });

    Object.keys(sumas).forEach(k => {
        mediasCombustible[k] = conteos[k] > 0 ? (sumas[k] / conteos[k]) : 0;
    });
}

function aplicarFiltros() {
    let resultado = [...estaciones];
    const seleccionCombustible = elements.sortSelect?.value || 'p95';
    const campoPrecio = SORT_MAP[seleccionCombustible];

    // 1. Filtro Solo Favoritos
    if (elements.favFilter?.checked) {
        resultado = resultado.filter(e => esFavorito(e.IDEESS));
    }

    // 2. Filtro Abiertas Ahora
    if (elements.openNowFilter?.checked) {
        resultado = resultado.filter(e => estaAbiertaAhora(e['Horario']));
    }

    // 3. Filtro Búsqueda de texto (Municipio, Rótulo, Provincia)
    const term = elements.searchInput?.value.toLowerCase().trim();
    if (term) {
        resultado = resultado.filter(e => 
            ['Rótulo', 'Municipio', 'Provincia'].some(key => (e[key] || '').toLowerCase().includes(term))
        );
    }

    // 4. Filtro por Marcas / Cadenas
    const marca = elements.brandSelect?.value || 'todas';
    if (marca !== 'todas') {
        resultado = resultado.filter(e => coincideMarca(e['Rótulo'], marca));
    }

    // 5. Filtro por precio válido si no es "todos"
    if (seleccionCombustible !== 'todos' && campoPrecio) {
        resultado = resultado.filter(e => {
            const precio = parsePrecio(e[campoPrecio]);
            return precio !== null;
        });
    }

    // 6. Filtro por Ubicación GPS / Radio
    if (coordsReferencia) {
        const radioMax = parseFloat(elements.rangeInput?.value) || 30;
        resultado = resultado.filter(e => {
            const latEst = toNum(e['Latitud']);
            const lonEst = toNum(e['Longitud (WGS84)']);
            if (latEst === null || lonEst === null) return false;
            const dist = calcularDistancia(coordsReferencia.lat, coordsReferencia.lon, latEst, lonEst);
            e.distanciaCalculada = dist;
            return dist <= radioMax;
        });
    }

    // 7. Ordenación
    resultado.sort((a, b) => {
        if (coordsReferencia) return a.distanciaCalculada - b.distanciaCalculada;
        if (seleccionCombustible !== 'todos' && campoPrecio) {
            const pA = parsePrecio(a[campoPrecio]) || 999;
            const pB = parsePrecio(b[campoPrecio]) || 999;
            return pA - pB;
        }
        return 0;
    });

    estacionesFiltradas = resultado;
    calcularMediasCombustible(estacionesFiltradas);
    actualizarEncabezadosTabla();

    if (elements.totalResultados) {
        elements.totalResultados.textContent = `${estacionesFiltradas.length.toLocaleString('es-ES')} estaciones`;
    }

    itemsMostrados = 0;
    if (elements.tableBody) elements.tableBody.innerHTML = '';
    cargarMasEstaciones();
}

function cargarMasEstaciones() {
    if (estacionesFiltradas.length === 0) {
        if (elements.tableBody) {
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="py-5 text-center">
                        <div class="empty-state-box py-4 px-3 mx-auto" style="max-width: 480px;">
                            <div class="empty-state-icon mb-3">
                                <i class="bi bi-search text-primary opacity-75" style="font-size: 2.5rem;"></i>
                            </div>
                            <h5 class="fw-bold mb-2">No hemos encontrado gasolineras con esos filtros</h5>
                            <p class="text-muted small mb-4">
                                Prueba a ampliar el radio de búsqueda, buscar por otra localidad o desactivar los filtros de "Abiertas ahora" o "Solo Favs".
                            </p>
                            <button class="btn btn-primary btn-sm px-4 shadow-sm rounded-pill" type="button" id="btnEmptyReset">
                                <i class="bi bi-arrow-counterclockwise me-1"></i> Restablecer filtros
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            const btnEmpty = document.getElementById('btnEmptyReset');
            if (btnEmpty) {
                btnEmpty.addEventListener('click', () => {
                    elements.btnResetFilters?.click();
                });
            }
        }
        return;
    }

    const lote = estacionesFiltradas.slice(itemsMostrados, itemsMostrados + PASO);
    renderRows(lote);
    itemsMostrados += PASO;
}

function generarBadgePrecio(precioStr, fuelKey) {
    const precio = parsePrecio(precioStr);
    if (!precio) {
        return '<span class="badge bg-secondary-subtle text-muted border border-light">--</span>';
    }

    const esModoTanque = elements.modeTank?.checked;
    const litros = parseInt(elements.tankCapacity?.value, 10) || 50;

    let badgeClass = 'bg-success text-light';
    if (fuelKey === 'pDiesel') badgeClass = 'bg-dark text-light';
    else if (fuelKey === 'pDieselPre') badgeClass = 'bg-warning text-dark';
    else if (fuelKey === 'pGLP') badgeClass = 'bg-info text-dark';

    if (!esModoTanque) {
        return `<span class="badge ${badgeClass} w-100 shadow-sm">${precio.toFixed(3)} €</span>`;
    }

    // Modo Tanque Total
    const costeTotal = precio * litros;
    const media = mediasCombustible[fuelKey];
    let ahorroHtml = '';

    if (media > 0) {
        const ahorro = (media - precio) * litros;
        if (ahorro > 0.1) {
            ahorroHtml = `<div class="text-success fw-bold" style="font-size: 0.68rem; margin-top: 1px;"><i class="bi bi-piggy-bank-fill me-1"></i>-${ahorro.toFixed(2)}€</div>`;
        } else if (ahorro < -0.3) {
            ahorroHtml = `<div class="text-danger" style="font-size: 0.68rem; margin-top: 1px;">+${Math.abs(ahorro).toFixed(2)}€ vs media</div>`;
        }
    }

    return `
        <div>
            <span class="badge ${badgeClass} w-100 shadow-sm">${costeTotal.toFixed(2)} €</span>
            ${ahorroHtml}
        </div>
    `;
}

function renderRows(data) {
    const fragment = document.createDocumentFragment();

    data.forEach(e => {
        const isFav = esFavorito(e.IDEESS);
        const distHtml = e.distanciaCalculada ? `<div class="text-danger fw-bold" style="font-size: 0.7rem;"><i class="bi bi-pin-map-fill me-1"></i>A ${e.distanciaCalculada.toFixed(1)} km</div>` : '';
        const latEst = toNum(e['Latitud']) || 0;
        const lonEst = toNum(e['Longitud (WGS84)']) || 0;
        const abierta = estaAbiertaAhora(e['Horario']);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <i class="bi ${isFav ? 'bi-star-fill text-warning' : 'bi-star text-muted'} fav-icon" onclick="toggleFav('${e.IDEESS}')" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}"></i>
            </td>
            <td class="text-start">
                <div class="fw-bold text-primary">${e['Rótulo']}</div>
                <div class="text-muted small" style="font-size: 0.75rem;">${e['Dirección']}</div>
                ${distHtml}
                <div class="d-flex align-items-center gap-1 mt-1">
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${latEst},${lonEst}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-outline-primary py-0 px-1 text-nowrap d-inline-flex align-items-center" style="font-size: 0.72rem; text-decoration: none;" title="Abrir ruta en Google Maps">
                        <i class="bi bi-cursor-fill me-1"></i> Cómo llegar
                    </a>
                    <a href="mapa.html?id=${e.IDEESS}&lat=${latEst}&lng=${lonEst}" class="btn btn-xs btn-outline-secondary py-0 px-1 text-nowrap d-inline-flex align-items-center" style="font-size: 0.72rem; text-decoration: none;" title="Localizar en el mapa">
                        <i class="bi bi-geo-alt-fill text-danger me-1"></i> Ver en mapa
                    </a>
                </div>
            </td>
            <td>${e['Municipio']}</td>
            <td>${generarBadgePrecio(e['Precio Gasolina 95 E5'], 'p95')}</td>
            <td>${generarBadgePrecio(e['Precio Gasolina 98 E5'], 'p98')}</td>
            <td>${generarBadgePrecio(e['Precio Gasoleo A'], 'pDiesel')}</td>
            <td>${generarBadgePrecio(e['Precio Gasoleo Premium'], 'pDieselPre')}</td>
            <td>${generarBadgePrecio(e['Precio Gases licuados del petróleo'], 'pGLP')}</td>
            <td>
                <div class="d-flex flex-column align-items-center">
                    <span class="badge ${abierta ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle'} mb-1" style="font-size: 0.65rem;">
                        ${abierta ? '<i class="bi bi-check-circle-fill me-1"></i>Abierta' : '<i class="bi bi-x-circle me-1"></i>Cerrada'}
                    </span>
                    <div class="text-muted" style="font-size: 0.7rem; line-height: 1.1;">${e['Horario']}</div>
                </div>
            </td>
        `;
        fragment.appendChild(row);
    });

    elements.tableBody.appendChild(fragment);
}

// Control GPS
elements.btnGPS?.addEventListener('click', () => {
    if (!navigator.geolocation) return showNotify("GPS no soportado", "error");

    if (elements.loader) elements.loader.style.display = 'block';
    elements.btnGPS.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    navigator.geolocation.getCurrentPosition((pos) => {
        coordsReferencia = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        elements.locationInput.value = "Mi ubicación actual";
        elements.btnLocation?.classList.replace('btn-primary', 'btn-success');
        elements.btnGPS.innerHTML = '<i class="bi bi-crosshair text-success"></i>';
        if (elements.loader) elements.loader.style.display = 'none';
        aplicarFiltros();
    }, () => {
        if (elements.loader) elements.loader.style.display = 'none';
        elements.btnGPS.innerHTML = '<i class="bi bi-crosshair"></i>';
        showNotify("Error al obtener GPS", "error");
    }, { enableHighAccuracy: true });
});

// Búsqueda por dirección / geocodificación
elements.btnLocation?.addEventListener('click', async () => {
    const query = elements.locationInput?.value.trim();
    if (!query || query === "Mi ubicación actual") {
        if (!query) coordsReferencia = null;
        elements.btnLocation.classList.add('btn-primary');
        elements.btnLocation.classList.remove('btn-success');
        return aplicarFiltros();
    }

    elements.btnLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=es`);
        const data = await resp.json();
        if (data.length > 0) {
            coordsReferencia = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            elements.btnLocation.classList.replace('btn-primary', 'btn-success');
            aplicarFiltros();
        } else {
            showNotify("No se encontró la ubicación indicada", "warning");
        }
    } catch (e) {
        showNotify("Error de conexión al geolocalizar", "error");
    } finally {
        elements.btnLocation.innerHTML = '<i class="bi bi-funnel"></i>';
    }
});

export function toggleFav(id) {
    toggleFavorito(id);
    favoritos = getFavoritos();
    aplicarFiltros();
}

// Botón Limpiar Filtros
elements.btnResetFilters?.addEventListener('click', () => {
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.locationInput) elements.locationInput.value = '';
    if (elements.sortSelect) elements.sortSelect.value = 'p95';
    if (elements.brandSelect) elements.brandSelect.value = 'todas';
    if (elements.openNowFilter) elements.openNowFilter.checked = false;
    if (elements.favFilter) elements.favFilter.checked = false;
    if (elements.rangeInput) elements.rangeInput.value = 30;
    if (elements.tankCapacity) elements.tankCapacity.value = 50;
    if (elements.modeLiter) elements.modeLiter.checked = true;

    coordsReferencia = null;
    elements.btnLocation?.classList.add('btn-primary');
    elements.btnLocation?.classList.remove('btn-success');
    elements.btnGPS?.querySelector('i')?.classList.remove('text-success');

    aplicarFiltros();
});

// Event Listeners para Filtros y Calculadora
elements.searchInput?.addEventListener('input', aplicarFiltros);
elements.sortSelect?.addEventListener('change', aplicarFiltros);
elements.brandSelect?.addEventListener('change', aplicarFiltros);
elements.openNowFilter?.addEventListener('change', aplicarFiltros);
elements.favFilter?.addEventListener('change', aplicarFiltros);
elements.rangeInput?.addEventListener('input', () => coordsReferencia && aplicarFiltros());

elements.modeLiter?.addEventListener('change', () => {
    actualizarEncabezadosTabla();
    itemsMostrados = 0;
    if (elements.tableBody) elements.tableBody.innerHTML = '';
    cargarMasEstaciones();
});

elements.modeTank?.addEventListener('change', () => {
    actualizarEncabezadosTabla();
    itemsMostrados = 0;
    if (elements.tableBody) elements.tableBody.innerHTML = '';
    cargarMasEstaciones();
});

elements.tankCapacity?.addEventListener('input', () => {
    if (elements.modeTank?.checked) {
        actualizarEncabezadosTabla();
        itemsMostrados = 0;
        if (elements.tableBody) elements.tableBody.innerHTML = '';
        cargarMasEstaciones();
    }
});

elements.tableContainer?.addEventListener('scroll', () => {
    const { scrollTop, clientHeight, scrollHeight } = elements.tableContainer;
    if (scrollTop + clientHeight >= scrollHeight - 120 && itemsMostrados < estacionesFiltradas.length) {
        cargarMasEstaciones();
    }
});

// Exposición global para llamadas onclick en filas de la tabla
window.toggleFav = toggleFav;

fetchData();
