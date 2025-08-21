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
    
    let scene, camera, renderer, earth, controls, line, textPerigeo, textApogeo, legenda3D, eclipticPlane, ecuatorialPlane;
    let orbitGroup;

    function crearLeyenda3D(container, modo) {
        const legendDiv = document.createElement('div');
        legendDiv.id = 'leyenda-3d';
        legendDiv.style.position = 'absolute';
        legendDiv.style.bottom = '20px';
        legendDiv.style.right = '20px';
        legendDiv.style.background = 'rgba(0, 0, 0, 0.5)';
        legendDiv.style.color = 'white';
        legendDiv.style.padding = '15px';
        legendDiv.style.borderRadius = '8px';
        legendDiv.style.fontFamily = 'Arial, sans-serif';
        
        let planoReferenciaTexto = '';
        if (modo === 'ecliptica') {
            planoReferenciaTexto = 'Plano de la Eclíptica';
        } else if (modo === 'ecuatorial') {
            planoReferenciaTexto = 'Plano Ecuatorial';
        }

        legendDiv.innerHTML = `
            <div>
                <span style="display:inline-block; width:15px; height:2px; background:#ff9900; margin-right:5px; vertical-align:middle;"></span>
                <span>Órbita de Debris</span>
            </div>
            <div>
                <span style="display:inline-block; width:15px; height:2px; background:rgba(255, 255, 255, 0.5); margin-right:5px; vertical-align:middle;"></span>
                <span>${planoReferenciaTexto}</span>
            </div>
        `;
        container.appendChild(legendDiv);
        return legendDiv;
    }

    function removerLeyenda3D() {
        const legend = document.getElementById('leyenda-3d');
        if (legend) {
            legend.remove();
        }
    }

    function alinearVistaEcliptica() {
        earthGroup.rotation.x = -23.4 * Math.PI / 180;
        ecuatorialPlane.visible = false;
        eclipticPlane.visible = true;
        controls.target.set(0, 0, 0);
        camera.position.set(0, 15000, 0);
        controls.update();
        removerLeyenda3D();
        crearLeyenda3D(document.getElementById('orbita3DContainer'), 'ecliptica');
    }

    function alinearVistaEcuatorial() {
        earthGroup.rotation.x = 0;
        ecuatorialPlane.visible = true;
        eclipticPlane.visible = false;
        controls.target.set(0, 0, 0);
        camera.position.set(radioTierra * 3, radioTierra * 0.5, radioTierra * 3);
        controls.update();
        removerLeyenda3D();
        crearLeyenda3D(document.getElementById('orbita3DContainer'), 'ecuatorial');
    }
    
    function init(d) {
        const container = document.getElementById('orbita3DContainer');
        if (!container) return;
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000010);
        
        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100000);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.position = 'absolute';
        buttonContainer.style.top = '10px';
        buttonContainer.style.right = '10px';
        buttonContainer.style.zIndex = '1000';
        container.appendChild(buttonContainer);

        const eclipticaBtn = document.createElement('button');
        eclipticaBtn.textContent = 'Ver Eclíptica';
        eclipticaBtn.className = 'btn btn-secondary btn-sm me-2';
        eclipticaBtn.onclick = alinearVistaEcliptica;
        buttonContainer.appendChild(eclipticaBtn);

        const ecuatorialBtn = document.createElement('button');
        ecuatorialBtn.textContent = 'Ver Ecuatorial';
        ecuatorialBtn.className = 'btn btn-secondary btn-sm';
        ecuatorialBtn.onclick = alinearVistaEcuatorial;
        buttonContainer.appendChild(ecuatorialBtn);
        
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
                earthGroup.add(earth);
            },
            undefined,
            function(error) {
                console.error('Error al cargar la textura de la Tierra:', error);
            }
        );
        
        const planeSize = radioTierra * 3;
        const divisions = 50;
        const gridGeometry = new THREE.PlaneGeometry(planeSize, planeSize, divisions, divisions);
        const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.1, side: THREE.DoubleSide, wireframe: true });
        
        ecuatorialPlane = new THREE.Mesh(gridGeometry, gridMaterial);
        ecuatorialPlane.rotation.x = Math.PI / 2;
        earthGroup.add(ecuatorialPlane);
        ecuatorialPlane.visible = true;

        eclipticPlane = new THREE.Mesh(gridGeometry, gridMaterial);
        eclipticPlane.rotation.x = Math.PI / 2;
        eclipticPlane.rotation.z = -23.4 * Math.PI / 180;
        earthGroup.add(eclipticPlane);
        eclipticPlane.visible = false;
        
        scene.add(earthGroup);

        const satrec = satellite.twoline2satrec(d.tle1, d.tle2);
        const perigeo = satrec.perigee + radioTierra;
        const apogeo = satrec.apogee + radioTierra;

        const canvasPerigeo = document.createElement('canvas');
        const contextPerigeo = canvasPerigeo.getContext('2d');
        contextPerigeo.font = 'Bold 40px Arial';
        contextPerigeo.fillStyle = 'yellow';
        contextPerigeo.fillText('Perigeo', 10, 50);
        const texturePerigeo = new THREE.Texture(canvasPerigeo);
        texturePerigeo.needsUpdate = true;
        const spriteMaterialPerigeo = new THREE.SpriteMaterial({ map: texturePerigeo, transparent: true, opacity: 0.8 });
        const textPerigeo = new THREE.Sprite(spriteMaterialPerigeo);
        textPerigeo.scale.set(400, 100, 1);
        textPerigeo.position.set(0, 0, -perigeo / 100);
        scene.add(textPerigeo);

        const canvasApogeo = document.createElement('canvas');
        const contextApogeo = canvasApogeo.getContext('2d');
        contextApogeo.font = 'Bold 40px Arial';
        contextApogeo.fillStyle = 'red';
        contextApogeo.fillText('Apogeo', 10, 50);
        const textureApogeo = new THREE.Texture(canvasApogeo);
        textureApogeo.needsUpdate = true;
        const spriteMaterialApogeo = new THREE.SpriteMaterial({ map: textureApogeo, transparent: true, opacity: 0.8 });
        const textApogeo = new THREE.Sprite(spriteMaterialApogeo);
        textApogeo.scale.set(400, 100, 1);
        textApogeo.position.set(0, 0, apogeo / 100);
        scene.add(textApogeo);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        plotOrbit(d);
        alinearVistaEcuatorial();
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
            orbitalLine = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xff9900 }));
            orbitalLine.name = "orbitalLine";
            scene.add(orbitalLine);
        }
    }
    
    function animate() {
        requestAnimationFrame(animate);
        if(orbitalLine){
            orbitalLine.rotation.y += (2*Math.PI)/240/60; // 360 grados en 240 minutos
        }
        controls.update();
        renderer.render(scene, camera);
    }
    
    modalElement.addEventListener('shown.bs.modal', function onModalShown() {
        init(d);
        animate();
        modalElement.removeEventListener('shown.bs.modal', onModalShown);
    });
    
    modalElement.addEventListener('hidden.bs.modal', function onModalHidden() {
        if (earthGroup) {
            scene.remove(earthGroup);
        }
        if (orbitalLine) {
            scene.remove(orbitalLine);
        }
        if (renderer) {
            renderer.dispose();
        }
        modalElement.removeEventListener('hidden.bs.modal', onModalHidden);
    });
    
    modal.show();
};
