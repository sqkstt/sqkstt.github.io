import express from 'express';
import matter from 'gray-matter';
import { createServer as createViteServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const rootDir = process.cwd();
const editorDir = fileURLToPath(new URL('.', import.meta.url));
const contentDir = resolve(rootDir, 'src/content/blog');
const port = Number(process.env.EDITOR_PORT ?? 4322);
const blogPreviewUrl = 'http://127.0.0.1:4321/';
const execFileAsync = promisify(execFile);
let previewProcess;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/assets', express.static(resolve(rootDir, 'public/assets')));

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

async function isUrlReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReady(url)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }

  return false;
}

async function ensureBlogPreview() {
  if (await isUrlReady(blogPreviewUrl)) {
    return { url: blogPreviewUrl, started: false };
  }

  if (!previewProcess || previewProcess.exitCode !== null) {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1']
        : ['run', 'dev', '--', '--host', '127.0.0.1'];

    previewProcess = spawn(command, args, {
      cwd: rootDir,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });

    previewProcess.unref();
  }

  const ready = await waitForUrl(blogPreviewUrl);
  if (!ready) {
    throw new Error('博客预览服务启动超时，请在终端运行 npm run dev 查看错误');
  }

  return { url: blogPreviewUrl, started: true };
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

async function getContentGitStatusMap() {
  const statusMap = new Map();

  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-z', '--', 'src/content/blog'], {
      cwd: rootDir,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const entries = stdout.split('\0').filter(Boolean);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const code = entry.slice(0, 2);
      const file = entry.slice(3);

      if (code.startsWith('R') || code.startsWith('C')) {
        index += 1;
      }

      if (!file.endsWith('.md')) continue;
      const filename = file.replace(/\\/g, '/').split('/').pop();
      if (!filename) continue;

      let state = 'local-modified';
      let label = '本地修改';
      if (code === '??') {
        state = 'local-new';
        label = '本地新增';
      } else if (code.includes('D')) {
        state = 'local-deleted';
        label = '本地删除';
      }

      statusMap.set(filename, { state, label });
    }
  } catch {
    return statusMap;
  }

  return statusMap;
}

async function isTracked(filename) {
  try {
    await execFileAsync('git', ['ls-files', '--error-unmatch', `src/content/blog/${filename}`], {
      cwd: rootDir,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function enrichPostStatus(post, statusMap) {
  if (statusMap.has(post.filename)) {
    return { ...post, git: statusMap.get(post.filename) };
  }

  if (await isTracked(post.filename)) {
    return { ...post, git: { state: 'submitted', label: '已提交' } };
  }

  return { ...post, git: { state: 'local-new', label: '本地新增' } };
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
    git: post.git ?? { state: 'unknown', label: '状态未知' },
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
    const statusMap = await getContentGitStatusMap();
    const posts = await Promise.all((await listPostFiles()).map(async (file) => enrichPostStatus(await readPost(file), statusMap)));
    posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
    res.json({ posts: posts.map(postSummary) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:id', async (req, res, next) => {
  try {
    const statusMap = await getContentGitStatusMap();
    res.json({ post: await enrichPostStatus(await readPost(req.params.id), statusMap) });
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
    const statusMap = await getContentGitStatusMap();
    res.status(201).json({ post: await enrichPostStatus(await readPost(filename), statusMap) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:id', async (req, res, next) => {
  try {
    const filename = normalizeFilename(req.params.id);

    // Auto-manage dates
    const body = { ...req.body };
    const currentPost = existsSync(postPath(filename))
      ? normalizePost(filename, matter(await readFile(postPath(filename), 'utf8')))
      : null;

    // pubDate: set on first publish (draft -> false transition), never overwrite
    if (currentPost && currentPost.draft && body.draft === false) {
      body.pubDate = today();
    }
    // If no existing pubDate, use today
    if (!body.pubDate && !currentPost?.pubDate) {
      body.pubDate = today();
    }

    // updatedDate: always set to today when saving
    body.updatedDate = today();

    await ensureContentDir();
    await writeFile(postPath(filename), postToMarkdown(body), 'utf8');
    const statusMap = await getContentGitStatusMap();
    res.json({ post: await enrichPostStatus(await readPost(filename), statusMap) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:id', async (req, res, next) => {
  try {
    const filename = normalizeFilename(req.params.id);
    const target = postPath(filename);

    if (!existsSync(target)) {
      res.status(404).json({ error: '文章文件不存在或已经删除' });
      return;
    }

    await unlink(target);
    res.json({ deleted: true, filename });
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
    blogPreviewUrl,
  });
});

app.post('/api/open-external/:id', async (req, res, next) => {
  try {
    const target = postPath(normalizeFilename(req.params.id));
    if (!existsSync(target)) {
      return res.status(404).json({ error: '文章文件不存在' });
    }

    const abs = resolve(target);
    const platform = process.platform;
    const command = platform === 'win32' ? 'cmd.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
    const args = platform === 'win32' ? ['/c', 'start', '', abs] : [abs];

    spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
    res.json({ opened: true, path: abs });
  } catch (error) {
    next(error);
  }
});

app.post('/api/preview', async (_req, res, next) => {
  try {
    res.json(await ensureBlogPreview());
  } catch (error) {
    next(error);
  }
});

app.get('/api/git/status', async (_req, res, next) => {
  try {
    const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: rootDir,
      windowsHide: true,
    });
    const branch = branchOut.trim();

    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
      cwd: rootDir,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    const files = statusOut.split('\0').filter(Boolean);
    const staged = [];
    const unstaged = [];
    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      const code = entry.slice(0, 2);
      const file = entry.slice(3);
      if (code.startsWith('R') || code.startsWith('C')) i++;
      const icon = code.includes('D') ? 'D' : code.includes('A') ? 'A' : code.includes('?') ? '?' : 'M';
      const target = { file, icon };
      if (code[0] !== ' ' && code[1] !== '?') staged.push(target);
      if (code[1] !== ' ' || code.includes('??')) unstaged.push(target);
    }

    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: remoteOut } = await execFileAsync(
        'git',
        ['rev-list', '--left-right', '--count', `${branch}...@{u}`],
        { cwd: rootDir, windowsHide: true },
      );
      const parts = remoteOut.trim().split(/\s+/);
      ahead = Number(parts[0]) || 0;
      behind = Number(parts[1]) || 0;
    } catch {
      // no upstream configured
    }

    res.json({ branch, ahead, behind, staged, unstaged });
  } catch (error) {
    next(error);
  }
});

app.post('/api/git/commit', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: '提交信息不能为空' });
    }

    // Stage only blog content
    await execFileAsync('git', ['add', 'src/content/blog/'], { cwd: rootDir, windowsHide: true });

    let commitResult = '';
    try {
      const { stdout } = await execFileAsync('git', ['commit', '-m', message.trim()], {
        cwd: rootDir,
        windowsHide: true,
      });
      commitResult = stdout.trim();
    } catch (commitErr) {
      const stderr = (commitErr.stderr || '').trim();
      if (stderr.includes('nothing to commit') || stderr.includes('nothing added')) {
        return res.json({ info: '没有需要提交的更改' });
      }
      throw commitErr;
    }

    res.json({ success: true, commit: commitResult });
  } catch (error) {
    next(error);
  }
});

app.get('/api/git/log/:id', async (req, res, next) => {
  try {
    const filename = normalizeFilename(req.params.id);
    const filepath = `src/content/blog/${filename}`;

    const { stdout } = await execFileAsync(
      'git',
      ['log', '--oneline', '--follow', '-15', '--', filepath],
      { cwd: rootDir, windowsHide: true },
    );

    const entries = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split(' ');
        return { hash: hash.slice(0, 7), message: rest.join(' ') };
      });

    res.json({ entries });
  } catch {
    res.json({ entries: [] });
  }
});

app.post('/api/git/push', async (_req, res, next) => {
  try {
    const { stdout: pushOut } = await execFileAsync('git', ['push'], {
      cwd: rootDir,
      windowsHide: true,
    });
    res.json({ success: true, push: pushOut.trim() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/upload-image', async (req, res, next) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: '缺少文件名或图片数据' });
    }

    const imagesDir = resolve(contentDir, 'images');
    await mkdir(imagesDir, { recursive: true });

    const safeName = filename.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
    const buffer = Buffer.from(data, 'base64');
    const target = resolve(imagesDir, safeName);

    if (existsSync(target)) {
      const ext = extname(safeName);
      const base = safeName.slice(0, safeName.length - ext.length);
      const ts = Date.now();
      const altName = `${base}-${ts}${ext}`;
      await writeFile(resolve(imagesDir, altName), buffer);
      return res.json({ path: `./images/${altName}` });
    }

    await writeFile(target, buffer);
    res.json({ path: `./images/${safeName}` });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message ?? '编辑器服务异常' });
});

const vite = await createViteServer({
  root: join(editorDir, 'client'),
  cacheDir: resolve(rootDir, '.astro/editor-vite'),
  server: { middlewareMode: true },
  appType: 'spa',
});

app.use(vite.middlewares);

app.listen(port, '127.0.0.1', () => {
  console.log(`Local blog editor: http://127.0.0.1:${port}/`);
  console.log(`Blog root: ${rootDir}`);
});
