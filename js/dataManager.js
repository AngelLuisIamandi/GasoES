/**
 * dataManager.js - Módulo de gestión, caché y snapshots históricos de gasolineras (IndexedDB + API Geoportal).
 */

import { estaAbiertaAhora, parsePrecio } from './utils.js';

export const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
export const DB_NAME = 'GasoESDB';
export const DB_VERSION = 2;
export const STORE_NAME = 'estaciones';
export const HISTORICO_STORE = 'historico_diario';
export const TIMESTAMP_KEY = 'gaso_last_update';
export const CACHE_TIME = 30 * 60 * 1000; // 30 minutos

/**
 * Formatea una fecha a formato ISO YYYY-MM-DD local.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function formatearFechaISO(date = new Date()) {
    const anio = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

/**
 * Abre la base de datos IndexedDB asegurando los objectStores necesarios.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
            if (!db.objectStoreNames.contains(HISTORICO_STORE)) {
                db.createObjectStore(HISTORICO_STORE, { keyPath: 'fecha' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject("Error abriendo IndexedDB: " + (e.target?.error || e));
    });
}

/**
 * Normaliza y optimiza una estación quedándose solo con los campos esenciales para el histórico.
 * @param {object} e - Datos brutos de la estación
 * @returns {object}
 */
export function optimizarEstacion(e) {
    return {
        IDEESS: String(e.IDEESS ?? e['IDEESS'] ?? ''),
        'Rótulo': e['Rótulo'] || e.Rotulo || e['rotulo'] || '',
        'Municipio': e['Municipio'] || e.Municipio || '',
        'Provincia': e['Provincia'] || e.Provincia || '',
        'Latitud': e['Latitud'] || e.Latitud || '',
        'Longitud (WGS84)': e['Longitud (WGS84)'] || e.Longitud || '',
        p95: parsePrecio(e['Precio Gasolina 95 E5'] ?? e.p95),
        p98: parsePrecio(e['Precio Gasolina 98 E5'] ?? e.p98),
        pDiesel: parsePrecio(e['Precio Gasoleo A'] ?? e.pDiesel),
        pDieselPre: parsePrecio(e['Precio Gasoleo Premium'] ?? e.pDieselPre),
        pGLP: parsePrecio(e['Precio Gases licuados del petróleo'] ?? e.pGLP)
    };
}

/**
 * Guarda los datos actuales en el almacén de caché de IndexedDB y registra el snapshot diario.
 * @param {Array<object>} data
 * @returns {Promise<void>}
 */
export async function guardarEnDB(data) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put(data, "lista_completa");
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject("Error guardando en IndexedDB: " + (e.target?.error || e));
    });

    // Guardar automáticamente snapshot del día actual en historico_diario
    try {
        const hoy = formatearFechaISO();
        await guardarSnapshot(hoy, { timestamp: Date.now(), estaciones: data });
    } catch (err) {
        console.warn("Aviso al guardar snapshot automático diario:", err);
    }
}

/**
 * Lee la lista completa en caché desde IndexedDB.
 * @returns {Promise<Array<object>|null>}
 */
export async function leerDeDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get("lista_completa");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject("Error leyendo de IndexedDB: " + (e.target?.error || e));
    });
}

/**
 * Limpia la caché local (localStorage e IndexedDB) forzando una recarga limpia en la próxima consulta.
 * @returns {Promise<boolean>}
 */
export async function limpiarCache() {
    try {
        localStorage.removeItem(TIMESTAMP_KEY);
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const req = store.delete("lista_completa");
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error("Error al limpiar caché:", e);
        return false;
    }
}

/**
 * Guarda un snapshot de estaciones para una fecha determinada en historico_diario.
 * @param {string} fecha - Formato YYYY-MM-DD
 * @param {object|Array} datos - Objeto { timestamp, estaciones } o Array de estaciones
 * @returns {Promise<object>}
 */
export async function guardarSnapshot(fecha, datos) {
    if (!fecha) throw new Error("Fecha no válida para guardar snapshot");
    const db = await openDB();
    const estacionesOrigen = Array.isArray(datos) ? datos : (datos?.estaciones || []);
    const timestamp = datos?.timestamp || Date.now();
    const estacionesOptimizadas = estacionesOrigen.map(optimizarEstacion);

    const registro = {
        fecha,
        timestamp,
        totalEstaciones: estacionesOptimizadas.length,
        estaciones: estacionesOptimizadas
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readwrite");
        const store = transaction.objectStore(HISTORICO_STORE);
        store.put(registro);
        transaction.oncomplete = () => resolve(registro);
        transaction.onerror = (e) => reject("Error guardando snapshot en IndexedDB: " + (e.target?.error || e));
    });
}

/**
 * Obtiene el snapshot guardado para una fecha determinada.
 * @param {string} fecha - Formato YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
export async function obtenerSnapshot(fecha) {
    if (!fecha) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readonly");
        const store = transaction.objectStore(HISTORICO_STORE);
        const req = store.get(fecha);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject("Error obteniendo snapshot de " + fecha + ": " + (e.target?.error || e));
    });
}

/**
 * Devuelve la lista de fechas (YYYY-MM-DD) almacenadas en el histórico ordenadas cronológicamente.
 * @returns {Promise<Array<string>>}
 */
export async function obtenerFechasHistorico() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readonly");
        const store = transaction.objectStore(HISTORICO_STORE);
        const req = store.getAllKeys();
        req.onsuccess = () => {
            const keys = (req.result || []).map(String).sort();
            resolve(keys);
        };
        req.onerror = (e) => reject("Error obteniendo fechas del histórico: " + (e.target?.error || e));
    });
}

/**
 * Elimina el snapshot de una fecha específica.
 * @param {string} fecha - Formato YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
export async function eliminarSnapshot(fecha) {
    if (!fecha) return false;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readwrite");
        const store = transaction.objectStore(HISTORICO_STORE);
        store.delete(fecha);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (e) => reject("Error eliminando snapshot de " + fecha + ": " + (e.target?.error || e));
    });
}

/**
 * Borra todos los snapshots del almacén historico_diario.
 * @returns {Promise<boolean>}
 */
export async function limpiarHistorico() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readwrite");
        const store = transaction.objectStore(HISTORICO_STORE);
        store.clear();
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (e) => reject("Error vaciando histórico: " + (e.target?.error || e));
    });
}

/**
 * Calcula métricas detalladas de almacenamiento del histórico y cuota del navegador.
 * @returns {Promise<object>}
 */
export async function calcularEspacioHistorico() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([HISTORICO_STORE], "readonly");
        const store = transaction.objectStore(HISTORICO_STORE);
        const req = store.getAll();
        req.onsuccess = async () => {
            const records = req.result || [];
            const totalFechas = records.length;
            let totalBytes = 0;
            let ultimaCaptura = null;

            for (const rec of records) {
                if (!ultimaCaptura || rec.fecha > ultimaCaptura) {
                    ultimaCaptura = rec.fecha;
                }
                try {
                    const str = JSON.stringify(rec);
                    totalBytes += new Blob([str]).size;
                } catch (e) {
                    totalBytes += 1.5 * 1024 * 1024;
                }
            }

            let cuota = null;
            let usoTotalNavegador = null;
            if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
                try {
                    const est = await navigator.storage.estimate();
                    cuota = est.quota || null;
                    usoTotalNavegador = est.usage || null;
                } catch (e) {
                    console.warn("navigator.storage.estimate no disponible:", e);
                }
            }

            const mb = totalBytes / (1024 * 1024);
            const kb = totalBytes / 1024;

            const formatBytes = (b) => {
                if (b === null || b === undefined) return '--';
                if (b < 1024) return `${b} B`;
                if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
                if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
                return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            };

            resolve({
                totalFechas,
                bytes: totalBytes,
                tamanoMB: mb.toFixed(2),
                tamanoKB: kb.toFixed(1),
                tamanoFormateado: formatBytes(totalBytes),
                ultimaCaptura: ultimaCaptura || 'Ninguna',
                cuotaBytes: cuota,
                cuotaFormateada: formatBytes(cuota),
                usoTotalBytes: usoTotalNavegador,
                usoTotalFormateado: formatBytes(usoTotalNavegador),
                porcentajeUso: (cuota && usoTotalNavegador) 
                    ? ((usoTotalNavegador / cuota) * 100).toFixed(2) + '%' 
                    : '--'
            });
        };
        req.onerror = (e) => reject("Error calculando espacio del histórico: " + (e.target?.error || e));
    });
}

/**
 * Genera datos de muestra para los últimos 5 a 7 días con variaciones realistas de precios (±0.005 a ±0.035 €).
 * @param {number} [numDias=7]
 * @returns {Promise<Array<string>>} Lista de fechas generadas
 */
export async function generarDatosDemoHistorico(numDias = 7) {
    let estacionesBase = await leerDeDB();
    if (!estacionesBase || !Array.isArray(estacionesBase) || estacionesBase.length === 0) {
        estacionesBase = await getGasolineras();
    }
    if (!estacionesBase || estacionesBase.length === 0) {
        throw new Error("No hay datos base disponibles para generar la demo.");
    }

    const fechasGeneradas = [];
    const dias = Math.max(3, Math.min(14, numDias));

    for (let i = dias - 1; i >= 0; i--) {
        const fechaObj = new Date();
        fechaObj.setDate(fechaObj.getDate() - i);
        const fechaISO = formatearFechaISO(fechaObj);

        // Curva de tendencia para simular ciclos reales de subida y bajada semanal
        const cicloMercado = Math.sin((dias - 1 - i) * 0.9) * 0.022;

        const estacionesSimuladas = estacionesBase.map((e, index) => {
            const seed = (index % 17) / 17 - 0.5; // Jitter determinista por estación
            const variacionGeneral = cicloMercado + (seed * 0.015);

            const simularPrecio = (pVal) => {
                const p = parsePrecio(pVal);
                if (p === null || p <= 0) return null;
                // Fluctuación realista entre ±0.005 y ±0.035 €
                const delta = variacionGeneral + ((Math.random() - 0.5) * 0.012);
                const nuevo = Math.round(Math.max(0.75, p + delta) * 1000) / 1000;
                return nuevo;
            };

            return {
                IDEESS: String(e.IDEESS ?? e['IDEESS'] ?? ''),
                'Rótulo': e['Rótulo'] || e.Rotulo || e['rotulo'] || '',
                'Municipio': e['Municipio'] || e.Municipio || '',
                'Provincia': e['Provincia'] || e.Provincia || '',
                'Latitud': e['Latitud'] || e.Latitud || '',
                'Longitud (WGS84)': e['Longitud (WGS84)'] || e.Longitud || '',
                p95: simularPrecio(e['Precio Gasolina 95 E5'] ?? e.p95),
                p98: simularPrecio(e['Precio Gasolina 98 E5'] ?? e.p98),
                pDiesel: simularPrecio(e['Precio Gasoleo A'] ?? e.pDiesel),
                pDieselPre: simularPrecio(e['Precio Gasoleo Premium'] ?? e.pDieselPre),
                pGLP: simularPrecio(e['Precio Gases licuados del petróleo'] ?? e.pGLP)
            };
        });

        await guardarSnapshot(fechaISO, {
            timestamp: fechaObj.getTime(),
            estaciones: estacionesSimuladas
        });
        fechasGeneradas.push(fechaISO);
    }

    return fechasGeneradas;
}

/**
 * Obtiene el listado de gasolineras, priorizando caché de IndexedDB si tiene menos de 30 minutos.
 * @returns {Promise<Array<object>>}
 */
export async function getGasolineras() {
    const ahora = Date.now();
    const ultimoGuardado = localStorage.getItem(TIMESTAMP_KEY);

    if (ultimoGuardado && (ahora - parseInt(ultimoGuardado, 10) < CACHE_TIME)) {
        try {
            const datosCache = await leerDeDB();
            if (datosCache && Array.isArray(datosCache) && datosCache.length > 0) {
                // Comprobar y asegurar snapshot de hoy
                try {
                    const hoy = formatearFechaISO();
                    const snapHoy = await obtenerSnapshot(hoy);
                    if (!snapHoy) {
                        guardarSnapshot(hoy, { timestamp: ahora, estaciones: datosCache }).catch(() => {});
                    }
                } catch (_) {}
                return datosCache;
            }
        } catch (e) {
            console.warn("Fallo al leer caché, consultando API...", e);
        }
    }

    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        const estaciones = data.ListaEESSPrecio || [];

        await guardarEnDB(estaciones);
        localStorage.setItem(TIMESTAMP_KEY, ahora.toString());

        return estaciones;
    } catch (error) {
        console.error("Error obteniendo datos del Geoportal:", error);
        return (await leerDeDB()) || [];
    }
}

// Re-exportar utilidades
export { estaAbiertaAhora, parsePrecio };

// Exposición global para el navegador y llamadas legacy
if (typeof window !== 'undefined') {
    window.getGasolineras = getGasolineras;
    window.limpiarCache = limpiarCache;
    window.openDB = openDB;
    window.guardarEnDB = guardarEnDB;
    window.leerDeDB = leerDeDB;
    window.DB_NAME = DB_NAME;
    window.STORE_NAME = STORE_NAME;
    window.HISTORICO_STORE = HISTORICO_STORE;
    window.CACHE_TIME = CACHE_TIME;
    window.formatearFechaISO = formatearFechaISO;
    window.optimizarEstacion = optimizarEstacion;
    window.guardarSnapshot = guardarSnapshot;
    window.obtenerSnapshot = obtenerSnapshot;
    window.obtenerFechasHistorico = obtenerFechasHistorico;
    window.eliminarSnapshot = eliminarSnapshot;
    window.limpiarHistorico = limpiarHistorico;
    window.calcularEspacioHistorico = calcularEspacioHistorico;
    window.generarDatosDemoHistorico = generarDatosDemoHistorico;
}
