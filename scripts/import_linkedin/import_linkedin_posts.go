package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	contentDir    = "content/blog"
	linkedinDir   = "scripts/linkedin" // Path to LinkedIn export directory
	imagesDir     = "static/images/linkedin"
	dateTolerance = 5 * time.Minute // Tolerance for date matching (increased for better matching)
)

type LinkedInPost struct {
	Date           time.Time
	Content        string
	URL            string   // ShareLink - link to the share itself
	SharedURL      string   // SharedUrl - external link being shared, or reshared LinkedIn post URL (if extracted)
	ContentType    string   // "share" or "article"
	Title          string
	ImageURLs      []string // URLs from Rich_Media.csv
	LocalImages    []string // Local file paths after download
	ContentHash    string   // SHA256 hash for duplicate detection
	IsReshare      bool     // True if this is a reshare of another LinkedIn post
	ResharedPostURL string  // URL of the original LinkedIn post being reshared (extracted via browser)
}

type RichMediaEntry struct {
	DateTime    time.Time
	Description string
	MediaLink   string
}

type PostIndex struct {
	ByURL      map[string]string       // originalURL -> filepath
	ByHash     map[string]string       // contentHash -> filepath
	ByDateSlug map[string]string       // date-slug -> filepath
	ByFilePath map[string]PostMetadata // filepath -> metadata
}

type PostMetadata struct {
	FilePath        string
	OriginalURL     string
	ContentHash     string
	Date            time.Time
	Slug            string
	HasImages       bool
	Images          []string
	ResharedPostURL string
	IsDraft         bool
}

func main() {
	// Parse CLI flags
	modeFlag := flag.String("mode", "create", "Import mode: create, update, sync, or images-only")
	extractResharesFlag := flag.Bool("extract-reshares", false, "Extract reshared LinkedIn post URLs using browser automation (slower)")
	flag.Parse()

	mode := *modeFlag
	if mode != "create" && mode != "update" && mode != "sync" && mode != "images-only" {
		fmt.Printf("Invalid mode: %s. Must be one of: create, update, sync, images-only\n", mode)
		return
	}
	
	extractReshares := *extractResharesFlag

	// Get the current working directory
	projectRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error getting current directory: %v\n", err)
		return
	}

	// Try multiple possible locations for LinkedIn export
	linkedinPaths := []string{
		filepath.Join(projectRoot, linkedinDir),
		filepath.Join(projectRoot, "scripts", "Complete_LinkedInDataExport_12-27-2025.zip"),
	}
	
	var linkedinPath string
	for _, path := range linkedinPaths {
		if _, err := os.Stat(path); err == nil {
			linkedinPath = path
			break
		}
	}
	
	if linkedinPath == "" {
		fmt.Printf("LinkedIn export directory not found. Tried:\n")
		for _, path := range linkedinPaths {
			fmt.Printf("  - %s\n", path)
		}
		return
	}

	// Create images directory
	imagesPath := filepath.Join(projectRoot, imagesDir)
	if err := os.MkdirAll(imagesPath, 0755); err != nil {
		fmt.Printf("Error creating images directory: %v\n", err)
		return
	}

	// Index existing posts if in update/sync/images-only mode
	var postIndex *PostIndex
	if mode == "update" || mode == "sync" || mode == "images-only" {
		fmt.Println("Indexing existing posts...")
		postIndex, err = indexExistingPosts(projectRoot)
		if err != nil {
			fmt.Printf("Error indexing existing posts: %v\n", err)
			return
		}
		fmt.Printf("Found %d existing LinkedIn posts\n", len(postIndex.ByFilePath))
	}

	// Process Rich_Media.csv for image URLs
	var mediaEntries []RichMediaEntry
	// Try multiple possible locations
	richMediaPaths := []string{
		filepath.Join(linkedinPath, "Rich_Media.csv"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_10-19-2025.zip", "Rich_Media.csv"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_12-27-2025.zip", "Rich_Media.csv"),
	}

	for _, richMediaPath := range richMediaPaths {
		if _, err := os.Stat(richMediaPath); err == nil {
			fmt.Println("Processing Rich_Media.csv...")
			mediaEntries, err = processRichMediaCSV(richMediaPath)
			if err != nil {
				fmt.Printf("Warning: Error processing Rich_Media.csv: %v\n", err)
			} else {
				fmt.Printf("Found %d media entries\n", len(mediaEntries))
			}
			break // Use first found file
		}
	}

	var posts []LinkedInPost

	// Process Shares.csv (try multiple locations)
	sharesPaths := []string{
		filepath.Join(linkedinPath, "Shares.csv"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_10-19-2025.zip", "Shares.csv"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_12-27-2025.zip", "Shares.csv"),
	}

	var sharesPath string
	for _, path := range sharesPaths {
		if _, err := os.Stat(path); err == nil {
			sharesPath = path
			break
		}
	}

	if sharesPath != "" {
		fmt.Println("Processing Shares.csv...")
		sharesPosts, err := processSharesCSV(sharesPath)
		if err != nil {
			fmt.Printf("Error processing shares: %v\n", err)
			return
		}
		// Match images to posts
		for i := range sharesPosts {
			sharesPosts[i].ImageURLs = matchMediaToPost(sharesPosts[i], mediaEntries)
			sharesPosts[i].ContentHash = generateContentHash(sharesPosts[i].Content)
		}
		posts = append(posts, sharesPosts...)
	}

	// Process Articles (try multiple locations)
	articlesPaths := []string{
		filepath.Join(linkedinPath, "Articles", "Articles"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_10-19-2025.zip", "Articles", "Articles"),
		filepath.Join(linkedinPath, "Complete_LinkedInDataExport_12-27-2025.zip", "Articles", "Articles"),
	}

	var articlesPath string
	for _, path := range articlesPaths {
		if _, err := os.Stat(path); err == nil {
			articlesPath = path
			break
		}
	}

	if articlesPath != "" {
		fmt.Println("Processing Articles...")
		articlePosts, err := processArticles(articlesPath)
		if err != nil {
			fmt.Printf("Error processing articles: %v\n", err)
			return
		}
		// Match images to posts
		for i := range articlePosts {
			articlePosts[i].ImageURLs = matchMediaToPost(articlePosts[i], mediaEntries)
			articlePosts[i].ContentHash = generateContentHash(articlePosts[i].Content)
		}
		posts = append(posts, articlePosts...)
	}

	// Download images for posts that have them
	fmt.Println("Downloading images...")
	for i := range posts {
		if len(posts[i].ImageURLs) > 0 {
			slug := createSlug(posts[i].Title)
			dateStr := posts[i].Date.Format("2006-01-02")
			for j, imgURL := range posts[i].ImageURLs {
				localPath, err := downloadImage(imgURL, imagesPath, dateStr, slug, j)
				if err != nil {
					fmt.Printf("Warning: Failed to download image %d for post '%s': %v\n", j+1, posts[i].Title, err)
					continue
				}
				posts[i].LocalImages = append(posts[i].LocalImages, localPath)
			}
		}
	}

	// Extract reshared post URLs for posts that might be reshares (if enabled)
	if extractReshares {
		fmt.Println("Extracting reshared post URLs (browser will open - please log in)...")
		
		// Collect all URLs that need extraction
		var urlsToExtract []urlToExtract
		
		for i := range posts {
			// If SharedURL is empty but we have a ShareLink, try to extract reshared post URL
			if posts[i].SharedURL == "" && posts[i].URL != "" && posts[i].ContentType == "share" {
				// Check if post already has resharedPostURL in frontmatter or is a draft
				existingFile := findExistingPost(posts[i], postIndex)
				if existingFile != "" {
					// Read the file to check for resharedPostURL and draft status
					fullPath := filepath.Join(projectRoot, existingFile)
					content, err := os.ReadFile(fullPath)
					if err == nil {
						metadata := parseFrontmatter(string(content), existingFile)
						if metadata != nil {
							// Skip draft posts
							if metadata.IsDraft {
								fmt.Printf("  ⊘ Skipping '%s' - post is a draft\n", truncateTitle(posts[i].Title, 50))
								continue
							}
							// Skip if already has resharedPostURL
							if metadata.ResharedPostURL != "" {
								fmt.Printf("  ⊘ Skipping '%s' - already has resharedPostURL\n", truncateTitle(posts[i].Title, 50))
								continue
							}
						}
					}
				}
				
				// Heuristic: short commentary might indicate a reshare
				contentPreview := strings.TrimSpace(posts[i].Content)
				if len(contentPreview) < 500 { // Short posts are more likely to be reshares
					urlsToExtract = append(urlsToExtract, urlToExtract{
						index: i,
						url:   posts[i].URL,
						title: posts[i].Title,
					})
				}
			}
		}
		
		if len(urlsToExtract) > 0 {
			fmt.Printf("Found %d posts that might be reshares. Processing in single browser session...\n", len(urlsToExtract))
			fmt.Println("(Posts will be saved incrementally as URLs are extracted)\n")
			
			// Extract URLs incrementally and save posts as we go
			extractCount := 0
			err := extractResharedPostURLsIncremental(urlsToExtract, projectRoot, posts, &extractCount)
			if err != nil {
				fmt.Printf("Warning: Batch extraction failed: %v\n", err)
			} else {
				if extractCount > 0 {
					fmt.Printf("\n✓ Successfully extracted %d reshared post URLs\n", extractCount)
				}
			}
		} else {
			fmt.Println("No posts found that need reshared URL extraction.")
		}
	}

	// Create or update Hugo posts
	createdCount := 0
	updatedCount := 0
	skippedCount := 0

	for _, post := range posts {
		existingFile := findExistingPost(post, postIndex)

		if existingFile != "" {
			// Post already exists
			if mode == "create" {
				skippedCount++
				fmt.Printf("Skipped (exists): %s\n", post.Title)
				continue
			}

			// Update existing post
			err := updateHugoPost(projectRoot, post, existingFile, mode)
			if err != nil {
				fmt.Printf("Error updating post for %s: %v\n", post.Title, err)
				continue
			}
			updatedCount++
			fmt.Printf("Updated: %s (%s)\n", post.Title, post.ContentType)
		} else {
			// New post
			if mode == "images-only" {
				skippedCount++
				fmt.Printf("Skipped (new post in images-only mode): %s\n", post.Title)
				continue
			}

			err := createHugoPost(projectRoot, post)
			if err != nil {
				fmt.Printf("Error creating post for %s: %v\n", post.Title, err)
				continue
			}
			createdCount++
			fmt.Printf("Created: %s (%s)\n", post.Title, post.ContentType)
		}
	}

	fmt.Printf("\nImport completed! Created: %d, Updated: %d, Skipped: %d\n", createdCount, updatedCount, skippedCount)
}

func processRichMediaCSV(csvPath string) ([]RichMediaEntry, error) {
	file, err := os.Open(csvPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.LazyQuotes = true // Handle malformed quotes
	reader.TrimLeadingSpace = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	if len(records) < 2 {
		return nil, fmt.Errorf("CSV file appears to be empty or missing headers")
	}

	var entries []RichMediaEntry

	// Find column indices
	headers := records[0]
	var dateCol, descCol, linkCol int = -1, -1, -1
	for i, header := range headers {
		headerLower := strings.ToLower(strings.TrimSpace(header))
		switch headerLower {
		case "date/time", "date":
			dateCol = i
		case "media description", "description":
			descCol = i
		case "media link", "link":
			linkCol = i
		}
	}

	if dateCol == -1 || descCol == -1 || linkCol == -1 {
		return nil, fmt.Errorf("Could not find required columns in Rich_Media.csv")
	}

	// First pass: collect all links
	type linkInfo struct {
		rowIndex int
		link     string
	}
	var links []linkInfo
	for i, record := range records[1:] {
		if len(record) > linkCol && strings.TrimSpace(record[linkCol]) != "" && strings.HasPrefix(strings.TrimSpace(record[linkCol]), "http") {
			links = append(links, linkInfo{rowIndex: i, link: strings.TrimSpace(record[linkCol])})
		}
	}

	// Second pass: find date rows and match with links
	linkIndex := 0
	for i, record := range records[1:] {
		if len(record) <= dateCol {
			continue
		}

		dateStr := strings.TrimSpace(record[dateCol])
		// Check if this row has a date (contains "uploaded")
		if !strings.Contains(strings.ToLower(dateStr), "uploaded") {
			continue
		}

		description := ""
		if len(record) > descCol {
			description = record[descCol]
		}

		// Find the corresponding link (links appear after descriptions due to multi-line fields)
		var mediaLink string
		if linkIndex < len(links) {
			// Match link to this date row (links typically appear later in the CSV)
			// For now, match sequentially: first date row -> first link, etc.
			mediaLink = links[linkIndex].link
			linkIndex++
		}

		// Skip if no link found
		if mediaLink == "" {
			continue
		}

		// Parse date from format like "You uploaded a feed photo on October 18, 2025 at 5:17 PM (GMT)"
		var parsedDate time.Time
		var parseErr error

		// Extract date from the description string
		dateRegex := regexp.MustCompile(`(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})`)
		dateMatch := dateRegex.FindStringSubmatch(dateStr)
		if len(dateMatch) >= 4 {
			// Try to extract time as well
			timeRegex := regexp.MustCompile(`at (\d{1,2}):(\d{2}) (AM|PM)`)
			timeMatch := timeRegex.FindStringSubmatch(dateStr)

			datePart := fmt.Sprintf("%s %s, %s", dateMatch[1], dateMatch[2], dateMatch[3])
			if len(timeMatch) >= 4 {
				datePart += fmt.Sprintf(" at %s:%s %s", timeMatch[1], timeMatch[2], timeMatch[3])
				parsedDate, parseErr = time.Parse("January 2, 2006 at 3:04 PM", datePart)
			} else {
				parsedDate, parseErr = time.Parse("January 2, 2006", datePart)
			}
		}

		if parseErr != nil || parsedDate.IsZero() {
			fmt.Printf("Warning: Could not parse date '%s' for media entry %d, skipping\n", dateStr, i+1)
			continue
		}

		entries = append(entries, RichMediaEntry{
			DateTime:    parsedDate,
			Description: description,
			MediaLink:   mediaLink,
		})
	}

	return entries, nil
}

func matchMediaToPost(post LinkedInPost, mediaEntries []RichMediaEntry) []string {
	var matchedURLs []string

	// Clean post content for matching (remove markdown, extra whitespace)
	postContentClean := cleanContentForMatching(post.Content)

	for _, entry := range mediaEntries {
		// Match by date (within tolerance) - primary match
		timeDiff := post.Date.Sub(entry.DateTime)
		if timeDiff < 0 {
			timeDiff = -timeDiff
		}
		if timeDiff > dateTolerance {
			continue
		}

		// If dates match closely (within 2 minutes), accept immediately
		if timeDiff <= 2*time.Minute {
			matchedURLs = append(matchedURLs, entry.MediaLink)
			continue
		}

		// For dates within tolerance but not super close, check content similarity
		descClean := cleanContentForMatching(entry.Description)
		
		// Use longer previews for better matching
		postPreview := postContentClean
		if len(postPreview) > 200 {
			postPreview = postPreview[:200]
		}
		descPreview := descClean
		if len(descPreview) > 200 {
			descPreview = descPreview[:200]
		}

		// More flexible matching: check if either contains the other, or high similarity
		containsMatch := strings.Contains(postPreview, descPreview) || strings.Contains(descPreview, postPreview)
		similarity := calculateSimilarity(postPreview, descPreview)
		
		// Lower threshold for similarity when dates are close
		if containsMatch || similarity > 0.3 {
			matchedURLs = append(matchedURLs, entry.MediaLink)
		}
	}

	return matchedURLs
}

func cleanContentForMatching(content string) string {
	// Remove markdown formatting, extra whitespace, and normalize
	content = strings.ToLower(strings.TrimSpace(content))
	// Remove markdown links [text](url) -> text
	content = regexp.MustCompile(`\[([^\]]+)\]\([^\)]+\)`).ReplaceAllString(content, "$1")
	// Remove markdown bold/italic
	content = regexp.MustCompile(`\*\*([^\*]+)\*\*`).ReplaceAllString(content, "$1")
	content = regexp.MustCompile(`\*([^\*]+)\*`).ReplaceAllString(content, "$1")
	// Remove hashtags for matching
	content = regexp.MustCompile(`#\w+`).ReplaceAllString(content, "")
	// Normalize whitespace
	content = regexp.MustCompile(`\s+`).ReplaceAllString(content, " ")
	return strings.TrimSpace(content)
}

func calculateSimilarity(s1, s2 string) float64 {
	// Simple similarity: count common words
	words1 := strings.Fields(s1)
	words2 := strings.Fields(s2)

	if len(words1) == 0 || len(words2) == 0 {
		return 0.0
	}

	common := 0
	for _, w1 := range words1 {
		for _, w2 := range words2 {
			if w1 == w2 && len(w1) > 3 { // Only count words longer than 3 chars
				common++
				break
			}
		}
	}

	maxLen := len(words1)
	if len(words2) > maxLen {
		maxLen = len(words2)
	}

	return float64(common) / float64(maxLen)
}

func downloadImage(imgURL, imagesDir, dateStr, slug string, index int) (string, error) {
	// Create filename
	ext := "jpg" // default
	if parsedURL, err := url.Parse(imgURL); err == nil {
		// Try to get extension from URL
		path := parsedURL.Path
		if pathExt := filepath.Ext(path); pathExt != "" {
			ext = strings.TrimPrefix(pathExt, ".")
		}
	}

	filename := fmt.Sprintf("%s-%s-%d.%s", dateStr, slug, index+1, ext)
	filePath := filepath.Join(imagesDir, filename)

	// Check if file already exists
	if _, err := os.Stat(filePath); err == nil {
		return filepath.Join("/images/linkedin", filename), nil
	}

	// Download image
	resp, err := http.Get(imgURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Determine extension from Content-Type if not already set
	contentType := resp.Header.Get("Content-Type")
	if ext == "jpg" && contentType != "" {
		mediaType, _, err := mime.ParseMediaType(contentType)
		if err == nil {
			if strings.HasPrefix(mediaType, "image/") {
				ext = strings.TrimPrefix(mediaType, "image/")
				if ext == "jpeg" {
					ext = "jpg"
				}
				filename = fmt.Sprintf("%s-%s-%d.%s", dateStr, slug, index+1, ext)
				filePath = filepath.Join(imagesDir, filename)
			}
		}
	}

	// Create file
	out, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Copy response body to file
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		os.Remove(filePath) // Clean up on error
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	return filepath.Join("/images/linkedin", filename), nil
}

func generateContentHash(content string) string {
	// Use first 200 characters for hash
	preview := content
	if len(preview) > 200 {
		preview = preview[:200]
	}
	hash := sha256.Sum256([]byte(strings.TrimSpace(preview)))
	return hex.EncodeToString(hash[:])
}

type extractionResult struct {
	Index           int
	ShareURL        string
	ResharedPostURL string
	Error           string
}

type urlToExtract struct {
	index int
	url   string
	title string
}

func extractResharedPostURLsIncremental(urlsToExtract []urlToExtract, projectRoot string, posts []LinkedInPost, extractCount *int) error {
	if len(urlsToExtract) == 0 {
		return nil
	}

	// Build command with all URLs
	scriptPath := filepath.Join(projectRoot, "scripts", "import_linkedin", "extract_reshared_urls_batch.js")
	
	// Prepare command args
	args := []string{scriptPath}
	for _, item := range urlsToExtract {
		args = append(args, item.url)
	}
	
	cmd := exec.Command("node", args...)
	cmd.Dir = projectRoot
	
	// Create URL to index mapping
	urlToIndex := make(map[string]int)
	for _, item := range urlsToExtract {
		urlToIndex[item.url] = item.index
	}
	
	// Get stdout pipe to read line by line
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	
	// Also capture stderr for debugging output
	cmd.Stderr = os.Stderr
	
	// Start command
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start extraction script: %w", err)
	}
	
	// Read results line by line (each line is a JSON object)
	scanner := bufio.NewScanner(stdout)
	lineNum := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		
		// Parse JSON result
		var raw struct {
			ShareURL        string `json:"shareURL"`
			ResharedPostURL string `json:"resharedPostURL"`
			Error           string `json:"error"`
			Index           int    `json:"index"`
		}
		
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			fmt.Printf("Warning: Could not parse result line %d: %v\n", lineNum+1, err)
			continue
		}
		
		// Find the post index
		postIndex, exists := urlToIndex[raw.ShareURL]
		if !exists {
			fmt.Printf("Warning: Could not find post for URL: %s\n", raw.ShareURL)
			continue
		}
		
		// Update post with reshared URL
		if raw.ResharedPostURL != "" {
			posts[postIndex].ResharedPostURL = raw.ResharedPostURL
			posts[postIndex].IsReshare = true
			*extractCount++
			
			// Save the post immediately
			fmt.Printf("  → Saving post: %s\n", truncateTitle(posts[postIndex].Title, 50))
			if err := savePostIncrementally(projectRoot, posts[postIndex]); err != nil {
				fmt.Printf("  ✗ Warning: Failed to save post: %v\n", err)
			} else {
				fmt.Printf("  ✓ Saved: %s\n", truncateTitle(posts[postIndex].Title, 50))
			}
		} else if raw.Error != "" {
			fmt.Printf("  ✗ Could not extract for '%s': %s\n", truncateTitle(posts[postIndex].Title, 50), raw.Error)
		}
		
		lineNum++
	}
	
	// Wait for command to finish
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("extraction script failed: %w", err)
	}
	
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading output: %w", err)
	}
	
	return nil
}

func savePostIncrementally(projectRoot string, post LinkedInPost) error {
	// Find existing post file
	slug := createSlug(post.Title)
	filename := fmt.Sprintf("%s-%s.md", post.Date.Format("2006-01-02"), slug)
	filePath := filepath.Join(projectRoot, contentDir, filename)
	
	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Post doesn't exist yet, skip (will be created later)
		return nil
	}
	
	// Read existing file
	content, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}
	
	contentStr := string(content)
	
	// Extract frontmatter and body
	frontmatterRegex := regexp.MustCompile(`(?s)\+\+\+\n(.*?)\n\+\+\+\n(.*)`)
	matches := frontmatterRegex.FindStringSubmatch(contentStr)
	if len(matches) < 3 {
		return fmt.Errorf("could not parse frontmatter")
	}
	
	oldFrontmatter := matches[1]
	body := matches[2]
	
	// Build new frontmatter with updated reshared URL
	newFrontmatter := buildFrontmatter(post, oldFrontmatter, "update")
	
	// Write updated file
	newContent := fmt.Sprintf("+++\n%s\n+++\n\n%s", newFrontmatter, body)
	return os.WriteFile(filePath, []byte(newContent), 0644)
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
	var dateCol, shareLinkCol, shareCommentaryCol, sharedUrlCol int = -1, -1, -1, -1
	for i, header := range headers {
		switch strings.ToLower(strings.TrimSpace(header)) {
		case "date":
			dateCol = i
		case "sharelink":
			shareLinkCol = i
		case "sharecommentary":
			shareCommentaryCol = i
		case "sharedurl":
			sharedUrlCol = i
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
		
		sharedURL := ""
		isReshare := false
		if sharedUrlCol != -1 && len(record) > sharedUrlCol {
			sharedURL = strings.TrimSpace(record[sharedUrlCol])
			// Check if SharedURL is a LinkedIn post URL (reshare) vs external link
			if sharedURL != "" {
				if strings.Contains(sharedURL, "linkedin.com") && (strings.Contains(sharedURL, "/feed/update/") || strings.Contains(sharedURL, "urn:li:activity:")) {
					isReshare = true
				}
			}
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
			Date:           parsedDate,
			Content:        content,
			URL:            url,
			SharedURL:      sharedURL,
			ContentType:    "share",
			Title:          title,
			IsReshare:      isReshare,
			ResharedPostURL: sharedURL, // Will be updated if we extract via browser
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

func truncateTitle(title string, maxLen int) string {
	if len(title) <= maxLen {
		return title
	}
	return title[:maxLen]
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

func indexExistingPosts(projectRoot string) (*PostIndex, error) {
	index := &PostIndex{
		ByURL:      make(map[string]string),
		ByHash:     make(map[string]string),
		ByDateSlug: make(map[string]string),
		ByFilePath: make(map[string]PostMetadata),
	}

	contentPath := filepath.Join(projectRoot, contentDir)
	err := filepath.Walk(contentPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}

		// Read file to check if it's a LinkedIn post
		content, err := os.ReadFile(path)
		if err != nil {
			return nil // Skip files we can't read
		}

		// Check if it has linkedin tag
		contentStr := string(content)
		if !strings.Contains(contentStr, `tags = ["linkedin`) && !strings.Contains(contentStr, `tags = [ "linkedin`) {
			return nil // Not a LinkedIn post
		}

		// Parse frontmatter
		metadata := parseFrontmatter(contentStr, path)
		if metadata == nil {
			return nil // Skip if we can't parse
		}

		relPath, _ := filepath.Rel(projectRoot, path)
		index.ByFilePath[relPath] = *metadata

		if metadata.OriginalURL != "" {
			index.ByURL[metadata.OriginalURL] = relPath
		}
		if metadata.ContentHash != "" {
			index.ByHash[metadata.ContentHash] = relPath
		}
		if metadata.Slug != "" {
			dateSlug := fmt.Sprintf("%s-%s", metadata.Date.Format("2006-01-02"), metadata.Slug)
			index.ByDateSlug[dateSlug] = relPath
		}

		return nil
	})

	return index, err
}

func parseFrontmatter(content, filePath string) *PostMetadata {
	// Extract TOML frontmatter between +++
	frontmatterRegex := regexp.MustCompile(`(?s)\+\+\+\n(.*?)\n\+\+\+`)
	matches := frontmatterRegex.FindStringSubmatch(content)
	if len(matches) < 2 {
		return nil
	}

	frontmatter := matches[1]
	metadata := &PostMetadata{
		FilePath: filePath,
	}

	// Extract originalURL
	urlRegex := regexp.MustCompile(`originalURL\s*=\s*"([^"]+)"`)
	if urlMatch := urlRegex.FindStringSubmatch(frontmatter); len(urlMatch) >= 2 {
		metadata.OriginalURL = urlMatch[1]
	}

	// Extract date
	dateRegex := regexp.MustCompile(`date\s*=\s*"([^"]+)"`)
	if dateMatch := dateRegex.FindStringSubmatch(frontmatter); len(dateMatch) >= 2 {
		if parsedDate, err := time.Parse(time.RFC3339, dateMatch[1]); err == nil {
			metadata.Date = parsedDate
		}
	}

	// Extract contentHash
	hashRegex := regexp.MustCompile(`contentHash\s*=\s*"([^"]+)"`)
	if hashMatch := hashRegex.FindStringSubmatch(frontmatter); len(hashMatch) >= 2 {
		metadata.ContentHash = hashMatch[1]
	}

	// Extract images
	imagesRegex := regexp.MustCompile(`images\s*=\s*\[(.*?)\]`)
	if imagesMatch := imagesRegex.FindStringSubmatch(frontmatter); len(imagesMatch) >= 2 {
		// Parse array of strings
		imageStr := imagesMatch[1]
		imageRegex := regexp.MustCompile(`"([^"]+)"`)
		imageMatches := imageRegex.FindAllStringSubmatch(imageStr, -1)
		for _, match := range imageMatches {
			if len(match) >= 2 {
				metadata.Images = append(metadata.Images, match[1])
			}
		}
		metadata.HasImages = len(metadata.Images) > 0
	}

	// Extract resharedPostURL
	resharedRegex := regexp.MustCompile(`resharedPostURL\s*=\s*"([^"]+)"`)
	if resharedMatch := resharedRegex.FindStringSubmatch(frontmatter); len(resharedMatch) >= 2 {
		metadata.ResharedPostURL = resharedMatch[1]
	}

	// Extract draft status (defaults to false if not present)
	draftRegex := regexp.MustCompile(`draft\s*=\s*(true|false)`)
	if draftMatch := draftRegex.FindStringSubmatch(frontmatter); len(draftMatch) >= 2 {
		metadata.IsDraft = draftMatch[1] == "true"
	} else {
		metadata.IsDraft = false // Default to false if not specified
	}

	// Extract slug from filename
	filename := filepath.Base(filePath)
	if dateSlugMatch := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-(.+)\.md$`).FindStringSubmatch(filename); len(dateSlugMatch) >= 2 {
		metadata.Slug = dateSlugMatch[1]
	}

	return metadata
}

func findExistingPost(post LinkedInPost, index *PostIndex) string {
	if index == nil {
		return ""
	}

	// Try by URL first
	if post.URL != "" {
		if filePath, exists := index.ByURL[post.URL]; exists {
			return filePath
		}
	}

	// Try by content hash
	if post.ContentHash != "" {
		if filePath, exists := index.ByHash[post.ContentHash]; exists {
			return filePath
		}
	}

	// Try by date + slug
	slug := createSlug(post.Title)
	dateSlug := fmt.Sprintf("%s-%s", post.Date.Format("2006-01-02"), slug)
	if filePath, exists := index.ByDateSlug[dateSlug]; exists {
		return filePath
	}

	return ""
}

func updateHugoPost(projectRoot string, post LinkedInPost, existingFilePath string, mode string) error {
	fullPath := filepath.Join(projectRoot, existingFilePath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return fmt.Errorf("failed to read existing file: %w", err)
	}

	contentStr := string(content)

	// Extract frontmatter and body
	frontmatterRegex := regexp.MustCompile(`(?s)\+\+\+\n(.*?)\n\+\+\+\n(.*)`)
	matches := frontmatterRegex.FindStringSubmatch(contentStr)
	if len(matches) < 3 {
		return fmt.Errorf("could not parse frontmatter")
	}

	oldFrontmatter := matches[1]
	body := matches[2]

	// For images-only mode, check if images already exist
	if mode == "images-only" {
		metadata := parseFrontmatter(contentStr, existingFilePath)
		if metadata != nil && metadata.HasImages {
			// Skip posts that already have images
			return nil
		}
	}

	// Build new frontmatter
	newFrontmatter := buildFrontmatter(post, oldFrontmatter, mode)

	// Add reshared content reference if not already present in body
	bodyWithReshare := body
	if post.IsReshare && post.ResharedPostURL != "" {
		// Check if reshared reference already exists
		if !strings.Contains(body, "Reshared from:") && !strings.Contains(body, post.ResharedPostURL) {
			bodyWithReshare = body + fmt.Sprintf("\n\n---\n\n*Reshared from: [View original post on LinkedIn](%s)*", post.ResharedPostURL)
		}
	} else if post.SharedURL != "" && !post.IsReshare {
		// External link being shared
		if !strings.Contains(body, "Shared link:") && !strings.Contains(body, post.SharedURL) {
			bodyWithReshare = body + fmt.Sprintf("\n\n---\n\n*Shared link: [%s](%s)*", post.SharedURL, post.SharedURL)
		}
	}

	// Write updated file
	newContent := fmt.Sprintf("+++\n%s\n+++\n\n%s", newFrontmatter, bodyWithReshare)
	return os.WriteFile(fullPath, []byte(newContent), 0644)
}

func buildFrontmatter(post LinkedInPost, oldFrontmatter string, mode string) string {
	// Parse old frontmatter to preserve some fields
	preserveFields := []string{"categories", "layout"}
	preserved := make(map[string]string)

	for _, field := range preserveFields {
		regex := regexp.MustCompile(fmt.Sprintf(`(?m)^%s\s*=\s*(.+)$`, field))
		if match := regex.FindStringSubmatch(oldFrontmatter); len(match) >= 2 {
			preserved[field] = strings.TrimSpace(match[1])
		}
	}

	// Build new frontmatter
	var parts []string
	parts = append(parts, fmt.Sprintf(`title = "%s"`, post.Title))
	parts = append(parts, fmt.Sprintf(`date = "%s"`, post.Date.Format(time.RFC3339)))
	parts = append(parts, `draft = false`)
	parts = append(parts, fmt.Sprintf(`tags = ["linkedin", "imported", "%s"]`, post.ContentType))

	// Preserve categories or use default
	if categories, ok := preserved["categories"]; ok {
		parts = append(parts, fmt.Sprintf(`categories = %s`, categories))
	} else {
		parts = append(parts, `categories = ["Professional"]`)
	}

	// Preserve layout or use default
	if layout, ok := preserved["layout"]; ok {
		parts = append(parts, fmt.Sprintf(`layout = %s`, layout))
	} else {
		parts = append(parts, `layout = "blog"`)
	}

	if post.URL != "" {
		parts = append(parts, fmt.Sprintf(`originalURL = "%s"`, post.URL))
	}
	
	// Add shared/reshared URL information
	if post.SharedURL != "" {
		if post.IsReshare {
			// Reshared LinkedIn post
			parts = append(parts, fmt.Sprintf(`resharedPostURL = "%s"`, post.SharedURL))
		} else {
			// External link being shared
			parts = append(parts, fmt.Sprintf(`sharedURL = "%s"`, post.SharedURL))
		}
	}
	
	// If we extracted a reshared post URL via browser, use that instead
	if post.ResharedPostURL != "" && post.ResharedPostURL != post.SharedURL {
		parts = append(parts, fmt.Sprintf(`resharedPostURL = "%s"`, post.ResharedPostURL))
	}
	
	parts = append(parts, fmt.Sprintf(`originalDate = "%s"`, post.Date.Format("January 2, 2006")))
	parts = append(parts, fmt.Sprintf(`contentHash = "%s"`, post.ContentHash))

	// Add images if we have them
	if len(post.LocalImages) > 0 {
		imagePaths := make([]string, len(post.LocalImages))
		for i, img := range post.LocalImages {
			imagePaths[i] = fmt.Sprintf(`"%s"`, img)
		}
		parts = append(parts, fmt.Sprintf(`images = [%s]`, strings.Join(imagePaths, ", ")))
		parts = append(parts, fmt.Sprintf(`featuredImage = "%s"`, post.LocalImages[0]))
	}

	return strings.Join(parts, "\n")
}

func createHugoPost(projectRoot string, post LinkedInPost) error {
	slug := createSlug(post.Title)
	filename := fmt.Sprintf("%s-%s.md", post.Date.Format("2006-01-02"), slug)
	filePath := filepath.Join(projectRoot, contentDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); err == nil {
		return fmt.Errorf("File already exists: %s", filename)
	}

	// Build frontmatter using shared function
	frontmatter := buildFrontmatter(post, "", "create")

	// Build content with shared/reshared references
	content := post.Content
	
	// Add reference to shared/reshared content
	if post.IsReshare && post.ResharedPostURL != "" {
		// Reshared LinkedIn post - add reference
		content += fmt.Sprintf("\n\n---\n\n*Reshared from: [View original post on LinkedIn](%s)*", post.ResharedPostURL)
	} else if post.SharedURL != "" && !post.IsReshare {
		// External link being shared - add reference
		content += fmt.Sprintf("\n\n---\n\n*Shared link: [%s](%s)*", post.SharedURL, post.SharedURL)
	}

	fullContent := fmt.Sprintf("+++\n%s\n+++\n\n%s\n", frontmatter, content)

	// Write file
	return os.WriteFile(filePath, []byte(fullContent), 0644)
}
