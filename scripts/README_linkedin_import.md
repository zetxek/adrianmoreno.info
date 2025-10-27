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

1. Place your LinkedIn export files in the `scripts/linkedin/` directory:
   ```
   scripts/linkedin/
   ├── Shares.csv          # Contains your posts/shares
   └── Articles/
       └── Articles/       # Contains your articles as HTML files
   ```

2. Run the import script:
   ```bash
   go run scripts/import_linkedin_posts.go
   ```

## What the Script Does

- **Shares.csv Processing**: Reads your LinkedIn posts from the CSV file, extracting date, content, and any linked URLs
- **Articles Processing**: Reads your LinkedIn articles from HTML files, extracting title, date, and content
- **Content Conversion**: Converts HTML content to clean markdown-like text
- **Hugo Post Creation**: Creates individual Hugo blog posts in `content/blog/` with proper frontmatter

## Output

Each LinkedIn post/article becomes a Hugo blog post with:
- Original publication date
- Clean, readable content
- Attribution to the original LinkedIn post
- Tags indicating it's an imported LinkedIn post
- URL-friendly slug based on the title

## File Structure After Import

```
content/blog/
├── 2024-01-15-my-first-linkedin-post.md
├── 2024-02-20-another-share.md
└── 2024-03-10-article-title.md
```

## Notes

- The script skips empty posts automatically
- If a post with the same date and title already exists, it will be skipped
- HTML content is converted to plain text with basic formatting preserved
- Original LinkedIn URLs are included when available
- All imported posts are marked as `draft = false` so they publish immediately

## Troubleshooting

- **"LinkedIn export directory not found"**: Make sure you've placed the export files in `scripts/linkedin/`
- **"Could not find required columns"**: Your Shares.csv may have different column names than expected
- **Compilation errors**: Make sure you have Go installed and the script is syntactically correct