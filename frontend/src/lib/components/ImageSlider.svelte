<script lang="ts">
  let {
    images = [],
    productTitle = '',
    autoplayInterval = 3000
  }: {
    images?: Array<{ image: { url: string; alt?: string } }>;
    productTitle?: string;
    autoplayInterval?: number;
  } = $props();

  let currentIndex = $state(0);
  let isAutoplayActive = $state(true);
  let hasUserInteracted = $state(false);

  // Lightbox state
  let lightboxOpen = $state(false);
  let lightboxIndex = $state(0);

  // Touch/swipe state
  let touchStartX = $state(0);
  let touchEndX = $state(0);
  let isSwiping = $state(false);
  const minSwipeDistance = 50;

  function nextSlide() {
    currentIndex = (currentIndex + 1) % images.length;
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
  }

  function goToSlide(index: number) {
    currentIndex = index;
    handleUserInteraction();
  }

  function handleUserInteraction() {
    hasUserInteracted = true;
    isAutoplayActive = false;
  }

  function handlePrevClick() {
    handleUserInteraction();
    prevSlide();
  }

  function handleNextClick() {
    handleUserInteraction();
    nextSlide();
  }

  $effect(() => {
    if (images.length <= 1 || hasUserInteracted) {
      isAutoplayActive = false;
      return;
    }

    isAutoplayActive = true;
    const timer = window.setInterval(() => {
      nextSlide();
    }, autoplayInterval);

    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  });

  function openLightbox(index: number) {
    lightboxIndex = index;
    lightboxOpen = true;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightboxOpen = false;
    document.body.style.overflow = '';
  }

  function lightboxPrev() {
    lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  }

  function lightboxNext() {
    lightboxIndex = (lightboxIndex + 1) % images.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (lightboxOpen) {
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft') {
        lightboxPrev();
      } else if (event.key === 'ArrowRight') {
        lightboxNext();
      }
    } else {
      if (event.key === 'ArrowLeft') {
        handleUserInteraction();
        prevSlide();
      } else if (event.key === 'ArrowRight') {
        handleUserInteraction();
        nextSlide();
      }
    }
  }

  function handleTouchStart(event: TouchEvent) {
    touchStartX = event.touches[0].clientX;
    isSwiping = true;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isSwiping) return;
    touchEndX = event.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (!isSwiping) return;
    isSwiping = false;

    const swipeDistance = touchStartX - touchEndX;
    const absDistance = Math.abs(swipeDistance);

    if (absDistance > minSwipeDistance) {
      handleUserInteraction();
      if (swipeDistance > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }

    touchStartX = 0;
    touchEndX = 0;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if images && images.length > 0}
  <div class="mb-8 w-full sm:mb-4">
    <!-- Main slider -->
    <div
      class="slider-main relative w-full aspect-[4/3] overflow-hidden select-none
             border border-[var(--color-border)] bg-[var(--color-muted)]"
      style="touch-action: pan-y pinch-zoom;"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
    >
      <div class="relative w-full h-full">
        {#each images as imageItem, index}
          <div class="slide absolute inset-0 transition-opacity duration-500 ease-in-out"
               class:opacity-100={index === currentIndex}
               class:opacity-0={index !== currentIndex}
               class:visible={index === currentIndex}
               class:invisible={index !== currentIndex}>
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading={index === 0 ? 'eager' : 'lazy'}
              onload={(e) => e.currentTarget.classList.add('loaded')}
              onclick={() => openLightbox(index)}
              class="w-full h-full object-contain block cursor-pointer hover:opacity-95 transition-opacity duration-200"
              role="button"
              tabindex="0"
            />
          </div>
        {/each}
      </div>

      {#if images.length > 1}
        <button
          class="nav-arrow absolute top-1/2 -translate-y-1/2 left-0 w-[50px] h-[50px]
                 flex items-center justify-center text-5xl leading-none p-0
                 bg-[var(--color-surface)] text-[var(--color-fg)] border-none cursor-pointer z-10
                 hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] active:scale-95
                 sm:w-9 sm:h-9 sm:text-3xl transition-all"
          onclick={handlePrevClick}
          aria-label="Previous image"
        >
          &#8249;
        </button>
        <button
          class="nav-arrow absolute top-1/2 -translate-y-1/2 right-0 w-[50px] h-[50px]
                 flex items-center justify-center text-5xl leading-none p-0
                 bg-[var(--color-surface)] text-[var(--color-fg)] border-none cursor-pointer z-10
                 hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)] active:scale-95
                 sm:w-9 sm:h-9 sm:text-3xl transition-all"
          onclick={handleNextClick}
          aria-label="Next image"
        >
          &#8250;
        </button>

        <div class="absolute bottom-4 right-4 z-10 px-3 py-1.5 text-sm font-mono font-bold
                    bg-[var(--color-surface)] text-[var(--color-fg)]/80 border border-[var(--color-border)]
                    sm:bottom-2 sm:right-2 sm:text-xs sm:px-2 sm:py-1">
          {currentIndex + 1} / {images.length}
        </div>
      {/if}
    </div>

    <!-- Thumbnails -->
    {#if images.length > 1}
      <div class="flex gap-3 mt-4 overflow-x-auto py-2 sm:gap-2 sm:mt-2
                  scrollbar-thin">
        {#each images as imageItem, index}
          <button
            class="flex-shrink-0 w-20 h-20 overflow-hidden cursor-pointer p-0 transition-all duration-200
                   border-2 bg-[var(--color-muted)]
                   {index === currentIndex ? 'border-[var(--color-fg)]' : 'border-transparent hover:border-[var(--color-fg)]/50'}
                   hover:-translate-y-0.5
                   sm:w-[50px] sm:h-[50px]"
            onclick={() => goToSlide(index)}
            aria-label={`Go to image ${index + 1}`}
          >
            <img
              src={imageItem.image.url}
              alt={imageItem.image.alt || productTitle}
              loading="lazy"
              onload={(e) => e.currentTarget.classList.add('loaded')}
              class="w-full h-full object-cover block"
            />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center justify-center w-full aspect-[4/3] mb-8
              bg-[var(--color-muted)] text-[var(--color-fg)]/40 text-lg font-semibold
              border border-[var(--color-border)]
              sm:mb-4">
    <span>No Image Available</span>
  </div>
{/if}

<!-- Lightbox -->
{#if lightboxOpen}
  <div class="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center cursor-zoom-out animate-fade-in"
       onclick={closeLightbox} role="button" tabindex="0">
    <button
      class="absolute top-5 right-5 w-[50px] h-[50px] flex items-center justify-center
             text-3xl leading-none p-0 cursor-pointer z-[10001] transition-all
             bg-white/10 text-white border border-white/20
             hover:bg-white hover:text-black hover:border-white
             sm:top-2.5 sm:right-2.5 sm:w-[44px] sm:h-[44px] sm:text-2xl"
      onclick={closeLightbox}
      aria-label="Close lightbox"
    >
      &#10005;
    </button>

    <div class="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center cursor-default"
         onclick={(e) => { e.stopPropagation(); }} role="dialog">
      <img
        src={images[lightboxIndex].image.url}
        alt={images[lightboxIndex].image.alt || productTitle}
        class="max-w-full max-h-[95vh] w-auto h-auto object-contain
               border border-white/10"
      />

      {#if images.length > 1}
        <button
          class="absolute top-1/2 -translate-y-1/2 left-10 w-[60px] h-[60px]
                 flex items-center justify-center text-5xl leading-none p-0 cursor-pointer z-[10000] transition-all
                 bg-white/10 text-white border border-white/20
                 hover:bg-white hover:text-black hover:border-white hover:scale-105
                 sm:left-2.5 sm:w-[44px] sm:h-[44px] sm:text-3xl"
          onclick={lightboxPrev}
          aria-label="Previous image"
        >
          &#8249;
        </button>
        <button
          class="absolute top-1/2 -translate-y-1/2 right-10 w-[60px] h-[60px]
                 flex items-center justify-center text-5xl leading-none p-0 cursor-pointer z-[10000] transition-all
                 bg-white/10 text-white border border-white/20
                 hover:bg-white hover:text-black hover:border-white hover:scale-105
                 sm:right-2.5 sm:w-[44px] sm:h-[44px] sm:text-3xl"
          onclick={lightboxNext}
          aria-label="Next image"
        >
          &#8250;
        </button>

        <div class="absolute -bottom-[50px] left-1/2 -translate-x-1/2
                    px-5 py-2 text-sm font-mono font-bold
                    bg-white/10 text-white/80 border border-white/10
                    sm:-bottom-[40px] sm:text-xs sm:px-3 sm:py-1.5">
          {lightboxIndex + 1} / {images.length}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fade-in 0.2s ease-out;
  }

  /* Mobile image cover */
  @media (max-width: 768px) {
    .slider-main img {
      object-fit: cover;
    }
  }

  /* Scrollbar */
  .scrollbar-thin::-webkit-scrollbar { height: 6px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: var(--color-muted); }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--color-fg); opacity: 0.5; }
</style>
