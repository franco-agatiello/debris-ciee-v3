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
    if(d.imagen) contenido += `<img src="${d.imagen}" alt="${d.nombre}" style="max-width:220px; height:auto;"><br>`;
    if(d.tle1 && d.tle2) {
        contenido += `<button class="btn btn-sm btn-info mt-2" onclick="mostrarTrayectoria(${index})">Ver trayectoria</button>`;
        contenido += `<button class="btn btn-sm btn-warning mt-2 ms-1" onclick="mostrarOrbita3D(${index})">Ver órbita 3D</button>`;
    }
    return contenido;
}

// Lógica de transición suave
function actualizarMapa(){
    const datosFiltrados = filtrarDatos();

    if(capaPuntos){
        capaPuntos.clearLayers(); 
        try{mapa.removeLayer(capaPuntos);}catch(e){} 
        capaPuntos=null;
    }
    if(capaCalor && mapa.hasLayer(capaCalor)){
        mapa.removeLayer(capaCalor); 
        capaCalor=null;
    }
    if(leyendaPuntos) leyendaPuntos.remove();
    if(leyendaCalor) leyendaCalor.remove();
    
    // Un pequeño retraso para que Leaflet tenga tiempo de procesar la eliminación
    setTimeout(() => {
        if(modo==="puntos"){
            capaPuntos=L.layerGroup();
            datosFiltrados.forEach((d,i)=>{
                const marker=L.marker([d.lugar_caida.lat,d.lugar_caida.lon],{icon:marcadorPorFecha(d.fecha)})
                .bindPopup(popupContenidoDebris(d,i),{autoPan:true});
                
                // Efecto hover
                marker.on('mouseover', function() {
                    this.getElement().style.transition = 'transform 0.2s ease';
                    this.getElement().style.transform = 'scale(1.3)';
                });
                marker.on('mouseout', function() {
                    this.getElement().style.transform = 'scale(1)';
                });

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
    }, 100); // 100ms de delay

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

window.mostrarOrbitaPlanta = function(index) {
    const d = filtrarDatos()[index];
    if (!d.tle1 || !d.tle2) return alert("No hay TLE para este debris.");

    const a = d.a ?? null;
    const apogeo = d.apogeo ?? null;
    const perigeo = d.perigeo ?? null;
    let excentricidad = null;
    if (a && apogeo !== null && perigeo !== null) {
        excentricidad = (apogeo - perigeo) / (apogeo + perigeo + 2*radioTierra);
    } else {
        excentricidad = null;
    }

    let infoHTML = `<strong>Parámetros orbitales:</strong><br>`;
    if (a) infoHTML += `Semi eje mayor (a): <b>${a.toFixed(2)}</b> km<br>`;
    if (apogeo) infoHTML += `Apogeo: <b>${apogeo.toFixed(2)}</b> km<br>`;
    if (perigeo) infoHTML += `Perigeo: <b>${perigeo.toFixed(2)}</b> km<br>`;
    if (excentricidad !== null) infoHTML += `Excentricidad: <b>${excentricidad.toFixed(4)}</b><br>`;
    document.getElementById('orbitaPlantaInfo').innerHTML = infoHTML;
    const canvas = document.getElementById('canvasPlanta');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (a && excentricidad !== null) {
        const margen_canvas = 30;
        const c = a * excentricidad;
        const b = a * Math.sqrt(1 - excentricidad*excentricidad);

        const ancho_izq = a - c;
        const ancho_der = a + c;
        const ancho_total = ancho_izq + ancho_der;
        const alto_total = 2 * b;
        const escala_x = (canvas.width - 2 * margen_canvas) / (ancho_total);
        const escala_y = (canvas.height - 2 * margen_canvas) / (alto_total);
        const escala = Math.min(escala_x, escala_y);

        const xc = canvas.width / 2;
        const yc = canvas.height / 2;
        const focoX = xc + c * escala;

        ctx.beginPath();
        ctx.ellipse(xc, yc, a * escala, b * escala, 0, 0, 2*Math.PI);
        ctx.strokeStyle = "#ff9900";
        ctx.lineWidth = 3;
        ctx.stroke();

        const img = new Image();
        img.src = 'img/earth.png';
        img.onload = function() {
            const earthRadiusPx = radioTierra * escala;
            ctx.save();
            ctx.beginPath();
            ctx.arc(focoX, yc, earthRadiusPx, 0, 2*Math.PI);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, focoX - earthRadiusPx, yc - earthRadiusPx, earthRadiusPx * 2, earthRadiusPx * 2);
            ctx.restore();

            ctx.fillStyle = "#ff0000";
            ctx.beginPath();
            ctx.arc(focoX + (a - c) * escala, yc, 5, 0, 2*Math.PI);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(focoX - (a + c) * escala, yc, 5, 0, 2*Math.PI);
            ctx.fill();
            canvas.onmousemove = function(e) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const perigeoX = focoX + (a - c) * escala;
                const apogeoX = focoX - (a + c) * escala;
                const r = 9;
                let msg = '';
                if (Math.hypot(mx - perigeoX, my - yc) < r) msg = 'Perigeo';
                else if (Math.hypot(mx - apogeoX, my - yc) < r) msg = 'Apogeo';
                else msg = '';
                canvas.title = msg;
            };
        };
    }

    const modal = new bootstrap.Modal(document.getElementById('modalOrbitaPlanta'));
    modal.show();
};

window.mostrarOrbita3D = function(index) {
    const d = filtrarDatos()[index];
    if (!d.tle1 || !d.tle2) {
        return alert("No hay TLE para este debris.");
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
        const earthTexture = textureLoader.load('img/earthmap1k.jpg',
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
    
    // Animación de dibujo de órbita
    function plotOrbit(d) {
        const satrec = satellite.twoline2satrec(d.tle1, d.tle2);
        const meanMotion = satrec.no * 1440 / (2 * Math.PI);
        const periodoMin = 1440 / meanMotion;
        const vueltas = 4;
        const minutosATrazar = periodoMin * vueltas;

        const epochDate = new Date(Date.UTC(satrec.epochyr < 57 ? satrec.epochyr + 2000 : satrec.epochyr + 1900, 0, 1) + (satrec.epochdays - 1) * 24 * 60 * 60 * 1000);

        const fullPoints = [];
        for (let min = 0; min <= minutosATrazar; min += 1) {
            const time = new Date(epochDate.getTime() + min * 60000);
            const gmst = satellite.gstime(time);
            const pos = satellite.propagate(satrec, time);

            if (!pos || !pos.position) continue;
            
            const eciPos = pos.position;
            fullPoints.push(new THREE.Vector3(eciPos.x, eciPos.z, -eciPos.y));
        }

        if (fullPoints.length > 1) {
            const geometry = new THREE.BufferGeometry();
            line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff9900 }));
            scene.add(line);

            let currentPointIndex = 0;
            const totalPoints = fullPoints.length;
            
            function animateLine() {
                if (currentPointIndex < totalPoints) {
                    const pointsToDraw = fullPoints.slice(0, currentPointIndex + 1);
                    geometry.setFromPoints(pointsToDraw);
                    currentPointIndex++;
                    requestAnimationFrame(animateLine);
                }
            }
            animateLine();
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
};

document.addEventListener("DOMContentLoaded", ()=>{
    initMapa();
    listeners();
    cargarDatos();
});
