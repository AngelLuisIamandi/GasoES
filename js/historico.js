/**
 * historico.js - Lógica interactiva para la página de Histórico, Comparador y Métricas de Almacenamiento.
 */

import { 
    obtenerFechasHistorico, 
    obtenerSnapshot, 
    guardarSnapshot, 
    eliminarSnapshot, 
    limpiarHistorico, 
    calcularEspacioHistorico, 
 
    getGasolineras, 
    formatearFechaISO,
    HISTORICO_STORE,
    openDB
} from './dataManager.js';

import { 
    getFavoritos, 
    esFavorito, 
    toggleFavorito, 
    showNotify, 
    toNum, 
    parsePrecio, 
    formatPrecio 
} from './utils.js';

// Configuración de metadatos de los carburantes
const COMBUSTIBLES = {
    'p95': { nombre: 'Gasolina 95', color: '#198754', border: '#198754', bg: 'rgba(25, 135, 84, 0.1)' },
    'p98': { nombre: 'Gasolina 98', color: '#0d6efd', border: '#0d6efd', bg: 'rgba(13, 110, 253, 0.1)' },
    'pDiesel': { nombre: 'Diésel A', color: '#212529', border: '#212529', bg: 'rgba(33, 37, 41, 0.1)' },
    'pDieselPre': { nombre: 'Diésel+', color: '#fd7e14', border: '#fd7e14', bg: 'rgba(253, 126, 20, 0.1)' },
    'pGLP': { nombre: 'GLP', color: '#6f42c1', border: '#6f42c1', bg: 'rgba(111, 66, 193, 0.1)' }
};

// Estado reactivo de la aplicación
const state = {
    fechas: [],
    fechaA: null,
    fechaB: null,
    snapshotA: null,
    snapshotB: null,
    combustibleSeleccionado: 'p95',
    filtroTexto: '',
    filtroSoloFavs: false,
    ordenTabla: 'mayorBajada',
    paginaActual: 1,
    itemsPorPagina: 40,
    estacionesComparadas: [],
    todasLasEstacionesCatalogo: [],
    chartInstance: null,
    modalBorrar: null
};

// Referencias del DOM
const dom = {
    kpiFechas: document.getElementById('kpi-fechas'),
    kpiEspacio: document.getElementById('kpi-espacio'),
    kpiUltima: document.getElementById('kpi-ultima'),
    kpiCuota: document.getElementById('kpi-cuota'),
    barCuota: document.getElementById('bar-cuota'),
    btnImportarJson: document.getElementById('btnImportarJson'),
    inputImportarJson: document.getElementById('inputImportarJson'),
    btnExportarJson: document.getElementById('btnExportarJson'),
    btnAbrirModalBorrar: document.getElementById('btnAbrirModalBorrar'),
    btnConfirmarBorrado: document.getElementById('btnConfirmarBorrado'),
    btnRefrescarMetricas: document.getElementById('btnRefrescarMetricas'),
    alertaPocosDatos: document.getElementById('alertaPocosDatos'),
    selectFechaA: document.getElementById('selectFechaA'),
    selectFechaB: document.getElementById('selectFechaB'),
    resumenMediasNacionales: document.getElementById('resumenMediasNacionales'),
    btnGroupCombustibles: document.getElementById('btnGroupCombustibles'),
    filtroBuscador: document.getElementById('filtroBuscador'),
    filtroSoloFavs: document.getElementById('filtroSoloFavs'),
    selectOrdenTabla: document.getElementById('selectOrdenTabla'),
    conteoEstaciones: document.getElementById('conteoEstaciones'),
    tbodyComparativa: document.getElementById('tbodyComparativa'),
    thPrecioA: document.getElementById('thPrecioA'),
    thPrecioB: document.getElementById('thPrecioB'),
    infoPaginacion: document.getElementById('infoPaginacion'),
    btnPagAnterior: document.getElementById('btnPagAnterior'),
    btnPagSiguiente: document.getElementById('btnPagSiguiente'),
    selectScopeGrafica: document.getElementById('selectScopeGrafica'),
    wrapperSelectorEstacion: document.getElementById('wrapperSelectorEstacion'),
    selectEstacionConcreta: document.getElementById('selectEstacionConcreta'),
    chartHistoricoCanvas: document.getElementById('chartHistorico')
};

/**
 * Inicialización al cargar el módulo.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar modal Bootstrap
    const modalEl = document.getElementById('modalBorrarHistorico');
    if (modalEl && window.bootstrap?.Modal) {
        state.modalBorrar = new window.bootstrap.Modal(modalEl);
    }

    vincularEventos();

    // Sincronizar catálogo base y snapshot del día si está vacío
    try {
        await getGasolineras();
    } catch (e) {
        console.warn("No se pudo pre-cargar datos del servidor:", e);
    }

    await refrescarTodo();
});

/**
 * Enlaza los escuchadores de eventos de la interfaz.
 */
function vincularEventos() {
    // Métricas y acciones de almacenamiento
    dom.btnRefrescarMetricas?.addEventListener('click', () => {
        actualizarMetricas();
        showNotify("Métricas de almacenamiento actualizadas", "info");
    });

    dom.btnImportarJson?.addEventListener('click', () => {
        dom.inputImportarJson?.click();
    });

    dom.inputImportarJson?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await importarHistoricoJSON(file);
        }
    });

    dom.btnExportarJson?.addEventListener('click', exportarHistoricoJSON);

    dom.btnAbrirModalBorrar?.addEventListener('click', () => {
        state.modalBorrar?.show();
    });

    dom.btnConfirmarBorrado?.addEventListener('click', async () => {
        try {
            await limpiarHistorico();
            state.modalBorrar?.hide();
            showNotify("Histórico vaciado correctamente", "info");
            await refrescarTodo();
        } catch (e) {
            console.error("Error al vaciar histórico:", e);
            showNotify("Error al vaciar histórico: " + e, "error");
        }
    });

    // Comparador: Selectores de fecha
    dom.selectFechaA?.addEventListener('change', (e) => {
        state.fechaA = e.target.value;
        cargarComparacionFechas();
    });

    dom.selectFechaB?.addEventListener('change', (e) => {
        state.fechaB = e.target.value;
        cargarComparacionFechas();
    });

    // Botones de filtro de combustible
    dom.btnGroupCombustibles?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-fuel]');
        if (!btn) return;
        dom.btnGroupCombustibles.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.combustibleSeleccionado = btn.dataset.fuel;
        state.paginaActual = 1;
        procesarYRenderizarTabla();
    });

    // Buscador con debounce simple
    let debounceTimer = null;
    dom.filtroBuscador?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.filtroTexto = e.target.value.toLowerCase().trim();
            state.paginaActual = 1;
            procesarYRenderizarTabla();
        }, 250);
    });

    // Filtro solo favoritas
    dom.filtroSoloFavs?.addEventListener('change', (e) => {
        state.filtroSoloFavs = e.target.checked;
        state.paginaActual = 1;
        procesarYRenderizarTabla();
    });

    // Orden de la tabla
    dom.selectOrdenTabla?.addEventListener('change', (e) => {
        state.ordenTabla = e.target.value;
        state.paginaActual = 1;
        procesarYRenderizarTabla();
    });

    // Paginación
    dom.btnPagAnterior?.addEventListener('click', () => {
        if (state.paginaActual > 1) {
            state.paginaActual--;
            renderizarPaginaTabla();
        }
    });

    dom.btnPagSiguiente?.addEventListener('click', () => {
        const totalPags = Math.ceil(state.estacionesFiltradas.length / state.itemsPorPagina) || 1;
        if (state.paginaActual < totalPags) {
            state.paginaActual++;
            renderizarPaginaTabla();
        }
    });

    // Gráfica: Ámbito y estación concreta
    dom.selectScopeGrafica?.addEventListener('change', (e) => {
        const scope = e.target.value;
        if (scope === 'estacion') {
            dom.wrapperSelectorEstacion?.classList.remove('d-none');
        } else {
            dom.wrapperSelectorEstacion?.classList.add('d-none');
        }
        actualizarGrafica();
    });

    dom.selectEstacionConcreta?.addEventListener('change', () => {
        actualizarGrafica();
    });

    // Checkboxes de combustibles en la gráfica
    document.querySelectorAll('.check-grafica-comb').forEach(chk => {
        chk.addEventListener('change', () => {
            actualizarGrafica();
        });
    });
}

/**
 * Refresca todas las secciones de la página.
 */
async function refrescarTodo() {
    await actualizarMetricas();
    await cargarFechasDisponibles();
    await actualizarGrafica();
}

/**
 * Actualiza las tarjetas KPI de métricas de almacenamiento.
 */
async function actualizarMetricas() {
    try {
        const metricas = await calcularEspacioHistorico();
        if (dom.kpiFechas) dom.kpiFechas.textContent = `${metricas.totalFechas} ${metricas.totalFechas === 1 ? 'día' : 'días'}`;
        if (dom.kpiEspacio) dom.kpiEspacio.textContent = metricas.tamanoFormateado;
        if (dom.kpiUltima) dom.kpiUltima.textContent = metricas.ultimaCaptura;

        if (dom.kpiCuota) {
            if (metricas.cuotaBytes) {
                dom.kpiCuota.textContent = `${metricas.usoTotalFormateado} / ${metricas.cuotaFormateada}`;
            } else {
                dom.kpiCuota.textContent = `${metricas.tamanoFormateado} (IndexedDB)`;
            }
        }

        if (dom.barCuota && metricas.porcentajeUso !== '--') {
            dom.barCuota.style.width = metricas.porcentajeUso;
        }

        // Mostrar u ocultar alerta de pocos datos
        if (dom.alertaPocosDatos) {
            if (metricas.totalFechas < 2) {
                dom.alertaPocosDatos.classList.remove('d-none');
                dom.alertaPocosDatos.classList.add('d-flex');
            } else {
                dom.alertaPocosDatos.classList.add('d-none');
                dom.alertaPocosDatos.classList.remove('d-flex');
            }
        }
    } catch (e) {
        console.error("Error al actualizar métricas:", e);
    }
}

/**
 * Carga las fechas disponibles en los selectores y prepara el comparador.
 */
async function cargarFechasDisponibles() {
    try {
        state.fechas = await obtenerFechasHistorico();

        dom.selectFechaA.innerHTML = '';
        dom.selectFechaB.innerHTML = '';

        if (!state.fechas || state.fechas.length === 0) {
            dom.selectFechaA.innerHTML = '<option value="">No hay fechas guardadas</option>';
            dom.selectFechaB.innerHTML = '<option value="">No hay fechas guardadas</option>';
            limpiarVistaComparador();
            return;
        }

        state.fechas.forEach(f => {
            const optA = document.createElement('option');
            optA.value = f;
            optA.textContent = formatearFechaLegible(f);
            dom.selectFechaA.appendChild(optA);

            const optB = document.createElement('option');
            optB.value = f;
            optB.textContent = formatearFechaLegible(f);
            dom.selectFechaB.appendChild(optB);
        });

        // Configuración por defecto: fechaA = penúltima (o primera), fechaB = última
        if (state.fechas.length >= 2) {
            state.fechaA = state.fechas[state.fechas.length - 2];
            state.fechaB = state.fechas[state.fechas.length - 1];
        } else {
            state.fechaA = state.fechas[0];
            state.fechaB = state.fechas[0];
        }

        dom.selectFechaA.value = state.fechaA;
        dom.selectFechaB.value = state.fechaB;

        await cargarComparacionFechas();
        poblarSelectorEstacionesParaGrafica();
    } catch (e) {
        console.error("Error al cargar fechas:", e);
    }
}

/**
 * Carga los snapshots de las fechas A y B seleccionadas y renderiza comparativa.
 */
async function cargarComparacionFechas() {
    if (!state.fechaA || !state.fechaB) {
        limpiarVistaComparador();
        return;
    }

    if (dom.thPrecioA) dom.thPrecioA.textContent = `Precio (${formatearFechaCorta(state.fechaA)})`;
    if (dom.thPrecioB) dom.thPrecioB.textContent = `Precio (${formatearFechaCorta(state.fechaB)})`;

    try {
        state.snapshotA = await obtenerSnapshot(state.fechaA);
        state.snapshotB = await obtenerSnapshot(state.fechaB);

        const estacionesA = state.snapshotA?.estaciones || [];
        const estacionesB = state.snapshotB?.estaciones || [];

        // Guardar catálogo combinado para selectores
        if (estacionesB.length > 0) {
            state.todasLasEstacionesCatalogo = estacionesB;
        } else if (estacionesA.length > 0) {
            state.todasLasEstacionesCatalogo = estacionesA;
        }

        renderizarResumenMedias(estacionesA, estacionesB);
        construirComparativaEstaciones(estacionesA, estacionesB);
        procesarYRenderizarTabla();
    } catch (e) {
        console.error("Error al comparar fechas:", e);
        showNotify("Error al comparar los snapshots de las fechas seleccionadas", "error");
    }
}

/**
 * Calcula y renderiza el resumen de subida/bajada media nacional por combustible.
 */
function renderizarResumenMedias(estacionesA, estacionesB) {
    if (!dom.resumenMediasNacionales) return;
    dom.resumenMediasNacionales.innerHTML = '';

    const calcularMedia = (lista, fuelKey) => {
        let suma = 0;
        let conteo = 0;
        for (const e of lista) {
            const p = e[fuelKey];
            if (p !== null && p !== undefined && p > 0) {
                suma += p;
                conteo++;
            }
        }
        return conteo > 0 ? suma / conteo : null;
    };

    Object.keys(COMBUSTIBLES).forEach(fuelKey => {
        const info = COMBUSTIBLES[fuelKey];
        const mediaA = calcularMedia(estacionesA, fuelKey);
        const mediaB = calcularMedia(estacionesB, fuelKey);

        const col = document.createElement('div');
        col.className = 'col-6 col-md-4 col-lg';

        let contenidoVariacion = '';
        if (mediaA !== null && mediaB !== null) {
            const delta = mediaB - mediaA;
            const porcentaje = mediaA > 0 ? (delta / mediaA) * 100 : 0;
            const signo = delta > 0 ? '+' : '';
            const deltaTexto = `${signo}${delta.toFixed(3)} €/L`;
            const porcTexto = `${signo}${porcentaje.toFixed(2)}%`;

            let badgeClase = 'delta-neutral';
            let icono = 'bi-dash';

            if (delta < -0.0001) {
                badgeClase = 'delta-down';
                icono = 'bi-arrow-down-right';
            } else if (delta > 0.0001) {
                badgeClase = 'delta-up';
                icono = 'bi-arrow-up-right';
            }

            contenidoVariacion = `
                <div class="d-flex justify-content-between align-items-baseline mt-2">
                    <span class="small text-muted" style="font-size: 0.72rem;">${mediaA.toFixed(3)} € &rarr; ${mediaB.toFixed(3)} €</span>
                </div>
                <div class="mt-1">
                    <span class="delta-badge ${badgeClase}" style="font-size: 0.75rem;">
                        <i class="bi ${icono}"></i> ${deltaTexto} (${porcTexto})
                    </span>
                </div>
            `;
        } else {
            contenidoVariacion = `
                <div class="small text-muted mt-2">Sin datos suficientes</div>
            `;
        }

        col.innerHTML = `
            <div class="fuel-pill-badge h-100">
                <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="fw-bold" style="color: ${info.color}; font-size: 0.85rem;">${info.nombre}</span>
                    <span class="badge rounded-pill border fuel-badge-label" style="font-size: 0.65rem;">Media</span>
                </div>
                ${contenidoVariacion}
            </div>
        `;

        dom.resumenMediasNacionales.appendChild(col);
    });
}

/**
 * Cruza las estaciones de Fecha A y Fecha B por IDEESS calculando las diferencias de precio.
 */
function construirComparativaEstaciones(estacionesA, estacionesB) {
    const mapaA = new Map();
    for (const ea of estacionesA) {
        if (ea.IDEESS) mapaA.set(String(ea.IDEESS), ea);
    }

    const mapaB = new Map();
    for (const eb of estacionesB) {
        if (eb.IDEESS) mapaB.set(String(eb.IDEESS), eb);
    }

    // Unir IDs de ambas fechas
    const todosIDs = new Set([...mapaA.keys(), ...mapaB.keys()]);
    state.estacionesComparadas = [];

    todosIDs.forEach(id => {
        const stA = mapaA.get(id);
        const stB = mapaB.get(id);
        const ref = stB || stA;

        const deltas = {};
        const porcentajes = {};

        Object.keys(COMBUSTIBLES).forEach(fuel => {
            const pA = stA ? stA[fuel] : null;
            const pB = stB ? stB[fuel] : null;

            if (pA !== null && pB !== null && pA > 0 && pB > 0) {
                const diff = pB - pA;
                deltas[fuel] = Math.round(diff * 1000) / 1000;
                porcentajes[fuel] = (diff / pA) * 100;
            } else {
                deltas[fuel] = null;
                porcentajes[fuel] = null;
            }
        });

        state.estacionesComparadas.push({
            IDEESS: String(id),
            rotulo: ref['Rótulo'] || 'Estación de Servicio',
            municipio: ref['Municipio'] || '',
            provincia: ref['Provincia'] || '',
            stA,
            stB,
            deltas,
            porcentajes
        });
    });
}

/**
 * Filtra, ordena y pagina las estaciones para renderizar la tabla.
 */
function procesarYRenderizarTabla() {
    const fuel = state.combustibleSeleccionado;
    const favs = getFavoritos();

    let filtradas = state.estacionesComparadas.filter(item => {
        // Filtro de favoritos
        if (state.filtroSoloFavs && !favs.has(item.IDEESS)) {
            return false;
        }

        // Filtro de texto (rótulo, municipio, provincia)
        if (state.filtroTexto) {
            const match = item.rotulo.toLowerCase().includes(state.filtroTexto) ||
                          item.municipio.toLowerCase().includes(state.filtroTexto) ||
                          item.provincia.toLowerCase().includes(state.filtroTexto);
            if (!match) return false;
        }

        // Solo mostrar estaciones que tengan precio en al menos una de las dos fechas para este combustible
        const pA = item.stA ? item.stA[fuel] : null;
        const pB = item.stB ? item.stB[fuel] : null;
        return (pA !== null && pA > 0) || (pB !== null && pB > 0);
    });

    // Ordenación
    filtradas.sort((a, b) => {
        const deltaA = a.deltas[fuel];
        const deltaB = b.deltas[fuel];
        const pB_A = a.stB ? a.stB[fuel] : null;
        const pB_B = b.stB ? b.stB[fuel] : null;

        if (state.ordenTabla === 'mayorBajada') {
            // Bajada mayor = delta más negativo primero
            if (deltaA === null && deltaB === null) return 0;
            if (deltaA === null) return 1;
            if (deltaB === null) return -1;
            return deltaA - deltaB;
        } else if (state.ordenTabla === 'mayorSubida') {
            // Subida mayor = delta más positivo primero
            if (deltaA === null && deltaB === null) return 0;
            if (deltaA === null) return 1;
            if (deltaB === null) return -1;
            return deltaB - deltaA;
        } else if (state.ordenTabla === 'masBaratoB') {
            if (pB_A === null && pB_B === null) return 0;
            if (pB_A === null) return 1;
            if (pB_B === null) return -1;
            return pB_A - pB_B;
        } else {
            // Por rótulo
            return a.rotulo.localeCompare(b.rotulo);
        }
    });

    state.estacionesFiltradas = filtradas;
    if (dom.conteoEstaciones) {
        dom.conteoEstaciones.textContent = `Mostrando ${filtradas.length} estaciones con precio en ${COMBUSTIBLES[fuel].nombre}`;
    }

    renderizarPaginaTabla();
}

/**
 * Renderiza el bloque paginado actual de la tabla comparativa.
 */
function renderizarPaginaTabla() {
    if (!dom.tbodyComparativa) return;
    const fuel = state.combustibleSeleccionado;
    const favs = getFavoritos();

    const totalItems = state.estacionesFiltradas.length;
    const totalPags = Math.max(1, Math.ceil(totalItems / state.itemsPorPagina));
    state.paginaActual = Math.min(state.paginaActual, totalPags);

    const inicio = (state.paginaActual - 1) * state.itemsPorPagina;
    const fin = Math.min(inicio + state.itemsPorPagina, totalItems);
    const paginaEstaciones = state.estacionesFiltradas.slice(inicio, fin);

    if (dom.infoPaginacion) {
        dom.infoPaginacion.textContent = `Página ${state.paginaActual} de ${totalPags} (${totalItems} estaciones)`;
    }
    if (dom.btnPagAnterior) dom.btnPagAnterior.disabled = (state.paginaActual <= 1);
    if (dom.btnPagSiguiente) dom.btnPagSiguiente.disabled = (state.paginaActual >= totalPags);

    if (paginaEstaciones.length === 0) {
        dom.tbodyComparativa.innerHTML = `
            <tr>
                <td colspan="6" class="py-5 text-center">
                    <div class="empty-state-box py-4 px-3 mx-auto" style="max-width: 480px;">
                        <div class="empty-state-icon mb-3">
                            <i class="bi bi-funnel text-primary opacity-75" style="font-size: 2.5rem;"></i>
                        </div>
                        <h5 class="fw-bold mb-2">No hay estaciones con esos filtros</h5>
                        <p class="text-muted small mb-0">
                            Prueba a cambiar el texto del buscador o desmarcar la casilla de solo favoritas.
                        </p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    for (const est of paginaEstaciones) {
        const esFav = favs.has(est.IDEESS);
        const pA = est.stA ? est.stA[fuel] : null;
        const pB = est.stB ? est.stB[fuel] : null;
        const delta = est.deltas[fuel];
        const porcentaje = est.porcentajes[fuel];

        const pATexto = pA ? `${pA.toFixed(3)} €` : '<span class="text-muted">--</span>';
        const pBTexto = pB ? `<strong>${pB.toFixed(3)} €</strong>` : '<span class="text-muted">--</span>';

        let badgeDiff = '<span class="text-muted">--</span>';
        let badgePorc = '<span class="text-muted">--</span>';

        if (delta !== null && delta !== undefined) {
            const signo = delta > 0 ? '+' : '';
            const diffFormatted = `${signo}${delta.toFixed(3)} €`;
            const porcFormatted = `${signo}${porcentaje.toFixed(2)}%`;

            let badgeClase = 'delta-neutral';
            let icono = 'bi-dash';

            if (delta < -0.0001) {
                badgeClase = 'delta-down';
                icono = 'bi-arrow-down-right';
            } else if (delta > 0.0001) {
                badgeClase = 'delta-up';
                icono = 'bi-arrow-up-right';
            }

            badgeDiff = `<span class="delta-badge ${badgeClase}"><i class="bi ${icono}"></i> ${diffFormatted}</span>`;
            badgePorc = `<span class="delta-badge ${badgeClase}">${porcFormatted}</span>`;
        }

        html += `
            <tr data-id="${est.IDEESS}">
                <td>
                    <i class="bi ${esFav ? 'bi-star-fill text-warning' : 'bi-star'} star-fav" 
                       data-id="${est.IDEESS}" 
                       title="${esFav ? 'Quitar de favoritas' : 'Añadir a favoritas'}"></i>
                </td>
                <td class="text-start">
                    <div class="fw-bold">${escapeHTML(est.rotulo)}</div>
                    <div class="text-muted small" style="font-size: 0.76rem;">
                        <i class="bi bi-geo-alt"></i> ${escapeHTML(est.municipio)}${est.provincia ? ', ' + escapeHTML(est.provincia) : ''}
                    </div>
                </td>
                <td>${pATexto}</td>
                <td>${pBTexto}</td>
                <td>${badgeDiff}</td>
                <td>${badgePorc}</td>
            </tr>
        `;
    }

    dom.tbodyComparativa.innerHTML = html;

    // Vincular toggle de favoritos en los iconos de estrella
    dom.tbodyComparativa.querySelectorAll('.star-fav').forEach(star => {
        star.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const ahoraFav = toggleFavorito(id);
            if (ahoraFav) {
                e.currentTarget.className = 'bi bi-star-fill text-warning star-fav';
                e.currentTarget.title = 'Quitar de favoritas';
            } else {
                e.currentTarget.className = 'bi bi-star star-fav';
                e.currentTarget.title = 'Añadir a favoritas';
            }
            if (state.filtroSoloFavs) {
                procesarYRenderizarTabla();
            }
        });
    });
}

/**
 * Limpia la vista del comparador cuando no hay fechas suficientes.
 */
function limpiarVistaComparador() {
    if (dom.resumenMediasNacionales) dom.resumenMediasNacionales.innerHTML = '';
    if (dom.tbodyComparativa) {
        dom.tbodyComparativa.innerHTML = `
            <tr>
                <td colspan="6" class="py-5 text-center">
                    <div class="empty-state-box py-4 px-3 mx-auto" style="max-width: 480px;">
                        <div class="empty-state-icon mb-3">
                            <i class="bi bi-calendar-range text-primary opacity-75" style="font-size: 2.5rem;"></i>
                        </div>
                        <h5 class="fw-bold mb-2">Se necesitan al menos dos fechas en el histórico</h5>
                        <p class="text-muted small mb-3">
                            Para realizar comparativas y calcular diferencias de precio necesitas al menos dos días guardados en el almacenamiento local.
                        </p>
                        <div class="d-flex justify-content-center gap-2">
                            <button type="button" class="btn btn-outline-success btn-sm rounded-pill px-3 shadow-sm" onclick="document.getElementById('btnImportarJson')?.click()">
                                <i class="bi bi-upload me-1"></i> Importar Datos (JSON)
                            </button>
                            <a href="#seccionAjustesDatos" class="btn btn-outline-secondary btn-sm rounded-pill px-3 shadow-sm">
                                <i class="bi bi-gear-wide-connected me-1"></i> Ver Ajustes
                            </a>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }
    if (dom.conteoEstaciones) dom.conteoEstaciones.textContent = 'Sin datos';
}

/**
 * Rellena el selector de estaciones para la gráfica de evolución temporal.
 */
function poblarSelectorEstacionesParaGrafica() {
    if (!dom.selectEstacionConcreta) return;
    dom.selectEstacionConcreta.innerHTML = '<option value="">-- Selecciona una estación --</option>';

    const estaciones = state.todasLasEstacionesCatalogo || [];
    const listaOrdenada = [...estaciones].sort((a, b) => {
        const rA = a['Rótulo'] || a.rotulo || '';
        const rB = b['Rótulo'] || b.rotulo || '';
        return rA.localeCompare(rB);
    });

    listaOrdenada.slice(0, 500).forEach(st => {
        const id = st.IDEESS;
        const rotulo = st['Rótulo'] || st.rotulo || 'Estación';
        const mun = st['Municipio'] || st.municipio || '';
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${rotulo} (${mun})`;
        dom.selectEstacionConcreta.appendChild(opt);
    });
}

/**
 * Actualiza la gráfica interactiva de Chart.js con la evolución histórica.
 */
async function actualizarGrafica() {
    if (!dom.chartHistoricoCanvas || typeof Chart === 'undefined') return;

    if (!state.fechas || state.fechas.length === 0) {
        if (state.chartInstance) {
            state.chartInstance.destroy();
            state.chartInstance = null;
        }
        return;
    }

    const scope = dom.selectScopeGrafica?.value || 'nacional';
    const estacionId = dom.selectEstacionConcreta?.value;
    const favs = getFavoritos();

    // Obtener qué combustibles están marcados con checkbox
    const combustiblesVisibles = [];
    document.querySelectorAll('.check-grafica-comb:checked').forEach(chk => {
        combustiblesVisibles.push(chk.value);
    });

    // Cargar todos los snapshots en orden cronológico
    const snapshots = [];
    for (const f of state.fechas) {
        const snap = await obtenerSnapshot(f);
        if (snap) snapshots.push(snap);
    }

    if (snapshots.length === 0) return;

    // Calcular valores por fecha y por combustible
    const etiquetas = snapshots.map(s => formatearFechaCorta(s.fecha));

    const datasets = combustiblesVisibles.map(fuelKey => {
        const info = COMBUSTIBLES[fuelKey];
        const dataPuntos = snapshots.map(s => {
            let estaciones = s.estaciones || [];

            if (scope === 'favoritas') {
                estaciones = estaciones.filter(e => favs.has(String(e.IDEESS)));
            } else if (scope === 'estacion' && estacionId) {
                estaciones = estaciones.filter(e => String(e.IDEESS) === String(estacionId));
            }

            if (estaciones.length === 0) return null;

            let suma = 0;
            let conteo = 0;
            for (const e of estaciones) {
                const p = e[fuelKey];
                if (p !== null && p !== undefined && p > 0) {
                    suma += p;
                    conteo++;
                }
            }

            return conteo > 0 ? Number((suma / conteo).toFixed(3)) : null;
        });

        return {
            label: info.nombre,
            data: dataPuntos,
            borderColor: info.border,
            backgroundColor: info.bg,
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true
        };
    });

    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    const tickColor = isDark ? '#adb5bd' : '#6c757d';
    const labelColor = isDark ? '#f8f9fa' : '#212529';

    const ctx = dom.chartHistoricoCanvas.getContext('2d');
    state.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: labelColor,
                        usePointStyle: true,
                        boxWidth: 8,
                        font: { family: "'Inter', sans-serif", size: 12, weight: 600 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(3) + ' €/L';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: tickColor, font: { family: "'Inter', sans-serif", size: 11 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: tickColor,
                        font: { family: "'Inter', sans-serif", size: 11 },
                        callback: function (val) {
                            return val.toFixed(2) + ' €';
                        }
                    }
                }
            }
        }
    });
}

/**
 * Exporta todos los registros históricos en un archivo JSON descargable.
 */
/**
 * Importa snapshots históricos desde un archivo JSON subido por el usuario.
 * @param {File} file
 */
async function importarHistoricoJSON(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
        showNotify("Por favor, selecciona un archivo en formato JSON (.json).", "warning");
        return;
    }

    try {
        showNotify("Procesando e importando datos históricos...", "info");
        const text = await file.text();
        const data = JSON.parse(text);

        let snapshots = [];
        if (Array.isArray(data)) {
            snapshots = data;
        } else if (data && typeof data === 'object') {
            if (Array.isArray(data.snapshots)) snapshots = data.snapshots;
            else if (Array.isArray(data.historico)) snapshots = data.historico;
            else if (data.fecha) snapshots = [data];
        }

        if (snapshots.length === 0) {
            showNotify("El archivo no contiene snapshots o datos históricos reconocibles.", "warning");
            return;
        }

        let importados = 0;
        for (const s of snapshots) {
            if (s && s.fecha) {
                const estaciones = Array.isArray(s.estaciones) ? s.estaciones : (Array.isArray(s) ? s : []);
                await guardarSnapshot(s.fecha, {
                    timestamp: s.timestamp || Date.now(),
                    estaciones: estaciones
                });
                importados++;
            }
        }

        if (importados > 0) {
            showNotify(`Se han importado ${importados} fecha(s) en el histórico con éxito.`, "success");
            await refrescarTodo();
        } else {
            showNotify("No se encontraron registros válidos con campo 'fecha' en el archivo.", "error");
        }
    } catch (err) {
        console.error("Error al importar histórico JSON:", err);
        showNotify("Error al procesar el archivo: " + (err.message || err), "error");
    } finally {
        if (dom.inputImportarJson) dom.inputImportarJson.value = '';
    }
}

async function exportarHistoricoJSON() {
    try {
        const db = await openDB();
        const snapshots = await new Promise((resolve, reject) => {
            const tx = db.transaction([HISTORICO_STORE], 'readonly');
            const store = tx.objectStore(HISTORICO_STORE);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e);
        });

        if (snapshots.length === 0) {
            showNotify("No hay registros en el histórico para exportar.", "warning");
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshots, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `gasoes_historico_${formatearFechaISO()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showNotify(`Histórico exportado correctamente (${snapshots.length} snapshots)`, "success");
    } catch (e) {
        console.error("Error exportando histórico:", e);
        showNotify("Error al exportar histórico a JSON", "error");
    }
}

/**
 * Formatea una fecha YYYY-MM-DD en texto legible (ej: "5 de nov, 2026").
 */
function formatearFechaLegible(fechaISO) {
    if (!fechaISO) return '';
    try {
        const [y, m, d] = fechaISO.split('-').map(Number);
        const fecha = new Date(y, m - 1, d);
        return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
        return fechaISO;
    }
}

/**
 * Formatea una fecha YYYY-MM-DD a formato corto DD/MM.
 */
function formatearFechaCorta(fechaISO) {
    if (!fechaISO) return '';
    try {
        const parts = fechaISO.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
        return fechaISO;
    } catch (_) {
        return fechaISO;
    }
}

/**
 * Escapa cadenas para prevenir inyecciones HTML en tablas.
 */
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Escuchar cambios de tema para redibujar la gráfica con los colores correctos de ejes
window.addEventListener('gaso_theme_changed', () => {
    if (state.chartInstance) {
        actualizarGrafica();
    }
});
