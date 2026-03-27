<script lang="ts">
  let { width = '100%', height = '1rem', rounded = false, className = '' }: {
    width?: string;
    height?: string;
    rounded?: boolean;
    className?: string;
  } = $props();
</script>

<div
  class="skeleton {className}"
  class:rounded-full={rounded}
  style="width:{width};height:{height}"
  aria-hidden="true"
></div>

<style>
  .skeleton {
    background: linear-gradient(90deg, var(--sk-base, rgba(255,255,255,0.06)) 25%, var(--sk-shine, rgba(255,255,255,0.12)) 50%, var(--sk-base, rgba(255,255,255,0.06)) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }

  :global(.dark) .skeleton {
    --sk-base: rgba(255,255,255,0.06);
    --sk-shine: rgba(255,255,255,0.12);
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
