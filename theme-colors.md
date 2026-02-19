# Promobi Color Palette

Based on the analysis of `public/logo.png` and the brand guidelines (Promobi Orange), here is the suggested color palette for the Promobi application.

## 1. Primary Colors
The core brand identity colors.

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Promobi Orange** | `#FF7518` | `--color-primary` | Primary buttons, active states, brand highlights |
| **Pure White** | `#FFFFFF` | `--color-white` | Text on dark backgrounds, card backgrounds |

## 2. Secondary Colors
Colors that support the primary palette and provide depth (Premium Feel).

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Deep Navy** | `#0F172A` | `--color-secondary` | Headers, footer, primary text in light mode |
| **Slate Gray** | `#334155` | `--color-secondary-light` | Body text, subheadings |

## 3. Accent Colors
Used sparingly for emphasis, success states, or premium touches.

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Gold** | `#F59E0B` | `--color-accent` | Premium badges, stars, high-value actions |
| **Teal** | `#14B8A6` | `--color-success` | Success messages, verified badges |

## 4. Background Colors
Neutral shades for layout structure.

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Light Gray** | `#F8FAFC` | `--color-bg-light` | Main background (light mode) |
| **Off-White** | `#F1F5F9` | `--color-bg-subtle` | Sidebar backgrounds, secondary sections |
| **Dark Void** | `#020617` | `--color-bg-dark` | Main background (dark mode) |

## Implementation in Tailwind CSS v4

Update your `app/globals.css` `@theme` block:

```css
@theme {
  --color-primary: #FF7518;
  --color-secondary: #0F172A;
  --color-accent: #F59E0B;
  
  --color-background-light: #F8FAFC;
  --color-background-dark: #020617;
}
```
