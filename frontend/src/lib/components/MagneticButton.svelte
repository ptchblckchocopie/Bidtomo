<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';

	let {
		children,
		strength = 0.3,
		class: className = '',
		href = '',
		onclick = undefined as (() => void) | undefined,
	}: {
		children: Snippet;
		strength?: number;
		class?: string;
		href?: string;
		onclick?: (() => void) | undefined;
	} = $props();

	let el: HTMLElement;
	let x = $state(0);
	let y = $state(0);
	let hovering = $state(false);

	function handleMouseMove(e: MouseEvent) {
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		x = (e.clientX - centerX) * strength;
		y = (e.clientY - centerY) * strength;
		hovering = true;
	}

	function handleMouseLeave() {
		x = 0;
		y = 0;
		hovering = false;
	}
</script>

{#if href}
	<a
		bind:this={el}
		{href}
		class="magnetic-btn {className}"
		style="transform: translate({x}px, {y}px) scale({hovering ? 1.05 : 1}); transition: transform {hovering ? '0.15s' : '0.5s'} cubic-bezier(0.4, 0, 0.2, 1);"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
	>
		{@render children()}
	</a>
{:else}
	<button
		bind:this={el}
		class="magnetic-btn {className}"
		style="transform: translate({x}px, {y}px) scale({hovering ? 1.05 : 1}); transition: transform {hovering ? '0.15s' : '0.5s'} cubic-bezier(0.4, 0, 0.2, 1);"
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
		{onclick}
	>
		{@render children()}
	</button>
{/if}

<style>
	.magnetic-btn {
		display: inline-flex;
		will-change: transform;
	}
</style>
