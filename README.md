# ⛽ GasoES - Localizador Inteligente de Combustible

GasoES es una SPA (Single Page Application) diseñada para optimizar el ahorro en combustible en España. Utiliza datos oficiales y cálculos geoespaciales para ofrecer la mejor opción de repostaje según ubicación y precio.

![Licencia](https://img.shields.io/badge/license-MIT-blue.svg)
![Javascript](https://img.shields.io/badge/language-Javascript-yellow.svg)
![HTML/CSS](https://img.shields.io/badge/style-HTML%2FCSS-orange.svg)

## 🚀 Características Principales

- **Geolocalización Dual:** Permite filtrar por ubicación GPS en tiempo real o mediante búsqueda de direcciones (vía Nominatim API).
- **Cálculo de Distancia Real:** Implementación de la fórmula de Haversine para filtrado por radio (KM) de alta precisión.
- **Rendimiento Optimizado:** - **Tablas:** Renderizado progresivo mediante scroll infinito para manejar grandes volúmenes de datos sin bloquear el hilo principal.
    - **Mapas:** Uso de `Leaflet.markercluster` para la agrupación eficiente de puntos de interés.
- **Análisis de Mercado:** Sistema de colores dinámicos que compara cada precio con el promedio de la zona visible.
- **Persistencia:** Sistema de favoritos integrado con `localStorage`.

## 🛠️ Tecnologías Utilizadas

- **Lenguaje:** JavaScript (ES6+).
- **Mapas:** Leaflet API.
- **Estilos:** Bootstrap 5 + Iconos de Bootstrap.
- **Fuentes:** Inter & Montserrat (vía Google Fonts).
- **Datos:** API REST Geoportal Gasolineras (Ministerio para la Transición Ecológica).

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Siéntete libre de usarlo, modificarlo y compartirlo.

---
Desarrollado por Ángel Luis.
