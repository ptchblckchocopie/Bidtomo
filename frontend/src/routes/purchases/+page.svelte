<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    // Redirect to the unified dashboard with purchases tab
    goto('/dashboard?tab=purchases', { replaceState: true });
  });
</script>

<div class="redirect-message">
  <p>Redirecting to Dashboard...</p>
</div>

<style>
  .redirect-message {
    text-align: center;
    padding: 4rem 2rem;
    color: #666;
    font-size: 1.2rem;
  }
</style>
