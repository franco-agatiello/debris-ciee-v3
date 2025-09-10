// ================== Config ==================
const LOGO_SRC = "Captura de pantalla 2025-06-06 211123.png"; // watermark y PDF
const EARTH_IMG_SRC = "earthmap1k.jpg";                        // fondo local para mapa del informe

// Tramos de reentrada (fijos)
const TRAMOS_REENTRADA = [
  { label: "< 2004",    start: null, end: 2003 },
  { label: "2004–2010", start: 2004, end: 2010 },
  { label: "2011–2017", start: 2011, end: 2017 },
  { label: "2018–2025", start: 2018, end: 2025 },
];

// Tramos de tiempo en órbita (años)
const TRAMOS_TIEMPO_ORBITA = [
  { label: "<5 años",   min: null, max: 5 },
  { label: "5–10",      min: 5,    max: 10 },
  { label: "10–20",     min: 10,   max: 20 },
  { label: ">20",       min: 20,   max: null },
];

let debris = [];
let mapa, capaPuntos, capaCalor;
let rectSeleccion = null, seleccionActiva = false, startLL = null;

// ================== Mapa ==================
mapa = L.map('map', { worldCopyJump: true }).setView([0,0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 8,
  attribution: '&copy; OpenStreetMap',
  crossOrigin: true
}).addTo(mapa);
capaPuntos = L.layerGroup().addTo(mapa);

// ================== Datos ==================
(async function cargarDatos() {
  try {
    const r = await fetch("debris.json");
    debris = await r.json();
  } catch(e) {
    const r = await fetch("data/debris.json");
    debris = await r.json();
  }
  poblarDropdown("dropdownPaisMenu", "dropdownPaisBtn", valoresUnicos(debris.map(d=>d.pais)), "Todos");
  poblarDropdown("dropdownClaseMenu", "dropdownClaseBtn", valoresUnicos(debris.map(d=>d.clase_objeto)), "Todas");
  listeners();
  actualizarMapa();
})();

// ================== Helpers ==================
function valoresUnicos(arr){ return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'es')); }
function anio(str){ if(!str) return null; const y = parseInt(String(str).slice(0,4),10); return Number.isFinite(y)?y:null; }
function numOrNull(v){ if(v===""||v==null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function getLat(d){ return numOrNull(d?.lugar_caida?.lat ?? d?.lat ?? d?.latitude ?? d?.latitud ?? d?.Lat); }
function getLon(d){ return numOrNull(d?.lugar_caida?.lon ?? d?.lon ?? d?.longitude ?? d?.longitud ?? d?.Lon); }

function getMasaReingresadaKg(d){
  const keys = ["masa_reingresada_kg","masa_reingreso_kg","masa_reentrada","masa_reentrada_kg","tamano_caida_kg","masa_en_orbita"];
  for (const k of keys) {
    const v = Number(d?.[k]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

// ================== Dropdowns ==================
function poblarDropdown(menuId, btnId, items, etiquetaTodos="Todos"){
  const menu = document.getElementById(menuId);
  const btn  = document.getElementById(btnId);
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">${etiquetaTodos}</a></li>` +
    items.map(v=>`<li><a class="dropdown-item" href="#" data-value="${v}">${v}</a></li>`).join("");
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

// ================== Filtros ==================
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
    else { if (!(lon>=lonMin || lon<=lonMax)) return false; } // cruza 180°
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

// ================== Mapa (Leaflet en pantalla) ==================
function iconoPorFecha(fecha){
  const y = parseInt(String(fecha||'').slice(0,4),10);
  const iconUrl = y>=2018? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png'
    : (y>=2011? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'
    : (y>=2004? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png'
    : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png'));
  return L.icon({iconUrl, iconSize:[18,29], iconAnchor:[9,29], popupAnchor:[1,-30]});
}
function actualizarMapa(){
  const datos = filtrarDatos();
  document.getElementById("countSpan").textContent = String(datos.length);
  capaPuntos.clearLayers();
  const bounds = [];
  datos.forEach(d=>{
    const lat = getLat(d), lon = getLon(d);
    if (lat===null || lon===null) return;
    L.marker([lat,lon], {icon: iconoPorFecha(d.fecha)})
      .bindPopup(`
        <div class="small">
          <div><strong>${d.nombre||''}</strong></div>
          <div>País: ${d.pais||'—'}</div>
          <div>Clase: ${d.clase_objeto||'—'}</div>
          <div>Fecha: ${d.fecha||'—'}</div>
          <div>Masa órbita: ${d.masa_en_orbita??'—'} kg</div>
          <div>Lat/Lon: ${lat}, ${lon}</div>
        </div>
      `).addTo(capaPuntos);
    bounds.push([lat,lon]);
  });
  if (bounds.length) try { mapa.fitBounds(bounds, {padding:[20,20]}); } catch {}
}

// ================== Selección rectangular ==================
function activarSeleccionRect(){
  if (seleccionActiva) return;
  seleccionActiva = true;
  mapa.dragging.disable();
  let moving = false;

  function onDown(e){ startLL = e.latlng; moving = true; if (rectSeleccion) { mapa.removeLayer(rectSeleccion); rectSeleccion=null; } }
  function onMove(e){
    if (!moving || !startLL) return;
    const b = L.latLngBounds(startLL, e.latlng);
    if (!rectSeleccion) rectSeleccion = L.rectangle(b, {color:'#0d6efd',weight:1,fillOpacity:0.1}).addTo(mapa);
    else rectSeleccion.setBounds(b);
  }
  function onUp(){
    moving = false; seleccionActiva = false; mapa.dragging.enable();
    mapa.off('mousedown', onDown); mapa.off('mousemove', onMove); mapa.off('mouseup', onUp);
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

// ================== Watermark (logo CIEE) ==================
const logoImg = new Image(); logoImg.crossOrigin = "anonymous"; logoImg.src = LOGO_SRC;
const chartsRegistry = [];
const cieeWatermark = {
  id: 'cieeWatermark',
  afterDraw(chart) {
    if (!logoImg.complete) { chartsRegistry.push(chart); return; }
    const ctx = chart.ctx, { chartArea } = chart;
    const w = (chartArea.right - chartArea.left) * 0.25;
    const h = w * 0.32;
    const x = chartArea.right - w - 8;
    const y = chartArea.bottom - h - 8;
    ctx.save(); ctx.globalAlpha = 0.12; ctx.drawImage(logoImg, x, y, w, h); ctx.restore();
  }
};
Chart.register(cieeWatermark);
logoImg.onload = () => { chartsRegistry.forEach(c=>c.draw()); chartsRegistry.length=0; };

// ================== Informe (modal + PDF) ==================
let chPieTramos=null, chBarClases=null, chBarTipoMasa=null, chPieTiempo=null;
let earthImg = null, earthLoaded = false, earthTried = false;

// Carga de imagen del mundo (una sola vez)
function loadEarth(){
  return new Promise((resolve)=>{
    if (earthLoaded) return resolve(earthImg);
    if (earthTried && !earthImg) return resolve(null);
    earthTried = true;
    const img = new Image();
    img.onload = ()=>{ earthImg = img; earthLoaded = true; resolve(img); };
    img.onerror = ()=> resolve(null);
    img.src = EARTH_IMG_SRC; // local -> sin CORS
  });
}

// Proyección equirectangular simple
function lonLatToXY(lon, lat, W, H){
  const x = ( (lon + 180) / 360 ) * W;
  const y = ( (90 - lat) / 180 ) * H;
  return [x, y];
}
function colorPorTramo(y){
  // similar a los marcadores Leaflet
  if (y>=2018) return '#e74c3c';   // rojo
  if (y>=2011) return '#2ecc71';   // verde
  if (y>=2004) return '#3498db';   // azul
  return '#f1c40f';                // amarillo
}

// Dibuja un "mapa" rápido en canvas y devuelve dataURL
async function renderMapPreview(datos){
  const canvas = document.getElementById('canvasMapaInforme');
  const cont = canvas.parentElement; // col contenedora
  const W = Math.min(Math.max(cont.clientWidth, 720), 1200); // ancho razonable
  const H = Math.round(W / 2); // 2:1
  canvas.width = W; canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef3f7'; ctx.fillRect(0,0,W,H);

  const img = await loadEarth();
  if (img) ctx.drawImage(img, 0, 0, W, H);

  // Borde y graticula liviana
  ctx.strokeStyle = '#c9d6e2'; ctx.lineWidth = 1;
  for (let lon=-180; lon<=180; lon+=60){
    const x = ((lon+180)/360)*W; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  }
  for (let lat=-60; lat<=60; lat+=30){
    const y = ((90-lat)/180)*H; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // Puntos
  const r = 2.2;
  for (const d of datos){
    const lat = getLat(d), lon = getLon(d);
    if (lat==null || lon==null) continue;
    const [x,y] = lonLatToXY(lon, lat, W, H);
    ctx.fillStyle = colorPorTramo(anio(d.fecha));
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6; ctx.stroke();
  }

  // Rectángulo de filtros si aplica
  const f = obtenerFiltros();
  const latMin = f.latMin!==""?Number(f.latMin):null;
  const latMax = f.latMax!==""?Number(f.latMax):null;
  const lonMin = f.lonMin!==""?Number(f.lonMin):null;
  const lonMax = f.lonMax!==""?Number(f.lonMax):null;
  if (latMin!==null || latMax!==null || lonMin!==null || lonMax!==null){
    const aLat = latMin ?? -90, bLat = latMax ?? 90;
    const aLon = lonMin ?? -180, bLon = lonMax ?? 180;
    const [x1,y1] = lonLatToXY(aLon, bLat, W, H);
    const [x2,y2] = lonLatToXY(bLon, aLat, W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(13,110,253,0.10)';
    ctx.strokeStyle = '#0d6efd'; ctx.lineWidth = 2;
    const rx = Math.min(x1,x2), ry = Math.min(y1,y2);
    const rw = Math.abs(x2-x1), rh = Math.abs(y2-y1);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // Devolver dataURL y pintar <img>
  const url = canvas.toDataURL('image/png', 0.95);
  document.getElementById('imgMapaInforme').src = url;
  return url;
}

function renderChart(id, type, labels, data, title){
  const el = document.getElementById(id);
  if (!el) return null;
  if (el._chartInstance) el._chartInstance.destroy();
  const inst = new Chart(el, {
    type,
    data: { labels, datasets: [{ label: title, data }] },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' }, title: { display: false } },
      animation: false
    }
  });
  el._chartInstance = inst;
  return inst;
}

function resumenTextoPlano(datos, filtros){
  const r = (a,b)=> (!a && !b) ? "—" : `${a||"…"} a ${b||"…"}`
  return `Objetos mostrados: ${datos.length}.  Filtros: País=${filtros.pais||"Todos"}, Clase=${filtros.clase_objeto||"Todas"}, Fecha=${r(filtros.fechaDesde,filtros.fechaHasta)}, Inc=${r(filtros.inclinacionMin,filtros.inclinacionMax)}°, Masa=${r(filtros.masaOrbitaMin,filtros.masaOrbitaMax)} kg, Lat=${r(filtros.latMin,filtros.latMax)}, Lon=${r(filtros.lonMin,filtros.lonMax)}, Constelación=${filtros.constelacion}.`;
}

// Genera contenido del informe (rápido) y deja lista la imagen del mapa
async function generarInforme(){
  const loading = document.getElementById('informe-loading');
  loading.classList.remove('d-none');

  await new Promise(r=>setTimeout(r,0)); // deja dibujar el modal

  const datos = filtrarDatos();
  const filtros = obtenerFiltros();

  document.getElementById('informe-resumen').textContent = resumenTextoPlano(datos, filtros);

  const tr = contarTramos(datos);
  chPieTramos    = renderChart('chartPieTramos', 'pie', tr.labels, tr.data, 'Tramos de reentrada');

  const cls = contarClases(datos);
  chBarClases    = renderChart('chartBarClases', 'bar', cls.labels, cls.data, 'Distribución por clase');

  const tp  = masaPorTipo(datos);
  chBarTipoMasa = renderChart('chartBarTipoMasa', 'bar', tp.labels, tp.data, 'Masa reingresada (kg) por tipo');

  const to  = agruparTiempoOrbita(datos);
  chPieTiempo   = renderChart('chartPieTiempo', 'pie', to.labels, to.data, 'Tiempo en órbita');

  // Imagen del mapa renderizada en canvas propio (muy liviano)
  await renderMapPreview(datos);

  loading.classList.add('d-none');
}

// Abre modal al instante y genera contenido (fluido)
function abrirInforme() {
  const modal = new bootstrap.Modal(document.getElementById('informeModal'));
  modal.show();
  generarInforme();
}

// Exporta a PDF usando lo ya renderizado (sin recapturas pesadas)
async function exportInformePDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin*2;
  let y = margin;

  const filtros = obtenerFiltros();
  const datos = filtrarDatos();

  try { doc.addImage(LOGO_SRC, "PNG", margin, y-5, 25, 10); } catch {}
  doc.setFontSize(16); doc.text("Informe de reentradas", margin+30, y);
  doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleString()}`, pageW-margin, y, {align:"right"});
  y += 10;

  const resumen = resumenTextoPlano(datos, filtros);
  doc.setFontSize(10);
  doc.splitTextToSize(resumen, contentW).forEach(line=>{ doc.text(line, margin, y); y+=5; });
  y += 4;

  // Añadir gráficos (como imágenes desde los canvas existentes)
  const addCanvas = (id, titulo) => {
    const el = document.getElementById(id);
    if (!el) return;
    const data = el.toDataURL("image/png", 0.95);
    const ratio = el.height / el.width;
    const w = contentW, h = w * ratio;
    if (y + h + 20 > pageH - margin) { doc.addPage(); y = margin; }
    doc.setFontSize(12); doc.text(titulo, margin, y); y += 6;
    doc.addImage(data, "PNG", margin, y, w, h, undefined, "FAST"); y += h + 8;
  };
  addCanvas('chartPieTramos',   'Reentradas por tramo');
  addCanvas('chartBarClases',   'Distribución por clase');
  addCanvas('chartBarTipoMasa', 'Masa reingresada (kg) por tipo de debris');
  addCanvas('chartPieTiempo',   'Tiempo en órbita');

  // Mapa (desde nuestro canvas liviano)
  const mapCanvas = document.getElementById('canvasMapaInforme');
  if (mapCanvas && mapCanvas.width){
    const data = mapCanvas.toDataURL("image/png", 0.95);
    const w = contentW, h = w * 0.5;
    if (y + h + 20 > pageH - margin) { doc.addPage(); y = margin; }
    doc.setFontSize(12); doc.text('Mapa (registros filtrados)', margin, y); y += 6;
    doc.addImage(data, "PNG", margin, y, w, h, undefined, "FAST");
  }

  doc.save("informe_reentradas.pdf");
}

// ================== Agrupaciones (gráficos) ==================
function tramoReentrada(y){
  if (y==null) return null;
  for (const t of TRAMOS_REENTRADA){
    const okS = t.start==null || y>=t.start;
    const okE = t.end==null   || y<=t.end;
    if (okS && okE) return t.label;
  }
  return null;
}
function contarTramos(datos){
  const obj = Object.fromEntries(TRAMOS_REENTRADA.map(t=>[t.label,0]));
  datos.forEach(d=>{ const y=anio(d.fecha); const lab=tramoReentrada(y); if (lab) obj[lab]++; });
  const labels = TRAMOS_REENTRADA.map(t=>t.label);
  return { labels, data: labels.map(l=>obj[l]) };
}
function contarClases(datos){
  const m = {};
  datos.forEach(d=>{ const k = d.clase_objeto || "Desconocido"; m[k] = (m[k]||0)+1; });
  const labels = Object.keys(m).sort((a,b)=>m[b]-m[a]);
  return { labels, data: labels.map(k=>m[k]) };
}
function masaPorTipo(datos){
  const m = {};
  datos.forEach(d=>{
    const k = d.clase_objeto || "Desconocido";
    const kg = getMasaReingresadaKg(d);
    m[k] = (m[k]||0) + kg;
  });
  const labels = Object.keys(m).sort((a,b)=>m[b]-m[a]);
  return { labels, data: labels.map(k=>Number(m[k].toFixed(2))) };
}
function agruparTiempoOrbita(datos){
  const buckets = Object.fromEntries(TRAMOS_TIEMPO_ORBITA.map(t=>[t.label,0]));
  datos.forEach(d=>{
    const dias = Number(d.dias_en_orbita ?? d.tiempo_en_orbita_dias ?? d.tiempo_en_orbita);
    if (!Number.isFinite(dias)) return;
    const anios = dias/365.25;
    for (const t of TRAMOS_TIEMPO_ORBITA){
      const okMin = t.min==null || anios>=t.min;
      const okMax = t.max==null || anios<t.max;
      if (okMin && okMax){ buckets[t.label]++; break; }
    }
  });
  const labels = TRAMOS_TIEMPO_ORBITA.map(t=>t.label);
  return { labels, data: labels.map(l=>buckets[l]) };
}

// ================== Listeners ==================
function listeners(){
  ['fecha-desde','fecha-hasta','inclinacion-min','inclinacion-max','masa-orbita-min','masa-orbita-max','lat-min','lat-max','lon-min','lon-max']
    .forEach(id => document.getElementById(id).addEventListener('change', actualizarMapa));

  document.getElementById('modo-puntos').addEventListener('click', ()=>{ actualizarMapa(); });
  document.getElementById('modo-calor').addEventListener('click', ()=>{ actualizarMapa(); });

  document.getElementById('btn-select-rect').addEventListener('click', (e)=>{ e.preventDefault(); activarSeleccionRect(); });
  document.getElementById('btn-clear-rect').addEventListener('click', (e)=>{ e.preventDefault(); limpiarSeleccionRect(); });

  ['const-all','const-yes','const-no'].forEach(id=>document.getElementById(id).addEventListener('change', actualizarMapa));

  // Abrir modal rápido y generar luego (fluido)
  document.getElementById('btn-informe').addEventListener('click', abrirInforme);
  document.getElementById('dlPDF').addEventListener('click', exportInformePDF);
}
