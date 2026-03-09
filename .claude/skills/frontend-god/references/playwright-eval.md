# Playwriter MCP — Visual Evaluation Workflow

Playwriter is a Chrome extension that provides browser automation through MCP. It works with your current browser session — no new Chrome instances, no CDP mode required. All control happens locally through the Chrome DevTools Protocol.

## Available MCP Tools

- **`mcp__playwriter__execute`** — Execute JavaScript in the browser context. Persistent `state` object survives between calls.
- **`mcp__playwriter__reset`** — Reset the browser/page/context connection.

## Key Functions Available Inside execute

- `snapshot({ page })` — Text-based accessibility snapshot (fast, cheap on tokens)
- `screenshotWithAccessibilityLabels({ page })` — Visual screenshot with overlaid labels (costs image tokens)
- `waitForPageLoad({ page, timeout })` — Smart load detection
- `state` — Persistent object between execute calls (store pages, data)
- `context` — Browser context, access pages via `context.pages()`
- `page` — Default page (shared with other agents)

## Prerequisites

1. Chrome must be running with the Playwriter extension installed and enabled
2. The extension icon should be green (connected)
3. Dev server must be running at localhost:5173 (`npm run dev` in `frontend/`)

---

## Page Setup Pattern

```js
// mcp__playwriter__execute
// Find an existing page or create a new one
state.page = context.pages().find(p => p.url().includes('localhost:5173'))
  ?? (await context.newPage());
await state.page.goto('http://localhost:5173/products', { waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page: state.page, timeout: 8000 });
```

---

## The Visual QA Loop

### Step 1: Initial assessment (text-based, cheap)
```js
// mcp__playwriter__execute
console.log('URL:', state.page.url());
await snapshot({ page: state.page }).then(console.log);
```

### Step 2: Visual screenshot for spatial/color evaluation
```js
// mcp__playwriter__execute
await screenshotWithAccessibilityLabels({ page: state.page });
```

### Step 3: Evaluate against checklist (see below)

### Step 4: Fix identified issues in code

### Step 5: Verify fix with reload
```js
// mcp__playwriter__execute
await state.page.reload({ waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page: state.page, timeout: 5000 });
await screenshotWithAccessibilityLabels({ page: state.page });
```

### Step 6: Re-evaluate. Repeat until perfect.

---

## Responsive Testing Script

```js
// mcp__playwriter__execute
const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 720 },
];
for (const vp of viewports) {
  await state.page.setViewportSize({ width: vp.width, height: vp.height });
  await state.page.waitForTimeout(500);
  console.log(`--- ${vp.name} (${vp.width}x${vp.height}) ---`);
  await screenshotWithAccessibilityLabels({ page: state.page });
}
```

---

## Visual Evaluation Checklist

### Layout
- [ ] Content hierarchy is clear and intentional
- [ ] Spacing follows 4/8px grid system
- [ ] No content overflow or unexpected scrollbars
- [ ] Container width appropriate (`max-w-6xl`)
- [ ] Grid/flex layouts align properly
- [ ] No orphaned elements or awkward wrapping

### Color & Theme
- [ ] All backgrounds are dark (#0A0A0A, #131316, #141418)
- [ ] No white or light-colored backgrounds anywhere
- [ ] Text readable — contrast ratio > 4.5:1 (WCAG AA)
- [ ] Accent (#10B981) used sparingly and purposefully
- [ ] Borders subtle (#232328), not harsh
- [ ] Glass effects have proper backdrop-filter blur

### Typography
- [ ] Headlines: Plus Jakarta Sans, bold (700), tight tracking (-0.03em)
- [ ] Body text: 0.9375rem (15px), line-height 1.6
- [ ] Labels/badges: JetBrains Mono, uppercase, wide tracking (0.08em)
- [ ] No generic/system fonts visible
- [ ] Text sizes responsive — no overflow on mobile

### Interactive Elements
- [ ] Buttons match `.btn-bh` / `.btn-bh-red` patterns
- [ ] Cards match `.card-bh` pattern
- [ ] Inputs match `.input-bh` pattern
- [ ] Focus rings visible (2px solid accent, 2px offset)
- [ ] Touch targets >= 44x44px on mobile
- [ ] Cursor changes appropriately

### Animation
- [ ] Hover lifts smooth (200-400ms)
- [ ] No jarring or abrupt transitions
- [ ] No layout shift during animation
- [ ] Reduced motion media query respected

---

## Accessibility Verification

After visual QA, verify with snapshot:
```js
// mcp__playwriter__execute
const snap = await snapshot({ page: state.page, search: /button|link|input/ });
console.log(snap);
```

Check:
- All buttons have accessible names
- All links have descriptive text (not just "click here")
- All form inputs have associated labels
- Interactive elements are keyboard-focusable
- Decorative elements have `aria-hidden="true"`

---

## Interaction Testing

### Test hover states
```js
// mcp__playwriter__execute
const button = state.page.locator('.btn-bh-red').first();
await button.hover();
await state.page.waitForTimeout(400); // wait for transition
await screenshotWithAccessibilityLabels({ page: state.page });
```

### Test form inputs
```js
// mcp__playwriter__execute
const input = state.page.locator('.input-bh').first();
await input.focus();
await state.page.waitForTimeout(200);
await screenshotWithAccessibilityLabels({ page: state.page });
```

### Scroll to trigger animations
```js
// mcp__playwriter__execute
await state.page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
await state.page.waitForTimeout(800);
await screenshotWithAccessibilityLabels({ page: state.page });
```

---

## Common Visual Bugs to Watch For

1. **White flash on page load** — Missing `background-color: var(--color-bg)` on body
2. **Z-index conflicts** — ThreeBackground is z-0, all content must be z-1+
3. **Custom cursor not hiding on touch** — Only hidden on `(hover: hover) and (pointer: fine)`
4. **GlowingEffect misalignment** — Container must have `position: relative` and `rounded-[inherit]`
5. **Image aspect ratio distortion** — Use `object-fit: cover` on images
6. **Scrollbar style missing in Firefox** — Only `-webkit-scrollbar` is styled
7. **Backdrop-filter not supported** — Check for fallback solid background
8. **Overlapping elements on mobile** — Flex wrap or grid breakpoints missing
9. **Text truncation** — Long product titles overflow containers

---

## Token Efficiency Rules

- **Use `snapshot()` first** — text-based, fast, cheap. Good for checking structure, content, element presence
- **Use `screenshotWithAccessibilityLabels()` only for visual** — colors, layout, spacing, alignment
- **Don't screenshot the same view twice** — fix issues, then screenshot
- **Combine viewport tests** — loop through all viewports in one execute call
