<script lang="ts">
	import { isDark } from '$lib/stores/theme';

	let { onToggle }: { onToggle: () => void } = $props();
</script>

<button
	onclick={onToggle}
	class="theme-toggle"
	aria-label={$isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if $isDark}
		<!-- Sun icon -->
		<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="4" />
			<path
				stroke-linecap="round"
				d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M8.34 15.66l-1.41 1.41m12.14 0l-1.41-1.41M8.34 8.34L6.93 6.93"
			/>
		</svg>
	{:else}
		<!-- Moon icon -->
		<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>

<style>
	.theme-toggle {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid rgba(255, 255, 255, 0.3);
		background: transparent;
		color: white;
		cursor: pointer;
		transition: background-color 0.15s ease, transform 0.15s ease;
	}

	.theme-toggle:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.theme-toggle:active {
		transform: translateY(2px);
	}

	.theme-toggle:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}
</style>
