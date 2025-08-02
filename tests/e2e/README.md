# End-to-End Tests

This directory contains end-to-end tests for the website using Playwright.

## Test Files

### `homepage.spec.js`
Tests the homepage functionality:
- Page loads successfully with correct title and meta information
- Key sections are present (About, Experience, Contact)
- Header navigation works correctly
- Social links are present
- Navigation scrolls to correct sections

### `experience.spec.js`
Tests the experience page functionality:
- Page loads successfully with correct content structure
- Experience entries are displayed correctly with proper data (dynamically counts entries)
- Navigation links work properly
- Experience entry links are clickable and point to correct URLs (dynamically counts links)
- Meta information is correct
- Page is responsive and accessible across different viewport sizes

## Running Tests

### Run all tests
```bash
npx playwright test tests/e2e/
```

### Run specific test file
```bash
npx playwright test tests/e2e/experience.spec.js
```

### Run tests in specific browser
```bash
npx playwright test tests/e2e/ --project=Chrome
npx playwright test tests/e2e/ --project=Firefox
```

### Run tests with UI
```bash
npx playwright test tests/e2e/ --headed
```

### View test report
```bash
npx playwright show-report
```

## Test Structure

Each test file follows this structure:
- **Page loading tests**: Verify the page loads correctly with proper HTTP status
- **Content verification tests**: Check that expected content is present and correct
- **Navigation tests**: Ensure navigation elements work as expected
- **Responsive tests**: Verify the page works across different screen sizes
- **Accessibility tests**: Check for accessibility features like skip links

## Screenshots

Tests automatically capture screenshots on failure and save them to the `test-results/` directory. Successful tests also capture screenshots for visual reference.

## Configuration

Tests are configured in `playwright.config.js` with:
- Base URL: `http://localhost:1313` (Hugo development server)
- Timeout: 30 seconds
- Screenshots and videos enabled
- Chrome and Firefox browser support 