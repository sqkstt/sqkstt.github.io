import express from 'express';
import matter from 'gray-matter';
import { createServer as createViteServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = process.cwd();
const editorDir = fileURLToPath(new URL('.', import.meta.url));
const contentDir = resolve(rootDir, 'src/content/blog');
const port = Number(process.env.EDITOR_PORT ?? 4322);

const app = express();
app.use(express.json({ limit: '2mb' }));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timestampSlug() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `post-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function normalizeFilename(input) {
  const raw = String(input ?? '').trim();
  const candidate = raw.length > 0 ? raw : `${timestampSlug()}.md`;
  const filename = candidate.endsWith('.md') ? candidate : `${candidate}.md`;
  const safe = filename
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return safe || `${timestampSlug()}.md`;
}

function postPath(id) {
  const filename = normalizeFilename(id);
  const absolutePath = resolve(contentDir, filename);
  const contentRoot = `${contentDir}${process.platform === 'win32' ? '\\' : '/'}`;

  if (!absolutePath.startsWith(contentRoot)) {
    throw new Error('Invalid post path');
  }

  return absolutePath;
}

function serializeDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizePost(id, parsed) {
  const data = parsed.data ?? {};

  return {
    id,
    filename: id,
    title: data.title ?? '',
    description: data.description ?? '',
    category: data.category ?? '',
    pubDate: serializeDate(data.pubDate) ?? today(),
    updatedDate: serializeDate(data.updatedDate) ?? '',
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft !== false,
    body: parsed.content?.replace(/^\n+/, '') ?? '',
  };
}

async function ensureContentDir() {
  await mkdir(contentDir, { recursive: true });
}

async function readPost(id) {
  const filename = normalizeFilename(id);
  const file = await readFile(postPath(filename), 'utf8');
  return normalizePost(filename, matter(file));
}

async function listPostFiles() {
  await ensureContentDir();
  const files = await readdir(contentDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function postSummary(post) {
  return {
    id: post.id,
    filename: post.filename,
    title: post.title || '未命名文章',
    description: post.description,
    category: post.category || '未分类',
    pubDate: post.pubDate,
    updatedDate: post.updatedDate,
    tags: post.tags,
    draft: post.draft,
  };
}

function postToMarkdown(payload) {
  const data = {
    title: String(payload.title ?? '').trim() || '未命名文章',
    description: String(payload.description ?? '').trim(),
    category: String(payload.category ?? '').trim() || '未分类',
    pubDate: String(payload.pubDate ?? '').trim() || today(),
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    draft: payload.draft !== false,
  };

  const updatedDate = String(payload.updatedDate ?? '').trim();
  if (updatedDate) data.updatedDate = updatedDate;

  return matter.stringify(String(payload.body ?? '').trimStart(), data);
}

app.get('/api/posts', async (_req, res, next) => {
  try {
    const posts = await Promise.all((await listPostFiles()).map(readPost));
    posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
    res.json({ posts: posts.map(postSummary) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:id', async (req, res, next) => {
  try {
    res.json({ post: await readPost(req.params.id) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts', async (req, res, next) => {
  try {
    await ensureContentDir();
    const filename = normalizeFilename(req.body.filename);
    const target = postPath(filename);

    if (existsSync(target)) {
      res.status(409).json({ error: '同名文章文件已存在' });
      return;
    }

    await writeFile(target, postToMarkdown({ ...req.body, draft: req.body.draft ?? true }), 'utf8');
    res.status(201).json({ post: await readPost(filename) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:id', async (req, res, next) => {
  try {
    const filename = normalizeFilename(req.params.id);
    await ensureContentDir();
    await writeFile(postPath(filename), postToMarkdown(req.body), 'utf8');
    res.json({ post: await readPost(filename) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/taxonomy', async (_req, res, next) => {
  try {
    const posts = await Promise.all((await listPostFiles()).map(readPost));
    const categories = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    );
    const tags = [...new Set(posts.flatMap((post) => post.tags).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    );
    res.json({ categories, tags });
  } catch (error) {
    next(error);
  }
});

app.get('/api/context', (_req, res) => {
  res.json({
    rootDir,
    contentDir: relative(rootDir, contentDir),
    blogPreviewUrl: 'http://127.0.0.1:4321/',
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message ?? '编辑器服务异常' });
});

const vite = await createViteServer({
  root: join(editorDir, 'client'),
  server: { middlewareMode: true },
  appType: 'spa',
});

app.use(vite.middlewares);

app.listen(port, '127.0.0.1', () => {
  console.log(`Local blog editor: http://127.0.0.1:${port}/`);
  console.log(`Blog root: ${rootDir}`);
});
