<script lang="ts">
	import { page } from '$app/stores';
	import { fly, fade } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let currentPath = $derived($page.url.pathname);
</script>

{#key currentPath}
	<div
		class="page-transition-wrapper"
		in:fly={{ y: 20, duration: 350, delay: 100 }}
		out:fade={{ duration: 150 }}
	>
		{@render children()}
	</div>
{/key}

<style>
	.page-transition-wrapper {
		width: 100%;
		min-height: 100%;
	}
</style>
