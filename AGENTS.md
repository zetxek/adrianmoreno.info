# Guidelines for contributors

This repository contains the source for a Hugo-based personal website for Adrián Moreno Peña, a hands-on technology leader.

He's based in Copenhagen (Denmark) and the audience is primarily English-speaking tech professionals.

Follow these instructions when working in this project.

The website uses a custom Hugo theme module, developed by the same author, available at https://github.com/zetxek/adritian-free-hugo-theme. You can contribute there as well - iff you are contributing to that project, please refer to the [AGENTS.md](./AGENTS.md) file in that repository for specific instructions.

## Pre-requisites

1. Install [Hugo Extended](https://gohugo.io/getting-started/installing/) (version 0.123 or newer is recommended)
2. Install [Node.js](https://nodejs.org/en/download/) (version 16 or newer is recommended)

## Setup

1. After cloning, run `hugo mod get -u github.com/zetxek/adritian-free-hugo-theme` to fetch the latest version of the theme.
2. Install Node.js dependencies with:
   ```bash
   npm install
   ```

## Development

- To preview the site locally run:
  ```bash
  hugo serve -D
  ```
  This includes draft content.
- Build the production version with:
  ```bash
  hugo --minify
  ```

The generated HTML lives in the `public/` directory.
Do not commit it - it will be generated during deployment, and published to Vercel.

## Content and code style

- Write posts in the `content/` directory using Markdown with YAML front matter.
- Indent HTML, Markdown lists, and TOML/YAML blocks with **two spaces**.
- Keep commit messages concise and written in English.

## Tests

1. Run `hugo --minify` to verify that the site builds
2. Run the local e2e tests, with `npm test`