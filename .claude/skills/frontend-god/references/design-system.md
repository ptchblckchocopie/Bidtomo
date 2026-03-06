# Bidtomo Design System Reference

## CSS Variables (from app.css :root)

### Colors
| Variable | Hex | Usage |
|----------|-----|-------|
| `--color-bg` | `#0A0A0A` | Page background, deep black |
| `--color-fg` | `#F5F5F3` | Primary text, warm off-white |
| `--color-accent` | `#10B981` | Accent emerald green |
| `--color-accent-hover` | `#34D399` | Accent hover state |
| `--color-border` | `#232328` | Subtle dark borders |
| `--color-border-light` | `#1A1A1F` | Even subtler borders |
| `--color-muted` | `#141418` | Muted background panels |
| `--color-muted-fg` | `#8A8F98` | Secondary/muted text |
| `--color-surface` | `#131316` | Cards, panels, elevated elements |
| `--color-surface-hover` | `#1E1E23` | Surface hover state |
| `--color-green` | `#10B981` | Success states |
| `--color-red` | `#EF4444` | Error/danger states |
| `--color-yellow` | `#F59E0B` | Warning states |
| `--color-blue` | `#3B82F6` | Info states |
| `--color-white` | `#FFFFFF` | Pure white (rare use) |

### Typography
| Variable | Value |
|----------|-------|
| `--font-display` | `'Plus Jakarta Sans', system-ui, sans-serif` |
| `--font-body` | `'Plus Jakarta Sans', system-ui, sans-serif` |
| `--font-mono` | `'JetBrains Mono', 'Courier New', monospace` |

### Spacing & Radii
| Variable | Value |
|----------|-------|
| `--transition-speed` | `200ms` |
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `14px` |
| `--radius-xl` | `20px` |
| `--glow-color` | `rgba(100, 140, 200, 0.08)` |

---

## Tailwind Config Extensions (from tailwind.config.js)

### Colors
```js
bh: { bg, fg, border, muted } // CSS variable mapped
accent: { DEFAULT: '#10B981', light: '#34D399', dark: '#059669' }
success: { DEFAULT: '#10B981', light: '#ECFDF5' }
danger: { DEFAULT: '#EF4444', light: '#FEF2F2' }
warning: { DEFAULT: '#F59E0B', light: '#FFFBEB' }
```

### Font Families
```js
display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
mono: ['"JetBrains Mono"', '"Courier New"', 'monospace']
```

### Letter Spacing
```js
'tighter': '-0.04em'  // h1
'cinema': '-0.03em'   // h2-h6, headlines
```

### Border Radius
```js
DEFAULT: '10px', none: '0px', sm: '6px', md: '10px',
lg: '14px', xl: '20px', '2xl': '24px', '3xl': '32px', full: '9999px'
```

### Box Shadows
```js
'obsidian': '0 0 0 1px rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)'
'glow': '0 0 30px rgba(100,140,200,0.08)'
'glow-accent': '0 0 30px rgba(16,185,129,0.12)'
'lift': '0 8px 24px rgba(0,0,0,0.08)'
'lift-dark': '0 8px 32px rgba(0,0,0,0.4)'
```

### Timing Function
```js
'vivid': 'cubic-bezier(0.52, 0.01, 0, 1)'  // Use: ease-vivid
```

---

## Component Classes

### .btn-bh-red (Primary Button)
```css
inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold
background: var(--color-fg); color: var(--color-bg);
border: 1px solid transparent; border-radius: var(--radius-md);
transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
:hover { opacity: 0.92; transform: translateY(-2px) scale(1.02); box-shadow: 0 4px 20px rgba(255,255,255,0.06); }
:active { opacity: 0.8; transform: scale(0.97) translateY(0); transition-duration: 80ms; }
:disabled { opacity-30 cursor-not-allowed }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
```

### .btn-bh (Outline Button)
```css
inline-flex items-center justify-center px-6 py-2.5 text-sm font-semibold
background: transparent; color: var(--color-fg);
border: 1px solid var(--color-border); border-radius: var(--radius-md);
:hover { background: var(--color-surface-hover); border-color: var(--color-muted-fg); transform: translateY(-2px) scale(1.02); }
:active { opacity: 0.8; transform: translateY(0) scale(0.97); }
```

### .btn-bh-outline (Light Outline)
```css
inline-flex items-center justify-center px-5 py-2 text-sm font-medium
background: transparent; color: var(--color-muted-fg);
border: 1px solid var(--color-border); border-radius: var(--radius-md);
:hover { color: var(--color-fg); border-color: var(--color-muted-fg); background: var(--color-surface-hover); }
```

### .card-bh
```css
background: var(--color-surface); border: 1px solid var(--color-border);
border-radius: var(--radius-lg); transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
:hover { border-color: rgba(255,255,255,0.1); transform: translateY(-3px) scale(1.01);
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05); }
```

### .input-bh
```css
w-full px-4 py-2.5 text-sm
background: var(--color-surface); color: var(--color-fg);
border: 1px solid var(--color-border); border-radius: var(--radius-md);
:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 15%, transparent); }
::placeholder { color: var(--color-muted-fg); }
```

### .glass-surface
```css
background: var(--color-surface); border: 1px solid var(--color-border);
border-radius: var(--radius-lg);
```

### .glass-elevated
```css
background: color-mix(in srgb, var(--color-surface) 80%, transparent);
backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
border: 1px solid var(--color-border); border-radius: var(--radius-lg);
box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5),
  inset 0 1px 0 rgba(255,255,255,0.03);
```

### .glass-frosted
```css
background: rgba(17, 17, 20, 0.6);
backdrop-filter: blur(20px) saturate(1.2); -webkit-backdrop-filter: blur(20px) saturate(1.2);
border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-lg);
```

### .headline-bh
```css
font-family: var(--font-display); font-weight: 700;
line-height: 1.1; letter-spacing: -0.03em; color: var(--color-fg);
```

### .label-bh
```css
font-family: var(--font-mono); text-xs uppercase;
letter-spacing: 0.08em; color: var(--color-muted-fg); font-weight: 500;
```

### .badge-bh
```css
inline-flex items-center px-2.5 py-0.5 text-xs font-medium
font-family: var(--font-mono);
background: var(--color-surface); color: var(--color-fg);
border: 1px solid var(--color-border); border-radius: var(--radius-sm);
```

### .divider-bh / .divider-thin
```css
.divider-bh { w-full my-6; height: 1px; background: var(--color-border); }
.divider-thin { w-full my-4; height: 1px; background: var(--color-border); }
```

### .link-reveal
```css
position: relative; display: inline-block;
::after { content: ''; position: absolute; bottom: -1px; left: 0;
  width: 100%; height: 1px; background: currentColor;
  transform: scaleX(0); transform-origin: right;
  transition: transform 0.4s cubic-bezier(0.52, 0.01, 0, 1); }
:hover::after { transform: scaleX(1); transform-origin: left; }
```

---

## Animation Classes

### .animate-in + .visible (Scroll-triggered)
```css
.animate-in { opacity: 0; transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease; }
.animate-in.visible { opacity: 1; transform: translateY(0); }
```

### .stagger-child (Nth-child delays)
```css
.animate-in.visible > .stagger-child:nth-child(1) { transition-delay: 0.05s; }
.animate-in.visible > .stagger-child:nth-child(2) { transition-delay: 0.1s; }
/* ... up to nth-child(6) at 0.3s */
```

### @keyframes scaleIn (Hero elements)
```css
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.animate-scale-in { animation: scaleIn 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
```

---

## Global Styles

- **Custom cursor:** Hidden on pointer devices (`cursor: none !important`), replaced by CustomCursor.svelte
- **Focus rings:** `outline: 2px solid var(--color-accent); outline-offset: 2px`
- **Scrollbar:** 5px width, transparent track, `var(--color-border)` thumb
- **Selection:** `background: var(--color-fg); color: var(--color-bg)`
- **Header:** `.site-header` — frosted glass (`rgba(10,10,10,0.7)`, blur 16px)
- **Footer:** `.site-footer` — semi-transparent (`rgba(17,17,20,0.8)`)
- **Reduced motion:** All animations/transitions set to 0.01ms
- **Image loading:** `opacity: 0` → `opacity: 1` fade on load
