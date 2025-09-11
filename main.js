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

// CIEE logo for watermark
const LOGO_WATERMARK_SRC = LOGO_SRC;

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
function getMasaReingresadaKg(d) { return Number(d.masa_en_orbita) || 0; }
function getDiasEnOrbita(d){ return Number(d.dias_en_orbita) || 0; }

function poblarDropdown(menuId, btnId, items, etiquetaTodos="Todos"){
  const menu = document.getElementById(menuId);
  const btn  = document.getElementById(btnId);
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">${etiquetaTodos}</a></li>` +
    items.map(v=>`<li><a class="dropdown-item" href="#" data-value="${v}">${v}</a></li>`).join("");
  btn.textContent = etiquetaTodos;
  btn.dataset.value = "";
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

// -- Marca de agua para Chart.js --
const watermarkPlugin = {
  id: 'cieeWatermark',
  beforeDraw: (chart) => {
    const ctx = chart.ctx;
    const { width, height } = chart;
    const img = document.getElementById('logo-ciee-watermark');
    if (!img || !img.complete) return;
    ctx.save();
    ctx.globalAlpha = 0.11;
    const imgW = width * 0.55;
    const imgH = imgW * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, (width-imgW)/2, (height-imgH)/2, imgW, imgH);
    ctx.restore();
  }
};

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
// ...igual que antes...

// --- Órbita 3D ---
// ...igual que antes...

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
// ...igual que antes...

// --- Informe y PDF con Chart.js estéticas y correcciones ---
let charts = {};

function abrirInforme() {
  const modal = new bootstrap.Modal(document.getElementById('informeModal'));
  modal.show();
  document.getElementById('informe-loading').style.display = "flex";

  // Limpieza previa
  Object.values(charts).forEach(c=>{ if(c) c.destroy(); });
  charts = {};
  document.getElementById('informe-resumen').innerText = "";
  document.getElementById('imgMapaInforme').classList.add('d-none');
  document.getElementById('imgMapaInforme').src = "";
  const canvasMapa = document.getElementById('canvasMapaInforme');
  if (canvasMapa) {
    canvasMapa.width = 650; canvasMapa.height = 320;
    const ctx = canvasMapa.getContext('2d');
    ctx.clearRect(0,0,canvasMapa.width,canvasMapa.height);
  }

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
      },
      plugins: [watermarkPlugin]
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
      options: { indexAxis: 'y', plugins: { legend: { display: false } } },
      plugins: [watermarkPlugin]
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
            ticks: { stepSize: 1 }
          }
        }
      },
      plugins: [watermarkPlugin]
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
      },
      plugins: [watermarkPlugin]
    });

    // --- Mapa filtrado en el informe: genera imagen ---
    if (canvasMapa) {
      const ctx = canvasMapa.getContext('2d');
      ctx.clearRect(0,0,canvasMapa.width,canvasMapa.height);
      ctx.fillStyle = "#eef";
      ctx.fillRect(0,0,canvasMapa.width,canvasMapa.height);
      // Marca de agua en el mapa
      const logoImg = document.getElementById('logo-ciee-watermark');
      if (logoImg && logoImg.complete) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        const imgW = canvasMapa.width * 0.55;
        const imgH = imgW * (logoImg.naturalHeight / logoImg.naturalWidth);
        ctx.drawImage(logoImg, (canvasMapa.width-imgW)/2, (canvasMapa.height-imgH)/2, imgW, imgH);
        ctx.restore();
      }
      // Dibuja puntos
      filtrados.forEach(d => {
        const lat = getLat(d), lon = getLon(d);
        if (lat === null || lon === null) return;
        const x = (lon+180)/360*canvasMapa.width;
        const y = canvasMapa.height-(lat+90)/180*canvasMapa.height;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2*Math.PI, false);
        ctx.fillStyle = "#3f51b5";
        ctx.fill();
      });
      // Mostrar imagen
      const img = document.getElementById('imgMapaInforme');
      img.src = canvasMapa.toDataURL("image/png", 1.0);
      img.classList.remove('d-none');
      img.style.width = "100%";
      img.style.maxWidth = "650px";
      img.style.height = "auto";
    }
    document.getElementById('informe-loading').style.display = "none";
  }, 600);
}

// --- Al cerrar modal, limpiar informe para el próximo ---
document.getElementById('informeModal').addEventListener('hidden.bs.modal', () => {
  Object.values(charts).forEach(c=>{ if(c) c.destroy(); });
  charts = {};
  document.getElementById('informe-resumen').innerText = "";
  document.getElementById('imgMapaInforme').src = "";
  document.getElementById('imgMapaInforme').classList.add('d-none');
});

// --- Exportar PDF ---
function exportInformePDF() {
  const doc = new window.jspdf.jsPDF("l", "pt", "a4");
  const logoImg = document.getElementById('logo-ciee-watermark');
  // Marca de agua en fondo de cada página
  function drawWatermark(doc, pageW, pageH) {
    if (logoImg && logoImg.complete) {
      doc.setGState(new doc.GState({opacity: 0.11}));
      doc.addImage(logoImg, "PNG",
        pageW/2-175, pageH/2-55, // centrado
        350, 110
      );
      doc.setGState(new doc.GState({opacity: 1}));
    }
  }

  doc.setFontSize(20);
  doc.text("Informe de Debris Espaciales", 30, 40);
  doc.setFontSize(12);
  doc.text(document.getElementById('informe-resumen').innerText, 30, 70);

  // Watermark page 1
  drawWatermark(doc, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());

  // Gráficos, en vertical, en alta calidad
  let y = 90;
  const chartIds = [
    {id: 'chartPieTramos', title: 'Reentradas por tramo'},
    {id: 'chartBarClases', title: 'Distribución por clase'},
    {id: 'chartBarTipoMasa', title: 'Masa total reingresada (kg) por tipo'},
    {id: 'chartPieTiempo', title: 'Tiempo en órbita'}
  ];
  chartIds.forEach(({id, title}) => {
    const chartCanvas = document.getElementById(id);
    if (chartCanvas) {
      doc.setFontSize(14);
      doc.text(title, 40, y);
      y += 20;
      const imgData = chartCanvas.toDataURL("image/png", 1.0);
      doc.addImage(imgData, "PNG", 40, y, 360, 150);
      y += 160;
    }
  });

  // Nueva página para el mapa
  doc.addPage();
  drawWatermark(doc, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
  doc.setFontSize(15);
  doc.text("Mapa de reentradas filtradas", 40, 40);
  const imgMapa = document.getElementById('imgMapaInforme');
  if (imgMapa && imgMapa.src) {
    doc.addImage(imgMapa.src, "PNG", 40, 60, 600, 320);
  }
  doc.save("informe-debris.pdf");
}
