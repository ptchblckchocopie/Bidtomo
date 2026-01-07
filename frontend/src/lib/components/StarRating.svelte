<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let rating: number = 0;
  export let maxRating: number = 5;
  export let interactive: boolean = false;
  export let size: 'small' | 'medium' | 'large' = 'medium';
  export let showValue: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  let hoverRating: number = 0;

  function handleClick(value: number) {
    if (!interactive || disabled) return;
    rating = value;
    dispatch('change', { rating: value });
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

  $: displayRating = hoverRating || rating;
  $: sizeClass = `size-${size}`;
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
        on:click={() => handleClick(value)}
        on:mouseenter={() => handleMouseEnter(value)}
        on:mouseleave={handleMouseLeave}
        on:keydown={(e) => handleKeyDown(e, value)}
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
    fill: #e0e0e0;
    stroke: #ccc;
    stroke-width: 1;
    transition: fill 0.15s ease, stroke 0.15s ease;
  }

  .star.filled svg {
    fill: #fbbf24;
    stroke: #f59e0b;
  }

  .star.half-filled svg {
    fill: url(#half-fill);
    stroke: #f59e0b;
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
    color: #666;
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
    outline: 2px solid #f59e0b;
    outline-offset: 2px;
    border-radius: 2px;
  }
</style>
