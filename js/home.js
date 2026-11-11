/**
 * home.js - Lógica interactiva para la Landing Page de GasoES
 * Widget de Precios Medios en Vivo y Calculadora Interactiva de Ahorro
 */

import { getGasolineras } from './dataManager.js';
import { parsePrecio, toNum } from './utils.js';

// Estado de precios calculados (inicialmente nulos para mostrar spinners de carga reales)
const state = {
    estaciones: [],
    stats: {
        p95: null,
        p98: null,
        pDiesel: null,
        pDieselPre: null,
        pGLP: null
    },
    totalEstaciones: 0,
    selectedFuel: 'p95',
    tankLitres: 50,
    fillFrequencyPerMonth: 2
};

const FUEL_KEYS = {
    'p95': 'Precio Gasolina 95 E5',
    'p98': 'Precio Gasolina 98 E5',
    'pDiesel': 'Precio Gasoleo A',
    'pDieselPre': 'Precio Gasoleo Premium',
    'pGLP': 'Precio Gases licuados del petróleo'
};

const FUEL_NAMES = {
    'p95': 'Gasolina 95',
    'p98': 'Gasolina 98',
    'pDiesel': 'Diésel A',
    'pDieselPre': 'Diésel+',
    'pGLP': 'GLP Auto'
};

/**
 * Inicialización de la Landing Page
 */
document.addEventListener('DOMContentLoaded', () => {
    initHeroSearch();
    initCalculatorControls();
    cargarPreciosEnVivo();
});

/**
 * Buscador rápido de la Hero section
 */
function initHeroSearch() {
    const form = document.getElementById('heroSearchForm');
    const input = document.getElementById('heroSearchInput');
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const term = input.value.trim();
        if (term) {
            window.location.href = `listado.html?q=${encodeURIComponent(term)}`;
        } else {
            window.location.href = 'listado.html';
        }
    });
}

/**
 * Carga los datos de gasolineras y calcula las medias nacionales en tiempo real
 */
async function cargarPreciosEnVivo() {
    try {
        const datos = await getGasolineras();
        if (Array.isArray(datos) && datos.length > 0) {
            state.estaciones = datos;
            state.totalEstaciones = datos.length;
            calcularMediasNacionales(datos);
            renderWidgetPrecios();
            actualizarCalculadoraAhorro();
        }
    } catch (err) {
        console.warn('[home.js] No se pudieron calcular las medias en vivo:', err);
        // Dejar valores de referencia
        renderWidgetPrecios();
        actualizarCalculadoraAhorro();
    }
}

/**
 * Calcula media y precio mínimo por tipo de combustible
 */
function calcularMediasNacionales(estaciones) {
    const acumuladores = {
        p95: { suma: 0, count: 0, min: Infinity },
        p98: { suma: 0, count: 0, min: Infinity },
        pDiesel: { suma: 0, count: 0, min: Infinity },
        pDieselPre: { suma: 0, count: 0, min: Infinity },
        pGLP: { suma: 0, count: 0, min: Infinity }
    };

    estaciones.forEach(est => {
        for (const [fuelId, apiKey] of Object.entries(FUEL_KEYS)) {
            // El campo puede venir normalizado (est[fuelId]) o con el nombre de la API (est[apiKey])
            const rawVal = est[fuelId] !== undefined ? est[fuelId] : est[apiKey];
            const p = parsePrecio(rawVal);
            if (p && p > 0.6 && p < 3.5) { // filtro de plausibilidad
                acumuladores[fuelId].suma += p;
                acumuladores[fuelId].count++;
                if (p < acumuladores[fuelId].min) {
                    acumuladores[fuelId].min = p;
                }
            }
        }
    });

    for (const fuelId of Object.keys(FUEL_KEYS)) {
        const acc = acumuladores[fuelId];
        if (acc.count > 0) {
            state.stats[fuelId] = {
                avg: acc.suma / acc.count,
                min: acc.min !== Infinity ? acc.min : acc.suma / acc.count,
                count: acc.count
            };
        }
    }
}

/**
 * Renderiza los precios medios en las tarjetas del widget
 */
function renderWidgetPrecios() {
    for (const fuelId of Object.keys(FUEL_KEYS)) {
        const avgEl = document.getElementById(`avg-${fuelId}`);
        const minEl = document.getElementById(`min-${fuelId}`);
        const st = state.stats[fuelId];

        if (avgEl && st) {
            avgEl.innerHTML = `${st.avg.toFixed(3)} <span class="fuel-price-unit">€/L</span>`;
        }
        if (minEl && st) {
            minEl.textContent = `Mínimo: ${st.min.toFixed(3)} €/L`;
        }
    }

    const badgeEstaciones = document.getElementById('badgeTotalEstaciones');
    if (badgeEstaciones && state.totalEstaciones > 0) {
        badgeEstaciones.innerHTML = `<i class="bi bi-check-circle-fill text-success me-1"></i> ${state.totalEstaciones.toLocaleString('es-ES')} estaciones analizadas hoy`;
    }

    const lastUpdatedEl = document.getElementById('widgetLastUpdated');
    if (lastUpdatedEl) {
        const ahora = new Date();
        const horaStr = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        lastUpdatedEl.textContent = `Actualizado hoy a las ${horaStr}h con datos oficiales MITECO`;
    }
}

/**
 * Configura los eventos de la calculadora interactiva
 */
function initCalculatorControls() {
    // Selector de combustible
    const fuelRadios = document.querySelectorAll('input[name="calcFuel"]');
    fuelRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.selectedFuel = e.target.value;
            actualizarCalculadoraAhorro();
        });
    });

    // Selector rápido de litros (40L, 50L, 60L, 70L)
    const tankButtons = document.querySelectorAll('.btn-tank-preset');
    const customTankInput = document.getElementById('calcTankInput');

    tankButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tankButtons.forEach(b => b.classList.remove('active', 'btn-primary'));
            tankButtons.forEach(b => b.classList.add('btn-outline-primary'));
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline-primary');

            const val = parseInt(btn.getAttribute('data-litres'), 10);
            state.tankLitres = val;
            if (customTankInput) customTankInput.value = val;
            actualizarCalculadoraAhorro();
        });
    });

    if (customTankInput) {
        customTankInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 10 && val <= 150) {
                state.tankLitres = val;
                // Desmarcar presets si no coinciden
                tankButtons.forEach(b => {
                    const bVal = parseInt(b.getAttribute('data-litres'), 10);
                    if (bVal === val) {
                        b.classList.add('active', 'btn-primary');
                        b.classList.remove('btn-outline-primary');
                    } else {
                        b.classList.remove('active', 'btn-primary');
                        b.classList.add('btn-outline-primary');
                    }
                });
                actualizarCalculadoraAhorro();
            }
        });
    }

    // Frecuencia mensual de llenado
    const freqSelect = document.getElementById('calcFreqSelect');
    if (freqSelect) {
        freqSelect.addEventListener('change', (e) => {
            state.fillFrequencyPerMonth = parseInt(e.target.value, 10) || 2;
            actualizarCalculadoraAhorro();
        });
    }
}

/**
 * Calcula y actualiza el ahorro estimado por llenado y anual
 */
function actualizarCalculadoraAhorro() {
    const fuelData = state.stats[state.selectedFuel];
    if (!fuelData || !fuelData.avg || !fuelData.min) {
        // Datos en proceso de cálculo, mantener spinners
        return;
    }
    const avg = fuelData.avg;
    const min = fuelData.min;

    // Diferencia real entre la media nacional y la estación más económica del día
    const spreadReal = Math.max(0.05, avg - min);

    const ahorroPorDeposito = spreadReal * state.tankLitres;
    const ahorroAnual = ahorroPorDeposito * (state.fillFrequencyPerMonth * 12);
    const fuelName = FUEL_NAMES[state.selectedFuel] || 'combustible';

    const elAhorroDeposito = document.getElementById('calcAhorroDeposito');
    const elAhorroAnual = document.getElementById('calcAhorroAnual');
    const elSpreadInfo = document.getElementById('calcSpreadInfo');
    const btnIrMapaAhorro = document.getElementById('btnIrMapaAhorro');

    if (elAhorroDeposito) {
        elAhorroDeposito.textContent = `${ahorroPorDeposito.toFixed(2).replace('.', ',')} €`;
    }
    if (elAhorroAnual) {
        elAhorroAnual.textContent = `${Math.round(ahorroAnual).toLocaleString('es-ES')} € / año`;
    }
    if (elSpreadInfo) {
        elSpreadInfo.innerHTML = `<i class="bi bi-info-circle text-primary me-1"></i> Diferencia hoy en <strong>${fuelName}</strong>: ~<strong>${spreadReal.toFixed(2).replace('.', ',')} €/L</strong> (Media: ${avg.toFixed(3)} € vs Mínimo: ${min.toFixed(3)} €).`;
    }
    if (btnIrMapaAhorro) {
        btnIrMapaAhorro.href = `mapa.html?fuel=${state.selectedFuel}`;
    }
}
