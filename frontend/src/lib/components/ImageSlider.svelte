<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let images: Array<{ image: { url: string; alt?: string } }> = [];
  export let productTitle: string = '';
  export let autoplayInterval: number = 3000; // ms between slides

  let currentIndex = 0;
  let autoplayTimer: number | null = null;
  let isAutoplayActive = true;
  let hasUserInteracted = false;

  function nextSlide() {
    currentIndex = (currentIndex + 1) % images.length;
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
  }

  function goToSlide(index: number) {
    currentIndex = index;
    stopAutoplay();
  }

  function startAutoplay() {
    if (images.length <= 1 || hasUserInteracted) return;

    stopAutoplay();
    autoplayTimer = window.setInterval(() => {
      nextSlide();
    }, autoplayInterval);
    isAutoplayActive = true;
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    isAutoplayActive = false;
  }

  function handleUserInteraction() {
    hasUserInteracted = true;
    stopAutoplay();
  }

  function handlePrevClick() {
    handleUserInteraction();
    prevSlide();
  }

  function handleNextClick() {
    handleUserInteraction();
    nextSlide();
  }

  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      handleUserInteraction();
      prevSlide();
    } else if (event.key === 'ArrowRight') {
      handleUserInteraction();
      nextSlide();
    }
  }

  // Start autoplay on mount
  onMount(() => {
    startAutoplay();
  });

  // Clean up on destroy
  onDestroy(() => {
    stopAutoplay();
  });

  // Restart autoplay when images change
  $: if (images.length > 1 && !hasUserInteracted) {
    startAutoplay();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if images && images.length > 0}
  <div class="image-slider">
    <!-- Main image display -->
    <div class="slider-main">
      <div class="slider-images">
        {#each images as imageItem, index}
          <div class="slide" class:active={index === currentIndex}>
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          </div>
        {/each}
      </div>

      <!-- Navigation arrows (only show if more than 1 image) -->
      {#if images.length > 1}
        <button
          class="nav-arrow nav-prev"
          on:click={handlePrevClick}
          aria-label="Previous image"
        >
          ‹
        </button>
        <button
          class="nav-arrow nav-next"
          on:click={handleNextClick}
          aria-label="Next image"
        >
          ›
        </button>

        <!-- Slide counter -->
        <div class="slide-counter">
          {currentIndex + 1} / {images.length}
        </div>
      {/if}
    </div>

    <!-- Thumbnail navigation (only show if more than 1 image) -->
    {#if images.length > 1}
      <div class="thumbnail-nav">
        {#each images as imageItem, index}
          <button
            class="thumbnail"
            class:active={index === currentIndex}
            on:click={() => goToSlide(index)}
            aria-label={`Go to image ${index + 1}`}
          >
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading="lazy"
            />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="placeholder-image">
    <span>No Image Available</span>
  </div>
{/if}

<style>
  .image-slider {
    width: 100%;
    margin-bottom: 2rem;
  }

  .slider-main {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: #f5f5f5;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .slider-images {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .slide {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.5s ease, visibility 0.5s ease;
  }

  .slide.active {
    opacity: 1;
    visibility: visible;
  }

  .slide img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .nav-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    font-size: 3rem;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.3s ease;
    z-index: 10;
    line-height: 1;
    padding: 0;
  }

  .nav-arrow:hover {
    background: rgba(220, 38, 38, 0.9);
  }

  .nav-arrow:active {
    transform: translateY(-50%) scale(0.95);
  }

  .nav-prev {
    left: 0;
    border-radius: 0 8px 8px 0;
  }

  .nav-next {
    right: 0;
    border-radius: 8px 0 0 8px;
  }

  .slide-counter {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 600;
    z-index: 10;
  }

  .thumbnail-nav {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
    overflow-x: auto;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: #dc2626 #f5f5f5;
  }

  .thumbnail-nav::-webkit-scrollbar {
    height: 8px;
  }

  .thumbnail-nav::-webkit-scrollbar-track {
    background: #f5f5f5;
    border-radius: 4px;
  }

  .thumbnail-nav::-webkit-scrollbar-thumb {
    background: #dc2626;
    border-radius: 4px;
  }

  .thumbnail-nav::-webkit-scrollbar-thumb:hover {
    background: #991b1b;
  }

  .thumbnail {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border: 3px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s ease;
    background: #f5f5f5;
    padding: 0;
  }

  .thumbnail:hover {
    border-color: #dc2626;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(220, 38, 38, 0.3);
  }

  .thumbnail.active {
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .placeholder-image {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: #f5f5f5;
    border-radius: 12px;
    color: #999;
    font-size: 1.2rem;
    font-weight: 600;
    margin-bottom: 2rem;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .slider-main {
      aspect-ratio: 1;
    }

    .nav-arrow {
      width: 40px;
      height: 40px;
      font-size: 2rem;
    }

    .slide-counter {
      font-size: 0.8rem;
      padding: 0.4rem 0.8rem;
      bottom: 0.5rem;
      right: 0.5rem;
    }

    .thumbnail {
      width: 60px;
      height: 60px;
    }

    .thumbnail-nav {
      gap: 0.5rem;
    }
  }
</style>
