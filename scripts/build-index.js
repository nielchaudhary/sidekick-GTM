#!/usr/bin/env node

/**
 * Build skills-index.json from all SKILL.md files in the repo.
 *
 * Run from the repo root:
 *   node scripts/build-index.js
 *
 * Reads YAML frontmatter from each SKILL.md and collects file lists.
 * Output: skills-index.json at repo root.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'skills-index.json');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};

  // Simple YAML parser for flat key: value and key: >-multiline
  let currentKey = null;
  let multiline = false;

  for (const line of yaml.split('\n')) {
    if (!multiline) {
      const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        let value = kvMatch[2].trim();
        if (value === '>' || value === '|') {
          multiline = true;
          result[currentKey] = '';
        } else {
          // Strip surrounding quotes
          value = value.replace(/^['"]|['"]$/g, '');
          // Handle inline arrays [a, b, c]
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map((s) => s.trim());
          }
          result[currentKey] = value;
        }
      }
    } else {
      if (line.match(/^\S/) && !line.startsWith(' ')) {
        // New top-level key, end multiline
        multiline = false;
        result[currentKey] = result[currentKey].trim();
        // Re-parse this line
        const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
        if (kvMatch) {
          currentKey = kvMatch[1];
          let value = kvMatch[2].trim();
          value = value.replace(/^['"]|['"]$/g, '');
          result[currentKey] = value;
        }
      } else {
        result[currentKey] += ' ' + line.trim();
      }
    }
  }

  if (multiline && currentKey) {
    result[currentKey] = result[currentKey].trim();
  }

  return result;
}

function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function scanCategory(category) {
  const categoryDir = path.join(ROOT, 'skills', category);
  if (!fs.existsSync(categoryDir)) return [];

  const skills = [];
  const slugs = fs.readdirSync(categoryDir).filter((d) =>
    fs.statSync(path.join(categoryDir, d)).isDirectory()
  );

  for (const slug of slugs) {
    const skillDir = path.join(categoryDir, slug);
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;

    const content = fs.readFileSync(skillMd, 'utf8');
    const meta = parseFrontmatter(content);

    const allFiles = collectFiles(skillDir).map((f) =>
      path.relative(ROOT, f)
    );

    skills.push({
      slug,
      name: meta.name || slug,
      category,
      description: meta.description || '',
      tags: typeof meta.tags === 'string' ? meta.tags : (Array.isArray(meta.tags) ? meta.tags.join(', ') : ''),
      path: `skills/${category}/${slug}`,
      files: allFiles,
    });
  }

  return skills;
}

const skills = [
  ...scanCategory('capabilities'),
  ...scanCategory('composites'),
];

const index = {
  version: '1.0.0',
  generated: new Date().toISOString().split('T')[0],
  skills,
};

fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2));
console.log(`Generated ${OUTPUT} with ${skills.length} skills.`);
