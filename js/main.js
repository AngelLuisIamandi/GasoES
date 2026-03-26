const map = L.map('map', { zoomControl: false }).setView([40.4167, -3.7037], 6);
let todasLasEstaciones = [];
let mediasZona = { p95: 0, pDiesel: 0 };
let userMarker = null;

L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

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

const markers = L.markerClusterGroup();

const formatPrecio = (v) => v ? `<b>${v} €</b>` : '<span class="text-muted">--</span>';
const toNum = (str) => {
    if (!str) return null;
    if (typeof str === 'number') return str;
    return parseFloat(str.replace(',', '.')) || null;
};

function getColor(precio, media) {
    if (!precio || !media || media === 0) return 'bg-secondary';
    const dif = precio - media;
    if (dif < -0.02) return 'bg-success';
    if (dif > 0.02) return 'bg-danger';
    return 'bg-warning text-dark';
}

function crearIconoDoble(p95Str, pDieselStr) {
    const p95 = toNum(p95Str);
    const pDiesel = toNum(pDieselStr);
    const col95 = getColor(p95, mediasZona.p95);
    const colDiesel = getColor(pDiesel, mediasZona.pDiesel);

    return L.divIcon({
        className: 'custom-marker',
        html: `
            <div class="shadow-lg d-flex flex-column text-white fw-bold" 
                 style="width: 52px; border: 1px solid rgba(255,255,255,0.8); border-radius: 6px; overflow: hidden; font-size: 10px; background: #333;">
                
                <div class="d-flex align-items-stretch" style="height: 19px;">
                    <div class="bg-success text-center" style="width: 14px; line-height: 19px; font-size: 9px; opacity: 0.9;">G</div>
                    <div class="${col95} flex-grow-1 text-center" style="line-height: 19px;">
                        ${p95 ? p95.toFixed(2) : '--'}
                    </div>
                </div>

                <div class="d-flex align-items-stretch" style="height: 19px; border-top: 1px solid rgba(255,255,255,0.3);">
                    <div class="bg-dark text-center" style="width: 14px; line-height: 19px; font-size: 9px; opacity: 0.9;">D</div>
                    <div class="${colDiesel} flex-grow-1 text-center" style="line-height: 19px;">
                        ${pDiesel ? pDiesel.toFixed(2) : '--'}
                    </div>
                </div>
            </div>`,
        iconSize: [52, 38],
        iconAnchor: [26, 19]
    });
}

const botonInfo = document.querySelector('.btn-info-flotante');
const elOffcanvas = document.getElementById('offcanvasStats');

if (elOffcanvas) {
    elOffcanvas.addEventListener('show.bs.offcanvas', () => {
        botonInfo.classList.add('hidden');
    });

    elOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
        botonInfo.classList.remove('hidden');
    });
}

function abrirPanelStats() {
    const myOffcanvas = document.getElementById('offcanvasStats');
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
    mediasZona.pDiesel = acumuladores.pDiesel.count > 0 ? (acumuladores.pDiesel.sum / acumuladores.pDiesel.count) : 0;

    const getM = (key) => acumuladores[key].count > 0 ? (acumuladores[key].sum / acumuladores[key].count).toFixed(3) : '--';

    const container = document.getElementById('leyenda-container');
    if (!container) return;

    container.innerHTML = `
        <p class="text-muted small mb-4">Promedio de las <b>${estacionesVisibles}</b> estaciones en esta zona del mapa.</p>
        
        <div class="list-group list-group-flush mb-4">
            ${renderStatRow('Gasolina 95 E5', getM('p95'), 'text-success')}
            ${renderStatRow('Gasolina 98 E5', getM('p98'), 'text-success')}
            ${renderStatRow('Gasóleo A', getM('pDiesel'), 'text-dark')}
            ${renderStatRow('Gasóleo Premium', getM('pDieselPre'), 'text-warning')}
            ${renderStatRow('GLP', getM('pGLP'), 'text-info')}
        </div>

        <div class="p-3 bg-light rounded border-0">
            <h6 class="fw-bold small text-uppercase mb-2" style="font-size: 0.65rem;">Referencias de Color</h6>
            <div class="d-flex flex-column gap-2 small">
                <span><i class="bi bi-circle-fill text-success me-1"></i> Barato (inferior a la media)</span>
                <span><i class="bi bi-circle-fill text-warning me-1"></i> Precio Medio</span>
                <span><i class="bi bi-circle-fill text-danger me-1"></i> Caro (superior a la media)</span>
            </div>
        </div>
    `;
}

function renderStatRow(label, precio, colorClass) {
    return `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
            <span class="text-secondary small">${label}</span>
            <span class="fw-bold ${colorClass}">${precio} €</span>
        </div>
    `;
}

async function cargar() {
    try {
        todasLasEstaciones = await getGasolineras();

        actualizarLeyenda();

        todasLasEstaciones.forEach(e => {
            const lat = toNum(e['Latitud']), lng = toNum(e['Longitud (WGS84)']);
            if (lat && lng) {
                const marker = L.marker([lat, lng], {
                    icon: crearIconoDoble(e['Precio Gasolina 95 E5'], e['Precio Gasoleo A'])
                }).bindPopup(`
                    <div class="p-1" style="min-width: 200px;">
                        <h6 class="text-primary border-bottom pb-1 fw-bold">${e['Rótulo']}</h6>
                        <p class="small mb-2 text-muted">
                            <i class="bi bi-geo-alt"></i> ${e['Dirección']}<br>
                            <i class="bi bi-clock"></i> ${e['Horario']}
                        </p>
                        <table class="table table-sm table-borderless mb-0" style="font-size: 11px;">
                            <tr><td class="py-0">Gasolina 95</td><td class="py-0 text-end">${formatPrecio(e['Precio Gasolina 95 E5'])}</td></tr>
                            <tr><td class="py-0">Gasolina 98</td><td class="py-0 text-end">${formatPrecio(e['Precio Gasolina 98 E5'])}</td></tr>
                            <tr><td class="py-0">Gasóleo A</td><td class="py-0 text-end">${formatPrecio(e['Precio Gasoleo A'])}</td></tr>
                            <tr><td class="py-0">Diésel+</td><td class="py-0 text-end">${formatPrecio(e['Precio Gasoleo Premium'])}</td></tr>
                            <tr><td class="py-0">GLP</td><td class="py-0 text-end">${formatPrecio(e['Precio Gases licuados del petróleo'])}</td></tr>
                        </table>
                    </div>
                `);
                markers.addLayer(marker);
            }
        });

        map.addLayer(markers);
        const loader = document.getElementById('loader');
        if (loader) loader.remove();

    } catch (e) { 
        console.error("Error al cargar estaciones:", e); 
    }
}

function miUbicacion() {
    if (!navigator.geolocation) {
        if (typeof showNotify === 'function') showNotify("GPS no soportado", "error");
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
        },
        { enableHighAccuracy: true }
    );
}

map.on('moveend', actualizarLeyenda);

cargar();