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
                
                # Create TOML front matter
                front_matter = f"""+++
title = "{title_prefix}{post.get('title', 'Untitled')}"
date = "{post.get('datetime', datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S'))}"
draft = false
tags = ["linkedin", "social-media"]
categories = ["posts"]
type = "post"
linkedin_url = "{post.get('url', '')}"
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

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Convert LinkedIn posts to Hugo Markdown")
    parser.add_argument("--export", help="Path to LinkedIn export file (ZIP, CSV, or HTML)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Output directory for Markdown files")
    
    args = parser.parse_args()
    
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
    
    print(f"Converted {count} posts to Markdown")

if __name__ == "__main__":
    main()
