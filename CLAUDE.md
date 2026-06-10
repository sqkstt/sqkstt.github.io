# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Personal tech blog (Chinese-language) built with **Astro 6.x**, deployed to **GitHub Pages** via GitHub Actions. Content is authored as Markdown files with frontmatter, stored in `src/content/blog/`.

## Commands

```sh
npm install              # Install dependencies (Node >= 22.12)
npm run dev              # Start Astro dev server (usually http://127.0.0.1:4321)
npm run build            # Production build to dist/
npm run preview          # Preview production build
npm run editor           # Start local blog editor (http://127.0.0.1:4322)
```

The editor is a separate Express + Vite + React SPA that reads/writes Markdown files directly. It auto-starts the Astro dev server for preview. See `LOCAL_EDITING.md` for usage details.

## Architecture

```
src/
  pages/           # File-based routing (Astro pages)
    index.astro    # Homepage: hero panel + stat cards + post list
    blog/[id].astro          # Single article page
    categories/index.astro   # Category directory
    categories/[category].astro  # Posts by category
    tags/index.astro         # Tag directory
    tags/[tag].astro         # Posts by tag
    about.astro              # About page
    rss.xml.ts               # RSS feed generation
  layouts/
    BaseLayout.astro  # Shell: <head>, space background, header, footer, floating pet
  components/
    PostCard.astro    # Article card (used in lists)
    SiteIcon.astro    # Inline SVG icon set (brand, pen, category, tag, deploy, empty)
  styles/
    global.css        # All styles: CSS custom properties, meteors, layout, typography, responsive
  content.config.ts  # Astro content collection schema (blog with glob loader)
tools/
  editor/
    server.mjs        # Express API: CRUD posts, taxonomy, preview orchestration
    client/           # Vite + React SPA for the editing UI
```

## Key design decisions

- **No frameworks in the public site** — pages are pure Astro/HTML/CSS. React (`lucide-react`, `react-markdown`) exists in devDependencies only for the local editor tool.
- **Dark-only theme** — no light mode toggle. Deep space aesthetic with cyan/pink/violet accents.
- **Content collection loader is `glob`** (not the default `file` loader) — posts live directly in `src/content/blog/*.md`.
- **Draft filtering** — posts with `draft: true` in frontmatter are excluded from all pages, RSS, and sitemap at build time. The editor defaults new posts to `draft: true`.
- **Categories and tags are implicit** — they are derived from post frontmatter at build time, no separate taxonomy config needed. Category is a single string per post; tags are an array.
- **Floating pet mascot** — bottom-right corner, draggable with `localStorage` position persistence. Hidden on mobile (`max-width: 700px`).
- **Space background** — 16 CSS-animated meteor elements + grid overlay + radial gradient "stars". All pure CSS, fixed position, `pointer-events: none`.
- **Deployment** — push to `main` triggers GitHub Actions (`deploy.yml`): builds with `SITE_URL=https://sqkstt.github.io` and deploys the `dist/` folder to GitHub Pages.

## Site icon system

`SiteIcon.astro` accepts a `name` prop (`'brand' | 'pen' | 'category' | 'tag' | 'deploy' | 'empty'`) and renders an inline SVG with `viewBox="0 0 64 64"`. Styled via the `.icon-glyph` class (stroke-based line icons). To add a new icon, add a new branch in the component's switch expression.

## CSS conventions

- All design tokens in `:root` as custom properties (colors, shadows, font-family).
- Class naming is BEM-like functional: `.site-shell`, `.hero-panel`, `.post-card`, `.article-body`, `.dashboard-strip`.
- Responsive breakpoint at `max-width: 700px` — smaller than typical 768px to target true narrow screens.
- `prefers-reduced-motion: reduce` disables meteor and pet animations.
