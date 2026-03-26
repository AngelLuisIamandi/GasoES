const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
const DB_NAME = 'GasoESDB';
const STORE_NAME = 'estaciones';
const TIMESTAMP_KEY = 'gaso_last_update';
const CACHE_TIME = 30 * 60 * 1000;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject("Error abriendo IndexedDB");
    });
}

async function guardarEnDB(data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put(data, "lista_completa");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject();
    });
}

async function leerDeDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get("lista_completa");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject();
    });
}

async function getGasolineras() {
    const ahora = Date.now();
    const ultimoGuardado = localStorage.getItem(TIMESTAMP_KEY);

    if (ultimoGuardado && (ahora - parseInt(ultimoGuardado) < CACHE_TIME)) {
        try {
            const datosCache = await leerDeDB();
            if (datosCache) {
                //console.log("Cargando desde IndexedDB");
                return datosCache;
            }
        } catch (e) {
            console.warn("Fallo al leer caché, consultando API...");
        }
    }

    try {
        //console.log("Consultando API del Ministerio...");
        const response = await fetch(API_URL);
        const data = await response.json();
        const estaciones = data.ListaEESSPrecio;

        await guardarEnDB(estaciones);
        localStorage.setItem(TIMESTAMP_KEY, ahora.toString());

        return estaciones;
    } catch (error) {
        console.error("Error obteniendo datos:", error);
        return await leerDeDB() || [];
    }
}