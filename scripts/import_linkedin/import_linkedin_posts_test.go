package main

import (
	"strings"
	"testing"
)

// =============================================================================
// CSV CONTENT PARSING TESTS
// =============================================================================

func TestCleanShareContent_PreservesParagraphBreaks(t *testing.T) {
	// LinkedIn CSV format uses "" followed by newline and "" to separate paragraphs
	input := `First paragraph.""
""Second paragraph.""
""Third paragraph.`

	result := cleanShareContent(input)

	if !strings.Contains(result, "First paragraph.") {
		t.Errorf("Expected 'First paragraph.' in result, got: %s", result)
	}
	if !strings.Contains(result, "Second paragraph.") {
		t.Errorf("Expected 'Second paragraph.' in result, got: %s", result)
	}
	// Paragraphs should be separated by blank lines, not run together
	if strings.Contains(result, "paragraph.Second") {
		t.Errorf("Paragraphs should not run together, got: %s", result)
	}
}

func TestCleanShareContent_PreservesEmojiParagraphs(t *testing.T) {
	input := `🤬You might be outraged at the wrong thing about AI""
""The problem isn't "AI", in general.`

	result := cleanShareContent(input)

	if !strings.Contains(result, "🤬You might be outraged") {
		t.Errorf("Emoji title should be preserved, got: %s", result)
	}
	// Should not run title and next paragraph together
	lines := strings.Split(result, "\n")
	firstLine := strings.TrimSpace(lines[0])
	if strings.Contains(firstLine, "The problem isn't") {
		t.Errorf("First paragraph should not include second paragraph content on same line, got first line: %s", firstLine)
	}
}

func TestCleanShareContent_PreservesQuotesInText(t *testing.T) {
	input := `He said ""hello"" to me.`

	result := cleanShareContent(input)

	if !strings.Contains(result, `"hello"`) {
		t.Errorf("Expected quotes around 'hello', got: %s", result)
	}
}

func TestCleanShareContent_PreservesHashtags(t *testing.T) {
	input := `Some content.""
""#AIEthics #FutureOfWork #Leadership`

	result := cleanShareContent(input)

	if !strings.Contains(result, "#AIEthics") {
		t.Errorf("Hashtags should be preserved, got: %s", result)
	}
}

func TestCleanShareContent_HandlesBulletPoints(t *testing.T) {
	input := `You must:""
""📄 Brief it clearly.""
""🧐 Review its work critically.""
""🧑‍⚖️ Add your expertise.`

	result := cleanShareContent(input)

	if !strings.Contains(result, "You must:") {
		t.Errorf("'You must:' should be preserved, got: %s", result)
	}
	if !strings.Contains(result, "📄 Brief it clearly") {
		t.Errorf("First bullet should be preserved, got: %s", result)
	}
	if !strings.Contains(result, "🧐 Review its work") {
		t.Errorf("Second bullet should be preserved, got: %s", result)
	}
}

func TestCleanShareContent_ComplexPost(t *testing.T) {
	input := `Frustrated your team won't change? The solution starts in the mirror 🪞""
""We've all been there: you want either to change or start a new behaviour.""
""Maybe to be more proactive, more collaborative, more curious - you name it. But the change just doesn't stick.""
""Before you get frustrated, think of this: Are you modelling the behavior you're asking for?""
""#LeadByExample #Leadership`

	result := cleanShareContent(input)

	paragraphCount := len(strings.Split(result, "\n\n"))
	if paragraphCount < 3 {
		t.Errorf("Expected at least 3 paragraph breaks, got %d. Result:\n%s", paragraphCount, result)
	}
	if strings.Contains(result, "mirror 🪞We've") {
		t.Errorf("Title should be separated from next paragraph, got: %s", result)
	}
}

func TestCleanShareContent_RemovesControlCharacters(t *testing.T) {
	input := "Hello\x00World\x1FTest"

	result := cleanShareContent(input)

	if strings.Contains(result, "\x00") || strings.Contains(result, "\x1F") {
		t.Errorf("Control characters should be removed, got: %s", result)
	}
	if !strings.Contains(result, "Hello") || !strings.Contains(result, "World") {
		t.Errorf("Text content should be preserved, got: %s", result)
	}
}

// =============================================================================
// HTML TO MARKDOWN CONVERSION TESTS
// =============================================================================

func TestHtmlToMarkdown_ConvertsParagraphs(t *testing.T) {
	input := `<p>First paragraph.</p><p>Second paragraph.</p>`

	result := htmlToMarkdown(input)

	if strings.Contains(result, "First paragraph.Second") {
		t.Errorf("Paragraphs should be separated, got: %s", result)
	}
	if !strings.Contains(result, "First paragraph.") {
		t.Errorf("First paragraph missing, got: %s", result)
	}
	if !strings.Contains(result, "Second paragraph.") {
		t.Errorf("Second paragraph missing, got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsHeaders(t *testing.T) {
	input := `<h1>Main Title</h1><h2>Subtitle</h2><h3>Section</h3>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "# Main Title") {
		t.Errorf("H1 should become '# Main Title', got: %s", result)
	}
	if !strings.Contains(result, "## Subtitle") {
		t.Errorf("H2 should become '## Subtitle', got: %s", result)
	}
	if !strings.Contains(result, "### Section") {
		t.Errorf("H3 should become '### Section', got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsBold(t *testing.T) {
	input := `<p>This is <strong>bold</strong> text.</p>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "**bold**") {
		t.Errorf("Strong should become **bold**, got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsItalic(t *testing.T) {
	input := `<p>This is <em>italic</em> text.</p>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "*italic*") {
		t.Errorf("Em should become *italic*, got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsLinks(t *testing.T) {
	input := `<p>Visit <a href="https://example.com">my site</a> today.</p>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "[my site](https://example.com)") {
		t.Errorf("Links should become [text](url), got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsUnorderedLists(t *testing.T) {
	input := `<ul><li>First item</li><li>Second item</li><li>Third item</li></ul>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "- First item") {
		t.Errorf("List items should become '- item', got: %s", result)
	}
	if !strings.Contains(result, "- Second item") {
		t.Errorf("List items should become '- item', got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsBlockquotes(t *testing.T) {
	input := `<blockquote>This is a quote.</blockquote>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "> This is a quote.") {
		t.Errorf("Blockquote should become '> quote', got: %s", result)
	}
}

func TestHtmlToMarkdown_ConvertsImages(t *testing.T) {
	input := `<img src="https://example.com/image.jpg" alt="My image">`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "![My image](https://example.com/image.jpg)") {
		t.Errorf("Images should become ![alt](src), got: %s", result)
	}
}

func TestHtmlToMarkdown_HandlesNestedFormatting(t *testing.T) {
	input := `<p>This has <strong>bold with <em>italic</em> inside</strong>.</p>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "bold") || !strings.Contains(result, "italic") {
		t.Errorf("Nested formatting should be preserved, got: %s", result)
	}
}

func TestHtmlToMarkdown_RemovesScriptAndStyle(t *testing.T) {
	input := `<p>Content</p><script>alert('bad')</script><style>.hidden{}</style><p>More content</p>`

	result := htmlToMarkdown(input)

	if strings.Contains(result, "alert") || strings.Contains(result, "hidden") {
		t.Errorf("Script and style should be removed, got: %s", result)
	}
	if !strings.Contains(result, "Content") || !strings.Contains(result, "More content") {
		t.Errorf("Regular content should be preserved, got: %s", result)
	}
}

func TestHtmlToMarkdown_ComplexArticle(t *testing.T) {
	input := `<div><p>The year is 2015. I see myself on a pic.</p><p>But I had to accept it: the pic was not unflattering - I came to terms with it and started running.</p><ul><li><strong>📆 the power of planning</strong>: that would work at multiple levels.</li><li><strong>🏆 sharing my goals</strong>: what's the point of achieving anything big?</li></ul><p>Thanks to <a href="https://example.com" target="_blank">Mikko</a> for sharing!</p></div>`

	result := htmlToMarkdown(input)

	if !strings.Contains(result, "The year is 2015") {
		t.Errorf("First paragraph missing, got: %s", result)
	}
	if !strings.Contains(result, "- **📆 the power of planning**") {
		t.Errorf("List items with bold should be converted, got: %s", result)
	}
	if !strings.Contains(result, "[Mikko](https://example.com)") {
		t.Errorf("Links should be converted, got: %s", result)
	}
}

// =============================================================================
// TITLE CREATION TESTS
// =============================================================================

func TestCreateTitle_HandlesEmoji(t *testing.T) {
	input := "🤬You might be outraged at the wrong thing about AI"

	result := createTitle(input)

	if !strings.HasPrefix(result, "🤬") {
		t.Errorf("Title should preserve leading emoji, got: %s", result)
	}
}

func TestCreateTitle_TruncatesLongTitles(t *testing.T) {
	input := "This is a very long title that should be truncated at some reasonable length to avoid issues"

	result := createTitle(input)

	if len([]rune(result)) > 55 {
		t.Errorf("Title should be truncated, got length %d: %s", len([]rune(result)), result)
	}
}

func TestCreateTitle_EscapesQuotes(t *testing.T) {
	input := `He said "hello" to everyone`

	result := createTitle(input)

	if strings.Contains(result, `"hello"`) && !strings.Contains(result, `\"hello\"`) {
		t.Errorf("Quotes should be escaped, got: %s", result)
	}
}

func TestCreateTitle_RemovesNewlines(t *testing.T) {
	input := "First line\nSecond line\rThird line"

	result := createTitle(input)

	if strings.Contains(result, "\n") || strings.Contains(result, "\r") {
		t.Errorf("Title should not contain newlines, got: %s", result)
	}
}

func TestCreateTitle_UsesFirstLine(t *testing.T) {
	input := "First line is the title\n\nSecond paragraph with more content"

	result := createTitle(input)

	if !strings.Contains(result, "First line is the title") {
		t.Errorf("Title should use first line, got: %s", result)
	}
	if strings.Contains(result, "Second paragraph") {
		t.Errorf("Title should not include second paragraph, got: %s", result)
	}
}

// =============================================================================
// SLUG CREATION TESTS
// =============================================================================

func TestCreateSlug_HandlesEmoji(t *testing.T) {
	input := "🤬You might be outraged"

	result := createSlug(input)

	if strings.Contains(result, "🤬") {
		t.Errorf("Slug should not contain emoji, got: %s", result)
	}
	if !strings.Contains(result, "you-might-be-outraged") {
		t.Errorf("Slug should contain text portion, got: %s", result)
	}
}

func TestCreateSlug_LowercasesText(t *testing.T) {
	input := "Hello World Test"

	result := createSlug(input)

	if result != "hello-world-test" {
		t.Errorf("Slug should be lowercase with dashes, got: %s", result)
	}
}

func TestCreateSlug_RemovesSpecialChars(t *testing.T) {
	input := "What's the deal? It's great!"

	result := createSlug(input)

	if strings.Contains(result, "'") || strings.Contains(result, "?") || strings.Contains(result, "!") {
		t.Errorf("Slug should not contain special chars, got: %s", result)
	}
}

func TestCreateSlug_TruncatesLongSlugs(t *testing.T) {
	input := "This is a very long title that will generate a very long slug that needs to be truncated"

	result := createSlug(input)

	if len(result) > 55 {
		t.Errorf("Slug should be truncated, got length %d: %s", len(result), result)
	}
}

// =============================================================================
// INTEGRATION-STYLE TESTS
// =============================================================================

func TestFullPostProcessing_Share(t *testing.T) {
	csvContent := `🤬You might be outraged at the wrong thing about AI""
""The problem isn't "AI", in general. The problem is how we use it.""
""Too many people treat AI as a peer—an equal collaborator.""
""#AIEthics #Leadership`

	content := cleanShareContent(csvContent)
	title := createTitle(content)
	slug := createSlug(title)

	if strings.Count(content, "\n\n") < 2 {
		t.Errorf("Content should have multiple paragraph breaks, got:\n%s", content)
	}
	if len([]rune(title)) > 55 {
		t.Errorf("Title too long: %s", title)
	}
	if len(slug) == 0 || strings.Contains(slug, " ") {
		t.Errorf("Invalid slug: %s", slug)
	}
}

// Test with the ACTUAL format that Go's CSV reader produces after parsing
func TestCleanShareContent_ActualCSVParsedFormat(t *testing.T) {
	// This is what Go's csv.Reader returns after parsing the LinkedIn CSV
	// The outer quotes are removed, internal "" becomes "
	csvParsedContent := "🤬You might be outraged at the wrong thing about AI\"\n\"\"\n\"The problem isn't \"AI\", in general. The problem, as with most tools, is how we use it.\"\n\"Too many people treat AI as a peer—an equal collaborator.\"\n\"\"\n\"#AIEthics #Leadership"

	content := cleanShareContent(csvParsedContent)

	// Should have paragraph breaks
	if strings.Count(content, "\n\n") < 2 {
		t.Errorf("Content should have multiple paragraph breaks, got:\n%s", content)
	}

	// Title and next paragraph should be separate
	if strings.Contains(content, "AI🤬") || strings.Contains(content, "AIThe") {
		t.Errorf("Paragraphs should be separated, got:\n%s", content)
	}

	// Quotes within text should be preserved
	if !strings.Contains(content, `"AI"`) {
		t.Errorf("Quotes around 'AI' should be preserved, got:\n%s", content)
	}

	// Hashtags should be present
	if !strings.Contains(content, "#AIEthics") {
		t.Errorf("Hashtags should be preserved, got:\n%s", content)
	}
}

func TestFullPostProcessing_Article(t *testing.T) {
	htmlBody := `<p>The year is 2015. I see myself on a pic in the company slack.</p>
<p>But I had to accept it: the pic was not unflattering.</p>
<ul>
<li><strong>📆 the power of planning</strong>: that would work at multiple levels.</li>
<li><strong>🏆 sharing my goals</strong>: what's the point of achieving anything big?</li>
</ul>
<p>Thanks to <a href="https://example.com">Mikko</a> for inspiration!</p>`

	content := htmlToMarkdown(htmlBody)

	if !strings.Contains(content, "The year is 2015") {
		t.Errorf("First paragraph missing")
	}
	if !strings.Contains(content, "- **📆 the power of planning**") {
		t.Errorf("List items should be converted to markdown, got:\n%s", content)
	}
	if !strings.Contains(content, "[Mikko](https://example.com)") {
		t.Errorf("Links should be converted to markdown, got:\n%s", content)
	}
	if !strings.Contains(content, "**") {
		t.Errorf("Bold should be converted to markdown, got:\n%s", content)
	}
}
