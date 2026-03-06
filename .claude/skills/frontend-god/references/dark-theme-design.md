# Dark Theme Design Principles

Designing for dark backgrounds is fundamentally different from light. These aren't inverted light themes — they're a distinct design language.

---

## Elevation Without Shadows

On a light background, shadows create depth by darkening below an element. On #0A0A0A, there's nowhere darker to go. Instead:

### Use glow for elevation
```css
/* Light theme: shadow pushes down */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

/* Dark theme: glow lifts up */
box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 4px 24px rgba(0, 0, 0, 0.5);
```
The `1px rgba(255, 255, 255, 0.04)` border-glow is the key signal. The shadow adds depth without being visible against dark backgrounds.

### Use surface layers for depth
Each step is subtle but perceptible:
```
#0A0A0A (bg)     → Base layer, the void
#141418 (muted)  → Recessed areas, secondary panels
#131316 (surface) → Cards, primary panels
#1E1E23 (surface-hover) → Elevated/hovered surfaces
```
A card on the page: `bg → surface`. A modal over a card: `surface → surface-hover + backdrop blur`.

### Border lightening for interaction
Instead of shadow expansion on hover:
```css
/* Resting: nearly invisible border */
border: 1px solid var(--color-border);  /* #232328 */

/* Hover: border reveals itself */
border-color: rgba(255, 255, 255, 0.1);
```
This "border reveal" is more effective than shadows on dark backgrounds because the contrast change is perceptible.

---

## Color on Dark Backgrounds

### Pure white is harsh
`#FFFFFF` on `#0A0A0A` creates maximum contrast (21:1). This is technically perfect for accessibility but visually aggressive — it causes eye strain and draws attention to everything equally, destroying hierarchy.

The Bidtomo solution: `#F5F5F3` (warm off-white, contrast ratio ~18:1). Still WCAG AAA compliant but softer. The warmth prevents the clinical feel of pure white on pure black.

### Lower saturation for comfort
Saturated colors vibrate against dark backgrounds — an optical illusion where edges appear to shimmer. The Bidtomo accent `#10B981` is already relatively desaturated for a green. When creating new colored elements:
- Don't use full-saturation colors (`#00FF00`, `#FF0000`)
- Prefer the project's pre-defined colors (`--color-green`, `--color-red`, etc.)
- For status indicators, use the color + a dark-tinted background: `bg-[var(--color-green)]/10 text-[var(--color-green)]`

### Colored backgrounds on dark
Never use a fully saturated colored background. Instead:
```css
/* Wrong: harsh, vibrating */
background: #10B981; color: white;

/* Right: tinted surface */
background: rgba(16, 185, 129, 0.1);
color: var(--color-green);
border: 1px solid rgba(16, 185, 129, 0.2);
```
Exception: `.btn-bh-red` uses solid `--color-fg` background — this works because it's achromatic and intentionally high-contrast as the primary CTA.

---

## Text Hierarchy on Dark

On light backgrounds, you reduce importance by making text lighter gray. On dark backgrounds, the same principle — but the scale is different:

| Role | Color | Contrast Ratio | Usage |
|------|-------|---------------|-------|
| Primary | `--color-fg` (#F5F5F3) | ~18:1 | Headlines, body text, primary labels |
| Secondary | `--color-muted-fg` (#8A8F98) | ~5.5:1 | Timestamps, metadata, helper text |
| Disabled | `opacity: 0.3` on fg | ~5.4:1 | Disabled buttons, inactive elements |
| Subtle | `rgba(255,255,255,0.05)` | — | Decorative borders, dividers |

Three levels are enough. More than three and the hierarchy becomes muddy.

---

## Glow Effects

Glow is the dark theme's primary tool for emphasis, warmth, and magic.

### Accent glow (for interactive elements)
```css
box-shadow: 0 0 30px rgba(16, 185, 129, 0.12);  /* shadow-glow-accent */
```

### Ambient glow (for atmosphere)
```css
box-shadow: 0 0 30px rgba(100, 140, 200, 0.08);  /* shadow-glow — blue tinted */
```

### Focus glow (for inputs)
```css
box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent);
```

### Glow should feel like light bleeding, not neon
- Spread radius > blur radius creates a hard glow (neon) — avoid
- Blur radius > spread radius creates a soft bleed (atmospheric) — use this
- Multiple stacked glows with different radii create realism

---

## The Cinematic Feel

Bidtomo's dark theme isn't just "dark mode" — it's cinematic. This means:

1. **Depth of field** — The ThreeBackground shader is blurred and subtle. Content is sharp. This creates a sense of layered depth, like a camera focused on the UI.

2. **Vignetting** — Edges of the viewport are slightly darker than the center (the shader handles this). This draws the eye inward.

3. **Selective lighting** — Not everything glows. Only interactive elements and focal points get glow effects. The rest lives in shadow.

4. **Texture** — The glass-frosted surfaces, the backdrop blur, the subtle border reveals — these create visual texture that prevents the "flat black rectangle" problem.

5. **Restraint** — The accent color appears sparingly. When everything glows, nothing does. Reserve `--color-accent` for: primary CTAs, active states, and success indicators.

---

## Common Mistakes on Dark Themes

1. **Inverting a light theme** — Just swapping black/white creates a lifeless, headache-inducing interface. Dark themes need their own color calibration.

2. **Too much contrast** — Maximum contrast everywhere = visual shouting. Use the text hierarchy scale above.

3. **Forgetting hover states** — On light themes, hover darkens an element. On dark themes, hover lightens it (border reveal, surface-hover, subtle glow). The direction is reversed.

4. **Invisible borders** — `#1A1A1F` border on `#0A0A0A` is nearly invisible. That's intentional for resting state — but hover must brighten it enough to be perceptible.

5. **Colored text on colored backgrounds** — Green text on a green-tinted background might technically pass contrast but looks muddy. Use white or off-white text on tinted surfaces.

6. **Ignoring dark mode images** — Product photos with white backgrounds look jarring. The `rounded-lg overflow-hidden` pattern contains them, but consider `mix-blend-mode: multiply` for logos and illustrations with white backgrounds.
