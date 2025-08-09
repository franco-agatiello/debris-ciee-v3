let debris = [];
let map; // MapLibre instance
let modo = "puntos";

// Colores para marcadores
const markerColors = {
  azul: "#2196F3",
  verde: "#4CAF50",
  rojo: "#E53935",
  amarillo: "#FFEB3B"
};

async function cargarDatos() {
  const resp = await fetch('data/debris.json');
  debris = await resp.json();
  poblarFiltros();
  actualizarMapa();
}

function poblarFiltros() {
  // Paises ordenados alfabéticamente y sin duplicados
  const paises = Array.from(new Set(debris.map(d => d.pais).filter(p => p && p !== null)));
  paises.sort((a, b) => a.localeCompare(b, 'es'));
  const menu = document.getElementById("dropdownPaisMenu");
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">Todos</a></li>` +
    paises.map(p => `<li><a class="dropdown-item" href="#" data-value="${p}">${p}</a></li>`).join('');
  // Actualizar el texto del botón al seleccionar
  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('dropdownPaisBtn').textContent = this.textContent;
      document.getElementById('dropdownPaisBtn').dataset.value = this.dataset.value;
      actualizarMapa();
    });
  });
}

function obtenerFiltros() {
  return {
    pais: document.getElementById("dropdownPaisBtn").dataset.value ?? "",
    fechaDesde: document.getElementById("fecha-desde").value,
    fechaHasta: document.getElementById("fecha-hasta").value,
    inclinacionMin: document.getElementById("inclinacion-min").value,
    inclinacionMax: document.getElementById("inclinacion-max").value
  };
}

function filtrarDatos() {
  const filtros = obtenerFiltros();
  return debris.filter(d => {
    if (filtros.pais && d.pais !== filtros.pais) return false;
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const year = parseInt(fecha.slice(0,4), 10);
  if (year >= 2004 && year <= 2010) return markerColors.azul;
  if (year >= 2011 && year <= 2017) return markerColors.verde;
  if (year >= 2018 && year <= 2025) return markerColors.rojo;
  return markerColors.amarillo;
}

function popupContenidoDebris(d) {
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if (d.pais) contenido += `País: ${d.pais}<br>`;
  if (d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if (d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if (d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if (d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if (d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}" style="max-width:220px;border-radius:8px;">`;
  return contenido;
}

function initMapa() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'osm-liberty-style.json', // O el URL directo si está online
    center: [0, 0],
    zoom: 2
  });
  map.on('load', () => {
    cargarDatos();
  });
}

function actualizarMapa() {
  if (!map || !map.isStyleLoaded()) return;
  const datosFiltrados = filtrarDatos();

  // Elimina capa anterior si existe
  if (map.getSource('debris')) {
    if (map.getLayer('debris-points')) map.removeLayer('debris-points');
    if (map.getLayer('debris-heat')) map.removeLayer('debris-heat');
    map.removeSource('debris');
  }

  const geojson = {
    type: "FeatureCollection",
    features: datosFiltrados.map(d => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lugar_caida.lon, d.lugar_caida.lat] },
      properties: {
        popup: popupContenidoDebris(d),
        color: marcadorPorFecha(d.fecha)
      }
    }))
  };

  map.addSource('debris', { type: 'geojson', data: geojson });

  if (modo === "puntos") {
    map.addLayer({
      id: 'debris-points',
      type: 'circle',
      source: 'debris',
      paint: {
        'circle-radius': 8,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#333'
      }
    });

    map.on('click', 'debris-points', function(e) {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const popupHtml = e.features[0].properties.popup;
      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(popupHtml)
        .addTo(map);
    });

    map.on('mouseenter', 'debris-points', function() {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'debris-points', function() {
      map.getCanvas().style.cursor = '';
    });

  } else if (modo === "calor") {
    map.addLayer({
      id: 'debris-heat',
      type: 'heatmap',
      source: 'debris',
      maxzoom: 18,
      paint: {
        'heatmap-radius': 30,
        'heatmap-intensity': 1,
        'heatmap-opacity': 0.7,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'blue',
          0.3, 'lime',
          0.6, 'yellow',
          1.0, 'red'
        ]
      }
    });
  }
  actualizarBotonesModo();
  mostrarLeyenda();
}

function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active", modo === "puntos");
  document.getElementById("modo-calor").classList.toggle("active", modo === "calor");
}

function mostrarLeyenda() {
  // Puedes agregar tu leyenda personalizada en el DOM
  // por ejemplo, en el sidebar o flotante usando un div
  // Aquí un ejemplo básico:
  let leyenda = document.getElementById("leyenda-marcadores");
  if (!leyenda) {
    leyenda = document.createElement("div");
    leyenda.id = "leyenda-marcadores";
    leyenda.className = "info legend";
    leyenda.style.position = "absolute";
    leyenda.style.right = "30px";
    leyenda.style.bottom = "30px";
    leyenda.style.zIndex = "9999";
    document.body.appendChild(leyenda);
  }
  if (modo === "puntos") {
    leyenda.innerHTML = `
      <strong>Color del marcador según año de caída</strong><br>
      <span style="display:inline-block;width:13px;height:13px;background:${markerColors.azul};border-radius:2px;margin-right:4px;"></span> 2004 a 2010<br>
      <span style="display:inline-block;width:13px;height:13px;background:${markerColors.verde};border-radius:2px;margin-right:4px;"></span> 2011 a 2017<br>
      <span style="display:inline-block;width:13px;height:13px;background:${markerColors.rojo};border-radius:2px;margin-right:4px;"></span> 2018 a 2025<br>
      <span style="display:inline-block;width:13px;height:13px;background:${markerColors.amarillo};border-radius:2px;margin-right:4px;"></span> Antes de 2004<br>
    `;
  } else {
    leyenda.innerHTML = `
      <strong>Densidad de caídas</strong><br>
      <span style="display:inline-block;width:14px;height:14px;background:blue;border-radius:2px;margin-right:5px;"></span> Bajo<br>
      <span style="display:inline-block;width:14px;height:14px;background:lime;border-radius:2px;margin-right:5px;"></span> Medio<br>
      <span style="display:inline-block;width:14px;height:14px;background:yellow;border-radius:2px;margin-right:5px;"></span> Alto<br>
      <span style="display:inline-block;width:14px;height:14px;background:red;border-radius:2px;margin-right:5px;"></span> Muy alto<br>
    `;
  }
}

function listeners() {
  ["fecha-desde", "fecha-hasta", "inclinacion-min", "inclinacion-max"].forEach(id => {
    document.getElementById(id).addEventListener("change", actualizarMapa);
  });
  document.getElementById("modo-puntos").addEventListener("click", () => {
    modo = "puntos";
    actualizarMapa();
  });
  document.getElementById("modo-calor").addEventListener("click", () => {
    modo = "calor";
    actualizarMapa();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMapa();
  listeners();
});
