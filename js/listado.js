let estaciones = [];
let estacionesFiltradas = [];
let favoritos = new Set(JSON.parse(localStorage.getItem('gasoFavs')) || []);
let itemsMostrados = 0;
let coordsReferencia = null;
const PASO = 200;

const SORT_MAP = {
    'p95': 'Precio Gasolina 95 E5',
    'p98': 'Precio Gasolina 98 E5',
    'pDiesel': 'Precio Gasoleo A',
    'pDieselPre': 'Precio Gasoleo Premium'
};

const elements = {
    tableBody: document.getElementById('tableBody'),
    tableContainer: document.querySelector('.table-container'),
    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    favFilter: document.getElementById('favFilter'),
    loader: document.getElementById('loader-listado'),
    locationInput: document.getElementById('locationInput'),
    rangeInput: document.getElementById('rangeInput'),
    btnLocation: document.getElementById('btnLocation'),
    btnGPS: document.getElementById('btnGPS')
};

async function fetchData() {
    try {
        estaciones = await getGasolineras();
        if (elements.loader) elements.loader.style.display = 'none';
        aplicarFiltros();
    } catch (error) {
        console.error("Error cargando estaciones:", error);
        if (elements.loader) elements.loader.innerHTML = "Error al cargar los datos.";
    }
}

function aplicarFiltros() {
    let resultado = [...estaciones];
    const seleccion = elements.sortSelect.value;
    const campoPrecio = SORT_MAP[seleccion];

    if (elements.favFilter.checked) {
        resultado = resultado.filter(e => favoritos.has(e.IDEESS));
    }

    const term = elements.searchInput.value.toLowerCase();
    if (term) {
        resultado = resultado.filter(e => 
            ['Rótulo', 'Municipio', 'Provincia'].some(key => e[key].toLowerCase().includes(term))
        );
    }

    if (seleccion !== 'todos') {
        resultado = resultado.filter(e => {
            const precio = parseFloat(e[campoPrecio]?.replace(',', '.'));
            return !isNaN(precio) && precio > 0;
        });
    }

    if (coordsReferencia) {
        const radioMax = parseFloat(elements.rangeInput.value) || 30;
        resultado = resultado.filter(e => {
            const latEst = parseFloat(e['Latitud'].replace(',', '.'));
            const lonEst = parseFloat(e['Longitud (WGS84)'].replace(',', '.'));
            const dist = calcularDistancia(coordsReferencia.lat, coordsReferencia.lon, latEst, lonEst);
            e.distanciaCalculada = dist;
            return dist <= radioMax;
        });
    }

    resultado.sort((a, b) => {
        if (coordsReferencia) return a.distanciaCalculada - b.distanciaCalculada;
        if (seleccion !== 'todos') {
            const pA = parseFloat(a[campoPrecio]?.replace(',', '.')) || 999;
            const pB = parseFloat(b[campoPrecio]?.replace(',', '.')) || 999;
            return pA - pB;
        }
        return 0;
    });

    estacionesFiltradas = resultado;
    itemsMostrados = 0;
    elements.tableBody.innerHTML = '';
    cargarMasEstaciones();
}

function cargarMasEstaciones() {
    const lote = estacionesFiltradas.slice(itemsMostrados, itemsMostrados + PASO);
    renderRows(lote);
    itemsMostrados += PASO;
}

function renderRows(data) {
    const fragment = document.createDocumentFragment();
    data.forEach(e => {
        const isFav = favoritos.has(e.IDEESS);
        const distHtml = e.distanciaCalculada ? `<div class="text-danger fw-bold" style="font-size: 0.7rem;">A ${e.distanciaCalculada.toFixed(1)} km</div>` : '';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><i class="bi ${isFav ? 'bi-star-fill text-warning' : 'bi-star text-muted'} fav-icon" onclick="toggleFav('${e.IDEESS}')"></i></td>
            <td class="text-start">
                <div class="fw-bold text-primary">${e['Rótulo']}</div>
                <div class="text-muted small" style="font-size: 0.75rem;">${e['Dirección']}</div>
                ${distHtml}
            </td>
            <td>${e['Municipio']}</td>
            <td><span class="badge bg-success text-light border w-100">${e['Precio Gasolina 95 E5'] || '--'}</span></td>
            <td><span class="badge bg-success text-light border w-100">${e['Precio Gasolina 98 E5'] || '--'}</span></td>
            <td><span class="badge bg-dark text-light w-100">${e['Precio Gasoleo A'] || '--'}</span></td>
            <td><span class="badge bg-warning text-light w-100">${e['Precio Gasoleo Premium'] || '--'}</span></td>
            <td><span class="badge bg-info text-white w-100">${e['Precio Gases licuados del petróleo'] || '--'}</span></td>
            <td><div style="font-size: 0.7rem;">${e['Horario']}</div></td>
        `;
        fragment.appendChild(row);
    });
    elements.tableBody.appendChild(fragment);
}

elements.btnGPS.addEventListener('click', () => {
    if (!navigator.geolocation) return showNotify("GPS no soportado", "error");

    elements.loader.style.display = 'block';
    elements.btnGPS.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    navigator.geolocation.getCurrentPosition((pos) => {
        coordsReferencia = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        elements.locationInput.value = "Mi ubicación actual";
        elements.btnLocation.classList.replace('btn-primary', 'btn-success');
        elements.btnGPS.innerHTML = '<i class="bi bi-crosshair text-success"></i>';
        elements.loader.style.display = 'none';
        aplicarFiltros();
    }, () => {
        elements.loader.style.display = 'none';
        elements.btnGPS.innerHTML = '<i class="bi bi-crosshair"></i>';
        showNotify("Error al obtener GPS", "error");
    }, { enableHighAccuracy: true });
});

elements.btnLocation.addEventListener('click', async () => {
    const query = elements.locationInput.value.trim();
    if (!query) {
        coordsReferencia = null;
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
            showNotify("No encontrado", "warning");
        }
    } catch (e) {
        showNotify("Error de conexión", "error");
    } finally {
        elements.btnLocation.innerHTML = '<i class="bi bi-funnel"></i>';
    }
});

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toggleFav(id) {
    favoritos.has(id) ? favoritos.delete(id) : favoritos.add(id);
    localStorage.setItem('gasoFavs', JSON.stringify([...favoritos]));
    aplicarFiltros();
}

elements.searchInput.addEventListener('input', aplicarFiltros);
elements.sortSelect.addEventListener('change', aplicarFiltros);
elements.favFilter.addEventListener('change', aplicarFiltros);
elements.rangeInput.addEventListener('input', () => coordsReferencia && aplicarFiltros());

elements.tableContainer.addEventListener('scroll', () => {
    const { scrollTop, clientHeight, scrollHeight } = elements.tableContainer;
    if (scrollTop + clientHeight >= scrollHeight - 100 && itemsMostrados < estacionesFiltradas.length) {
        cargarMasEstaciones();
    }
});

fetchData();