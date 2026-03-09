# Motion Design for UI

Motion is communication. Every animation should answer: what changed, where did it come from, and what should I look at next?

---

## The 12 Principles of Animation (Applied to UI)

Disney's principles, adapted for interface design:

### 1. Ease In / Ease Out (Slow In, Slow Out)
Nothing in nature starts or stops abruptly. Every transition needs easing.
- **Standard UI**: `cubic-bezier(0.4, 0, 0.2, 1)` — ease-out dominant, snappy start, soft landing
- **Vivid/impactful**: `cubic-bezier(0.52, 0.01, 0, 1)` — ease-vivid, dramatic deceleration
- **Springy**: `cubic-bezier(0.34, 1.56, 0.64, 1)` — slight overshoot, playful
- **Linear**: Only for continuous motion (progress bars, loading spinners) — never for enter/exit

### 2. Anticipation
A small counter-movement before the main action. Tells the user "something is about to happen."
```css
/* Button press: scale down before releasing */
.btn:active { transform: scale(0.97); transition-duration: 80ms; }
```
The 80ms active state creates anticipation. The release back to scale(1) at 350ms is the payoff.

### 3. Follow-Through and Overlapping Action
Elements overshoot their destination slightly, then settle.
```js
gsap.to(element, { y: -8, duration: 0.4, ease: 'back.out(1.4)' });
// Moves to y:-8, overshoots slightly past it, then settles
```
In CSS: use `cubic-bezier(0.34, 1.56, 0.64, 1)` for a subtle bounce.

### 4. Staging
Direct the user's attention. When something important happens, everything else should quiet down.
- Modal opens → backdrop blur + dim
- Dropdown opens → rest of page doesn't move
- Error appears → subtle shake draws the eye

### 5. Arcs
Natural motion follows curved paths, not straight lines. For UI, this applies to:
- Elements that fly in from off-screen (curve slightly)
- Drag-and-drop (follow finger with slight lag, creating an arc)
- Page transitions (content slides with a slight vertical offset)

### 6. Secondary Action
Multiple properties animate together to reinforce a single interaction:
```css
.card-bh:hover {
  transform: translateY(-3px) scale(1.01);  /* lift */
  border-color: rgba(255, 255, 255, 0.1);   /* border reveal */
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);  /* depth */
}
```
Three coordinated signals: lift + glow + shadow. They all say "this is elevated."

### 7. Timing
Duration communicates importance and distance:
- **Micro-interactions** (hover, focus): 150-250ms
- **Small transitions** (dropdown, tooltip): 200-300ms
- **Medium transitions** (modal, slide): 300-450ms
- **Large transitions** (page, hero reveal): 500-800ms
- **Never exceed 1 second** for any UI transition (feels broken)

### 8. Exaggeration
Subtle exaggeration makes interactions feel alive without being cartoonish:
- Hover lift: 2-3px, not 10px
- Scale: 1.01-1.02, not 1.1
- Rotation: 1-2deg for playful, never more in UI

---

## Easing Theory

### The math of feel
An easing curve maps time (x-axis) to progress (y-axis):
- **Linear** (0, 0, 1, 1): Robotic. Only for looping animations.
- **Ease-out** (0, 0, 0.2, 1): Fast start, gentle stop. Best for **entrances** — element arrives quickly, settles gracefully.
- **Ease-in** (0.4, 0, 1, 1): Slow start, fast end. Best for **exits** — element gradually accelerates away.
- **Ease-in-out** (0.4, 0, 0.2, 1): Smooth both ends. Best for **state changes** where element stays on screen.
- **Vivid** (0.52, 0.01, 0, 1): Aggressive deceleration. Creates a sense of impact and weight. Bidtomo's signature.

### Choosing the right curve
| Action | Curve | Why |
|--------|-------|-----|
| Element enters | ease-out | Arrives quickly, settles |
| Element exits | ease-in | Accelerates away |
| Hover/focus state | ease-in-out | Smooth bidirectional |
| Impact moment | ease-vivid | Dramatic, weighty |
| Spring/bounce | back.out(1.4) | Playful, overshoots |
| Loading spinner | linear | Continuous, no emphasis |

---

## Choreography

When multiple elements animate, they must be coordinated — not chaotic.

### Stagger patterns
Elements should enter in a logical sequence, not all at once:
```js
// GSAP stagger
gsap.from('.card', {
  opacity: 0, y: 20,
  stagger: 0.06,       // 60ms between each
  duration: 0.4,
  ease: 'power2.out',
});
```

**Stagger timing math:**
- Per-item delay: 40-80ms (less for many items, more for few)
- Total sequence: < 600ms (beyond this, users get impatient)
- Formula: `delay = min(80ms, 600ms / itemCount)`

### CSS stagger (existing pattern)
```css
.animate-in.visible > .stagger-child:nth-child(1) { transition-delay: 0.05s; }
.animate-in.visible > .stagger-child:nth-child(2) { transition-delay: 0.1s; }
/* ... up to nth-child(6) at 0.3s */
```

### Direction consistency
- If elements enter from the bottom, they all enter from the bottom
- The element closest to the trigger (or top of viewport) animates first
- Reverse the stagger direction on exit

### Spatial continuity
Users build a mental map of the interface. Motion should reinforce it:
- Navigate forward → content slides left (or fades, or zooms in)
- Navigate back → content slides right (reverse)
- Open detail → zoom from the card's position
- Close detail → return to the card's position

---

## Page Transitions

### View Transitions API (modern approach)
```js
// In SvelteKit, trigger before navigation
document.startViewTransition(() => {
  // navigate to new page
});
```

```css
/* Default crossfade */
::view-transition-old(root) {
  animation: fade-out 200ms ease-in;
}
::view-transition-new(root) {
  animation: fade-in 200ms ease-out;
}

/* Named transition for a product card → detail page */
.product-card { view-transition-name: product-hero; }
.product-detail-image { view-transition-name: product-hero; }
```

### Fallback for browsers without View Transitions
Use Svelte's `transition:` directive on the page content:
```svelte
{#key $page.url.pathname}
  <div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
    <slot />
  </div>
{/key}
```

---

## Scroll-Triggered Animations

### IntersectionObserver pattern (existing)
```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1 });

document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
```

### CSS scroll-driven animations (modern)
```css
@keyframes reveal {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.scroll-reveal {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}
```
No JavaScript needed. But browser support is still evolving — use with feature detection.

### Parallax with scroll timeline
```css
.parallax-element {
  animation: parallax linear;
  animation-timeline: scroll();
}
@keyframes parallax {
  from { transform: translateY(-50px); }
  to { transform: translateY(50px); }
}
```

---

## Micro-animation Recipes

### Skeleton pulse
```css
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.15; }
}
.skeleton { animation: pulse 1.5s ease-in-out infinite; }
```

### Spinner
```css
.spinner {
  width: 16px; height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

### Shake (for errors)
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.shake { animation: shake 0.3s ease-in-out; }
```

### Number counter (for prices, bids)
```js
function animateValue(el, from, to, duration = 600) {
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.floor(from + (to - from) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
```

### Countdown urgency pulse
```css
.urgent {
  animation: urgentPulse 1s ease-in-out infinite;
}
@keyframes urgentPulse {
  0%, 100% { color: var(--color-red); }
  50% { color: var(--color-fg); }
}
```
