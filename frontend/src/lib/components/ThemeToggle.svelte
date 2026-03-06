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
		<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
			<circle cx="12" cy="12" r="4" />
			<path stroke-linecap="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M8.34 15.66l-1.41 1.41m12.14 0l-1.41-1.41M8.34 8.34L6.93 6.93" />
		</svg>
	{:else}
		<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
		</svg>
	{/if}
</button>

<style>
	.theme-toggle {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: color 0.15s ease-out;
	}

	.theme-toggle:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.theme-toggle:focus-visible {
		outline: 1px solid rgba(255, 255, 255, 0.3);
		outline-offset: 2px;
	}


</style>
