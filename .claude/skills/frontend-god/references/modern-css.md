# Modern CSS Techniques (2025-2026)

CSS features that a frontend god should use when appropriate.

---

## Fluid Typography with clamp()

Eliminates typography breakpoints entirely. Font size scales smoothly between a min and max based on viewport width.

```css
/* Scales from 1.5rem at 375px to 3rem at 1280px */
font-size: clamp(1.5rem, 1rem + 2.5vw, 3rem);

/* Bidtomo headlines */
.hero-title {
  font-size: clamp(2rem, 1rem + 4vw, 5rem);
  letter-spacing: -0.04em;
  line-height: 1.05;
}

/* Body text that's slightly responsive */
.responsive-body {
  font-size: clamp(0.875rem, 0.8rem + 0.25vw, 1rem);
}
```

### The formula
`clamp(MIN, PREFERRED, MAX)`
- MIN: smallest the text will ever be
- PREFERRED: a viewport-relative calculation (`rem + vw`)
- MAX: largest the text will ever be

### Quick calculation
To scale linearly from `minSize` at `minViewport` to `maxSize` at `maxViewport`:
```
preferred = minSize + (maxSize - minSize) * (100vw - minViewport) / (maxViewport - minViewport)
```

Simplified: `clamp(minRem, calcRem + Xvw, maxRem)` — use a clamp calculator for precision.

---

## Container Queries

Style based on the parent container's size, not the viewport. Essential for reusable components.

```css
/* Define a containment context */
.product-grid-item {
  container-type: inline-size;
  container-name: card;
}

/* Style based on container width */
@container card (min-width: 300px) {
  .product-card-inner {
    display: grid;
    grid-template-columns: 120px 1fr;
  }
}

@container card (max-width: 299px) {
  .product-card-inner {
    display: flex;
    flex-direction: column;
  }
}
```

### When to use
- **Reusable card components** that appear in different-width containers (main grid vs sidebar vs modal)
- **Dashboard widgets** that resize independently
- **Responsive typography within a component** without knowing the viewport size

### Tailwind syntax
```html
<div class="@container">
  <div class="flex flex-col @md:flex-row @md:items-center">
    <!-- Responsive to container, not viewport -->
  </div>
</div>
```
Requires the `@tailwindcss/container-queries` plugin.

---

## Dynamic Viewport Units

The `vh` unit on mobile includes the browser's address bar, causing content to be cut off or jump when the bar hides/shows.

```css
/* Old way — broken on mobile */
height: 100vh;

/* New way — accounts for browser chrome */
height: 100dvh;   /* dynamic: changes as browser chrome shows/hides */
height: 100svh;   /* small: assumes chrome is showing (smallest viewport) */
height: 100lvh;   /* large: assumes chrome is hidden (largest viewport) */
```

### Which to use
- **`100dvh`**: For full-screen hero sections, modals, and overlays. Resizes smoothly as the mobile address bar appears/disappears.
- **`100svh`**: For elements that must never be hidden behind browser chrome. Safe minimum.
- **`100lvh`**: Rarely needed. Only for content that should expand to fill the maximum possible space.

```css
.hero-section {
  min-height: 100dvh;
  display: flex;
  align-items: center;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  height: 100dvh; /* Covers the full visible area on mobile */
}
```

---

## View Transitions API

Smooth, animated transitions between page navigations — natively, without a framework.

### Basic crossfade
```js
// Trigger before DOM update
document.startViewTransition(() => {
  // Update the DOM (SvelteKit handles this during navigation)
  updateDOM();
});
```

```css
/* Default crossfade (applied automatically) */
::view-transition-old(root) {
  animation: 200ms ease-in both fade-out;
}
::view-transition-new(root) {
  animation: 200ms ease-out both fade-in;
}
```

### Named transitions (morphing elements)
For shared element transitions (e.g., product card → product detail):

```css
/* On the browse page card */
.product-card-image {
  view-transition-name: product-hero;
}

/* On the detail page */
.product-detail-hero {
  view-transition-name: product-hero;
}
```
The browser automatically morphs the element between positions. The `view-transition-name` must be unique on the page.

### SvelteKit integration
```svelte
<!-- In +layout.svelte or a navigation component -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>
```

### Custom transition animations
```css
@keyframes slide-from-right {
  from { transform: translateX(100px); opacity: 0; }
}
@keyframes slide-to-left {
  to { transform: translateX(-100px); opacity: 0; }
}

::view-transition-old(root) {
  animation: 250ms ease-in both slide-to-left;
}
::view-transition-new(root) {
  animation: 250ms ease-out both slide-from-right;
}
```

### Feature detection
```css
@supports (view-transition-name: none) {
  /* View transition styles */
}
```

---

## Scroll-Driven Animations

Animate elements based on scroll position — no JavaScript needed.

### Scroll progress indicator
```css
.progress-bar {
  position: fixed;
  top: 0; left: 0;
  height: 3px;
  background: var(--color-accent);
  transform-origin: left;
  animation: progress-fill linear;
  animation-timeline: scroll();
}

@keyframes progress-fill {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
```

### Reveal on scroll (replacing IntersectionObserver)
```css
.scroll-reveal {
  animation: reveal-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 40%;
}

@keyframes reveal-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Parallax
```css
.parallax-bg {
  animation: parallax-scroll linear;
  animation-timeline: scroll();
}

@keyframes parallax-scroll {
  from { transform: translateY(-20%); }
  to { transform: translateY(20%); }
}
```

### Feature detection
```css
@supports (animation-timeline: scroll()) {
  /* Scroll-driven animation styles */
}
```
Falls back gracefully — elements just appear without animation.

---

## CSS Nesting

Native CSS nesting (no preprocessor needed). Supported in all modern browsers.

```css
.card-bh {
  background: var(--color-surface);
  border: 1px solid var(--color-border);

  & .title {
    font-family: var(--font-display);
    font-weight: 700;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.1);

    & .title {
      color: var(--color-accent);
    }
  }

  @media (max-width: 768px) {
    padding: 1rem;
  }
}
```

### When to use
- Component-scoped styles in global CSS (app.css)
- Complex hover/focus state chains
- Media queries scoped to a specific component

### When NOT to use
- In Svelte `<style>` blocks — already scoped by default
- For simple one-level selectors — nesting adds complexity without benefit

---

## color-mix() and Relative Colors

### color-mix (already used in Bidtomo)
```css
/* Mix accent with transparent for focus rings */
box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);

/* Create lighter/darker variants */
background: color-mix(in srgb, var(--color-surface) 80%, transparent);
```

### Relative color syntax (newer)
```css
/* Lighten a color by 20% */
background: oklch(from var(--color-accent) calc(l + 0.2) c h);

/* Desaturate */
background: oklch(from var(--color-accent) l calc(c * 0.5) h);

/* Change opacity */
background: oklch(from var(--color-accent) l c h / 0.15);
```
Browser support is good as of 2025+. Use for generating color variants from a single token.

---

## has() Selector

Style a parent based on its children's state.

```css
/* Highlight form group when its input is focused */
.form-group:has(input:focus) {
  border-color: var(--color-accent);
}

/* Hide label when input has value */
.form-group:has(input:not(:placeholder-shown)) .floating-label {
  transform: translateY(-100%) scale(0.8);
}

/* Card with image vs without */
.card-bh:has(img) {
  padding: 0;
}
.card-bh:not(:has(img)) {
  padding: 1.5rem;
}
```

Supported in all modern browsers. Powerful for form interactions and conditional layouts.
