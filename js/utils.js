/**
 * utils.js - Módulo central de utilidades transversales para GasoES.
 */

// --- 1. Conversión numérica y formateo de precios ---

/**
 * Convierte un valor (string con comas, número, etc.) a número flotante válido o null.
 * @param {string|number|null|undefined} str
 * @returns {number|null}
 */
export function toNum(str) {
    if (str === null || str === undefined || str === '') return null;
    if (typeof str === 'number') return Number.isFinite(str) ? str : null;
    const cleanStr = String(str).replace(',', '.').trim();
    const num = parseFloat(cleanStr);
    return Number.isFinite(num) ? num : null;
}

/**
 * Parsea un precio asegurando que sea un número positivo válido.
 * @param {string|number} str
 * @returns {number|null}
 */
export function parsePrecio(str) {
    const num = toNum(str);
    return (num !== null && num > 0) ? num : null;
}

/**
 * Formatea un precio para visualización en modo litro o modo llenado de depósito.
 * @param {string|number|null} v - Precio por litro
 * @param {'liter'|'tank'} [modo='liter'] - 'liter' para €/L, 'tank' para coste total
 * @param {number} [capacidad=50] - Capacidad del depósito en litros
 * @returns {string} Fragmento HTML con el precio formateado
 */
export function formatPrecio(v, modo = 'liter', capacidad = 50) {
    const num = toNum(v);
    if (num === null || num <= 0) {
        return '<span class="text-muted">--</span>';
    }
    if (modo === 'tank') {
        const cap = Number(capacidad) || 50;
        const total = (num * cap).toFixed(2);
        return `<b>${total} €</b>`;
    }
    // modo 'liter'
    return `<b>${num.toFixed(3)} €</b>`;
}

// --- 2. Cálculo de Distancia Geográfica (Haversine) ---

/**
 * Calcula la distancia en kilómetros entre dos coordenadas usando la fórmula de Haversine.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distancia en kilómetros
 */
export function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// --- 3. Horarios y Disponibilidad ---

const DIAS_SEMANA_MAP = { 'L': 1, 'M': 2, 'X': 3, 'J': 4, 'V': 5, 'S': 6, 'D': 0 };

function parseHoraMinutos(t) {
    if (!t) return 0;
    const parts = t.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Comprueba de forma robusta si una estación está abierta según su cadena de horario del Ministerio.
 * @param {string} horarioStr - Cadena devuelta por la API (ej: "L-D: 24H", "L-S: 07:00-22:00; D: 08:00-14:00")
 * @param {Date} [fechaReferencia=new Date()] - Fecha y hora actual
 * @returns {boolean} true si está abierta o no se puede descartar con certeza; false si está cerrada.
 */
export function estaAbiertaAhora(horarioStr, fechaReferencia = new Date()) {
    if (!horarioStr) return true;
    const hUpper = horarioStr.toUpperCase().trim();

    // Comprobación rápida para 24 Horas
    if (hUpper.includes('24H') || hUpper.includes('24 H') || hUpper.includes('24 HORAS') || hUpper.includes('00:00-24:00') || hUpper.includes('00:00-23:59')) {
        if (hUpper === '24H' || hUpper.startsWith('L-D: 24') || hUpper === '24 HORAS' || hUpper.includes('L-D: 24H')) {
            return true;
        }
    }

    const currentDay = fechaReferencia.getDay(); // 0 = Domingo, 1 = Lunes, ...
    const currentMins = fechaReferencia.getHours() * 60 + fechaReferencia.getMinutes();

    // Las secciones de días vienen separadas por ';'
    const sections = hUpper.split(';');
    let dayMatched = false;

    for (const sec of sections) {
        const parts = sec.split(':');
        if (parts.length < 2) continue;
        const daysPart = parts[0].trim();
        const timePart = parts.slice(1).join(':').trim();

        let applies = false;
        if (daysPart.includes('-')) {
            const range = daysPart.split('-').map(s => s.trim());
            const startIdx = DIAS_SEMANA_MAP[range[0]];
            const endIdx = DIAS_SEMANA_MAP[range[1]];
            if (startIdx !== undefined && endIdx !== undefined) {
                let sVal = startIdx === 0 ? 7 : startIdx;
                let eVal = endIdx === 0 ? 7 : endIdx;
                let cVal = currentDay === 0 ? 7 : currentDay;
                if (sVal <= eVal) {
                    applies = cVal >= sVal && cVal <= eVal;
                } else {
                    applies = cVal >= sVal || cVal <= eVal;
                }
            }
        } else if (daysPart.includes(',')) {
            const list = daysPart.split(',').map(s => s.trim());
            applies = list.some(d => DIAS_SEMANA_MAP[d] === currentDay);
        } else if (DIAS_SEMANA_MAP[daysPart] !== undefined) {
            applies = (DIAS_SEMANA_MAP[daysPart] === currentDay);
        }

        if (applies) {
            dayMatched = true;
            if (timePart.includes('CERRADO')) return false;
            if (timePart.includes('24H') || timePart.includes('24 HORAS') || timePart.includes('00:00-24:00') || timePart.includes('00:00-23:59')) {
                return true;
            }

            // Múltiples turnos tipo: "08:00-14:00 y 16:00-20:00"
            const intervals = timePart.split(/ y | Y /);
            for (const interval of intervals) {
                const match = interval.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
                if (match) {
                    const startMin = parseHoraMinutos(match[1]);
                    let endMin = parseHoraMinutos(match[2]);
                    if (endMin === 0 || endMin < startMin) {
                        // Cierra a medianoche o madrugada del día siguiente
                        if (currentMins >= startMin || currentMins <= endMin) return true;
                    } else {
                        if (currentMins >= startMin && currentMins <= endMin) return true;
                    }
                }
            }
            return false;
        }
    }

    // Si contiene 24H en cualquier parte y no hemos emparejado un día explícito cerrado
    if (hUpper.includes('24H') || hUpper.includes('24 HORAS')) return true;

    // Si el formato no se pudo determinar con certeza para el día actual, no descartar
    return !dayMatched;
}

// --- 4. Clasificación de Marcas ---

export const TRADICIONALES = ['REPSOL', 'CEPSA', 'MOEVE', 'BP', 'SHELL', 'GALP', 'CAMPSA', 'PETRONOR'];
export const LOW_COST = [
    'PLENOIL', 'PLENERGY', 'BALLENOIL', 'PETROPRIX', 'BEROIL', 'GASEXPRESS', 
    'BONAREA', 'ALCAMPO', 'CARREFOUR', 'ESCLATOIL', 'EROSKI', 'COSTCO', 
    'AUTONETOIL', 'FAMILY ENERGY', 'FAST FUEL'
];

/**
 * Clasifica una gasolinera según su rótulo en 'tradicionales', 'lowcost' u 'otra'.
 * @param {string} rotulo
 * @returns {'tradicionales'|'lowcost'|'otra'}
 */
export function clasificarMarca(rotulo) {
    if (!rotulo) return 'otra';
    const r = rotulo.toUpperCase();
    if (TRADICIONALES.some(b => r.includes(b))) return 'tradicionales';
    if (LOW_COST.some(b => r.includes(b))) return 'lowcost';
    return 'otra';
}

/**
 * Comprueba si un rótulo coincide con un filtro de marca seleccionado.
 * @param {string} rotulo
 * @param {string} filtroMarca
 * @returns {boolean}
 */
export function coincideMarca(rotulo, filtroMarca) {
    if (!filtroMarca || filtroMarca === 'todas') return true;
    if (!rotulo) return false;
    const r = rotulo.toUpperCase();
    if (filtroMarca === 'tradicionales') {
        return TRADICIONALES.some(b => r.includes(b));
    }
    if (filtroMarca === 'lowcost') {
        return LOW_COST.some(b => r.includes(b));
    }
    if (filtroMarca === 'CEPSA') {
        return r.includes('CEPSA') || r.includes('MOEVE');
    }
    if (filtroMarca === 'PLENOIL') {
        return r.includes('PLENOIL') || r.includes('PLENERGY');
    }
    return r.includes(filtroMarca.toUpperCase());
}

// --- 5. Gestión Unificada de Favoritos ---

export const FAVS_STORAGE_KEY = 'gasoFavs';

/**
 * Obtiene el conjunto de IDs de estaciones favoritas almacenadas en localStorage.
 * @returns {Set<string>}
 */
export function getFavoritos() {
    try {
        const raw = localStorage.getItem(FAVS_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
        console.error("Error leyendo favoritos de localStorage:", e);
        return new Set();
    }
}

/**
 * Comprueba si una estación está marcada como favorita.
 * @param {string|number} id - IDEESS de la estación
 * @returns {boolean}
 */
export function esFavorito(id) {
    if (!id) return false;
    return getFavoritos().has(String(id));
}

/**
 * Alterna el estado de favorito de una estación y guarda los cambios en localStorage.
 * @param {string|number} id - IDEESS de la estación
 * @param {boolean} [notificar=true] - Si debe mostrar notificación toast
 * @returns {boolean} true si ahora es favorita, false si fue eliminada
 */
export function toggleFavorito(id, notificar = true) {
    if (!id) return false;
    const strId = String(id);
    const favs = getFavoritos();
    const yaEsFav = favs.has(strId);

    if (yaEsFav) {
        favs.delete(strId);
        if (notificar) showNotify("Eliminada de favoritos", "info");
    } else {
        favs.add(strId);
        if (notificar) showNotify("Añadida a favoritos", "success");
    }

    try {
        localStorage.setItem(FAVS_STORAGE_KEY, JSON.stringify([...favs]));
    } catch (e) {
        console.error("Error guardando favoritos en localStorage:", e);
    }

    return !yaEsFav;
}

// --- 6. Notificaciones Toast ---

/**
 * Muestra una notificación emergente tipo toast en la interfaz.
 * @param {string} mensaje
 * @param {'info'|'success'|'error'|'warning'} [tipo='info']
 * @param {string} [titulo='Aviso']
 */
export function showNotify(mensaje, tipo = 'info', titulo = 'Aviso') {
    const toastEl = document.getElementById('liveToast');
    if (!toastEl) {
        console.info(`[${tipo.toUpperCase()}] ${titulo}: ${mensaje}`);
        return;
    }
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastMessage');

    toastEl.className = 'toast hide border-0';

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

// --- Exposición global para compatibilidad con código HTML inline y extensiones ---
if (typeof window !== 'undefined') {
    window.toNum = toNum;
    window.parsePrecio = parsePrecio;
    window.formatPrecio = formatPrecio;
    window.calcularDistancia = calcularDistancia;
    window.estaAbiertaAhora = estaAbiertaAhora;
    window.clasificarMarca = clasificarMarca;
    window.coincideMarca = coincideMarca;
    window.TRADICIONALES = TRADICIONALES;
    window.LOW_COST = LOW_COST;
    window.getFavoritos = getFavoritos;
    window.esFavorito = esFavorito;
    window.toggleFavorito = toggleFavorito;
    window.showNotify = showNotify;
}
