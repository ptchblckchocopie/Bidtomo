<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let canvasContainer: HTMLDivElement;
	let currentCanvas: HTMLCanvasElement | null = null;
	let animationId: number;
	let cleanup: (() => void) | null = null;
	let isActive = false;

	let mouseNormX = 0;
	let mouseNormY = 0;
	let targetMouseX = 0;
	let targetMouseY = 0;

	function handleMouseMove(e: MouseEvent) {
		targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
		targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
	}

	function hasWebGL(): boolean {
		try {
			const c = document.createElement('canvas');
			return !!(c.getContext('webgl2') || c.getContext('webgl'));
		} catch {
			return false;
		}
	}

	function prefersReducedMotion(): boolean {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	async function initScene() {
		if (!browser || !canvasContainer || prefersReducedMotion() || !hasWebGL()) return;

		if (cleanup) { cleanup(); cleanup = null; }

		if (currentCanvas) {
			currentCanvas.remove();
			currentCanvas = null;
		}
		const canvas = document.createElement('canvas');
		canvas.className = 'three-bg';
		canvas.setAttribute('aria-hidden', 'true');
		canvasContainer.appendChild(canvas);
		currentCanvas = canvas;

		const THREE = await import('three');

		const w = window.innerWidth;
		const h = window.innerHeight;

		const renderer = new THREE.WebGLRenderer({
			canvas, alpha: true, antialias: true, powerPreference: 'low-power'
		});
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
		camera.position.z = 30;

		let cameraX = 0;
		let cameraY = 0;
		let time = 0;

		// --- Glass-like floating geometry cluster ---
		// Custom glass/crystal shader inspired by refraction aesthetics
		const glassVertexShader = `
			varying vec3 vWorldPosition;
			varying vec3 vNormal;
			varying vec3 vViewDir;
			varying vec2 vUv;

			void main() {
				vUv = uv;
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPos.xyz;
				vNormal = normalize(normalMatrix * normal);
				vViewDir = normalize(cameraPosition - worldPos.xyz);
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`;

		const glassFragmentShader = `
			uniform float uTime;
			uniform float uOpacity;
			uniform vec3 uColor;
			uniform float uFresnelPower;
			uniform float uChromaticShift;

			varying vec3 vWorldPosition;
			varying vec3 vNormal;
			varying vec3 vViewDir;
			varying vec2 vUv;

			void main() {
				// Fresnel effect for glass-edge glow
				float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), uFresnelPower);

				// Chromatic aberration-style color split
				float r = fresnel * (0.5 + 0.5 * sin(uTime * 0.3 + vWorldPosition.y * 0.5));
				float g = fresnel * (0.5 + 0.5 * sin(uTime * 0.3 + vWorldPosition.y * 0.5 + uChromaticShift));
				float b = fresnel * (0.5 + 0.5 * sin(uTime * 0.3 + vWorldPosition.y * 0.5 + uChromaticShift * 2.0));

				vec3 color = uColor + vec3(r, g, b) * 0.6;

				// Subtle interior noise pattern
				float noise = fract(sin(dot(vUv * 40.0, vec2(12.9898, 78.233))) * 43758.5453);
				color += noise * 0.02;

				// Edge highlight
				float edgeGlow = smoothstep(0.0, 0.4, fresnel) * 0.8;

				gl_FragColor = vec4(color, (fresnel * 0.6 + edgeGlow * 0.3 + 0.05) * uOpacity);
			}
		`;

		// Create glass block cluster (tetris-like arrangement)
		const glassMaterial = new THREE.ShaderMaterial({
			vertexShader: glassVertexShader,
			fragmentShader: glassFragmentShader,
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			uniforms: {
				uTime: { value: 0 },
				uOpacity: { value: 0.85 },
				uColor: { value: new THREE.Color(0.05, 0.08, 0.15) },
				uFresnelPower: { value: 2.5 },
				uChromaticShift: { value: 2.1 }
			}
		});

		const glassGroup = new THREE.Group();

		// Block arrangement — stacked glass cubes with slight offsets
		const boxGeo = new THREE.BoxGeometry(2.8, 2.8, 2.8, 1, 1, 1);
		const blockPositions = [
			[0, 0, 0],
			[0, 3.2, 0],
			[0, -3.2, 0],
			[3.2, 0, 0],
		];

		blockPositions.forEach(([x, y, z]) => {
			const mesh = new THREE.Mesh(boxGeo, glassMaterial.clone());
			mesh.position.set(x, y, z);
			mesh.rotation.set(
				Math.random() * 0.1,
				Math.random() * 0.1,
				Math.random() * 0.1
			);
			glassGroup.add(mesh);
		});

		// Add wireframe edges for definition
		const edgeMaterial = new THREE.LineBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.12,
		});

		blockPositions.forEach(([x, y, z]) => {
			const edges = new THREE.EdgesGeometry(boxGeo);
			const line = new THREE.LineSegments(edges, edgeMaterial.clone());
			line.position.set(x, y, z);
			glassGroup.add(line);
		});

		glassGroup.position.set(6, -1, -5);
		glassGroup.rotation.set(0.3, -0.4, 0.15);
		scene.add(glassGroup);

		// --- Ambient glow orbs (lens flare-like) ---
		const glowTexture = createGlowTexture(THREE);

		const glowPositions = [
			{ pos: [-12, 8, -20], scale: 15, opacity: 0.06, color: 0x4466aa },
			{ pos: [15, -5, -25], scale: 20, opacity: 0.04, color: 0x6688cc },
			{ pos: [-8, -10, -15], scale: 12, opacity: 0.05, color: 0x3355aa },
			{ pos: [20, 12, -30], scale: 18, opacity: 0.03, color: 0x5577bb },
		];

		const glowSprites: any[] = [];
		glowPositions.forEach(({ pos, scale, opacity, color }) => {
			const mat = new THREE.SpriteMaterial({
				map: glowTexture,
				color: color,
				transparent: true,
				opacity: opacity,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			});
			const sprite = new THREE.Sprite(mat);
			sprite.position.set(pos[0], pos[1], pos[2]);
			sprite.scale.set(scale, scale, 1);
			scene.add(sprite);
			glowSprites.push(sprite);
		});

		// --- Fine dust particles ---
		const particleCount = 200;
		const particleGeo = new THREE.BufferGeometry();
		const positions = new Float32Array(particleCount * 3);
		const sizes = new Float32Array(particleCount);

		for (let i = 0; i < particleCount; i++) {
			positions[i * 3] = (Math.random() - 0.5) * 80;
			positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
			positions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 10;
			sizes[i] = Math.random() * 1.5 + 0.3;
		}

		particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

		const particleMat = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.06,
			transparent: true,
			opacity: 0.3,
			sizeAttenuation: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});

		const particles = new THREE.Points(particleGeo, particleMat);
		scene.add(particles);

		// --- Animation loop ---
		function animate() {
			animationId = requestAnimationFrame(animate);
			time += 0.01;

			// Smooth mouse following
			mouseNormX += (targetMouseX - mouseNormX) * 0.02;
			mouseNormY += (targetMouseY - mouseNormY) * 0.02;

			// Camera parallax
			cameraX += (mouseNormX * 2.0 - cameraX) * 0.015;
			cameraY += (mouseNormY * 1.2 - cameraY) * 0.015;
			camera.position.x = cameraX;
			camera.position.y = cameraY;
			camera.lookAt(0, 0, 0);

			// Glass group — slow float + mouse interaction
			glassGroup.rotation.x = 0.3 + Math.sin(time * 0.4) * 0.08 + mouseNormY * 0.1;
			glassGroup.rotation.y = -0.4 + Math.cos(time * 0.3) * 0.1 + mouseNormX * 0.15;
			glassGroup.rotation.z = 0.15 + Math.sin(time * 0.2) * 0.05;
			glassGroup.position.y = -1 + Math.sin(time * 0.5) * 0.8;

			// Update glass shader uniforms
			glassGroup.children.forEach((child: any) => {
				if (child.material && child.material.uniforms) {
					child.material.uniforms.uTime.value = time;
				}
			});

			// Glow orbs — gentle drift
			glowSprites.forEach((sprite, i) => {
				sprite.position.x += Math.sin(time * 0.15 + i * 1.5) * 0.01;
				sprite.position.y += Math.cos(time * 0.12 + i * 2.0) * 0.008;
				const pulse = 0.9 + Math.sin(time * 0.3 + i * 1.2) * 0.1;
				sprite.scale.setScalar(glowPositions[i].scale * pulse);
			});

			// Particles — slow drift
			const posArr = particleGeo.attributes.position.array as Float32Array;
			for (let i = 0; i < particleCount; i++) {
				posArr[i * 3 + 1] += Math.sin(time + i * 0.1) * 0.003;
				posArr[i * 3] += Math.cos(time * 0.5 + i * 0.15) * 0.002;
			}
			particleGeo.attributes.position.needsUpdate = true;

			renderer.render(scene, camera);
		}

		animationId = requestAnimationFrame(animate);

		function onResize() {
			const w = window.innerWidth;
			const h = window.innerHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		}

		window.addEventListener('resize', onResize);

		cleanup = () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', onResize);
			scene.traverse((obj: any) => {
				if (obj.geometry) obj.geometry.dispose();
				if (obj.material) {
					if (Array.isArray(obj.material)) {
						obj.material.forEach((m: any) => m.dispose());
					} else {
						obj.material.dispose();
					}
				}
			});
			glowTexture.dispose();
			renderer.dispose();
			if (currentCanvas) {
				currentCanvas.remove();
				currentCanvas = null;
			}
		};

		isActive = true;
	}

	function createGlowTexture(THREE: any): any {
		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;

		const gradient = ctx.createRadialGradient(
			size / 2, size / 2, 0,
			size / 2, size / 2, size / 2
		);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		gradient.addColorStop(0.15, 'rgba(200, 220, 255, 0.6)');
		gradient.addColorStop(0.4, 'rgba(100, 140, 200, 0.15)');
		gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, size, size);

		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;
		return texture;
	}

	function destroyScene() {
		if (cleanup) { cleanup(); cleanup = null; }
		isActive = false;
	}

	onMount(() => {
		if (!browser) return;
		window.addEventListener('mousemove', handleMouseMove);
		initScene();
	});

	onDestroy(() => {
		if (browser) window.removeEventListener('mousemove', handleMouseMove);
		destroyScene();
	});
</script>

<div bind:this={canvasContainer} class="three-bg-container" aria-hidden="true"></div>

<style>
	.three-bg-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
	}

	.three-bg-container :global(.three-bg) {
		width: 100%;
		height: 100%;
	}
</style>
