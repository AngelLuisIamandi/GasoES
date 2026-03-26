const uiTemplate = `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark fixed-top shadow">
        <div class="container-fluid">
            <a class="navbar-brand d-flex align-items-center fw-bold" href="index.html">
                <img src="img/favicon.png" alt="Logo GasoES" width="32" height="32" class="d-inline-block align-text-top me-2 nav-logo">
                <span class="brand-text">Gaso<span class="text-success">ES</span></span>
            </a>

            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto mb-2 mb-lg-0">
                    <li class="nav-item">
                        <a class="nav-link" id="nav-mapa" href="index.html">Mapa</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" id="nav-listado" href="listado.html">Listado</a>
                    </li>
                    <li class="nav-item">
                        <a href="https://www.linkedin.com/in/angel-luis-iamandi/" target="_blank" class="nav-link">
                            Mi LinkedIn
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999">
        <div id="liveToast" class="toast hide shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <strong class="me-auto" id="toastTitle">Aviso</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body" id="toastMessage"></div>
        </div>
    </div>
`;

document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', uiTemplate);

    const path = window.location.pathname;
    if (path.includes('listado')) {
        document.getElementById('nav-listado')?.classList.add('active');
    } else {
        document.getElementById('nav-mapa')?.classList.add('active');
    }
});

function showNotify(mensaje, tipo = 'info', titulo = 'Aviso') {
    const toastEl = document.getElementById('liveToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastMessage');

    toastEl.className = `toast hide border-0`;

    const estilos = {
        'error': 'bg-danger text-white',
        'success': 'bg-success text-white',
        'info': 'bg-primary text-white',
        'warning': 'bg-warning text-dark'
    };

    toastEl.classList.add(...(estilos[tipo] || estilos.info).split(' '));
    toastTitle.innerText = titulo;
    toastBody.innerText = mensaje;

    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
}