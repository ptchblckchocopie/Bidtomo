<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';

	let container: HTMLDivElement;
	let cleanup: (() => void) | null = null;

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

	function initScene() {
		if (!browser || !container || prefersReducedMotion() || !hasWebGL()) return;
		if (cleanup) { cleanup(); cleanup = null; }

		const canvas = document.createElement('canvas');
		canvas.className = 'ripple-grid-bg';
		canvas.setAttribute('aria-hidden', 'true');
		container.appendChild(canvas);

		const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
		if (!gl) return;

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		const vert = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

		const frag = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec3 gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform vec2 mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;
in vec2 vUv;
out vec4 fragColor;

float pi = 3.141592;

void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    float dist = length(uv);
    float func = sin(pi * (iTime - dist));
    vec2 rippleUv = uv + uv * func * rippleIntensity;

    // Mouse interaction
    if (mouseInfluence > 0.0) {
        vec2 mouseUv = (mousePosition * 2.0 - 1.0);
        mouseUv.x *= iResolution.x / iResolution.y;
        float mouseDist = length(uv - mouseUv);
        float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
        float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;
        vec2 dir = length(uv - mouseUv) > 0.001 ? normalize(uv - mouseUv) : vec2(0.0);
        rippleUv += dir * mouseWave * rippleIntensity * 0.3;
    }

    vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);
    vec2 b = abs(a);

    float aaWidth = 0.5;
    vec2 smoothB = vec2(
        smoothstep(0.0, aaWidth, b.x),
        smoothstep(0.0, aaWidth, b.y)
    );

    vec3 color = vec3(0.0);
    color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));
    color += exp(-gridThickness * smoothB.y);
    color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
    color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

    if (glowIntensity > 0.0) {
        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
    }

    float ddd = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));

    vec2 vignetteCoords = vUv - 0.5;
    float vignetteDistance = length(vignetteCoords);
    float vignette = 1.0 - pow(vignetteDistance * 2.0, vignetteStrength);
    vignette = clamp(vignette, 0.0, 1.0);

    float finalFade = ddd * vignette;
    float alpha = length(color) * finalFade * opacity;
    fragColor = vec4(color * gridColor * finalFade * opacity, alpha);
}`;

		// Compile shaders
		function compileShader(type: number, source: string): WebGLShader | null {
			const shader = gl!.createShader(type);
			if (!shader) return null;
			gl!.shaderSource(shader, source);
			gl!.compileShader(shader);
			if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
				// Fallback for WebGL1 (no #version 300 es)
				console.warn('Shader compile failed:', gl!.getShaderInfoLog(shader));
				gl!.deleteShader(shader);
				return null;
			}
			return shader;
		}

		let vertShader = compileShader(gl.VERTEX_SHADER, vert);
		let fragShader = compileShader(gl.FRAGMENT_SHADER, frag);

		// WebGL1 fallback
		if (!vertShader || !fragShader) {
			const vert1 = `
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;
			const frag1 = `
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec3 gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform vec2 mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;
varying vec2 vUv;

float pi = 3.141592;

void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    float dist = length(uv);
    float func = sin(pi * (iTime - dist));
    vec2 rippleUv = uv + uv * func * rippleIntensity;

    if (mouseInfluence > 0.0) {
        vec2 mouseUv = (mousePosition * 2.0 - 1.0);
        mouseUv.x *= iResolution.x / iResolution.y;
        float mouseDist = length(uv - mouseUv);
        float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
        float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;
        vec2 dir = length(uv - mouseUv) > 0.001 ? normalize(uv - mouseUv) : vec2(0.0);
        rippleUv += dir * mouseWave * rippleIntensity * 0.3;
    }

    vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);
    vec2 b = abs(a);

    float aaWidth = 0.5;
    vec2 smoothB = vec2(
        smoothstep(0.0, aaWidth, b.x),
        smoothstep(0.0, aaWidth, b.y)
    );

    vec3 color = vec3(0.0);
    color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));
    color += exp(-gridThickness * smoothB.y);
    color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
    color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

    if (glowIntensity > 0.0) {
        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
        color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
    }

    float ddd = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));

    vec2 vignetteCoords = vUv - 0.5;
    float vignetteDistance = length(vignetteCoords);
    float vignette = 1.0 - pow(vignetteDistance * 2.0, vignetteStrength);
    vignette = clamp(vignette, 0.0, 1.0);

    float finalFade = ddd * vignette;
    float alpha = length(color) * finalFade * opacity;
    gl_FragColor = vec4(color * gridColor * finalFade * opacity, alpha);
}`;
			vertShader = compileShader(gl.VERTEX_SHADER, vert1);
			fragShader = compileShader(gl.FRAGMENT_SHADER, frag1);
		}

		if (!vertShader || !fragShader) return;

		const program = gl.createProgram()!;
		gl.attachShader(program, vertShader);
		gl.attachShader(program, fragShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.warn('Program link failed:', gl.getProgramInfoLog(program));
			return;
		}

		gl.useProgram(program);

		// Full-screen triangle (covers viewport with just 3 vertices)
		const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

		const posLoc = gl.getAttribLocation(program, 'position');
		gl.enableVertexAttribArray(posLoc);
		gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

		// Uniforms
		const loc = {
			iTime: gl.getUniformLocation(program, 'iTime'),
			iResolution: gl.getUniformLocation(program, 'iResolution'),
			gridColor: gl.getUniformLocation(program, 'gridColor'),
			rippleIntensity: gl.getUniformLocation(program, 'rippleIntensity'),
			gridSize: gl.getUniformLocation(program, 'gridSize'),
			gridThickness: gl.getUniformLocation(program, 'gridThickness'),
			fadeDistance: gl.getUniformLocation(program, 'fadeDistance'),
			vignetteStrength: gl.getUniformLocation(program, 'vignetteStrength'),
			glowIntensity: gl.getUniformLocation(program, 'glowIntensity'),
			opacity: gl.getUniformLocation(program, 'opacity'),
			mousePosition: gl.getUniformLocation(program, 'mousePosition'),
			mouseInfluence: gl.getUniformLocation(program, 'mouseInfluence'),
			mouseInteractionRadius: gl.getUniformLocation(program, 'mouseInteractionRadius'),
		};

		// Set static uniforms
		gl.uniform3f(loc.gridColor, 1.0, 1.0, 1.0); // #ffffff
		gl.uniform1f(loc.rippleIntensity, 0.05);
		gl.uniform1f(loc.gridSize, 10.0);
		gl.uniform1f(loc.gridThickness, 15.0);
		gl.uniform1f(loc.fadeDistance, 1.5);
		gl.uniform1f(loc.vignetteStrength, 2.0);
		gl.uniform1f(loc.glowIntensity, 0.1);
		gl.uniform1f(loc.opacity, 1.0);
		gl.uniform1f(loc.mouseInteractionRadius, 1.0);

		let mousePos = { x: 0.5, y: 0.5 };
		let targetMouse = { x: 0.5, y: 0.5 };
		let mouseInfluence = 0;
		let targetInfluence = 0;
		let animationId: number;

		function handleResize() {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const dpr = Math.min(window.devicePixelRatio, 2);
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			canvas.style.width = w + 'px';
			canvas.style.height = h + 'px';
			gl!.viewport(0, 0, canvas.width, canvas.height);
			gl!.uniform2f(loc.iResolution, canvas.width, canvas.height);
		}

		let lastMouseTime = 0;
		function handleMouseMove(e: MouseEvent) {
			const now = Date.now();
			if (now - lastMouseTime < 50) return;
			lastMouseTime = now;
			targetMouse.x = e.clientX / window.innerWidth;
			targetMouse.y = 1.0 - e.clientY / window.innerHeight;
			targetInfluence = 1.0;
		}

		function handleMouseLeave() {
			targetInfluence = 0;
		}

		handleResize();

		function animate(t: number) {
			animationId = requestAnimationFrame(animate);

			gl!.uniform1f(loc.iTime, t * 0.001);

			// Smooth mouse lerp
			mousePos.x += (targetMouse.x - mousePos.x) * 0.1;
			mousePos.y += (targetMouse.y - mousePos.y) * 0.1;
			mouseInfluence += (targetInfluence - mouseInfluence) * 0.05;

			gl!.uniform2f(loc.mousePosition, mousePos.x, mousePos.y);
			gl!.uniform1f(loc.mouseInfluence, mouseInfluence);

			gl!.drawArrays(gl!.TRIANGLES, 0, 3);
		}

		animationId = requestAnimationFrame(animate);

		window.addEventListener('resize', handleResize);
		window.addEventListener('mousemove', handleMouseMove, { passive: true });
		window.addEventListener('mouseleave', handleMouseLeave);

		cleanup = () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseleave', handleMouseLeave);
			gl!.getExtension('WEBGL_lose_context')?.loseContext();
			canvas.remove();
		};
	}

	onMount(() => {
		if (!browser) return;
		initScene();
	});

	onDestroy(() => {
		if (cleanup) { cleanup(); cleanup = null; }
	});
</script>

<div bind:this={container} class="ripple-grid-container" aria-hidden="true"></div>

<style>
	.ripple-grid-container {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
	}

	.ripple-grid-container :global(.ripple-grid-bg) {
		width: 100%;
		height: 100%;
	}
</style>
