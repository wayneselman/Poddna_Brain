# Design Guidelines: PODDNA - Podcast Annotation Platform

## Design Approach
**Modern SaaS Aesthetic** meeting **Genius-Style Annotation Mechanics**:
- Clean, minimal interface with generous whitespace and professional polish
- White backgrounds with subtle gray (#F9FAFB) section breaks
- Card-based layouts with organized grid systems
- Filter sidebars for discovery (left-rail pattern)
- Annotation highlights as core interaction (yellow #F5C518)
- Reference: Linear for clean typography, Notion for information hierarchy, Genius for annotation UX

## Typography
**Fonts**: Inter (primary sans-serif via Google Fonts)
- **Page Headings**: 700 weight, 4xl-5xl, black (#111827)
- **Section Headers**: 600 weight, 2xl-3xl, black
- **Card Titles**: 600 weight, lg-xl, black
- **Body/Annotations**: 400 weight, base-lg, gray-700 (#374151)
- **Metadata/Labels**: 500 weight, sm, gray-500 (#6B7280)
- **Timestamps**: 400 weight, sm, gray-600 with monospace (JetBrains Mono)

## Layout System
**Spacing**: Tailwind units **4, 6, 8, 12, 16, 20** for consistent rhythm.

**Grid Strategy**:
- Container: max-w-7xl with px-6 to px-8 padding
- Episode cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-6
- Filter sidebar: w-64 on desktop, collapsible drawer on mobile

## Core Components

### 1. Navigation Bar
- Sticky header (bg-white) with border-b border-gray-200
- Logo (left), Search bar (center, max-w-md), Profile/Auth (right)
- Height: h-16, shadow-sm on scroll
- Links: Explore, Collections, Creators (text-gray-700, hover:text-gray-900)
- Icons: Heroicons (outline style)

### 2. Hero Section (Explore Page)
- Height: 60vh, centered content (no full-bleed image)
- Background: White with subtle gradient overlay
- Heading: "Discover annotations on your favorite podcasts" (text-5xl, font-bold)
- Subheading: Gray-600, text-xl, max-w-2xl
- CTA: "Start exploring" button (bg-blue-600 #4F46E5, px-8, py-3, rounded-lg)
- Search bar below CTA: Large (w-full max-w-2xl), shadow-lg

### 3. Filter Sidebar (Explore/Collections)
- Fixed left rail on desktop (w-64), mb-8 on mobile
- Background: White with border-r border-gray-200
- Sections: Categories, Duration, Date, Rating (each with py-4, border-b)
- Checkboxes/Radio buttons with blue accent
- Clear filters link (text-blue-600, text-sm)

### 4. Episode/Podcast Cards
- White background, rounded-xl, border border-gray-200, hover:shadow-lg transition
- Padding: p-6
- Layout: Podcast artwork (w-20 h-20, rounded-lg) + metadata column
- Title: font-semibold, text-lg, line-clamp-2
- Description: text-gray-600, text-sm, line-clamp-3
- Footer: Annotation count badge (bg-yellow-100, text-yellow-800, rounded-full, px-3, py-1, text-xs)
- Metrics row: Duration, Date, Creator (text-gray-500, text-sm, gap-4)

### 5. Annotation System
**Inline Highlights** (Episode Pages):
- Yellow highlight: bg-yellow-200 (#F5C518 with opacity)
- Click reveals annotation card: Positioned absolute, w-80, bg-white, rounded-lg, shadow-2xl
- Card content: Annotation text, author avatar + name, upvote count, timestamp link
- Arrow pointer (triangle) connecting to highlighted text

**Annotation Cards** (Browse):
- Grid layout: gap-4, auto-fit columns
- Each card: White bg, p-4, rounded-lg, border
- Quoted text with yellow highlight stripe (border-l-4 border-yellow-400)
- Podcast thumbnail (w-12 h-12) + episode title
- Footer: Upvote button (outline), reply count, share icon

### 6. Episode Player Page
**Layout**: 2-column (sidebar + main content)
- Left sidebar (w-80): Podcast artwork (large), episode metadata, play button (blue)
- Main content: Transcript with inline annotations, timestamps in left margin (sticky positioning)
- Transcript: max-w-3xl, generous line-height (leading-relaxed), text-gray-700
- Annotations appear as yellow highlights inline, click to expand details

### 7. Collections/Creators Pages
- Page header: Title + description (py-12, border-b)
- Grid of cards (3-column on desktop)
- Collection cards: Cover image grid (2x2 of podcast artworks), title, annotation count
- Creator cards: Avatar (large, rounded-full), name, bio snippet, follower count

### 8. Social Engagement
- Upvote button: Outline style, hover:bg-gray-50, count displayed adjacent
- Comment threads: Nested with pl-8, border-l-2 border-gray-200, max depth 2
- Share: Icon button (text-gray-500, hover:text-gray-700)

## Interaction Patterns
- **Card hovers**: Subtle scale-102, shadow-lg transition (duration-200)
- **Annotation clicks**: Highlight fade-in (duration-150), popup slide-up (duration-200)
- **Filter changes**: Instant grid update with skeleton loading states
- **Upvote**: Number increment with scale pulse (duration-150)

## Images
**Hero Section**: No large background image. Clean gradient or solid white.

**Podcast/Episode Artwork**:
- Card thumbnails: w-20 h-20 (square, rounded-lg)
- Episode page sidebar: w-full aspect-square (large, prominent)
- Collection grids: 2x2 mosaic of episode artworks
- All images: Lazy load with gray-200 skeleton, fade-in on load

**Sizes**: Small contextual (w-12 to w-20), medium cards (w-20 to w-24), large player (w-64 to w-80)

## Responsive Strategy
- **Desktop (lg+)**: 3-column grids, persistent filter sidebar, 2-column episode layout
- **Tablet (md)**: 2-column grids, collapsible filter drawer, single column episode
- **Mobile**: 1-column grids, bottom sheet filters, stacked episode layout

## Key Differentiators
- Clean SaaS professionalism with annotation-first interactions
- Yellow highlights as signature visual element on white canvas
- Information density balanced with whitespace (not sparse, not cluttered)
- Filter-driven discovery vs. algorithmic rails
- Professional typography hierarchy creates editorial feel