import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ================== Config ==================
const LOGO_SRC = "img/Captura de pantalla 2025-06-06 211123.png";
const EARTH_IMG_SRC = "img/earthmap1k.jpg";
const radioTierra = 6371; // km

const iconoAzul = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoVerde = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoRojo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoAmarillo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});

let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let mapaTrayectoria = null;

mapa = L.map('map', { worldCopyJump: true }).setView([0,0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 8,
  attribution: '&copy; OpenStreetMap',
  crossOrigin: true
}).addTo(mapa);
capaPuntos = L.layerGroup().addTo(mapa);

(async function cargarDatos() {
  try {
    const r = await fetch("data/debris.json");
    debris = await r.json();
  } catch(e) {
    debris = [];
  }
  poblarDropdown("dropdownPaisMenu", "dropdownPaisBtn", valoresUnicos(debris.map(d=>d.pais)), "Todos");
  poblarDropdown("dropdownClaseMenu", "dropdownClaseBtn", valoresUnicos(debris.map(d=>d.clase_objeto)), "Todas");
  listeners();
  actualizarMapa();
})();

function valoresUnicos(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'es')); }
function anio(str){ if(!str) return null; const y = parseInt(String(str).slice(0,4),10); return Number.isFinite(y)?y:null; }
function numOrNull(v){ if(v===""||v==null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function getLat(d){ return numOrNull(d?.lugar_caida?.lat ?? d?.lat ?? d?.latitude ?? d?.latitud ?? d?.Lat); }
function getLon(d){ return numOrNull(d?.lugar_caida?.lon ?? d?.lon ?? d?.longitude ?? d?.longitud ?? d?.Lon); }

// ----------- CLAVE: SOLO USAR masa_en_orbita PARA LA GRÁFICA DE MASA ----------
function getMasaReingresadaKg(d) {
  return Number(d.masa_en_orbita) || 0;
}

// ----------- CLAVE: SOLO USAR dias_en_orbita PARA LA GRÁFICA DE TIEMPO ----------
function getDiasEnOrbita(d){
  return Number(d.dias_en_orbita) || 0;
}

function poblarDropdown(menuId, btnId, items, etiquetaTodos="Todos"){
  const menu = document.getElementById(menuId);
  const btn  = document.getElementById(btnId);
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">${etiquetaTodos}</a></li>` +
    items.map(v=>`<li><a class="dropdown-item" href="#" data-value="${v}">${v}</a></li>`).join("");
  btn.textContent = etiquetaTodos; // Default selected text
  btn.dataset.value = ""; // Default selected value
  menu.querySelectorAll(".dropdown-item").forEach(a=>{
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      btn.dataset.value = a.dataset.value || "";
      btn.textContent = a.textContent.trim();
      if (window.bootstrap && bootstrap.Dropdown) {
        bootstrap.Dropdown.getOrCreateInstance(btn).hide();
      }
      actualizarMapa();
    });
  });
}

function obtenerFiltros(){
  const constAll = document.getElementById('const-all').checked;
  const constYes = document.getElementById('const-yes').checked;
  const constNo  = document.getElementById('const-no').checked;

  return {
    pais: document.getElementById("dropdownPaisBtn").dataset.value ?? "",
    fechaDesde: document.getElementById("fecha-desde").value,
    fechaHasta: document.getElementById("fecha-hasta").value,
    inclinacionMin: document.getElementById("inclinacion-min").value,
    inclinacionMax: document.getElementById("inclinacion-max").value,
    masaOrbitaMin: document.getElementById("masa-orbita-min").value,
    masaOrbitaMax: document.getElementById("masa-orbita-max").value,
    clase_objeto: document.getElementById("dropdownClaseBtn").dataset.value ?? "",
    constelacion: constAll ? "todas" : (constYes ? "si" : "no"),
    latMin: document.getElementById("lat-min").value,
    latMax: document.getElementById("lat-max").value,
    lonMin: document.getElementById("lon-min").value,
    lonMax: document.getElementById("lon-max").value,
  };
}

function pointInBBox(lat, lon, latMin, latMax, lonMin, lonMax){
  if (latMin===null && latMax===null && lonMin===null && lonMax===null) return true;
  if (lat===null || lon===null) return false;
  if (latMin!==null && lat<latMin) return false;
  if (latMax!==null && lat>latMax) return false;
  if (lonMin!==null && lonMax!==null){
    if (lonMin<=lonMax) { if (lon<lonMin || lon>lonMax) return false; }
    else { if (!(lon>=lonMin || lon<=lonMax)) return false; }
  } else {
    if (lonMin!==null && lon<lonMin) return false;
    if (lonMax!==null && lon>lonMax) return false;
  }
  return true;
}

function filtrarDatos(){
  const f = obtenerFiltros();
  const latMin = f.latMin!=="" ? Number(f.latMin) : null;
  const latMax = f.latMax!=="" ? Number(f.latMax) : null;
  const lonMin = f.lonMin!=="" ? Number(f.lonMin) : null;
  const lonMax = f.lonMax!=="" ? Number(f.lonMax) : null;

  return debris.filter(d=>{
    if (f.pais && d.pais!==f.pais) return false;
    if (f.fechaDesde && d.fecha < f.fechaDesde) return false;
    if (f.fechaHasta && d.fecha > f.fechaHasta) return false;
    if (f.inclinacionMin && Number(d.inclinacion_orbita) < Number(f.inclinacionMin)) return false;
    if (f.inclinacionMax && Number(d.inclinacion_orbita) > Number(f.inclinacionMax)) return false;
    if (f.masaOrbitaMin && (!d.masa_en_orbita || Number(d.masa_en_orbita) < Number(f.masaOrbitaMin))) return false;
    if (f.masaOrbitaMax && (!d.masa_en_orbita || Number(d.masa_en_orbita) > Number(f.masaOrbitaMax))) return false;
    if (f.clase_objeto && d.clase_objeto !== f.clase_objeto) return false;
    if (f.constelacion !== "todas"){
      const v = String(d.constelacion||"").toLowerCase();
      const enConst = v && v!=="noconstelacion" && v!=="no" ? true : false;
      if (f.constelacion==="si" && !enConst) return false;
      if (f.constelacion==="no" &&  enConst) return false;
    }
    const lat = getLat(d), lon = getLon(d);
    if (!pointInBBox(lat, lon, latMin, latMax, lonMin, lonMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const year = parseInt(fecha?.slice(0,4),10);
  if (year >= 2004 && year <= 2010) return iconoAzul;
  if (year >= 2011 && year <= 2017) return iconoVerde;
  if (year >= 2018 && year <= 2025) return iconoRojo;
  return iconoAmarillo;
}

function popupContenidoDebris(d,index){
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if(d.pais) contenido += `País: ${d.pais}<br>`;
  if(d.clase_objeto) contenido += `Clase: ${d.clase_objeto}<br>`;
  if(d.masa_en_orbita !== null && d.masa_en_orbita !== undefined) contenido += `Masa en órbita: ${d.masa_en_orbita} kg<br>`;
  if(d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if(d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if(d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if(d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if(d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}"><br>`;
  if(d.tle1 && d.tle2) {
    contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarTrayectoria(${index})">Ver trayectoria</button>`;
    contenido += `<button class="btn btn-sm btn-warning mt-2 ms-1" onclick="mostrarOrbita3D(${index})">Órbita 3D</button>`;
  }
  return contenido;
}

function actualizarMapa(){
  const datosFiltrados = filtrarDatos();
  document.getElementById("countSpan").textContent = String(datosFiltrados.length);
  if(capaPuntos){capaPuntos.clearLayers();}
  if(capaCalor && mapa.hasLayer(capaCalor)){mapa.removeLayer(capaCalor); capaCalor=null;}
  if(leyendaPuntos) leyendaPuntos.remove();
  if(leyendaCalor) leyendaCalor.remove();
  if(modo==="puntos"){
    datosFiltrados.forEach((d,i)=>{
      const lat = getLat(d), lon = getLon(d);
      if (lat===null || lon===null) return;
      const marker=L.marker([lat,lon],{icon:marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenidoDebris(d,i),{autoPan:true});
      marker.on('popupopen',function(e){
        const imgs=e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(img=>img.addEventListener('load',()=>{e.popup.update();}));
      });
      capaPuntos.addLayer(marker);
    });
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d=>[getLat(d),getLon(d)]).filter(([lat,lon])=>lat!==null && lon!==null);
    if(heatData.length){
      capaCalor=L.heatLayer(heatData,{
        radius:30, blur:25, minOpacity:0.4, max:30,
        gradient:{0.1:'blue',0.3:'lime',0.6:'yellow',1.0:'red'}
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
}

function mostrarLeyendaPuntos(){
  leyendaPuntos=L.control({position:'bottomright'});
  leyendaPuntos.onAdd=function(map){
    const div=L.DomUtil.create('div','info legend');
    div.innerHTML+=`<strong>Color del marcador según año de caída</strong><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2004 a 2010</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2011 a 2017</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">2018 a 2025</span><br>`;
    div.innerHTML+=`<img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png" style="width:13px;vertical-align:middle;"> <span style="color:#999">Antes de 2004</span><br>`;
    return div;
  };
  leyendaPuntos.addTo(mapa);
}
function mostrarLeyendaCalor(){
  leyendaCalor=L.control({position:'bottomright'});
  leyendaCalor.onAdd=function(map){
    const div=L.DomUtil.create('div','info legend');
    const grades=['Bajo','Medio','Alto','Muy alto'];
    const colors=['blue','lime','yellow','red'];
    div.innerHTML+='<strong>Densidad de caídas</strong><br>';
    for(let i=0;i<grades.length;i++){
      div.innerHTML+=`<i style="background:${colors[i]};width:14px;height:14px;display:inline-block;margin-right:5px;border-radius:2px;"></i> ${grades[i]}<br>`;
    }
    return div;
  };
  leyendaCalor.addTo(mapa);
}

// --- Trayectoria ---
window.mostrarTrayectoria = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");

  // --- ADVERTENCIA DE DIFERENCIA DE TIEMPO ---
  let mensajeDiferencia = '';
  if (d.dias_diferencia !== undefined && d.dias_diferencia !== null) {
    const horas = (d.dias_diferencia * 24).toFixed(2);
    mensajeDiferencia = `<div class="alert alert-warning p-2 mb-3" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i><strong>Advertencia:</strong> Diferencia de tiempo estimada entre la caída y los últimos datos orbitales (TLE): <b>${horas} horas</b></div>`;
  }
  const infoDiv = document.getElementById('trayectoriaInfo');
  if (infoDiv) {
    infoDiv.innerHTML = mensajeDiferencia;
  }

  setTimeout(() => {
    if (mapaTrayectoria) { mapaTrayectoria.remove(); mapaTrayectoria = null; }
    mapaTrayectoria = L.map('mapTrayectoria').setView([getLat(d), getLon(d)], 3);
    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { minZoom: 1, maxZoom: 20 }
    ).addTo(mapaTrayectoria);
    const satrec = satellite.twoline2satrec(d.tle1, d.tle2);
    const meanMotion = satrec.no * 1440 / (2 * Math.PI);
    const periodoMin = 1440 / meanMotion;
    const vueltas = 4;
    const minutosATrazar = periodoMin * vueltas;
    const jday = satrec.epochdays;
    const year = satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900;
    const epochDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) + (jday - 1) * 24 * 60 * 60 * 1000);
    let segments = [], segment = [], prevLon = null;
    for (let min = 0; min <= minutosATrazar; min += 1) {
      const time = new Date(epochDate.getTime() + min * 60000);
      const gmst = satellite.gstime(time);
      const pos = satellite.propagate(satrec, time);
      if (!pos || !pos.position) continue;
      const geo = satellite.eciToGeodetic(pos.position, gmst);
      let lat = satellite.degreesLat(geo.latitude);
      let lon = satellite.degreesLong(geo.longitude);
      if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90) continue;
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      if (prevLon !== null) {
        let delta = Math.abs(lon - prevLon);
        if (delta > 30) {
          if (segment.length > 1) segments.push(segment);
          segment = [];
        }
      }
      segment.push([lat, lon]);
      prevLon = lon;
    }
    if (segment.length > 1) segments.push(segment);
    segments.forEach(seg => {
      L.polyline(seg, { color: "#3f51b5", weight: 2 }).addTo(mapaTrayectoria);
    });
    L.marker([getLat(d), getLon(d)])
      .addTo(mapaTrayectoria)
      .bindPopup("Punto de caída")
      .openPopup();
    if (segments.length && segments[0].length > 1) {
      let bounds = segments.flat();
      mapaTrayectoria.fitBounds(bounds, {padding: [20, 20]});
    } else {
      mapaTrayectoria.setView([getLat(d), getLon(d)], 3);
    }
  }, 300);
  const modal = new bootstrap.Modal(document.getElementById('modalTrayectoria'));
  modal.show();
};

// --- Órbita 3D ---
window.mostrarOrbita3D = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) {
    return alert("No hay TLE para este debris.");
  }

  // --- ADVERTENCIA DE DIFERENCIA DE TIEMPO ---
  let mensajeDiferencia = '';
  if (d.dias_diferencia !== undefined && d.dias_diferencia !== null) {
    const horas = (d.dias_diferencia * 24).toFixed(2);
    mensajeDiferencia = `<div class="alert alert-warning p-2 mb-3" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i><strong>Advertencia:</strong> Diferencia de tiempo estimada entre la caída y los últimos datos orbitales (TLE): <b>${horas} horas</b></div>`;
  }
  const infoDiv = document.getElementById('orbita3DInfo');
  if (infoDiv) {
    infoDiv.innerHTML = mensajeDiferencia;
  }

  const modalElement = document.getElementById('modalOrbita3D');
  const modal = new bootstrap.Modal(modalElement);
  modalElement.addEventListener('shown.bs.modal', function onModalShown() {
    init(d);
    animate();
    modalElement.removeEventListener('shown.bs.modal', onModalShown);
  });
  modal.show();
  let scene, camera, renderer, earth, controls, line;
  function init(d) {
    const container = document.getElementById('orbita3DContainer');
    if (!container) return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000010);
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100000);
    camera.position.z = radioTierra * 3;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(EARTH_IMG_SRC,
      function(texture) {
        const geometry = new THREE.SphereGeometry(radioTierra, 64, 64);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        earth = new THREE.Mesh(geometry, material);
        scene.add(earth);
      },
      undefined,
      function(error) {
        console.error('Error al cargar la textura de la Tierra:', error);
      }
    );
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    plotOrbit(d);
  }
  function plotOrbit(d) {
    const satrec = satellite.twoline2satrec(d.tle1, d.tle2);
    const meanMotion = satrec.no * 1440 / (2 * Math.PI);
    const periodoMin = 1440 / meanMotion;
    const vueltas = 4;
    const minutosATrazar = periodoMin * vueltas;
    const epochDate = new Date(Date.UTC(satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900, 0, 1) + (satrec.epochdays - 1) * 24 * 60 * 60 * 1000);
    const points = [];
    for (let min = 0; min <= minutosATrazar; min += 1) {
      const time = new Date(epochDate.getTime() + min * 60000);
      const gmst = satellite.gstime(time);
      const pos = satellite.propagate(satrec, time);
      if (!pos || !pos.position) continue;
      const eciPos = pos.position;
      points.push(new THREE.Vector3(eciPos.x, eciPos.z, -eciPos.y));
    }
    if (points.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff9900 }));
      scene.add(line);
    }
  }
  function animate() {
    requestAnimationFrame(animate);
    if (earth) {
      earth.rotation.y += 0.01;
    }
    controls.update();
    renderer.render(scene, camera);
  }
}

// --- Listeners ---
function listeners(){
  [
    'fecha-desde','fecha-hasta','inclinacion-min','inclinacion-max',
    'masa-orbita-min','masa-orbita-max','lat-min','lat-max','lon-min','lon-max'
  ].forEach(id => document.getElementById(id).addEventListener('change', actualizarMapa));
  document.getElementById('modo-puntos').addEventListener('click', ()=>{ modo="puntos"; actualizarMapa(); });
  document.getElementById('modo-calor').addEventListener('click', ()=>{ modo="calor"; actualizarMapa(); });
  document.getElementById('btn-select-rect').addEventListener('click', (e)=>{ e.preventDefault(); activarSeleccionRect(); });
  document.getElementById('btn-clear-rect').addEventListener('click', (e)=>{ e.preventDefault(); limpiarSeleccionRect(); });
  ['const-all','const-yes','const-no'].forEach(id=>document.getElementById(id).addEventListener('change', actualizarMapa));
  document.getElementById('btn-informe').addEventListener('click', abrirInforme);
  document.getElementById('dlPDF').addEventListener('click', exportInformePDF);
}

// --- Selección rectangular ---
let rectSeleccion = null, seleccionActiva = false, startLL = null;
function activarSeleccionRect(){
  if (seleccionActiva) return;
  seleccionActiva = true;
  document.getElementById('map').style.cursor = 'crosshair';
  mapa.dragging.disable();
  let moving = false;
  function onDown(e){ startLL = e.latlng; moving = true; if (rectSeleccion) { mapa.removeLayer(rectSeleccion); rectSeleccion=null; } }
  function onMove(e){
    if (!moving || !startLL) return;
    const b = L.latLngBounds(startLL, e.latlng);
    if (!rectSeleccion) rectSeleccion = L.rectangle(b, {color:'#0d6efd',weight:2,fillOpacity:0.15, className:'selecting-rect'}).addTo(mapa);
    else rectSeleccion.setBounds(b);
  }
  function onUp(){
    moving = false; seleccionActiva = false; mapa.dragging.enable();
    mapa.off('mousedown', onDown); mapa.off('mousemove', onMove); mapa.off('mouseup', onUp);
    document.getElementById('map').style.cursor = '';
    if (!rectSeleccion) return;
    const b = rectSeleccion.getBounds();
    document.getElementById('lat-min').value = Math.min(b.getSouth(), b.getNorth()).toFixed(4);
    document.getElementById('lat-max').value = Math.max(b.getSouth(), b.getNorth()).toFixed(4);
    document.getElementById('lon-min').value = Math.min(b.getWest(), b.getEast()).toFixed(4);
    document.getElementById('lon-max').value = Math.max(b.getWest(), b.getEast()).toFixed(4);
    actualizarMapa();
  }
  mapa.on('mousedown', onDown);
  mapa.on('mousemove', onMove);
  mapa.on('mouseup', onUp);
}
function limpiarSeleccionRect(){
  if (rectSeleccion) { mapa.removeLayer(rectSeleccion); rectSeleccion=null; }
  ['lat-min','lat-max','lon-min','lon-max'].forEach(id=>document.getElementById(id).value='');
  actualizarMapa();
}

// --- Informe y PDF con Chart.js estéticas y correcciones ---
let charts = {}; // Para limpiar instancias previas

// ... (todo tu código previo idéntico hasta abrirInforme)

function abrirInforme() {
  const modal = new bootstrap.Modal(document.getElementById('informeModal'));
  modal.show();
  document.getElementById('informe-loading').style.display = "flex";

  // Limpieza previa
  Object.values(charts).forEach(c=>{ if(c) c.destroy(); });
  charts = {};
  document.getElementById('informe-resumen').innerText = "";
  // Ocultamos mapas anteriores si quedaban
  const canvasMapaPuntos = document.getElementById('canvasMapaPuntos');
  if (canvasMapaPuntos) {
    const ctx = canvasMapaPuntos.getContext('2d');
    ctx.clearRect(0,0,canvasMapaPuntos.width,canvasMapaPuntos.height);
  }
  // Eliminado el canvasMapaCalor

  setTimeout(() => {
    const filtrados = filtrarDatos();
    document.getElementById('informe-resumen').innerText =
      `Cantidad de registros visibles: ${filtrados.length}`;

    // --- Gráfica: Reentradas por tramo (Pie) ---
    const tramos = { "2004-2010": 0, "2011-2017": 0, "2018-2025": 0, "Antes de 2004": 0 };
    filtrados.forEach(d => {
      const y = anio(d.fecha);
      if (y >= 2004 && y <= 2010) tramos["2004-2010"]++;
      else if (y >= 2011 && y <= 2017) tramos["2011-2017"]++;
      else if (y >= 2018 && y <= 2025) tramos["2018-2025"]++;
      else tramos["Antes de 2004"]++;
    });
    charts.tramos = new Chart(document.getElementById('chartPieTramos'), {
      type: 'pie',
      data: {
        labels: Object.keys(tramos),
        datasets: [{
          data: Object.values(tramos),
          backgroundColor: ['#3f51b5','#43a047','#e53935','#ffc107'],
          borderColor: '#fff',
        }]
      },
      options: {
        plugins: {
          legend: { display: true },
          title: { display: false }
        }
      }
    });

    // --- Gráfica: Distribución por clase (Bar) ---
    const clases = {};
    filtrados.forEach(d => {
      const clase = d.clase_objeto || "Desconocido";
      clases[clase] = (clases[clase] || 0) + 1;
    });
    charts.clases = new Chart(document.getElementById('chartBarClases'), {
      type: 'bar',
      data: {
        labels: Object.keys(clases),
        datasets: [{
          label: 'Cantidad',
          data: Object.values(clases),
          backgroundColor: '#3f51b5'
        }]
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } }
    });

    // --- Gráfica: Masa reingresada por tipo (Bar) ---
    const tiposMasa = {};
    filtrados.forEach(d => {
      const tipo = d.clase_objeto || "Desconocido";
      tiposMasa[tipo] = (tiposMasa[tipo] || 0) + getMasaReingresadaKg(d);
    });
    charts.masa = new Chart(document.getElementById('chartBarTipoMasa'), {
      type: 'bar',
      data: {
        labels: Object.keys(tiposMasa),
        datasets: [{
          label: 'Masa (kg)',
          data: Object.values(tiposMasa).map(x=>Math.round(x)),
          backgroundColor: '#e53935'
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: {
            title: { display: true, text: 'Masa total reingresada (kg)' },
            beginAtZero: true,
            // ticks: { stepSize: 1 }   <-- QUITADO para evitar error de Chart.js con muchos ticks
          }
        }
      }
    });

    // --- Gráfica: Tiempo en órbita (Pie) ---
    const tiempos = { "<1 año": 0, "1-5 años": 0, "5-10 años": 0, ">10 años": 0 };
    filtrados.forEach(d => {
      const dias = getDiasEnOrbita(d);
      const años = dias / 365.25;
      if (años < 1) tiempos["<1 año"]++;
      else if (años < 5) tiempos["1-5 años"]++;
      else if (años < 10) tiempos["5-10 años"]++;
      else tiempos[">10 años"]++;
    });
    charts.tiempos = new Chart(document.getElementById('chartPieTiempo'), {
      type: 'pie',
      data: {
        labels: Object.keys(tiempos),
        datasets: [{
          data: Object.values(tiempos),
          backgroundColor: ['#43a047','#ffb300','#e53935','#3f51b5'],
          borderColor: '#fff',
        }]
      },
      options: {
        plugins: {
          legend: { display: true },
          title: { display: false }
        }
      }
    });

    // --- Mapa filtrado en el informe ---
    drawMapaPuntos(filtrados, 'canvasMapaPuntos');
    // drawMapaCalor ELIMINADO

    document.getElementById('informe-loading').style.display = "none";
  }, 600);
}

// --- Al cerrar modal, limpiar informe para el próximo ---
document.getElementById('informeModal').addEventListener('hidden.bs.modal', () => {
  Object.values(charts).forEach(c=>{ if(c) c.destroy(); });
  charts = {};
  document.getElementById('informe-resumen').innerText = "";
  // Limpia el mapa canvas
  const c=document.getElementById('canvasMapaPuntos');
  if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
  // El canvasMapaCalor ya no existe
});

// --- Exportar PDF ---
function exportInformePDF() {
  const doc = new window.jspdf.jsPDF("l", "pt", "a4");
  doc.setFontSize(20);
  doc.text("Informe de Debris Espaciales", 30, 40);
  doc.setFontSize(12);
  doc.text(document.getElementById('informe-resumen').innerText, 30, 70);

  // Gráficos
  const addChart = (canvasId, y) => {
    const chartCanvas = document.getElementById(canvasId);
    if (chartCanvas) {
      const imgData = chartCanvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", 40, y, 270, 140);
    }
  };
  addChart('chartPieTramos', 90);
  addChart('chartBarClases', 240);
  addChart('chartBarTipoMasa', 390);
  addChart('chartPieTiempo', 540);

  // Mapa
  const canvasPuntos = document.getElementById('canvasMapaPuntos');
  if (canvasPuntos) {
    const imgData = canvasPuntos.toDataURL("image/png");
    doc.addPage();
    doc.text("Mapa de puntos (por año de caída)", 30, 40);
    doc.addImage(imgData, "PNG", 40, 60, 600, 320);
  }
  // No hay canvasMapaCalor

  doc.save("informe-debris.pdf");
}

// ==================== MAPAS CANVAS PARA INFORME ====================

// --- Cargar earthmap1k solo una vez ---
let earthmapImg = null;
let earthmapLoading = false;
let earthmapCallbacks = [];

function cargarEarthmap(callback) {
  if (earthmapImg && earthmapImg.complete) {
    callback(earthmapImg);
    return;
  }
  earthmapCallbacks.push(callback);
  if (!earthmapLoading) {
    earthmapLoading = true;
    earthmapImg = new window.Image();
    earthmapImg.src = "img/earthmap1k.jpg";
    earthmapImg.onload = () => {
      earthmapLoading = false;
      earthmapCallbacks.forEach(cb => cb(earthmapImg));
      earthmapCallbacks = [];
    };
    earthmapImg.onerror = () => {
      earthmapLoading = false;
      earthmapCallbacks.forEach(cb => cb(null));
      earthmapCallbacks = [];
    };
  }
}

// --- Mapa de puntos (scatter, por año de caída) ---
function drawMapaPuntos(filtrados, canvasId) {
  cargarEarthmap((img) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fondo tierra con opacidad
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;

    // Dibuja puntos coloreados por año
    filtrados.forEach(d => {
      const lat = getLat(d), lon = getLon(d);
      if (lat === null || lon === null) return;
      const x = (lon + 180) / 360 * canvas.width;
      const y = canvas.height - (lat + 90) / 180 * canvas.height;
      const year = anio(d.fecha);
      let color = "#ffc107"; // Amarillo default
      if (year >= 2004 && year <= 2010) color = "#3f51b5";
      else if (year >= 2011 && year <= 2017) color = "#43a047";
      else if (year >= 2018 && year <= 2025) color = "#e53935";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });

    // Leyenda
    drawLeyendaAnios(canvas, ctx);
  });
}

// --- Leyenda para mapa de puntos ---
function drawLeyendaAnios(canvas, ctx) {
  const leyenda = [
    { color: "#3f51b5", label: "2004-2010" },
    { color: "#43a047", label: "2011-2017" },
    { color: "#e53935", label: "2018-2025" },
    { color: "#ffc107", label: "Antes de 2004" }
  ];
  const x0 = canvas.width - 150, y0 = canvas.height - 75;
  ctx.save();
  ctx.globalAlpha = 0.93;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x0 - 8, y0 - 8, 138, 56);
  ctx.globalAlpha = 1.0;
  ctx.font = "13px Inter, Arial";
  ctx.fillStyle = "#23272f";
  ctx.fillText("Color por año de caída", x0, y0 + 8);
  leyenda.forEach((item, i) => {
    ctx.beginPath();
    ctx.arc(x0 + 12, y0 + 24 + i * 13, 6, 0, 2 * Math.PI);
    ctx.fillStyle = item.color;
    ctx.fill();
    ctx.fillStyle = "#23272f";
    ctx.fillText(item.label, x0 + 25, y0 + 28 + i * 13);
  });
  ctx.restore();
}

