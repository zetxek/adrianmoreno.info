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

	// Extract date from filename (format: 2024-06-22 10:12:21.0-Title.html)
	filename := filepath.Base(filePath)
	dateRegex := regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})`)
	dateMatch := dateRegex.FindStringSubmatch(filename)
	if len(dateMatch) < 2 {
		return nil, fmt.Errorf("Could not extract date from filename")
	}

	parsedDate, err := time.Parse("2006-01-02 15:04:05", dateMatch[1])
	if err != nil {
		return nil, fmt.Errorf("Could not parse date: %v", err)
	}

	// Extract content from body
	bodyRegex := regexp.MustCompile(`<body>(.*?)</body>`)
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
	// Remove surrounding quotes if present
	content = strings.Trim(content, `"`)

	// Fix escaped quotes
	content = strings.ReplaceAll(content, `""`, `"`)

	// Convert line breaks (LinkedIn uses "" for newlines in CSV)
	content = strings.ReplaceAll(content, `""`, "\n\n")

	// Remove control characters and replacement characters
	content = regexp.MustCompile(`[\x00-\x1F\x7F-\x9F]`).ReplaceAllString(content, "")
	content = strings.ReplaceAll(content, "\uFFFD", "")

	return content
}

func htmlToMarkdown(html string) string {
	// Simple HTML to markdown conversion
	content := html

	// Remove script and style tags
	content = regexp.MustCompile(`(?s)<script.*?</script>`).ReplaceAllString(content, "")
	content = regexp.MustCompile(`(?s)<style.*?</style>`).ReplaceAllString(content, "")

	// Convert headers
	content = regexp.MustCompile(`<h1[^>]*>(.*?)</h1>`).ReplaceAllString(content, "# $1\n\n")
	content = regexp.MustCompile(`<h2[^>]*>(.*?)</h2>`).ReplaceAllString(content, "## $1\n\n")
	content = regexp.MustCompile(`<h3[^>]*>(.*?)</h3>`).ReplaceAllString(content, "### $1\n\n")

	// Convert paragraphs
	content = regexp.MustCompile(`<p[^>]*>(.*?)</p>`).ReplaceAllString(content, "$1\n\n")

	// Convert line breaks
	content = regexp.MustCompile(`<br[^>]*>`).ReplaceAllString(content, "\n")

	// Remove other HTML tags
	content = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(content, "")

	// Clean up extra whitespace
	content = regexp.MustCompile(`\n{3,}`).ReplaceAllString(content, "\n\n")
	content = strings.TrimSpace(content)

	return content
}

func createTitle(content string) string {
	// Clean content first - remove control characters and replacement characters
	content = regexp.MustCompile(`[\x00-\x1F\x7F-\x9F]`).ReplaceAllString(content, "")
	content = strings.ReplaceAll(content, "\uFFFD", "")

	// Use first line as title, or first 50 characters
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

	// Create frontmatter
	frontmatter := fmt.Sprintf(`+++
title = "%s"
date = "%s"
draft = false
tags = ["linkedin", "imported", "%s"]
categories = ["Professional"]
layout = "blog"
+++

Originally posted on LinkedIn on %s`,
		post.Title,
		post.Date.Format("2006-01-02T15:04:05Z"),
		post.ContentType,
		post.Date.Format("January 2, 2006"),
	)

	if post.URL != "" {
		frontmatter += fmt.Sprintf(`.

[View original post]("%s")`, post.URL)
	} else {
		frontmatter += "."
	}

	frontmatter += "\n\n" + post.Content + "\n"

	// Write file
	return os.WriteFile(filePath, []byte(frontmatter), 0644)
}
