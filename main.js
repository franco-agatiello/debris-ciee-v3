let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;

// Colores personalizados por rango de año
const iconoAzul = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoVerde = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoRojo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});
const iconoAmarillo = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  iconSize: [18, 29], iconAnchor: [9, 29], popupAnchor: [1, -30]
});

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

// Colores por rangos de año solicitados
function marcadorPorFecha(fecha) {
  const year = parseInt(fecha.slice(0,4), 10);
  if (year >= 2004 && year <= 2010) return iconoAzul;
  if (year >= 2011 && year <= 2017) return iconoVerde;
  if (year >= 2018 && year <= 2025) return iconoRojo;
  return iconoAmarillo; // Antes de 2004 (o si fecha no válida) usa amarillo
}

// Actualiza los estilos de los botones de modo
function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active", modo === "puntos");
  document.getElementById("modo-calor").classList.toggle("active", modo === "calor");
}

// Popup: Solo muestra datos no nulos y agrega botón de órbita si hay TLE
function popupContenidoDebris(d) {
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if (d.pais) contenido += `País: ${d.pais}<br>`;
  if (d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if (d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if (d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if (d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if (d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}"><br>`;
  // Botón para órbita solo si hay TLE
  if (d.tle1 && d.tle2) {
    contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarOrbita('${d.nombre?.replace(/'/g,"")}', '${d.tle1}', '${d.tle2}', ${d.lugar_caida.lat}, ${d.lugar_caida.lon})">Ver órbita</button>`;
  }
  return contenido;
}

// Calcula trayectoria de órbita usando TLE y satellite.js
function calcularOrbita(tle1, tle2, pasos = 90) {
  const satrec = satellite.twoline2satrec(tle1, tle2);
  let ahora = new Date();
  let coords = [];
  // Distribuye los puntos a lo largo de una órbita previa a la caída
  for (let i = 0; i < pasos; i++) {
    let minutos = (i * 90) / pasos; // órbita baja ~90 min
    let fecha = new Date(ahora.getTime() - minutos * 60000);
    let pv = satellite.propagate(satrec, fecha);
    let pos = pv.position;
    if (!pos) continue;
    let gmst = satellite.gstime(fecha);
    let gd = satellite.eciToGeodetic(pos, gmst);
    let lat = satellite.degreesLat(gd.latitude);
    let lon = satellite.degreesLong(gd.longitude);
    coords.push([lat, lon]);
  }
  return coords;
}

// Muestra modal con mapa de órbita
window.mostrarOrbita = function(nombre, tle1, tle2, lat, lon) {
  // Crea el modal si no existe
  let modal = document.getElementById('modal-orbita');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-orbita';
    modal.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:#000a;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;padding:20px;position:relative;max-width:90vw;max-height:90vh;">
        <button onclick="document.getElementById('modal-orbita').remove()" style="position:absolute;top:8px;right:8px;">Cerrar</button>
        <h5>${nombre}</h5>
        <div id="map-orbita" style="width:80vw;height:60vh;"></div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
    document.getElementById('map-orbita').innerHTML = '';
  }
  // Inicializa el mapa después de un pequeño delay para que el div exista
  setTimeout(() => {
    let mapo = L.map('map-orbita').setView([lat, lon], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapo);
    // Calcula y dibuja la órbita
    let trayectoria = calcularOrbita(tle1, tle2);
    L.polyline(trayectoria, {color: 'red'}).addTo(mapo);
    L.marker([lat, lon]).addTo(mapo).bindPopup('Punto de caída').openPopup();
  }, 100);
}

function actualizarMapa() {
  const datosFiltrados = filtrarDatos();

  if (capaPuntos) {
    capaPuntos.clearLayers();
    try { mapa.removeLayer(capaPuntos); } catch (e) {}
    capaPuntos = null;
  }
  if (capaCalor && mapa.hasLayer(capaCalor)) {
    mapa.removeLayer(capaCalor);
    capaCalor = null;
  }
  if (leyendaPuntos) leyendaPuntos.remove();
  if (leyendaCalor) leyendaCalor.remove();

  if (modo === "puntos") {
    capaPuntos = L.layerGroup();
    datosFiltrados.forEach(d => {
      const marker = L.marker([d.lugar_caida.lat, d.lugar_caida.lon], {icon: marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenidoDebris(d), {autoPan: true});
      marker.on('popupopen', function(e) {
        const imgs = e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(function(img) {
          img.addEventListener('load', function() {
            e.popup.update();
          });
        });
      });
      capaPuntos.addLayer(marker);
    });
    capaPuntos.addTo(mapa);
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d => [d.lugar_caida.lat, d.lugar_caida.lon]);
    if (heatData.length) {
      capaCalor = L.heatLayer(heatData, {
        radius: 30,
        blur: 25,
        minOpacity: 0.4,
        max: 30,
        gradient: {
          0.1: 'blue',
          0.3: 'lime',
          0.6: 'yellow',
          1.0: 'red'
        }
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
  actualizarBotonesModo();
}

function mostrarLeyendaPuntos() {
  leyendaPuntos = L.control({position: 'bottomright'});
  leyendaPuntos.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML += `<strong>Color del marcador según año de caída</strong><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2004 a 2010</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2011 a 2017</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2018 a 2025</span><br>`;
    div.innerHTML += `<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">Antes de 2004</span><br>`;
    return div;
  };
  leyendaPuntos.addTo(mapa);
}

function mostrarLeyendaCalor() {
  leyendaCalor = L.control({position: 'bottomright'});
  leyendaCalor.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = ['Bajo', 'Medio', 'Alto', 'Muy alto'];
    const colors = ['blue', 'lime', 'yellow', 'red'];
    div.innerHTML += '<strong>Densidad de caídas</strong><br>';
    for (let i = 0; i < grades.length; i++) {
      div.innerHTML +=
        `<i style="background:${colors[i]};width:14px;height:14px;display:inline-block;margin-right:5px;border-radius:2px;"></i> ${grades[i]}<br>`;
    }
    return div;
  };
  leyendaCalor.addTo(mapa);
}

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapa);
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
  cargarDatos();
  listeners();
});
