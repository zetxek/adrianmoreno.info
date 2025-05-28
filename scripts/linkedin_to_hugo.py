#!/usr/bin/env python3
"""
LinkedIn to Hugo Markdown Converter

This script converts LinkedIn posts to Hugo-compatible Markdown files.
It supports two methods:
1. Manual export: Process LinkedIn data export files
2. API-based: Use third-party APIs to fetch LinkedIn posts (requires API keys)

Author: Manus AI
Date: May 28, 2025
"""

import os
import sys
import json
import csv
import re
import argparse
import datetime
import requests
from pathlib import Path
from typing import Dict, List, Optional, Union, Any

# Default paths
DEFAULT_OUTPUT_DIR = "content/linkedin-posts"
DEFAULT_CONFIG_PATH = "config/linkedin_config.json"

class LinkedInToHugo:
    """Main class for converting LinkedIn posts to Hugo Markdown"""
    
    def __init__(self, config_path: str = DEFAULT_CONFIG_PATH):
        """Initialize with configuration"""
        self.config = self._load_config(config_path)
        self.output_dir = self.config.get("output_directory", DEFAULT_OUTPUT_DIR)
        
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from JSON file or create default"""
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                return json.load(f)
        else:
            # Default configuration
            default_config = {
                "output_directory": DEFAULT_OUTPUT_DIR,
                "api": {
                    "enabled": False,
                    "provider": "none",
                    "api_key": "",
                    "api_secret": ""
                },
                "post_template": {
                    "title_prefix": "LinkedIn Post: ",
                    "tags": ["linkedin", "social-media"],
                    "categories": ["posts"],
                    "layout": "post",
                    "draft": False
                }
            }
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(config_path), exist_ok=True)
            
            # Save default config
            with open(config_path, 'w') as f:
                json.dump(default_config, f, indent=2)
                
            return default_config
    
    def process_manual_export(self, export_path: str) -> List[Dict[str, Any]]:
        """Process manually exported LinkedIn data"""
        if not os.path.exists(export_path):
            print(f"Error: Export file not found at {export_path}")
            return []
            
        file_ext = os.path.splitext(export_path)[1].lower()
        
        if file_ext == '.csv':
            return self._process_csv_export(export_path)
        elif file_ext == '.json':
            return self._process_json_export(export_path)
        else:
            print(f"Error: Unsupported file format {file_ext}. Please use CSV or JSON.")
            return []
    
    def _process_csv_export(self, csv_path: str) -> List[Dict[str, Any]]:
        """Process CSV export from LinkedIn"""
        posts = []
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Check if this is a post row (format may vary based on LinkedIn export)
                    if 'Post' in row or 'Content' in row or 'Text' in row:
                        post_content = row.get('Post') or row.get('Content') or row.get('Text', '')
                        post_date = row.get('Date') or row.get('Created At') or row.get('Timestamp', '')
                        
                        # Convert date string to datetime object if possible
                        try:
                            # Try different date formats
                            date_formats = [
                                '%Y-%m-%d %H:%M:%S',
                                '%Y-%m-%d',
                                '%m/%d/%Y %H:%M:%S',
                                '%m/%d/%Y'
                            ]
                            
                            post_datetime = None
                            for fmt in date_formats:
                                try:
                                    post_datetime = datetime.datetime.strptime(post_date, fmt)
                                    break
                                except ValueError:
                                    continue
                            
                            if not post_datetime:
                                # If no format matched, use current date
                                post_datetime = datetime.datetime.now()
                                
                        except Exception:
                            post_datetime = datetime.datetime.now()
                        
                        # Create post object
                        post = {
                            'content': post_content,
                            'date': post_datetime.strftime('%Y-%m-%d'),
                            'datetime': post_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
                            'title': self._generate_title(post_content),
                            'url': row.get('URL', ''),
                            'likes': row.get('Likes', '0'),
                            'comments': row.get('Comments', '0'),
                            'shares': row.get('Shares', '0')
                        }
                        
                        posts.append(post)
        except Exception as e:
            print(f"Error processing CSV file: {str(e)}")
        
        return posts
    
    def _process_json_export(self, json_path: str) -> List[Dict[str, Any]]:
        """Process JSON export from LinkedIn"""
        posts = []
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # LinkedIn's export format can vary, so we need to handle different structures
            # This is a simplified example - actual implementation may need adjustments
            
            # Try to find posts in different possible locations in the JSON structure
            if 'posts' in data:
                raw_posts = data['posts']
            elif 'activities' in data:
                raw_posts = data['activities']
            elif 'shares' in data:
                raw_posts = data['shares']
            else:
                # If we can't find a clear posts array, try to search through the data
                raw_posts = []
                self._find_posts_in_json(data, raw_posts)
            
            for raw_post in raw_posts:
                # Extract post content - field names may vary
                content = (
                    raw_post.get('content', {}).get('text', '') or
                    raw_post.get('commentary', '') or
                    raw_post.get('text', '') or
                    raw_post.get('message', '')
                )
                
                # Extract date - field names may vary
                date_str = (
                    raw_post.get('createdAt', '') or
                    raw_post.get('created', '') or
                    raw_post.get('date', '') or
                    raw_post.get('timestamp', '')
                )
                
                # Try to parse date
                try:
                    if isinstance(date_str, (int, float)):
                        # Assume milliseconds timestamp
                        post_datetime = datetime.datetime.fromtimestamp(date_str / 1000)
                    else:
                        # Try ISO format first
                        try:
                            post_datetime = datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        except:
                            # Fall back to current date
                            post_datetime = datetime.datetime.now()
                except:
                    post_datetime = datetime.datetime.now()
                
                # Create post object
                post = {
                    'content': content,
                    'date': post_datetime.strftime('%Y-%m-%d'),
                    'datetime': post_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
                    'title': self._generate_title(content),
                    'url': raw_post.get('url', '') or raw_post.get('link', ''),
                    'likes': raw_post.get('likes', 0) or raw_post.get('numLikes', 0),
                    'comments': raw_post.get('comments', 0) or raw_post.get('numComments', 0),
                    'shares': raw_post.get('shares', 0) or raw_post.get('numShares', 0)
                }
                
                posts.append(post)
                
        except Exception as e:
            print(f"Error processing JSON file: {str(e)}")
        
        return posts
    
    def _find_posts_in_json(self, data: Any, result: List[Dict[str, Any]]) -> None:
        """Recursively search for posts in JSON structure"""
        if isinstance(data, dict):
            # Check if this dictionary looks like a post
            if 'text' in data or 'content' in data or 'commentary' in data:
                result.append(data)
            
            # Recursively search in values
            for value in data.values():
                self._find_posts_in_json(value, result)
        
        elif isinstance(data, list):
            # Recursively search in list items
            for item in data:
                self._find_posts_in_json(item, result)
    
    def fetch_posts_via_api(self) -> List[Dict[str, Any]]:
        """Fetch posts using a third-party API"""
        if not self.config.get('api', {}).get('enabled', False):
            print("API access is not enabled in configuration")
            return []
        
        provider = self.config.get('api', {}).get('provider', '').lower()
        api_key = self.config.get('api', {}).get('api_key', '')
        
        if not api_key:
            print("API key is missing in configuration")
            return []
        
        posts = []
        
        try:
            # Example implementation for different API providers
            if provider == 'apify':
                posts = self._fetch_from_apify(api_key)
            elif provider == 'brightdata':
                posts = self._fetch_from_brightdata(api_key)
            elif provider == 'phantombuster':
                posts = self._fetch_from_phantombuster(api_key)
            else:
                print(f"Unsupported API provider: {provider}")
        except Exception as e:
            print(f"Error fetching posts via API: {str(e)}")
        
        return posts
    
    def _fetch_from_apify(self, api_key: str) -> List[Dict[str, Any]]:
        """Fetch posts from Apify API"""
        # This is a placeholder implementation
        # Actual implementation would use Apify's API
        print("Fetching posts from Apify...")
        
        # Example API call
        url = "https://api.apify.com/v2/acts/curious_coder~linkedin-post-search-scraper/runs"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        payload = {
            "linkedinProfileUrl": self.config.get('linkedin_profile_url', ''),
            "maxPosts": 50
        }
        
        # This is just a placeholder - actual implementation would make the request
        # and process the response
        print("Note: This is a placeholder. You need to implement the actual API call.")
        
        return []
    
    def _fetch_from_brightdata(self, api_key: str) -> List[Dict[str, Any]]:
        """Fetch posts from Bright Data API"""
        # Placeholder implementation
        print("Fetching posts from Bright Data...")
        return []
    
    def _fetch_from_phantombuster(self, api_key: str) -> List[Dict[str, Any]]:
        """Fetch posts from Phantombuster API"""
        # Placeholder implementation
        print("Fetching posts from Phantombuster...")
        return []
    
    def _generate_title(self, content: str, max_length: int = 50) -> str:
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
    
    def convert_to_markdown(self, posts: List[Dict[str, Any]]) -> int:
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
                slug = self._generate_slug(post.get('title', 'linkedin-post'))
                filename = f"{date}-{slug}.md"
                filepath = os.path.join(self.output_dir, filename)
                
                # Generate front matter
                template = self.config.get('post_template', {})
                title_prefix = template.get('title_prefix', 'LinkedIn Post: ')
                
                front_matter = {
                    'title': f"{title_prefix}{post.get('title', 'Untitled')}",
                    'date': post.get('datetime', datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')),
                    'draft': template.get('draft', False),
                    'tags': template.get('tags', ['linkedin', 'social-media']),
                    'categories': template.get('categories', ['posts']),
                    'layout': template.get('layout', 'post'),
                    'linkedin_url': post.get('url', ''),
                    'linkedin_stats': {
                        'likes': post.get('likes', 0),
                        'comments': post.get('comments', 0),
                        'shares': post.get('shares', 0)
                    }
                }
                
                # Generate Markdown content
                markdown = self._generate_markdown(front_matter, post.get('content', ''))
                
                # Write to file
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(markdown)
                
                print(f"Created: {filepath}")
                count += 1
                
            except Exception as e:
                print(f"Error converting post to Markdown: {str(e)}")
        
        return count
    
    def _generate_slug(self, title: str) -> str:
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
    
    def _generate_markdown(self, front_matter: Dict[str, Any], content: str) -> str:
        """Generate Markdown with front matter and content"""
        # Convert front matter to YAML
        yaml_front_matter = "---\n"
        for key, value in front_matter.items():
            if isinstance(value, dict):
                yaml_front_matter += f"{key}:\n"
                for sub_key, sub_value in value.items():
                    yaml_front_matter += f"  {sub_key}: {sub_value}\n"
            elif isinstance(value, list):
                yaml_front_matter += f"{key}:\n"
                for item in value:
                    yaml_front_matter += f"  - {item}\n"
            else:
                yaml_front_matter += f"{key}: \"{value}\"\n"
        yaml_front_matter += "---\n\n"
        
        # Process content
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
        
        return yaml_front_matter + content + source_note

def create_config_directory(base_dir: str) -> None:
    """Create config directory structure"""
    config_dir = os.path.join(base_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    
    # Create default config file if it doesn't exist
    config_path = os.path.join(config_dir, "linkedin_config.json")
    if not os.path.exists(config_path):
        default_config = {
            "output_directory": "content/linkedin-posts",
            "api": {
                "enabled": False,
                "provider": "none",
                "api_key": "",
                "api_secret": ""
            },
            "post_template": {
                "title_prefix": "LinkedIn Post: ",
                "tags": ["linkedin", "social-media"],
                "categories": ["posts"],
                "layout": "post",
                "draft": False
            }
        }
        
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=2)
            
        print(f"Created default configuration at {config_path}")

def create_content_directory(base_dir: str) -> None:
    """Create content directory for LinkedIn posts"""
    content_dir = os.path.join(base_dir, "content", "linkedin-posts")
    os.makedirs(content_dir, exist_ok=True)
    
    # Create _index.md file
    index_path = os.path.join(content_dir, "_index.md")
    if not os.path.exists(index_path):
        index_content = """---
title: "LinkedIn Posts"
description: "Posts shared on LinkedIn"
date: 2025-05-28T00:00:00Z
draft: false
---

This section contains posts that were originally shared on LinkedIn.
"""
        
        with open(index_path, 'w') as f:
            f.write(index_content)
            
        print(f"Created LinkedIn posts index at {index_path}")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Convert LinkedIn posts to Hugo Markdown")
    parser.add_argument("--export", help="Path to LinkedIn export file (CSV or JSON)")
    parser.add_argument("--api", action="store_true", help="Use API to fetch posts")
    parser.add_argument("--config", default=DEFAULT_CONFIG_PATH, help="Path to configuration file")
    parser.add_argument("--output-dir", help="Output directory for Markdown files")
    parser.add_argument("--setup", action="store_true", help="Set up directory structure")
    
    args = parser.parse_args()
    
    # Get the base directory (repository root)
    base_dir = os.getcwd()
    
    # Set up directory structure if requested
    if args.setup:
        create_config_directory(base_dir)
        create_content_directory(base_dir)
        print("Setup complete. Please edit config/linkedin_config.json to configure the script.")
        return
    
    # Initialize converter
    converter = LinkedInToHugo(args.config)
    
    # Override output directory if specified
    if args.output_dir:
        converter.output_dir = args.output_dir
    
    posts = []
    
    # Process export file if provided
    if args.export:
        posts = converter.process_manual_export(args.export)
    
    # Fetch posts via API if requested
    if args.api:
        api_posts = converter.fetch_posts_via_api()
        posts.extend(api_posts)
    
    # Convert posts to Markdown
    count = converter.convert_to_markdown(posts)
    
    print(f"Converted {count} posts to Markdown")

if __name__ == "__main__":
    main()
