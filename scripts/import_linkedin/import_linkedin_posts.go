package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	contentDir  = "content/blog"
	linkedinDir = "scripts/linkedin" // Path to LinkedIn export directory
)

type LinkedInPost struct {
	Date        time.Time
	Content     string
	URL         string
	ContentType string // "share" or "article"
	Title       string
}

func main() {
	// Get the current working directory
	projectRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error getting current directory: %v\n", err)
		return
	}

	linkedinPath := filepath.Join(projectRoot, linkedinDir)
	if _, err := os.Stat(linkedinPath); os.IsNotExist(err) {
		fmt.Printf("LinkedIn export directory not found: %s\n", linkedinPath)
		fmt.Println("Please place your LinkedIn export in 'scripts/linkedin/' directory.")
		return
	}

	var posts []LinkedInPost

	// Process Shares.csv
	sharesPath := filepath.Join(linkedinPath, "Shares.csv")
	if _, err := os.Stat(sharesPath); err == nil {
		fmt.Println("Processing Shares.csv...")
		sharesPosts, err := processSharesCSV(sharesPath)
		if err != nil {
			fmt.Printf("Error processing shares: %v\n", err)
			return
		}
		posts = append(posts, sharesPosts...)
	}

	// Process Articles
	articlesPath := filepath.Join(linkedinPath, "Articles", "Articles")
	if _, err := os.Stat(articlesPath); err == nil {
		fmt.Println("Processing Articles...")
		articlePosts, err := processArticles(articlesPath)
		if err != nil {
			fmt.Printf("Error processing articles: %v\n", err)
			return
		}
		posts = append(posts, articlePosts...)
	}

	// Create Hugo posts
	for _, post := range posts {
		err := createHugoPost(projectRoot, post)
		if err != nil {
			fmt.Printf("Error creating post for %s: %v\n", post.Title, err)
			continue
		}
		fmt.Printf("Created: %s (%s)\n", post.Title, post.ContentType)
	}

	fmt.Println("Import completed!")
}

func processSharesCSV(csvPath string) ([]LinkedInPost, error) {
	file, err := os.Open(csvPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file appears to be empty or missing headers")
	}

	var posts []LinkedInPost

	// Find column indices
	headers := records[0]
	var dateCol, shareLinkCol, shareCommentaryCol int = -1, -1, -1
	for i, header := range headers {
		switch strings.ToLower(strings.TrimSpace(header)) {
		case "date":
			dateCol = i
		case "sharelink":
			shareLinkCol = i
		case "sharecommentary":
			shareCommentaryCol = i
		}
	}

	if dateCol == -1 || shareCommentaryCol == -1 {
		return nil, fmt.Errorf("Could not find required columns 'Date' and 'ShareCommentary'")
	}

	for i, record := range records[1:] {
		if len(record) <= shareCommentaryCol || strings.TrimSpace(record[shareCommentaryCol]) == "" {
			continue // Skip empty posts
		}

		dateStr := strings.TrimSpace(record[dateCol])
		content := record[shareCommentaryCol]
		url := ""
		if shareLinkCol != -1 && len(record) > shareLinkCol {
			url = strings.TrimSpace(record[shareLinkCol])
		}

		// Parse date (format: 2025-10-18 17:17:11)
		parsedDate, err := time.Parse("2006-01-02 15:04:05", dateStr)
		if err != nil {
			fmt.Printf("Warning: Could not parse date '%s' for record %d, skipping\n", dateStr, i+1)
			continue
		}

		// Clean up content (remove extra quotes and fix line breaks)
		content = cleanShareContent(content)

		title := createTitle(content)

		posts = append(posts, LinkedInPost{
			Date:        parsedDate,
			Content:     content,
			URL:         url,
			ContentType: "share",
			Title:       title,
		})
	}

	return posts, nil
}

func processArticles(articlesPath string) ([]LinkedInPost, error) {
	files, err := os.ReadDir(articlesPath)
	if err != nil {
		return nil, err
	}

	var posts []LinkedInPost

	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".html") {
			continue
		}

		filePath := filepath.Join(articlesPath, file.Name())
		post, err := processArticleFile(filePath)
		if err != nil {
			fmt.Printf("Warning: Could not process article %s: %v\n", file.Name(), err)
			continue
		}

		posts = append(posts, *post)
	}

	return posts, nil
}

func processArticleFile(filePath string) (*LinkedInPost, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	htmlContent := string(content)

	// Extract title
	titleRegex := regexp.MustCompile(`<title>(.*?)</title>`)
	titleMatch := titleRegex.FindStringSubmatch(htmlContent)
	if len(titleMatch) < 2 {
		return nil, fmt.Errorf("Could not find title in HTML")
	}
	title := strings.TrimSpace(titleMatch[1])

	// Escape quotes and backslashes for TOML frontmatter
	title = strings.ReplaceAll(title, `\`, `\\`)
	title = strings.ReplaceAll(title, `"`, `\"`)

	// Try to extract date from filename first (format: 2024-06-22 10:12:21.0-Title.html)
	var parsedDate time.Time
	filename := filepath.Base(filePath)
	dateRegex := regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})`)
	dateMatch := dateRegex.FindStringSubmatch(filename)

	if len(dateMatch) >= 2 {
		parsedDate, err = time.Parse("2006-01-02 15:04:05", dateMatch[1])
		if err != nil {
			parsedDate = time.Time{}
		}
	}

	// If no date from filename, try to extract from HTML content
	if parsedDate.IsZero() {
		// Look for "Created on YYYY-MM-DD HH:MM" pattern in HTML
		createdRegex := regexp.MustCompile(`Created on (\d{4}-\d{2}-\d{2} \d{2}:\d{2})`)
		createdMatch := createdRegex.FindStringSubmatch(htmlContent)
		if len(createdMatch) >= 2 {
			parsedDate, err = time.Parse("2006-01-02 15:04", createdMatch[1])
			if err != nil {
				parsedDate = time.Time{}
			}
		}
	}

	// If still no date, try "Published on" pattern
	if parsedDate.IsZero() {
		publishedRegex := regexp.MustCompile(`Published on (\d{4}-\d{2}-\d{2} \d{2}:\d{2})`)
		publishedMatch := publishedRegex.FindStringSubmatch(htmlContent)
		if len(publishedMatch) >= 2 {
			parsedDate, err = time.Parse("2006-01-02 15:04", publishedMatch[1])
			if err != nil {
				parsedDate = time.Time{}
			}
		}
	}

	if parsedDate.IsZero() {
		return nil, fmt.Errorf("Could not extract date from filename or HTML content")
	}

	// Extract content from body (use (?s) for multiline matching)
	bodyRegex := regexp.MustCompile(`(?s)<body[^>]*>(.*?)</body>`)
	bodyMatch := bodyRegex.FindStringSubmatch(htmlContent)
	if len(bodyMatch) < 2 {
		return nil, fmt.Errorf("Could not find body content")
	}

	bodyContent := bodyMatch[1]

	// Convert HTML to markdown-like content
	markdownContent := htmlToMarkdown(bodyContent)

	return &LinkedInPost{
		Date:        parsedDate,
		Content:     markdownContent,
		URL:         "", // Articles don't have direct LinkedIn URLs in export
		ContentType: "article",
		Title:       title,
	}, nil
}

func cleanShareContent(content string) string {
	// After Go's CSV parsing, the LinkedIn format looks like:
	// - Paragraph separators: "\n" or "\n"" (quote + newline + quote(s))
	// - Empty paragraphs: "\n""\n"
	// - Escaped quotes within text: ""

	// Step 1: Handle paragraph separators - pattern is "\n" (quote, newline, quote)
	// Also handle "\n"" variants (with extra quotes for empty lines)
	content = regexp.MustCompile(`"\s*\n\s*"+`).ReplaceAllString(content, "\n\n")

	// Step 2: Handle leading/trailing quotes
	content = strings.Trim(content, `"`)
	content = strings.TrimSpace(content)

	// Step 3: Clean up remaining double quotes that were escapes
	// But be careful not to remove legitimate single quotes
	content = strings.ReplaceAll(content, `""`, `"`)

	// Step 4: Remove orphan quotes at line start/end (leftover paragraph markers)
	lines := strings.Split(content, "\n")
	var cleanedLines []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Remove leading/trailing quotes that are paragraph markers
		line = strings.TrimPrefix(line, `"`)
		line = strings.TrimSuffix(line, `"`)
		line = strings.TrimSpace(line)
		cleanedLines = append(cleanedLines, line)
	}
	content = strings.Join(cleanedLines, "\n")

	// Step 5: Remove control characters EXCEPT newlines and tabs
	content = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]`).ReplaceAllString(content, "")
	content = strings.ReplaceAll(content, "\uFFFD", "")

	// Step 6: Normalize paragraph breaks (collapse 3+ newlines to 2)
	content = regexp.MustCompile(`\n{3,}`).ReplaceAllString(content, "\n\n")

	// Step 7: Clean up empty lines that are just whitespace
	content = regexp.MustCompile(`\n[ \t]+\n`).ReplaceAllString(content, "\n\n")

	// Step 8: Process paragraphs for special formatting
	paragraphs := strings.Split(content, "\n\n")
	var result []string

	for _, p := range paragraphs {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}

		// Handle emoji bullets as list items
		if regexp.MustCompile(`^(📄|🧐|🧑‍⚖️|✅|❌|💡|🔹|•)`).MatchString(p) {
			result = append(result, "- "+p)
			continue
		}

		// Regular paragraph
		result = append(result, p)
	}

	return strings.Join(result, "\n\n")
}

func htmlToMarkdown(html string) string {
	content := html

	// Remove script and style tags first (with (?s) for multiline)
	content = regexp.MustCompile(`(?s)<script[^>]*>.*?</script>`).ReplaceAllString(content, "")
	content = regexp.MustCompile(`(?s)<style[^>]*>.*?</style>`).ReplaceAllString(content, "")

	// Remove LinkedIn article metadata (Created on, Published on)
	content = regexp.MustCompile(`(?s)<p[^>]*class="created"[^>]*>.*?</p>`).ReplaceAllString(content, "")
	content = regexp.MustCompile(`(?s)<p[^>]*class="published"[^>]*>.*?</p>`).ReplaceAllString(content, "")

	// Convert images BEFORE removing other tags
	// Handle both single-tag <img> and self-closing <img />
	imgRegex := regexp.MustCompile(`<img[^>]*\ssrc=["']([^"']+)["'][^>]*\salt=["']([^"']*)["'][^>]*/?>`)
	content = imgRegex.ReplaceAllString(content, "![$2]($1)")
	// Also handle images where alt comes before src
	imgRegex2 := regexp.MustCompile(`<img[^>]*\salt=["']([^"']*)["'][^>]*\ssrc=["']([^"']+)["'][^>]*/?>`)
	content = imgRegex2.ReplaceAllString(content, "![$1]($2)")
	// Handle images with only src (no alt)
	imgRegex3 := regexp.MustCompile(`<img[^>]*\ssrc=["']([^"']+)["'][^>]*/?>`)
	content = imgRegex3.ReplaceAllString(content, "![]($1)")

	// Convert links: <a href="url">text</a> -> [text](url)
	// Handle links with various attributes (target, class, etc.)
	linkRegex := regexp.MustCompile(`<a[^>]*\shref=["']([^"']+)["'][^>]*>(.*?)</a>`)
	content = linkRegex.ReplaceAllString(content, "[$2]($1)")

	// Convert bold: <strong>text</strong> or <b>text</b> -> **text**
	content = regexp.MustCompile(`(?s)<strong[^>]*>(.*?)</strong>`).ReplaceAllString(content, "**$1**")
	content = regexp.MustCompile(`(?s)<b[^>]*>(.*?)</b>`).ReplaceAllString(content, "**$1**")

	// Convert italic: <em>text</em> or <i>text</i> -> *text*
	content = regexp.MustCompile(`(?s)<em[^>]*>(.*?)</em>`).ReplaceAllString(content, "*$1*")
	content = regexp.MustCompile(`(?s)<i[^>]*>(.*?)</i>`).ReplaceAllString(content, "*$1*")

	// Convert blockquotes: <blockquote>text</blockquote> -> > text
	blockquoteRegex := regexp.MustCompile(`(?s)<blockquote[^>]*>(.*?)</blockquote>`)
	content = blockquoteRegex.ReplaceAllStringFunc(content, func(match string) string {
		inner := blockquoteRegex.FindStringSubmatch(match)
		if len(inner) > 1 {
			// Clean up the inner content and prefix each line with >
			text := strings.TrimSpace(inner[1])
			text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, "") // Remove inner HTML tags
			lines := strings.Split(text, "\n")
			var quotedLines []string
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line != "" {
					quotedLines = append(quotedLines, "> "+line)
				}
			}
			return strings.Join(quotedLines, "\n")
		}
		return match
	})

	// Convert unordered lists: <ul><li>item</li></ul> -> - item
	// First, process each list item within ul tags
	ulRegex := regexp.MustCompile(`(?s)<ul[^>]*>(.*?)</ul>`)
	content = ulRegex.ReplaceAllStringFunc(content, func(match string) string {
		inner := ulRegex.FindStringSubmatch(match)
		if len(inner) > 1 {
			listContent := inner[1]
			// Find all li items
			liRegex := regexp.MustCompile(`(?s)<li[^>]*>(.*?)</li>`)
			items := liRegex.FindAllStringSubmatch(listContent, -1)
			var result []string
			for _, item := range items {
				if len(item) > 1 {
					// Clean up the item content (remove nested tags but keep text)
					itemText := item[1]
					// Process nested bold/italic within list items
					itemText = regexp.MustCompile(`(?s)<strong[^>]*>(.*?)</strong>`).ReplaceAllString(itemText, "**$1**")
					itemText = regexp.MustCompile(`(?s)<em[^>]*>(.*?)</em>`).ReplaceAllString(itemText, "*$1*")
					// Remove any remaining HTML tags
					itemText = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(itemText, "")
					itemText = strings.TrimSpace(itemText)
					if itemText != "" {
						result = append(result, "- "+itemText)
					}
				}
			}
			return "\n" + strings.Join(result, "\n") + "\n"
		}
		return match
	})

	// Convert ordered lists: <ol><li>item</li></ol> -> 1. item
	olRegex := regexp.MustCompile(`(?s)<ol[^>]*>(.*?)</ol>`)
	content = olRegex.ReplaceAllStringFunc(content, func(match string) string {
		inner := olRegex.FindStringSubmatch(match)
		if len(inner) > 1 {
			listContent := inner[1]
			liRegex := regexp.MustCompile(`(?s)<li[^>]*>(.*?)</li>`)
			items := liRegex.FindAllStringSubmatch(listContent, -1)
			var result []string
			for i, item := range items {
				if len(item) > 1 {
					itemText := item[1]
					itemText = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(itemText, "")
					itemText = strings.TrimSpace(itemText)
					if itemText != "" {
						result = append(result, fmt.Sprintf("%d. %s", i+1, itemText))
					}
				}
			}
			return "\n" + strings.Join(result, "\n") + "\n"
		}
		return match
	})

	// Convert headers
	content = regexp.MustCompile(`(?s)<h1[^>]*>(.*?)</h1>`).ReplaceAllString(content, "\n# $1\n\n")
	content = regexp.MustCompile(`(?s)<h2[^>]*>(.*?)</h2>`).ReplaceAllString(content, "\n## $1\n\n")
	content = regexp.MustCompile(`(?s)<h3[^>]*>(.*?)</h3>`).ReplaceAllString(content, "\n### $1\n\n")
	content = regexp.MustCompile(`(?s)<h4[^>]*>(.*?)</h4>`).ReplaceAllString(content, "\n#### $1\n\n")

	// Convert paragraphs: <p>text</p> -> text followed by blank line
	content = regexp.MustCompile(`(?s)<p[^>]*>(.*?)</p>`).ReplaceAllString(content, "$1\n\n")

	// Convert line breaks
	content = regexp.MustCompile(`<br\s*/?>`).ReplaceAllString(content, "\n")

	// Convert horizontal rules
	content = regexp.MustCompile(`<hr\s*/?>`).ReplaceAllString(content, "\n---\n")

	// Remove div tags but keep content
	content = regexp.MustCompile(`</?div[^>]*>`).ReplaceAllString(content, "\n")

	// Remove any remaining HTML tags
	content = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(content, "")

	// Decode common HTML entities
	content = strings.ReplaceAll(content, "&amp;", "&")
	content = strings.ReplaceAll(content, "&lt;", "<")
	content = strings.ReplaceAll(content, "&gt;", ">")
	content = strings.ReplaceAll(content, "&quot;", "\"")
	content = strings.ReplaceAll(content, "&#39;", "'")
	content = strings.ReplaceAll(content, "&nbsp;", " ")

	// Clean up excessive whitespace
	content = regexp.MustCompile(`\n{3,}`).ReplaceAllString(content, "\n\n")
	content = regexp.MustCompile(`[ \t]+\n`).ReplaceAllString(content, "\n")
	content = strings.TrimSpace(content)

	return content
}

func createTitle(content string) string {
	// Clean content first - remove control characters EXCEPT newlines
	content = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]`).ReplaceAllString(content, "")
	content = strings.ReplaceAll(content, "\uFFFD", "")

	// Use first line as title (split on both \n and \n\n)
	lines := strings.Split(content, "\n")
	title := strings.TrimSpace(lines[0])
	if title == "" && len(lines) > 1 {
		title = strings.TrimSpace(lines[1])
	}
	if title == "" {
		title = strings.ReplaceAll(content, "\n", " ")
		title = strings.TrimSpace(title)
	}
	// Ensure no newlines in title
	title = strings.ReplaceAll(title, "\n", " ")
	title = strings.ReplaceAll(title, "\r", " ")
	title = strings.TrimSpace(title)

	// Truncate at rune level to handle Unicode properly
	runes := []rune(title)
	if len(runes) > 50 {
		title = string(runes[:47]) + "..."
	}
	// Escape double quotes and backslashes for TOML double-quoted strings
	title = strings.ReplaceAll(title, `\`, `\\`)
	title = strings.ReplaceAll(title, `"`, `\"`)
	return title
}

func createSlug(title string) string {
	// Clean title first - remove control characters
	title = regexp.MustCompile(`[\x00-\x1F\x7F-\x9F]`).ReplaceAllString(title, "")

	// Create URL-friendly slug
	slug := strings.ToLower(title)
	slug = regexp.MustCompile(`[^\w\s-]`).ReplaceAllString(slug, "")
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if len(slug) > 50 {
		slug = slug[:50]
		slug = strings.Trim(slug, "-")
	}
	if slug == "" {
		slug = "linkedin-post"
	}
	return slug
}

func createHugoPost(projectRoot string, post LinkedInPost) error {
	slug := createSlug(post.Title)
	filename := fmt.Sprintf("%s-%s.md", post.Date.Format("2006-01-02"), slug)
	filePath := filepath.Join(projectRoot, contentDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); err == nil {
		return fmt.Errorf("File already exists: %s", filename)
	}

	// Create frontmatter (TOML format, no indentation)
	frontmatter := fmt.Sprintf(`+++
title = "%s"
date = "%s"
draft = false
tags = ["linkedin", "imported", "%s"]
categories = ["Professional"]
layout = "blog"`,
		post.Title,
		post.Date.Format("2006-01-02T15:04:05Z"),
		post.ContentType,
	)

	if post.URL != "" {
		frontmatter += fmt.Sprintf("\noriginalURL = \"%s\"", post.URL)
	}
	frontmatter += fmt.Sprintf("\noriginalDate = \"%s\"", post.Date.Format("January 2, 2006"))

	frontmatter += "\n+++\n\n" + post.Content + "\n"

	// Write file
	return os.WriteFile(filePath, []byte(frontmatter), 0644)
}
