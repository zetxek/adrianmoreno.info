package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	contentDir     = "content"
	contentType    = "book"
	staticImgDir   = "static/images/books"
	googleBooksAPI = "https://www.googleapis.com/books/v1/volumes?q=%s"
)

type GoogleBooksResponse struct {
	Items []struct {
		VolumeInfo struct {
			ImageLinks struct {
				Thumbnail string `json:"thumbnail"`
			} `json:"imageLinks"`
		} `json:"volumeInfo"`
	} `json:"items"`
}

type BookFrontMatter struct {
	Title          string   `yaml:"title"`
	BookAuthors    []string `yaml:"book_authors"`
	BookCategories []string `yaml:"book_categories"`
	Link           string   `yaml:"link"`
	Featured       bool     `yaml:"featured"`
	Cover          string   `yaml:"cover,omitempty"`
}

func main() {
	// Get the current working directory
	projectRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error getting current directory: %v\n", err)
		return
	}

	// Navigate to content directory
	contentPath := filepath.Join(projectRoot, contentDir, contentType)
	staticPath := filepath.Join(projectRoot, staticImgDir)

	fmt.Printf("Project root: %s\n", projectRoot)
	fmt.Printf("Content path: %s\n", contentPath)
	fmt.Printf("Static path: %s\n", staticPath)

	// Create static directory if it doesn't exist
	if err := os.MkdirAll(staticPath, 0755); err != nil {
		fmt.Printf("Error creating static directory: %v\n", err)
		return
	}

	// Process the markdown files
	err = filepath.Walk(contentPath, processFile)
	if err != nil {
		fmt.Printf("Error walking through files: %v\n", err)
	}
}

func processFile(path string, info os.FileInfo, err error) error {
	if err != nil {
		return err
	}

	// Skip directories and non-markdown files
	if info.IsDir() || !strings.HasSuffix(info.Name(), ".md") {
		return nil
	}

	// Read the file
	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("error reading file %s: %v", path, err)
	}

	// Modify the content
	modifiedContent := modifyContent(string(content))

	// Write the modified content back to the file
	err = os.WriteFile(path, []byte(modifiedContent), 0644)
	if err != nil {
		return fmt.Errorf("error writing to file %s: %v", path, err)
	}

	fmt.Printf("Processed: %s\n", path)
	return nil
}

func modifyContent(content string) string {
	// Extract front matter
	frontMatterRegex := regexp.MustCompile(`(?s)^---\n(.*?)\n---`)
	matches := frontMatterRegex.FindStringSubmatch(content)
	if len(matches) < 2 {
		return content
	}

	title := extractField(matches[1], "title")
	authors := extractArrayField(matches[1], "book_authors")

	// Create search query
	searchQuery := fmt.Sprintf("%s %s", title, strings.Join(authors, " "))
	imageURL := searchBookCover(searchQuery)

	if imageURL == "" {
		return content
	}

	// Download and save image
	imagePath := downloadImage(imageURL, title)
	if imagePath == "" {
		return content
	}

	// Add cover field to front matter
	newFrontMatter := matches[1] + fmt.Sprintf("\ncover: \"%s\"", imagePath)
	return strings.Replace(content, matches[1], newFrontMatter, 1)
}

func searchBookCover(query string) string {
	apiURL := fmt.Sprintf(googleBooksAPI, url.QueryEscape(query))
	fmt.Printf("Searching for book: %s\n", query)
	fmt.Printf("API URL: %s\n", apiURL)

	resp, err := http.Get(apiURL)
	if err != nil {
		fmt.Printf("Error fetching book data: %v\n", err)
		return ""
	}
	defer resp.Body.Close()

	var result GoogleBooksResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		fmt.Printf("Error decoding response: %v\n", err)
		return ""
	}

	fmt.Printf("Found %d items\n", len(result.Items))
	if (len(result.Items)) > 0 {
		fmt.Printf("First item: %+v\n", result.Items[0].VolumeInfo.ImageLinks.Thumbnail)
	}
	if len(result.Items) > 0 && result.Items[0].VolumeInfo.ImageLinks.Thumbnail != "" {
		imageURL := result.Items[0].VolumeInfo.ImageLinks.Thumbnail
		// Convert http to https
		imageURL = strings.Replace(imageURL, "http://", "https://", 1)
		fmt.Printf("Found image URL: %s\n", imageURL)
		return imageURL
	}

	fmt.Printf("No image found for query: %s\n", query)
	return ""
}

func downloadImage(imageURL, title string) string {
	fmt.Printf("Downloading image for: %s\n", title)

	client := &http.Client{}
	req, err := http.NewRequest("GET", imageURL, nil)
	if err != nil {
		fmt.Printf("Error creating request: %v\n", err)
		return ""
	}

	// Add User-Agent header to avoid potential blocks
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Error downloading image: %v\n", err)
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Error: status code %d\n", resp.StatusCode)
		return ""
	}

	// Create sanitized filename
	fileName := strings.ToLower(title)
	fileName = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(fileName, "-")
	fileName = strings.Trim(fileName, "-") + ".jpg"

	absStaticDir, _ := filepath.Abs(staticImgDir)
	filePath := filepath.Join(absStaticDir, fileName)

	fmt.Printf("Saving image to: %s\n", filePath)

	// Create static directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		fmt.Printf("Error creating directory: %v\n", err)
		return ""
	}

	file, err := os.Create(filePath)
	if err != nil {
		fmt.Printf("Error creating file: %v\n", err)
		return ""
	}
	defer file.Close()

	size, err := io.Copy(file, resp.Body)
	if err != nil {
		fmt.Printf("Error saving image: %v\n", err)
		return ""
	}

	if size == 0 {
		fmt.Printf("Error: downloaded file is empty\n")
		os.Remove(filePath)
		return ""
	}

	fmt.Printf("Successfully saved image (%d bytes)\n", size)
	return fmt.Sprintf("/images/books/%s", fileName)
}

func extractField(frontMatter, fieldName string) string {
	re := regexp.MustCompile(fmt.Sprintf(`(?m)^%s:\s*"(.+)"`, fieldName))
	matches := re.FindStringSubmatch(frontMatter)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

func extractArrayField(frontMatter, fieldName string) []string {
	re := regexp.MustCompile(fmt.Sprintf(`(?m)^%s:\s*\[(.*?)\]`, fieldName))
	matches := re.FindStringSubmatch(frontMatter)
	if len(matches) > 1 {
		items := strings.Split(matches[1], ",")
		var result []string
		for _, item := range items {
			item = strings.Trim(item, " \"")
			if item != "" {
				result = append(result, item)
			}
		}
		return result
	}
	return nil
}
