import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let debris = [];
let mapa, capaPuntos, capaCalor, modo = "puntos";
let leyendaPuntos, leyendaCalor;
let mapaTrayectoria = null;

const radioTierra = 6371; // km

const iconoAzul = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoVerde = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoRojo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});
const iconoAmarillo = L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',iconSize:[18,29],iconAnchor:[9,29],popupAnchor:[1,-30]});

async function cargarDatos() {
  const resp = await fetch('data/debris.json');
  debris = await resp.json();
  poblarFiltros();
  actualizarMapa();
}

function poblarFiltros() {
  const paises = Array.from(new Set(debris.map(d => d.pais).filter(p => p && p !== null)));
  paises.sort((a,b) => a.localeCompare(b,'es'));
  const menu = document.getElementById("dropdownPaisMenu");
  menu.innerHTML = `<li><a class="dropdown-item" href="#" data-value="">Todos</a></li>` +
    paises.map(p => `<li><a class="dropdown-item" href="#" data-value="${p}">${p}</a></li>`).join('');
  menu.querySelectorAll('.dropdown-item').forEach(item=>{
    item.addEventListener('click', function(e){
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
  return debris.filter(d=>{
    if (filtros.pais && d.pais !== filtros.pais) return false;
    if (filtros.fechaDesde && d.fecha < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && d.fecha > filtros.fechaHasta) return false;
    if (filtros.inclinacionMin && Number(d.inclinacion_orbita) < Number(filtros.inclinacionMin)) return false;
    if (filtros.inclinacionMax && Number(d.inclinacion_orbita) > Number(filtros.inclinacionMax)) return false;
    return true;
  });
}

function marcadorPorFecha(fecha) {
  const year = parseInt(fecha.slice(0,4),10);
  if (year >= 2004 && year <= 2010) return iconoAzul;
  if (year >= 2011 && year <= 2017) return iconoVerde;
  if (year >= 2018 && year <= 2025) return iconoRojo;
  return iconoAmarillo;
}

function actualizarBotonesModo() {
  document.getElementById("modo-puntos").classList.toggle("active",modo==="puntos");
  document.getElementById("modo-calor").classList.toggle("active",modo==="calor");
}

function popupContenidoDebris(d,index){
  let contenido = `<strong>${d.nombre ?? ''}</strong><br>`;
  if(d.pais) contenido += `País: ${d.pais}<br>`;
  if(d.tamano_caida_kg !== null && d.tamano_caida_kg !== undefined) contenido += `Masa caída: ${d.tamano_caida_kg} kg<br>`;
  if(d.material_principal) contenido += `Material: ${d.material_principal}<br>`;
  if(d.inclinacion_orbita !== null && d.inclinacion_orbita !== undefined) contenido += `Inclinación órbita: ${d.inclinacion_orbita}°<br>`;
  if(d.fecha) contenido += `Fecha: ${d.fecha}<br>`;
  if(d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}"><br>`;
  if(d.tle1 && d.tle2) {
    contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarTrayectoria(${index})">Ver trayectoria</button>`;
    contenido += `<button class="btn btn-sm btn-warning mt-2 ms-1" onclick="mostrarOrbita3D(${index})">Ver órbita 3D</button>`;
  }
  return contenido;
}

function actualizarMapa(){
  const datosFiltrados = filtrarDatos();
  if(capaPuntos){capaPuntos.clearLayers(); try{mapa.removeLayer(capaPuntos);}catch(e){} capaPuntos=null;}
  if(capaCalor && mapa.hasLayer(capaCalor)){mapa.removeLayer(capaCalor); capaCalor=null;}
  if(leyendaPuntos) leyendaPuntos.remove();
  if(leyendaCalor) leyendaCalor.remove();
  if(modo==="puntos"){
    capaPuntos=L.layerGroup();
    datosFiltrados.forEach((d,i)=>{
      const marker=L.marker([d.lugar_caida.lat,d.lugar_caida.lon],{icon:marcadorPorFecha(d.fecha)})
        .bindPopup(popupContenidoDebris(d,i),{autoPan:true});
      marker.on('popupopen',function(e){
        const imgs=e.popup._contentNode.querySelectorAll('img');
        imgs.forEach(img=>img.addEventListener('load',()=>{e.popup.update();}));
      });
      capaPuntos.addLayer(marker);
    });
    capaPuntos.addTo(mapa);
    mostrarLeyendaPuntos();
  } else {
    const heatData = datosFiltrados.map(d=>[d.lugar_caida.lat,d.lugar_caida.lon]);
    if(heatData.length){
      capaCalor=L.heatLayer(heatData,{
        radius:30, blur:25, minOpacity:0.4, max:30,
        gradient:{0.1:'blue',0.3:'lime',0.6:'yellow',1.0:'red'}
      }).addTo(mapa);
    }
    mostrarLeyendaCalor();
  }
  actualizarBotonesModo();
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

function initMapa() {
  mapa = L.map('map').setView([0, 0], 2);
  L.tileLayer(
    'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png',
    { minZoom: 1, maxZoom: 20 }
  ).addTo(mapa);
}

function listeners(){
  ["fecha-desde","fecha-hasta","inclinacion-min","inclinacion-max"].forEach(id=>{
    document.getElementById(id).addEventListener("change",actualizarMapa);
  });
  document.getElementById("modo-puntos").addEventListener("click",()=>{modo="puntos"; actualizarMapa();});
  document.getElementById("modo-calor").addEventListener("click",()=>{modo="calor"; actualizarMapa();});
}

window.mostrarTrayectoria = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");
  const diasDiferencia = d.dias_diferencia;
  let mensajeDiferencia = '';
  if (diasDiferencia !== undefined && diasDiferencia !== null) {
    const horas = (diasDiferencia * 24).toFixed(2);
    mensajeDiferencia = `<div class="alert alert-warning p-2" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i><strong>Advertencia:</strong> Diferencia de tiempo estimada entre la caída y los últimos datos orbitales (TLE): <b>${horas} horas</b></div>`;
  }
  const infoDiv = document.getElementById('trayectoriaInfo');
  if (infoDiv) {
    infoDiv.innerHTML = mensajeDiferencia;
  }
  setTimeout(() => {
    if (mapaTrayectoria) { mapaTrayectoria.remove(); mapaTrayectoria = null; }
    mapaTrayectoria = L.map('mapTrayectoria').setView([d.lugar_caida.lat, d.lugar_caida.lon], 3);
    L.tileLayer(
      'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png',
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
    L.marker([d.lugar_caida.lat, d.lugar_caida.lon])
      .addTo(mapaTrayectoria)
      .bindPopup("Punto de caída")
      .openPopup();
    if (segments.length && segments[0].length > 1) {
      let bounds = segments.flat();
      mapaTrayectoria.fitBounds(bounds, {padding: [20, 20]});
    } else {
      mapaTrayectoria.setView([d.lugar_caida.lat, d.lugar_caida.lon], 3);
    }
  }, 300);
  const modal = new bootstrap.Modal(document.getElementById('modalTrayectoria'));
  modal.show();
};

window.mostrarOrbita3D = function(index) {
  const d = filtrarDatos()[index];
  if (!d.tle1 || !d.tle2) {
    return alert("No hay TLE para este debris.");
  }
  const diasDiferencia = d.dias_diferencia;
  let mensajeDiferencia = '';
  if (diasDiferencia !== undefined && diasDiferencia !== null) {
    const horas = (diasDiferencia * 24).toFixed(2);
    mensajeDiferencia = `<div class="alert alert-warning p-2" role="alert"><i class="bi bi-exclamation-triangle-fill me-2"></i><strong>Advertencia:</strong> Diferencia de tiempo estimada entre la caída y los últimos datos orbitales (TLE): <b>${horas} horas</b></div>`;
  }
  const infoDiv = document.getElementById('orbita3DInfo');
  if (infoDiv) {
    infoDiv.innerHTML = mensajeDiferencia;
  }
  const modalElement = document.getElementById('modalOrbita3D');
  const modal = new bootstrap.Modal(modalElement);
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
    textureLoader.load('img/earthmap1k.jpg',
      function(texture) {
        const geometry = new THREE.SphereGeometry(radioTierra, 64, 64);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        earth = new THREE.Mesh(geometry, material);
        earth.rotation.x = (23.5 * Math.PI) / 180; // Inclinación axial de 23.5 grados
        scene.add(earth);
      },
      undefined,
      function(error) {
        console.error('Error al cargar la textura de la Tierra:', error);
      }
    );
    
    // Añadir rejilla sutil para la eclíptica
    const gridSize = radioTierra * 5; // Mayor para una sensación infinita
    const gridHelper = new THREE.GridHelper(gridSize, 100, 0x555555, 0x333333);
    const gridMaterial = gridHelper.material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.2;
    gridHelper.rotation.x = Math.PI / 2; // Orientar la rejilla en el plano XY
    scene.add(gridHelper);

    // Crear un lienzo para el texto
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = 'Bold 40px Arial';
    context.fillStyle = 'white';
    context.fillText('Plano Orbital (Eclíptica)', 10, 50);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.8 });
    const textSprite = new THREE.Sprite(spriteMaterial);
    textSprite.scale.set(400, 100, 1);
    textSprite.position.set(0, 0, 0); // Posicionarlo cerca de la rejilla
    scene.add(textSprite);

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
      const rotacionPorFrame = (2 * Math.PI) / 4 / 60; // 1 vuelta cada 4 segundos (2π rad / 4s)
      earth.rotation.y += rotacionPorFrame;
    }
    
    controls.update();
    renderer.render(scene, camera);
  }
  
  modalElement.addEventListener('shown.bs.modal', function onModalShown() {
    init(d);
    animate();
    modalElement.removeEventListener('shown.bs.modal', onModalShown);
  });
  
  modal.show();
};

document.addEventListener("DOMContentLoaded", ()=>{
  initMapa();
  listeners();
  cargarDatos();
});
