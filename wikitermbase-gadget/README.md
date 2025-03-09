# WikiTerm Gadget

MediaWiki gadget for embedding dictionary lookup functionality directly into Wikipedia.

## Overview

This gadget provides a Wikipedia-native implementation of the WikiTermBase dictionary tool without using iframes. It complies with Wikipedia security requirements by running all code directly within the MediaWiki environment while still accessing the WikiTermBase API for dictionary data.

## Key Features

- Search for terms in Arabic, English, and French
- Display aggregated dictionary results
- Expand/collapse detailed information
- Copy citation templates for Wikipedia articles
- View external references
- Mobile and desktop support
- Dark mode support based on user preferences

## Implementation

The gadget uses MediaWiki's OOJS UI library to create a dialog interface that:

1. Makes direct API calls to the WikiTermBase backend API
2. Renders search results with proper RTL support
3. Handles citations and references
4. Preserves all the core functionality of the original app

## Security Benefits

Unlike the iframe approach, this implementation:

- Runs within Wikipedia's content security policy
- No cross-site security concerns
- Better integration with Wikipedia's design language
- Avoids iframe sandboxing limitations

## Installation Options

### As a MediaWiki Gadget (For Administrators)

1. Create `MediaWiki:Gadget-wikitermbase.js` with the gadget code
2. Add an entry to `MediaWiki:Gadgets-definition`
3. Create a description page at `MediaWiki:Gadget-wikitermbase`

### For Individual Users

Users can install the gadget manually:

1. Add a loader to their `common.js` page
2. Create a personal `wikitermbase.js` page with the gadget code

## Files

- `WikiTermGadget.js` - The main gadget implementation
- `ResourceLoader.txt` - Configuration for MediaWiki Resource Loader
- `UserInstallation.txt` - Instructions for users (in Arabic)
- `README.md` - This documentation file

## Backend Requirements

The gadget requires:
- Access to the WikiTermBase API endpoint: `https://wikitermbase.toolforge.org/api/v1/search/aggregated`
- CORS support is already enabled in the backend