# Promobidocs Color Palette

Extracted from the `public/logo-promobidocs.png` brand asset.

## 1. Primary Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Copper** | `#B8763E` | `--color-primary` | Primary buttons, active states, brand highlights |
| **Gold** | `#C9956B` | `--color-primary-light` | Hover states, soft accents |

## 2. Dark & Neutral

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Dark** | `#1A1A1A` | `--color-dark` | Headers, footer, primary text |
| **Silver** | `#C0C0C8` | `--color-silver` | Subheadings, secondary text |

## 3. Background Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| **Background** | `#FAFAF8` | `--color-bg` | Main page background |
| **Background Accent** | `#F5EDE3` | `--color-bg-accent` | Warm card backgrounds, sections |

## Implementation in Tailwind CSS v4

```css
@theme {
  --color-primary: #B8763E;
  --color-primary-light: #C9956B;
  --color-dark: #1A1A1A;
  --color-silver: #C0C0C8;
  --color-bg: #FAFAF8;
  --color-bg-accent: #F5EDE3;
}
```
