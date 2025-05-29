#!/usr/bin/env python3
"""
LinkedIn to Hugo Markdown Converter (Updated Version)

This script converts LinkedIn posts to Hugo-compatible Markdown files.
It supports:
1. Processing LinkedIn data export files (Shares.csv and Articles HTML)
2. Converting to Hugo-compatible Markdown with TOML front matter

Author: Manus AI
Date: May 29, 2025
"""

import os
import sys
import csv
import re
import argparse
import datetime
import requests
import zipfile
import html
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import unquote

# Default paths
DEFAULT_OUTPUT_DIR = "content/linkedin-posts"

class LinkedInToHugo:
    """Main class for converting LinkedIn posts to Hugo Markdown"""
    
    def __init__(self, output_dir=DEFAULT_OUTPUT_DIR):
        """Initialize with output directory"""
        self.output_dir = output_dir
        
    def process_export_file(self, export_path):
        """Process LinkedIn export file (zip, csv, or html)"""
        if not os.path.exists(export_path):
            print(f"Error: Export file not found at {export_path}")
            return []
            
        # If it's a zip file, extract it first
        if export_path.lower().endswith('.zip'):
            return self._process_zip_export(export_path)
        
        # Otherwise process as individual file
        file_ext = os.path.splitext(export_path)[1].lower()
        
        if file_ext == '.csv':
            # Check if it's Shares.csv
            if os.path.basename(export_path) == 'Shares.csv':
                return self._process_shares_csv(export_path)
            else:
                print(f"Unsupported CSV file: {os.path.basename(export_path)}. Only Shares.csv is supported.")
                return []
        elif file_ext == '.html':
            # Process as article
            return [self._process_article_html(export_path)]
        else:
            print(f"Error: Unsupported file format {file_ext}. Please use ZIP, CSV, or HTML.")
            return []
    
    def _process_zip_export(self, zip_path):
        """Process LinkedIn data export ZIP file"""
        posts = []
        temp_dir = os.path.join(os.path.dirname(zip_path), "temp_linkedin_export")
        
        try:
            # Create temp directory if it doesn't exist
            os.makedirs(temp_dir, exist_ok=True)
            
            # Extract the zip file
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # Process Shares.csv if it exists
            shares_csv = os.path.join(temp_dir, "Shares.csv")
            if os.path.exists(shares_csv):
                shares_posts = self._process_shares_csv(shares_csv)
                posts.extend(shares_posts)
            
            # Process Articles if they exist
            articles_dir = os.path.join(temp_dir, "Articles", "Articles")
            if os.path.exists(articles_dir):
                for article_file in os.listdir(articles_dir):
                    if article_file.endswith('.html'):
                        article_path = os.path.join(articles_dir, article_file)
                        article_post = self._process_article_html(article_path)
                        if article_post:
                            posts.append(article_post)
            
        except Exception as e:
            print(f"Error processing ZIP file: {str(e)}")
        
        return posts
    
    def _process_shares_csv(self, csv_path):
        """Process Shares.csv from LinkedIn export"""
        posts = []
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                # Use csv.reader to handle the CSV file
                reader = csv.DictReader(f)
                for row in reader:
                    # Extract relevant fields
                    date_str = row.get('Date', '')
                    share_link = row.get('ShareLink', '')
                    share_commentary = row.get('ShareCommentary', '')
                    shared_url = row.get('SharedUrl', '')
                    media_url = row.get('MediaUrl', '')
                    visibility = row.get('Visibility', '')
                    
                    # Skip empty posts
                    if not share_commentary.strip():
                        continue
                    
                    # Parse date
                    try:
                        post_datetime = datetime.datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                    except ValueError:
                        post_datetime = datetime.datetime.now()
                    
                    # Create post object
                    post = {
                        'type': 'share',
                        'content': share_commentary,
                        'date': post_datetime.strftime('%Y-%m-%d'),
                        'datetime': post_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
                        'title': self._generate_title(share_commentary),
                        'url': unquote(share_link),
                        'shared_url': shared_url,
                        'media_url': media_url,
                        'visibility': visibility
                    }
                    
                    posts.append(post)
                    
        except Exception as e:
            print(f"Error processing Shares.csv: {str(e)}")
        
        return posts
    
    def _process_article_html(self, html_path):
        """Process Article HTML from LinkedIn export"""
        try:
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract title
            title = soup.title.string if soup.title else os.path.basename(html_path)
            
            # Extract content (main body)
            content = ""
            body = soup.body
            if body:
                # Remove script and style elements
                for script in body(["script", "style"]):
                    script.extract()
                
                # Get text
                content = body.get_text(separator="\n\n")
                
                # Clean up whitespace
                content = re.sub(r'\n{3,}', '\n\n', content)
                content = content.strip()
            
            # Extract date from filename or use current date
            date_match = re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(html_path))
            if date_match:
                post_date = date_match.group(1)
                post_datetime = datetime.datetime.strptime(post_date, '%Y-%m-%d')
            else:
                post_datetime = datetime.datetime.now()
            
            # Create post object
            post = {
                'type': 'article',
                'content': content,
                'date': post_datetime.strftime('%Y-%m-%d'),
                'datetime': post_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
                'title': title,
                'url': f"https://www.linkedin.com/in/adrianmoreno/detail/recent-activity/posts/",
                'filename': os.path.basename(html_path)
            }
            
            return post
            
        except Exception as e:
            print(f"Error processing article HTML {html_path}: {str(e)}")
            return None
    
    def _generate_title(self, content, max_length=50):
        """Generate a title from post content"""
        # Remove URLs
        content_no_urls = re.sub(r'https?://\S+', '', content)
        
        # Remove hashtags
        content_no_hashtags = re.sub(r'#\w+', '', content_no_urls)
        
        # Remove extra whitespace
        content_clean = re.sub(r'\s+', ' ', content_no_hashtags).strip()
        
        # Use first sentence or part of it as title
        sentences = re.split(r'[.!?]', content_clean)
        if sentences:
            title = sentences[0].strip()
            if len(title) > max_length:
                # Truncate and add ellipsis
                title = title[:max_length-3] + '...'
            return title
        else:
            return "LinkedIn Post"
    
    def _sanitize_toml_string(self, s):
        """Properly sanitize a string for TOML format"""
        if s is None:
            return ""
        
        # Remove any existing quotes within the string to avoid nesting
        s = s.replace('"', "'")
        
        # Remove any trailing empty quotes that might have been added
        s = re.sub(r'\s*""\s*$', '', s)
        
        # Replace backslashes first to avoid double escaping
        s = s.replace('\\', '\\\\')
        
        # Replace other special characters
        s = s.replace('\b', '\\b')
        s = s.replace('\t', '\\t')
        s = s.replace('\n', '\\n')
        s = s.replace('\f', '\\f')
        s = s.replace('\r', '\\r')
        
        return s
    
    def convert_to_markdown(self, posts):
        """Convert posts to Hugo Markdown files"""
        if not posts:
            print("No posts to convert")
            return 0
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        
        count = 0
        for post in posts:
            try:
                # Generate filename
                date = post.get('date', datetime.datetime.now().strftime('%Y-%m-%d'))
                post_type = post.get('type', 'post')
                slug = self._generate_slug(post.get('title', f'linkedin-{post_type}'))
                filename = f"{date}-{slug}.md"
                filepath = os.path.join(self.output_dir, filename)
                
                # Generate front matter
                title_prefix = "LinkedIn Article: " if post_type == 'article' else "LinkedIn Post: "
                
                # Sanitize title and other string fields for TOML
                safe_title = self._sanitize_toml_string(title_prefix + post.get('title', 'Untitled'))
                safe_url = self._sanitize_toml_string(post.get('url', ''))
                
                # Create TOML front matter
                front_matter = f"""+++
title = "{safe_title}"
date = "{post.get('datetime', datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))}"
draft = false
tags = ["linkedin", "social-media"]
categories = ["posts"]
type = "post"
linkedin_url = "{safe_url}"
+++

"""
                
                # Process content based on post type
                content = post.get('content', '')
                
                # Convert URLs to Markdown links
                content = re.sub(
                    r'(https?://[^\s]+)',
                    r'[\1](\1)',
                    content
                )
                
                # Convert hashtags to links
                content = re.sub(
                    r'#(\w+)',
                    r'[#\1](https://www.linkedin.com/feed/hashtag/\1)',
                    content
                )
                
                # Add LinkedIn source note
                source_note = "\n\n---\n\n*This post was originally published on [LinkedIn](https://www.linkedin.com/in/adrianmoreno/recent-activity/all/).*"
                
                # Combine front matter and content
                markdown = front_matter + content + source_note
                
                # Write to file
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(markdown)
                
                print(f"Created: {filepath}")
                count += 1
                
            except Exception as e:
                print(f"Error converting post to Markdown: {str(e)}")
        
        return count
    
    def _generate_slug(self, title):
        """Generate a URL-friendly slug from a title"""
        # Convert to lowercase
        slug = title.lower()
        
        # Replace non-alphanumeric characters with hyphens
        slug = re.sub(r'[^a-z0-9]+', '-', slug)
        
        # Remove leading/trailing hyphens
        slug = slug.strip('-')
        
        # Ensure slug is not empty
        if not slug:
            slug = 'post'
        
        return slug
    
    def validate_toml_front_matter(self, file_path):
        """Validate TOML front matter in a markdown file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract front matter
            front_matter_match = re.search(r'^\+\+\+(.*?)\+\+\+', content, re.DOTALL)
            if not front_matter_match:
                return False, "No front matter found"
            
            front_matter = front_matter_match.group(1)
            
            # Check for common TOML errors
            # 1. Nested quotes in title
            title_match = re.search(r'title\s*=\s*"(.*?)"', front_matter)
            if title_match:
                title = title_match.group(1)
                if '"' in title:
                    # Fix the title by replacing inner quotes with single quotes
                    fixed_title = title.replace('"', "'")
                    fixed_front_matter = front_matter.replace(title, fixed_title)
                    fixed_content = content.replace(front_matter, fixed_front_matter)
                    
                    # Write fixed content back to file
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(fixed_content)
                    
                    return False, f"Fixed nested quotes in title: {title}"
            
            # 2. Check for trailing empty quotes
            if '""' in front_matter:
                # Fix trailing empty quotes
                fixed_front_matter = re.sub(r'\s*""\s*', '', front_matter)
                fixed_content = content.replace(front_matter, fixed_front_matter)
                
                # Write fixed content back to file
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(fixed_content)
                
                return False, "Fixed trailing empty quotes"
            
            return True, "Front matter is valid"
            
        except Exception as e:
            return False, f"Error validating front matter: {str(e)}"

def create_index_file(output_dir):
    """Create _index.md file for LinkedIn posts section"""
    index_path = os.path.join(output_dir, "_index.md")
    if not os.path.exists(index_path):
        index_content = """+++
title = "LinkedIn Posts"
description = "Posts shared on LinkedIn"
date = "2025-05-29T00:00:00Z"
draft = false
type = "section"
+++

This section contains posts that were originally shared on LinkedIn.
"""
        
        # Create directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Write index file
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(index_content)
            
        print(f"Created LinkedIn posts index at {index_path}")

def validate_all_markdown_files(directory):
    """Validate all markdown files in a directory"""
    if not os.path.exists(directory):
        print(f"Directory not found: {directory}")
        return False
    
    all_valid = True
    validator = LinkedInToHugo()
    
    for filename in os.listdir(directory):
        if filename.endswith('.md') and filename != '_index.md':
            file_path = os.path.join(directory, filename)
            valid, message = validator.validate_toml_front_matter(file_path)
            if not valid:
                all_valid = False
                print(f"Fixed {filename}: {message}")
    
    return all_valid

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Convert LinkedIn posts to Hugo Markdown")
    parser.add_argument("--export", help="Path to LinkedIn export file (ZIP, CSV, or HTML)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Output directory for Markdown files")
    parser.add_argument("--validate", action="store_true", help="Validate existing markdown files")
    
    args = parser.parse_args()
    
    if args.validate:
        if args.output_dir:
            print(f"Validating markdown files in {args.output_dir}")
            all_valid = validate_all_markdown_files(args.output_dir)
            if all_valid:
                print("All markdown files have valid TOML front matter")
            else:
                print("Some markdown files were fixed. Please check the output directory.")
        else:
            print("Please specify an output directory to validate")
        return
    
    if not args.export:
        parser.print_help()
        return
    
    # Initialize converter
    converter = LinkedInToHugo(args.output_dir)
    
    # Process export file
    posts = converter.process_export_file(args.export)
    
    # Convert posts to Markdown
    count = converter.convert_to_markdown(posts)
    
    # Create index file
    create_index_file(args.output_dir)
    
    # Validate all markdown files
    validate_all_markdown_files(args.output_dir)
    
    print(f"Converted {count} posts to Markdown")

if __name__ == "__main__":
    main()
