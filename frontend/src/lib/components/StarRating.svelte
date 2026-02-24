<script lang="ts">
  let {
    rating = $bindable(0),
    maxRating = 5,
    interactive = false,
    size = 'medium' as 'small' | 'medium' | 'large',
    showValue = false,
    disabled = false,
    onChange
  }: {
    rating?: number;
    maxRating?: number;
    interactive?: boolean;
    size?: 'small' | 'medium' | 'large';
    showValue?: boolean;
    disabled?: boolean;
    onChange?: (detail: { rating: number }) => void;
  } = $props();

  let hoverRating: number = $state(0);

  function handleClick(value: number) {
    if (!interactive || disabled) return;
    rating = value;
    onChange?.({ rating: value });
  }

  function handleMouseEnter(value: number) {
    if (!interactive || disabled) return;
    hoverRating = value;
  }

  function handleMouseLeave() {
    if (!interactive || disabled) return;
    hoverRating = 0;
  }

  function handleKeyDown(event: KeyboardEvent, value: number) {
    if (!interactive || disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(value);
    }
  }

  let displayRating = $derived(hoverRating || rating);
  let sizeClass = $derived(`size-${size}`);
</script>

<div class="star-rating {sizeClass}" class:interactive class:disabled role={interactive ? 'radiogroup' : 'img'} aria-label={`Rating: ${rating} out of ${maxRating} stars`}>
  {#each Array(maxRating) as _, index}
    {@const value = index + 1}
    {@const filled = value <= displayRating}
    {@const halfFilled = !filled && value - 0.5 <= displayRating}

    {#if interactive}
      <button
        type="button"
        class="star"
        class:filled
        class:half-filled={halfFilled}
        onclick={() => handleClick(value)}
        onmouseenter={() => handleMouseEnter(value)}
        onmouseleave={handleMouseLeave}
        onkeydown={(e) => handleKeyDown(e, value)}
        aria-label={`${value} star${value !== 1 ? 's' : ''}`}
        aria-pressed={rating === value}
        {disabled}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </button>
    {:else}
      <span class="star" class:filled class:half-filled={halfFilled}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </span>
    {/if}
  {/each}

  {#if showValue}
    <span class="rating-value">{rating.toFixed(1)}</span>
  {/if}
</div>

<style>
  .star-rating {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
  }

  .star-rating.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .star {
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    cursor: default;
  }

  .star-rating.interactive .star {
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .star-rating.interactive .star:hover:not(:disabled) {
    transform: scale(1.15);
  }

  .star-rating.interactive.disabled .star {
    cursor: not-allowed;
  }

  .star svg {
    fill: var(--color-muted);
    stroke: var(--color-muted);
    stroke-width: 1;
    transition: fill 0.15s ease, stroke 0.15s ease;
  }

  .star.filled svg {
    fill: var(--color-yellow);
    stroke: var(--color-yellow);
  }

  .star.half-filled svg {
    fill: url(#half-fill);
    stroke: var(--color-yellow);
  }

  /* Size variants */
  .size-small .star svg {
    width: 16px;
    height: 16px;
  }

  .size-medium .star svg {
    width: 24px;
    height: 24px;
  }

  .size-large .star svg {
    width: 32px;
    height: 32px;
  }

  .rating-value {
    margin-left: 0.5rem;
    font-weight: 600;
    color: var(--color-fg);
  }

  .size-small .rating-value {
    font-size: 0.8rem;
  }

  .size-medium .rating-value {
    font-size: 1rem;
  }

  .size-large .rating-value {
    font-size: 1.2rem;
  }

  /* Focus styles for accessibility */
  .star-rating.interactive .star:focus {
    outline: none;
  }

  .star-rating.interactive .star:focus-visible {
    outline: 2px solid var(--color-yellow);
    outline-offset: 2px;
  }
</style>
