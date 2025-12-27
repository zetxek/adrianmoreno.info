# LinkedIn Posts Import Script

This Go script imports LinkedIn posts and articles from a LinkedIn data export and converts them into Hugo blog posts.

## Prerequisites

- Go installed on your system
- LinkedIn data export (see instructions below)

## LinkedIn Data Export

1. Go to your LinkedIn account settings
2. Navigate to "Data privacy" → "Get a copy of your data"
3. Request an archive of your data
4. When you receive the archive, extract it to a folder

## Usage

1. Place your LinkedIn export files in one of these locations:
   - `scripts/linkedin/` directory, or
   - `scripts/Complete_LinkedInDataExport_YYYY-MM-DD.zip/` directory (extracted export)
   
   Required files:
   ```
   ├── Shares.csv          # Contains your posts/shares
   ├── Rich_Media.csv      # Contains image URLs for posts (optional but recommended)
   └── Articles/
       └── Articles/       # Contains your articles as HTML files
   ```

2. Run the import script with your desired mode:
   ```bash
   # Default: create new posts, skip existing
   go run scripts/import_linkedin/import_linkedin_posts.go --mode=create
   
   # Update existing posts with new data and images
   go run scripts/import_linkedin/import_linkedin_posts.go --mode=update
   
   # Full sync: create new + update existing
   go run scripts/import_linkedin/import_linkedin_posts.go --mode=sync
   
   # Only add images to existing posts (skip posts that already have images)
   go run scripts/import_linkedin/import_linkedin_posts.go --mode=images-only
   
   # Extract reshared LinkedIn post URLs (requires browser automation, slower)
   go run scripts/import_linkedin/import_linkedin_posts.go --mode=sync --extract-reshares
   ```

### Import Modes

- **`create`** (default): Creates new posts, skips existing ones. Use for first-time imports.
- **`update`**: Updates existing posts with new frontmatter and images, creates new posts. Use when re-importing with a fresh export.
- **`sync`**: Full synchronization - creates new posts and updates existing ones. Best for keeping everything in sync.
- **`images-only`**: Only adds images to existing posts that don't have any. Skips new posts. Perfect for enriching already-imported content.

### Draft Post Handling

When extracting reshared post URLs (with `--extract-reshares`), the script automatically **skips draft posts**. This means:
- Posts with `draft = true` in their frontmatter are not processed
- Only published posts (`draft = false` or no draft field) are checked for reshared URLs
- This saves time and avoids unnecessary browser operations for unpublished content

You can still manually add `resharedPostURL` to draft posts if needed.

## What the Script Does

- **Shares.csv Processing**: Reads your LinkedIn posts from the CSV file, extracting date, content, and any linked URLs
- **Rich_Media.csv Processing**: Matches image URLs to posts by date and content similarity, then downloads images locally
- **Shared URL Handling**: Captures external links being shared (`SharedUrl` column) and includes them in frontmatter
- **Reshared Post Extraction**: Optionally extracts URLs of reshared LinkedIn posts using browser automation (requires `--extract-reshares` flag)
- **Articles Processing**: Reads your LinkedIn articles from HTML files, extracting title, date, and content
- **Content Conversion**: Converts HTML content to clean markdown-like text
- **Image Download**: Downloads post images from LinkedIn CDN URLs and stores them locally
- **Hugo Post Creation**: Creates individual Hugo blog posts in `content/blog/` with proper frontmatter including image references and shared/reshared URLs
- **Duplicate Detection**: Intelligently detects existing posts by URL, content hash, or date+slug to prevent duplicates

## Output

Each LinkedIn post/article becomes a Hugo blog post with:
- Original publication date
- Clean, readable content
- Attribution to the original LinkedIn post
- Tags indicating it's an imported LinkedIn post
- URL-friendly slug based on the title
- **Images** (if available): Downloaded images stored in `static/images/linkedin/` and referenced in frontmatter
- **Shared URLs** (if available): External links being shared, included in frontmatter as `sharedURL`
- **Reshared post URLs** (if extracted): Links to original LinkedIn posts being reshared, included in frontmatter as `resharedPostURL` and referenced in content
- **Content hash**: SHA256 hash for duplicate detection

### Reshared Posts

When you reshare a LinkedIn post, the export may not include the original post URL in the `SharedUrl` field. The script can extract this using browser automation:

- **Automatic detection**: For posts with short content (< 500 chars) and empty `SharedUrl`, the script attempts to detect potential reshares
- **Browser extraction**: With `--extract-reshares` flag, uses Playwright to visit the share page and extract the reshared post URL
- **Content reference**: Adds a reference at the end of the post: `*Reshared from: [View original post on LinkedIn](URL)*`

**Note**: Browser extraction requires:
- Playwright installed (`npm install` in project root)
- LinkedIn posts to be publicly accessible (or you'll need to authenticate)
- More time to process (browser automation is slower)

### Image Handling

The script automatically:
1. Parses `Rich_Media.csv` to find image URLs associated with posts
2. Matches images to posts using:
   - **Date matching**: Within 5-minute tolerance
   - **Content similarity**: Fuzzy matching on post content vs media description
3. Downloads images from LinkedIn CDN URLs to `static/images/linkedin/`
4. Adds image references to Hugo frontmatter:
   ```toml
   images = ["/images/linkedin/2025-10-18-post-slug-1.jpg"]
   featuredImage = "/images/linkedin/2025-10-18-post-slug-1.jpg"
   ```

**Important Notes:**
- LinkedIn CDN URLs expire after ~3-4 weeks. Use a fresh export for best results.
- Images are only added to posts that don't already have images when using `images-only` mode.
- If image downloads fail (expired URLs), posts are still created/updated but without images.

## File Structure After Import

```
content/blog/
├── 2024-01-15-my-first-linkedin-post.md
├── 2024-02-20-another-share.md
└── 2024-03-10-article-title.md

static/images/linkedin/
├── 2025-10-18-post-slug-1.jpg
├── 2025-10-18-post-slug-2.jpg
└── 2025-07-01-another-post-1.png
```

## Notes

- The script skips empty posts automatically
- **Duplicate Detection**: Posts are matched by:
  - `originalURL` (if available)
  - Content hash (SHA256 of first 200 characters)
  - Date + slug combination
- HTML content is converted to plain text with basic formatting preserved
- Original LinkedIn URLs are included when available
- All imported posts are marked as `draft = false` so they publish immediately
- **Image URLs expire**: LinkedIn CDN URLs typically expire 3-4 weeks after export. For best results, use a fresh export and run the script soon after downloading.
- **Image matching**: Uses intelligent matching with 5-minute date tolerance and content similarity scoring

## Troubleshooting

- **"LinkedIn export directory not found"**: Make sure you've placed the export files in `scripts/linkedin/` or `scripts/Complete_LinkedInDataExport_YYYY-MM-DD.zip/`
- **"Could not find required columns"**: Your Shares.csv may have different column names than expected
- **"Warning: Failed to download image"**: Image URLs may have expired. Try with a fresh export (downloaded within the last few weeks)
- **Images not matching to posts**: The matching algorithm uses date (5-min tolerance) and content similarity. If dates don't match closely, ensure the post content is similar to the media description in Rich_Media.csv
- **"File already exists"**: In `create` mode, existing posts are skipped. Use `update` or `sync` mode to update existing posts
- **Compilation errors**: Make sure you have Go installed and the script is syntactically correct

## Example Workflows

### First-Time Import
```bash
# Import all posts with images
go run scripts/import_linkedin/import_linkedin_posts.go --mode=create
```

### Adding Images to Existing Posts
```bash
# Get a fresh export, then add images to posts that don't have them
go run scripts/import_linkedin/import_linkedin_posts.go --mode=images-only
```

### Full Re-import with Fresh Export
```bash
# Download new export, then sync everything
go run scripts/import_linkedin/import_linkedin_posts.go --mode=sync
```

### Extracting Reshared Post URLs
```bash
# Extract reshared LinkedIn post URLs (slower, requires browser automation)
go run scripts/import_linkedin/import_linkedin_posts.go --mode=sync --extract-reshares
```

**Behavior**:
- **Skips draft posts**: Only processes posts with `draft = false` (or no draft field)
- **Skips existing URLs**: Posts that already have `resharedPostURL` are skipped
- **Incremental saving**: Posts are saved immediately after extraction (no need to wait for all)

**Note**: Reshared post extraction may not work if:
- Posts require LinkedIn authentication to view
- LinkedIn's page structure has changed
- The post is not actually a reshare

In these cases, you can manually add the `resharedPostURL` field to the post's frontmatter.