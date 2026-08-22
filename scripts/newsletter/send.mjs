#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import juice from 'juice';

import { parseFrontmatter } from './frontmatter.mjs';
import { selectPosts } from './posts.mjs';
import { readState, recordSent } from './state.mjs';
import { createDraftBroadcast } from './broadcast.mjs';

const BLOG_DIR = 'content/blog';
const PUBLIC_DIR = 'public';
const STATE_FILE = '.newsletter-state.json';
const DRY_RUN_DIR = 'tmp/newsletter-preview';

const dryRun = process.argv.includes('--dry-run');

function loadPosts() {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && f !== '_index.md')
    .map((f) => {
      const path = join(BLOG_DIR, f);
      return { path, frontmatter: parseFrontmatter(readFileSync(path, 'utf8')) };
    });
}

function emailHtmlFor(slug) {
  const file = join(PUBLIC_DIR, 'blog', slug, 'index.email.html');
  if (!existsSync(file)) {
    throw new Error(
      `Rendered email not found at ${file}. Did the Hugo build run, and does ` +
      `the post's slug match its output directory?`,
    );
  }
  // Inline the <style> block: Gmail and Outlook treat head styles inconsistently.
  return juice(readFileSync(file, 'utf8'));
}

function summary(line) {
  process.stdout.write(`${line}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: 'a' });
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main() {
  const sent = readState(STATE_FILE);
  const selected = selectPosts(loadPosts(), new Date(), sent);

  if (selected.length === 0) {
    summary('No posts qualify for the newsletter. Nothing to do.');
    return;
  }

  summary(`## Newsletter\n\nSelected ${selected.length} post(s).\n`);

  let failures = 0;

  for (const post of selected) {
    try {
      const html = emailHtmlFor(post.slug);

      if (dryRun) {
        mkdirSync(DRY_RUN_DIR, { recursive: true });
        const out = join(DRY_RUN_DIR, `${post.slug}.html`);
        writeFileSync(out, html);
        summary(`- \`${post.slug}\` — dry run, written to ${out} (${html.length} bytes)`);
        continue;
      }

      const result = await createDraftBroadcast({
        apiKey: requireEnv('RESEND_API_KEY'),
        segmentId: requireEnv('RESEND_SEGMENT_ID'),
        from: requireEnv('NEWSLETTER_FROM'),
        subject: post.title,
        // Resend caps `name` at 70 characters (422 otherwise). It is only an
        // internal dashboard label — recipients see `subject` — so truncating
        // is safe.
        name: `${post.date?.slice(0, 10) ?? ''} ${post.title}`.trim().slice(0, 70),
        html,
      });

      // Only now is it safe to record. If anything above threw, the post stays
      // unrecorded and the next run retries it.
      recordSent(STATE_FILE, post.slug);

      summary(
        `- **${post.title}** — draft created. ` +
        `[Review and send](https://resend.com/broadcasts/${result.id})`,
      );
    } catch (err) {
      failures += 1;
      summary(`- \`${post.slug}\` — FAILED: ${err.message}`);
    }
  }

  if (!dryRun && selected.length > failures) {
    summary('\n**These are drafts.** Nothing has been emailed until you press Send in Resend.');
  }

  if (failures > 0) {
    throw new Error(`${failures} post(s) failed. They were not recorded and will retry.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
