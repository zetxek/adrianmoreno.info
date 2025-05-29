#!/usr/bin/env python3
"""
TOML Front Matter Fixer for LinkedIn Posts - Enhanced Version

This script fixes TOML front matter in markdown files to ensure Hugo compatibility.
It specifically addresses issues with malformed titles, nested quotes, and improper field separation.

Author: Manus AI
Date: May 29, 2025
"""

import os
import re
import argparse
import glob

def fix_toml_front_matter(file_path):
    """Fix TOML front matter in a markdown file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if file has front matter
        front_matter_match = re.search(r'^\+\+\+(.*?)\+\+\+', content, re.DOTALL)
        if not front_matter_match:
            print(f"No front matter found in {file_path}")
            return False
        
        original_front_matter = front_matter_match.group(1)
        
        # Fix missing newline after +++ at the beginning
        if not original_front_matter.startswith('\n'):
            content = content.replace('+++', '+++\n', 1)
            front_matter_match = re.search(r'^\+\+\+(.*?)\+\+\+', content, re.DOTALL)
            if front_matter_match:
                original_front_matter = front_matter_match.group(1)
            else:
                print(f"Failed to fix front matter in {file_path}")
                return False
        
        # Extract all fields
        fields = {}
        field_matches = re.findall(r'(\w+)\s*=\s*"([^"]*)"', original_front_matter)
        for field, value in field_matches:
            fields[field] = value
        
        # If title field exists, sanitize it
        if 'title' in fields:
            # Remove any quotes (single or double)
            title = fields['title']
            title = title.replace('"', "'").replace("''", "'")
            # Remove any trailing empty quotes
            title = re.sub(r'\s*\'\'?\s*$', '', title)
            # Ensure it's a single line
            title = re.sub(r'\s+', ' ', title).strip()
            fields['title'] = title
        
        # Create new front matter
        new_front_matter = "\n"
        for field, value in fields.items():
            new_front_matter += f'{field} = "{value}"\n'
        
        # Replace front matter
        new_content = content.replace(original_front_matter, new_front_matter)
        
        # Write fixed content back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return True
    
    except Exception as e:
        print(f"Error fixing {file_path}: {str(e)}")
        return False

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Fix TOML front matter in markdown files")
    parser.add_argument("--dir", help="Directory containing markdown files to fix")
    parser.add_argument("--file", help="Single markdown file to fix")
    
    args = parser.parse_args()
    
    if args.file:
        if os.path.exists(args.file):
            if fix_toml_front_matter(args.file):
                print(f"Fixed front matter in {args.file}")
            else:
                print(f"Failed to fix front matter in {args.file}")
        else:
            print(f"File not found: {args.file}")
    
    elif args.dir:
        if os.path.exists(args.dir):
            md_files = glob.glob(os.path.join(args.dir, "*.md"))
            fixed_count = 0
            
            for file_path in md_files:
                if fix_toml_front_matter(file_path):
                    fixed_count += 1
                    print(f"Fixed front matter in {file_path}")
            
            print(f"Fixed {fixed_count} out of {len(md_files)} markdown files")
        else:
            print(f"Directory not found: {args.dir}")
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
