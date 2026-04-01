# PODDNA Admin Guide

Welcome to the PODDNA administration guide. This document covers everything you need to know to manage your podcast annotation platform effectively.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Discover & Import](#discover--import)
4. [Episode Library](#episode-library)
5. [Transcript Lab](#transcript-lab)
6. [Featured Annotations](#featured-annotations)
7. [User Management](#user-management)

---

## Getting Started

### Accessing the Admin Panel

1. Navigate to `/admin` on your PODDNA site
2. Sign in with your admin account using Replit authentication
3. Only users with the admin role can access the admin panel

### Admin Navigation

The admin sidebar provides quick access to all management areas:

- **Dashboard** - Overview and quick stats
- **Discover & Import** - Find and add new podcasts from Podcast Index
- **Episode Library** - View and manage all episodes
- **Transcript Lab** - Generate and manage transcripts
- **Featured Annotations** - Curate homepage content
- **User Management** - Manage user accounts and roles

---

## Dashboard Overview

The dashboard provides a quick snapshot of your platform activity and key metrics at a glance.

---

## Discover & Import

### Finding Podcasts

Use the Discover & Import section to search the Podcast Index database for podcasts to add to your platform.

1. Go to **Discover & Import** from the admin sidebar
2. Enter a podcast name, topic, or keyword in the search field
3. Browse results from the Podcast Index database
4. Import podcasts and their episodes to your library

### Supported Sources

PODDNA supports podcasts from various sources:

- **Podcast Index** - The primary source for discovering podcasts with RSS feeds
- **YouTube** - Episodes with YouTube video URLs are supported with synchronized video playback
- **Direct Audio** - MP3 and other audio file URLs

---

## Episode Library

### Viewing Episodes

The Episode Library displays all episodes in your platform. You can:

- View episode details and metadata
- Filter episodes by podcast or transcript status
- Search for specific episodes
- Access individual episode details

### Episode Details

Each episode record includes:

- Title and description
- Audio or video URL
- Publication date and duration
- Transcript status
- Associated podcast information

---

## Transcript Lab

### Overview

The Transcript Lab is where you generate and manage AI-powered transcripts for your episodes.

### Generating Transcripts

PODDNA uses AI with speaker diarization to create accurate, timestamped transcripts:

1. Navigate to **Transcript Lab**
2. Find episodes that need transcripts
3. Initiate transcript generation
4. Monitor progress via real-time indicators

### Transcript Features

- **Automatic speaker detection** - Different speakers are identified and labeled
- **Timestamped segments** - Each segment links to the corresponding audio moment
- **Speaker renaming** - Update speaker labels (e.g., "Speaker 1" to actual names)
- **Punctuation and formatting** - Clean, readable transcripts

### Tips for Best Results

- Higher quality audio produces better transcription accuracy
- Longer episodes take more time to process
- Episodes with many speakers may benefit from manual speaker name corrections

---

## Featured Annotations

Featured annotations are curated highlights that appear prominently on the homepage, showcasing the best community insights.

### Accessing Featured Annotations

1. Go to **Featured Annotations** from the admin sidebar
2. View the **Currently Featured** section showing what's on the homepage
3. Browse **All Annotations** to find content to feature

### Managing Featured Content

**To feature an annotation:**
1. Find the annotation in the list
2. Use filters to narrow results by search term, podcast, or featured status
3. Click the feature toggle to add it to the homepage

**To remove from featured:**
1. In the Currently Featured section, click Remove
2. Or toggle off the featured status in the table

### Best Practices for Curation

- **Quality over quantity** - Feature annotations that provide genuine insight
- **Rotate regularly** - Keep the homepage fresh with new featured content
- **Balance diversity** - Feature content from different podcasts and topics
- **Consider engagement** - Upvotes indicate community favorites

---

## User Management

### Viewing Users

The User Management section shows all registered users with:

- Profile information
- Registration date
- Current role (user or admin)
- Account status

### Managing Roles

**Promoting a user to admin:**
1. Find the user in the list
2. Change their role to Admin
3. Confirm the change

**Demoting an admin:**
1. Find the admin user
2. Change their role back to User
3. Confirm the change

### Account Actions

Depending on the situation, you may:

- View a user's public profile
- Adjust account permissions
- Address policy violations as needed

---

## Platform Best Practices

### Content Strategy

- Import podcasts that align with your platform's focus
- Generate transcripts promptly after adding episodes
- Feature high-quality annotations regularly to encourage engagement

### Community Building

- Monitor trending annotations to understand community interests
- Recognize and promote diverse perspectives
- Respond appropriately to community feedback

### Regular Maintenance

- Review user accounts periodically
- Update speaker names in transcripts for clarity
- Keep featured content fresh and relevant

---

## Getting Help

If you encounter issues:

1. Check this guide for common solutions
2. Review application logs for error details
3. Contact your development team for technical support

---

*Last updated: November 2025*
