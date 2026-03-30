<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="card-skeleton">
  <Skeleton width="100%" height="200px" />
  <div class="card-body">
    <Skeleton width="75%" height="1.125rem" />
    <Skeleton width="50%" height="0.875rem" />
    <div class="card-meta">
      <Skeleton width="40%" height="0.75rem" />
      <Skeleton width="30%" height="0.75rem" />
    </div>
    <Skeleton width="60%" height="1.25rem" />
    <div class="card-footer">
      <Skeleton width="45%" height="0.75rem" />
      <Skeleton width="80px" height="1.5rem" rounded />
    </div>
  </div>
</div>

<style>
  .card-skeleton {
    border: 1px solid var(--color-border, rgba(255,255,255,0.1));
    border-radius: 0;
    overflow: hidden;
    background: var(--color-bg, #0f172a);
  }

  .card-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .card-meta {
    display: flex;
    gap: 0.75rem;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.25rem;
  }
</style>
