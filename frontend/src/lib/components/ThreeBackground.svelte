<script lang="ts">
	import { isDark } from '$lib/stores/theme';
	import { browser } from '$app/environment';

	let reduceMotion = false;

	if (browser) {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
</script>

{#if $isDark}
	<div class="ambient-bg" aria-hidden="true">
		<div
			class="blob blob-primary"
			class:no-motion={reduceMotion}
		></div>
		<div
			class="blob blob-secondary"
			class:no-motion={reduceMotion}
		></div>
		<div
			class="blob blob-tertiary"
			class:no-motion={reduceMotion}
		></div>
	</div>
{/if}

<style>
	.ambient-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		overflow: hidden;
	}

	.blob {
		position: absolute;
		border-radius: 50%;
	}

	/* Primary blob — top center, indigo */
	.blob-primary {
		width: 900px;
		height: 1400px;
		top: -30%;
		left: 50%;
		transform: translateX(-50%);
		background: radial-gradient(ellipse, rgba(94, 106, 210, 0.15) 0%, transparent 70%);
		filter: blur(150px);
		animation: float-primary 10s ease-in-out infinite;
	}

	/* Secondary blob — bottom left */
	.blob-secondary {
		width: 600px;
		height: 800px;
		bottom: -10%;
		left: -5%;
		background: radial-gradient(ellipse, rgba(94, 106, 210, 0.08) 0%, transparent 70%);
		filter: blur(120px);
		animation: float-secondary 8s ease-in-out infinite;
	}

	/* Tertiary blob — right side, purple mix */
	.blob-tertiary {
		width: 500px;
		height: 700px;
		top: 30%;
		right: -5%;
		background: radial-gradient(ellipse, rgba(120, 90, 210, 0.06) 0%, transparent 70%);
		filter: blur(100px);
		animation: float-tertiary 12s ease-in-out infinite;
	}

	/* Disable animation for prefers-reduced-motion */
	.blob.no-motion {
		animation: none !important;
	}

	@keyframes float-primary {
		0%, 100% { transform: translateX(-50%) translateY(0) rotate(0deg); }
		50% { transform: translateX(-50%) translateY(-20px) rotate(1deg); }
	}

	@keyframes float-secondary {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		50% { transform: translateY(-15px) rotate(-1deg); }
	}

	@keyframes float-tertiary {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		50% { transform: translateY(-25px) rotate(1.5deg); }
	}
</style>
