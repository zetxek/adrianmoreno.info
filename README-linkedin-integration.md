# LinkedIn to Hugo Integration Guide

This guide explains how to integrate your LinkedIn posts with your Hugo website.

## Overview

The integration allows you to:
1. Extract your LinkedIn posts (either via manual export or API)
2. Convert them to Hugo-compatible Markdown files
3. Add them to your website as a dedicated "LinkedIn Posts" section

## Directory Structure

The integration adds the following to your Hugo site:

```
content/
  └── linkedin-posts/
      ├── _index.md                 # Section index page
      └── YYYY-MM-DD-post-title.md  # Individual LinkedIn posts

scripts/
  └── linkedin_to_hugo.py           # Conversion script
```

## Setup Instructions

### 1. Manual Export Method (Recommended)

LinkedIn allows you to export your data, including posts:

1. Go to your LinkedIn account settings
2. Navigate to "Data privacy" > "Get a copy of your data"
3. Select "Posts" in the data selection
4. Request the archive and download it when ready (usually takes a few hours)
5. Extract the downloaded archive
6. Run the conversion script:

```bash
cd /path/to/your/hugo/site
python3 scripts/linkedin_to_hugo.py --export /path/to/linkedin/export/file.csv
```

### 2. API Method (Alternative)

The script also supports using third-party APIs like Apify, Bright Data, or Phantombuster to fetch LinkedIn posts. This requires:

1. Creating an account with one of these services
2. Obtaining an API key
3. Configuring the script with your API credentials
4. Running the script with the API option:

```bash
cd /path/to/your/hugo/site
python3 scripts/linkedin_to_hugo.py --api
```

## Configuration

The script uses a configuration file at `config/linkedin_config.json`. You can create this file by running:

```bash
cd /path/to/your/hugo/site
python3 scripts/linkedin_to_hugo.py --setup
```

Then edit the generated configuration file to customize:
- Output directory
- API settings (if using API method)
- Post template (title prefix, tags, categories, etc.)

## Updating Your Posts

To update your LinkedIn posts on your website:

1. Re-export your LinkedIn data (or re-fetch via API)
2. Run the conversion script again
3. Build your Hugo site to see the changes

## Customization

### Styling

The LinkedIn posts section uses your Hugo theme's default post styling. To customize the appearance:

1. Create a custom layout for LinkedIn posts in `layouts/linkedin-posts/single.html`
2. Add custom CSS for LinkedIn posts in your theme's stylesheet

### Front Matter

Each converted post includes the following front matter:

```yaml
---
title: "LinkedIn Post: [Post Title]"
date: "[Post Date]"
draft: false
tags:
  - linkedin
  - social-media
categories:
  - posts
layout: post
linkedin_url: "[Original LinkedIn URL]"
linkedin_stats:
  likes: [Number of Likes]
  comments: [Number of Comments]
  shares: [Number of Shares]
---
```

You can customize this template in the configuration file.

## Troubleshooting

### Common Issues

1. **Script fails to process export file**: LinkedIn's export format may change. Check the export file structure and update the script if needed.

2. **Posts not appearing on site**: Ensure the `draft` setting is set to `false` in the configuration.

3. **API rate limits**: If using the API method, you might hit rate limits. Consider using the manual export method instead.

### Getting Help

If you encounter issues, check:
- The script's error messages
- LinkedIn's data export documentation
- The API provider's documentation (if using API method)

## Privacy Considerations

Remember that when republishing LinkedIn content on your website:
- You maintain ownership of your original content
- Consider the privacy of others mentioned in your posts
- Be mindful of any confidential information

## License

This integration script is provided under the MIT License.
