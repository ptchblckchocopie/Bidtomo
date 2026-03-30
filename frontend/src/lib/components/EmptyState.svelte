<script lang="ts">
  let { icon = '', title = '', message = '', actionLabel = '', actionHref = '' }: {
    icon?: string;
    title: string;
    message?: string;
    actionLabel?: string;
    actionHref?: string;
  } = $props();
</script>

<div class="empty-state">
  {#if icon}
    <div class="empty-icon">{icon}</div>
  {/if}
  <h3 class="empty-title">{title}</h3>
  {#if message}
    <p class="empty-message">{message}</p>
  {/if}
  {#if actionLabel && actionHref}
    <a href={actionHref} class="empty-action">{actionLabel}</a>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 1.5rem;
    min-height: 240px;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-fg, #fff);
    margin-bottom: 0.5rem;
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--color-muted-fg, #94a3b8);
    max-width: 320px;
    line-height: 1.5;
  }

  .empty-action {
    display: inline-block;
    margin-top: 1.25rem;
    padding: 0.625rem 1.5rem;
    background: #10b981;
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    border-radius: 4px;
    text-decoration: none;
    transition: background 0.15s;
  }

  .empty-action:hover {
    background: #059669;
  }
</style>
