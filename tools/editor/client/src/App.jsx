import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Calendar,
  Eye,
  FileText,
  Folder,
  List,
  Plus,
  Save,
  Search,
  X,
  Tag,
  UploadCloud,
} from 'lucide-react';
import './styles.css';

const emptyPost = () => ({
  id: '',
  filename: '',
  title: '',
  description: '',
  category: '',
  pubDate: new Date().toISOString().slice(0, 10),
  updatedDate: '',
  tags: [],
  draft: true,
  body: '',
});

function nextFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `post-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.md`;
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

function parseTags(value) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function ToolbarButton({ label, icon: Icon, onClick }) {
  return (
    <button className="toolbar-button" type="button" onClick={onClick} title={label} aria-label={label}>
      <Icon size={16} />
    </button>
  );
}

function App() {
  const [context, setContext] = useState({ rootDir: '', blogPreviewUrl: 'http://127.0.0.1:4321/' });
  const [posts, setPosts] = useState([]);
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [activeId, setActiveId] = useState('');
  const [post, setPost] = useState(emptyPost);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('write');
  const [status, setStatus] = useState('准备就绪');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  async function refreshPosts(selectId = activeId) {
    const [{ posts: nextPosts }, nextTaxonomy] = await Promise.all([
      requestJson('/api/posts'),
      requestJson('/api/taxonomy'),
    ]);
    setPosts(nextPosts);
    setTaxonomy(nextTaxonomy);

    if (selectId) {
      const selected = nextPosts.find((item) => item.id === selectId);
      if (selected) {
        await loadPost(selected.id);
      }
    }
  }

  async function loadPost(id) {
    const { post: nextPost } = await requestJson(`/api/posts/${encodeURIComponent(id)}`);
    setActiveId(id);
    setPost(nextPost);
    setStatus(`已打开 ${nextPost.filename}`);
  }

  useEffect(() => {
    async function boot() {
      try {
        const [nextContext, { posts: nextPosts }, nextTaxonomy] = await Promise.all([
          requestJson('/api/context'),
          requestJson('/api/posts'),
          requestJson('/api/taxonomy'),
        ]);
        setContext(nextContext);
        setPosts(nextPosts);
        setTaxonomy(nextTaxonomy);
        setStatus(nextPosts.length > 0 ? '请选择文章开始编辑' : '当前还没有文章，点击新建开始');
      } catch (error) {
        setStatus(error.message);
      }
    }

    boot();
  }, []);

  const filteredPosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return posts.filter((item) => {
      if (filter === 'draft' && !item.draft) return false;
      if (filter === 'published' && item.draft) return false;
      if (!keyword) return true;
      return [item.title, item.description, item.category, item.filename, item.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [filter, posts, query]);

  const tagText = post.tags.join(', ');

  function updatePost(field, value) {
    setPost((current) => ({ ...current, [field]: value }));
  }

  function insertMarkdown(before, after = '') {
    const textarea = document.querySelector('.body-editor');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = post.body.slice(start, end);
    const nextBody = `${post.body.slice(0, start)}${before}${selected || ''}${after}${post.body.slice(end)}`;
    updatePost('body', nextBody);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function createDraft() {
    const draft = {
      ...emptyPost(),
      filename: nextFilename(),
      category: taxonomy.categories[0] ?? '未分类',
      body: '## 小标题\n\n这里写正文内容。\n',
    };
    setActiveId('');
    setPost(draft);
    setMode('write');
    setStatus('正在创建新草稿');
  }

  async function openBlogPreview() {
    const previewWindow = window.open('about:blank', '_blank');
    try {
      setStatus('正在启动博客预览...');
      const result = await requestJson('/api/preview', { method: 'POST' });
      if (previewWindow) {
        previewWindow.location.href = result.url;
      } else {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
      setStatus(result.started ? '博客预览已启动' : '博客预览已打开');
    } catch (error) {
      previewWindow?.close();
      setStatus(error.message);
    }
  }

  function addCategory() {
    const nextCategory = categoryDraft.trim();
    if (!nextCategory) return;
    updatePost('category', nextCategory);
    setTaxonomy((current) => ({
      ...current,
      categories: [...new Set([...current.categories, nextCategory])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    }));
    setCategoryDraft('');
  }

  function addTag(value = tagDraft) {
    const nextTag = value.trim();
    if (!nextTag) return;
    updatePost('tags', [...new Set([...post.tags, nextTag])]);
    setTaxonomy((current) => ({
      ...current,
      tags: [...new Set([...current.tags, nextTag])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    }));
    setTagDraft('');
  }

  function removeTag(tag) {
    updatePost(
      'tags',
      post.tags.filter((current) => current !== tag),
    );
  }

  async function savePost() {
    try {
      setStatus('保存中...');
      const filename = post.filename || nextFilename();
      const payload = { ...post, filename };
      const result = activeId
        ? await requestJson(`/api/posts/${encodeURIComponent(activeId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await requestJson('/api/posts', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      setActiveId(result.post.id);
      setPost(result.post);
      await refreshPosts(result.post.id);
      setStatus('已保存到 src/content/blog/');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <>
      <div className="editor-space-bg" aria-hidden="true">
        <span className="meteor meteor-one"></span>
        <span className="meteor meteor-two"></span>
        <span className="meteor meteor-three"></span>
        <span className="meteor meteor-four"></span>
        <span className="meteor meteor-five"></span>
        <span className="meteor meteor-six"></span>
        <span className="editor-owl"></span>
      </div>
      <div className="app-shell">
        <header className="topbar">
        <div>
          <div className="app-title">本地博客编辑器</div>
          <div className="path-label">{context.rootDir || 'D:\\MyCode\\Blog'}</div>
        </div>
        <div className="top-actions">
          <button className="ghost-button" type="button" onClick={openBlogPreview}>
            <Eye size={16} />
            预览博客
          </button>
          <button className="ghost-button" type="button" title="保存后运行 git add、commit、push 发布">
            <UploadCloud size={16} />
            推送提醒
          </button>
          <button className="primary-button" type="button" onClick={savePost}>
            <Save size={16} />
            保存文章
          </button>
        </div>
        </header>

        <aside className="sidebar">
        <div className="sidebar-header">
          <h2>文章</h2>
          <button className="icon-button" type="button" onClick={createDraft} title="新建文章" aria-label="新建文章">
            <Plus size={18} />
          </button>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、分类、标签" />
        </label>
        <div className="segmented">
          {[
            ['all', '全部'],
            ['draft', '草稿'],
            ['published', '已发布'],
          ].map(([value, label]) => (
            <button className={filter === value ? 'active' : ''} key={value} type="button" onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="post-list">
          {filteredPosts.length > 0 ? (
            filteredPosts.map((item) => (
              <button
                className={`post-row ${item.id === activeId ? 'selected' : ''}`}
                key={item.id}
                type="button"
                onClick={() => loadPost(item.id)}
              >
                <span className="row-title">{item.title}</span>
                <span className="row-meta">
                  {item.category} · {item.pubDate}
                </span>
                <span className={item.draft ? 'status-pill draft' : 'status-pill published'}>
                  {item.draft ? '草稿' : '已发布'}
                </span>
              </button>
            ))
          ) : (
            <div className="empty-panel">没有匹配的文章。</div>
          )}
        </div>
        </aside>

        <main className="editor-main">
        <div className="title-fields">
          <input
            className="title-input"
            value={post.title}
            onChange={(event) => updatePost('title', event.target.value)}
            placeholder="文章标题"
          />
          <textarea
            className="summary-input"
            value={post.description}
            onChange={(event) => updatePost('description', event.target.value)}
            placeholder="文章摘要，会显示在首页、RSS 和分享信息里"
          />
        </div>

        <div className="editor-card">
          <div className="editor-tabs">
            <div className="toolbar">
              <ToolbarButton label="二级标题" icon={FileText} onClick={() => insertMarkdown('## ')} />
              <ToolbarButton label="加粗" icon={List} onClick={() => insertMarkdown('**', '**')} />
              <ToolbarButton label="链接" icon={Eye} onClick={() => insertMarkdown('[链接文字](', ')')} />
              <ToolbarButton label="代码块" icon={FileText} onClick={() => insertMarkdown('```ts\n', '\n```')} />
              <ToolbarButton label="列表" icon={List} onClick={() => insertMarkdown('- ')} />
            </div>
            <div className="mode-tabs">
              <button className={mode === 'write' ? 'active' : ''} type="button" onClick={() => setMode('write')}>
                编写
              </button>
              <button className={mode === 'preview' ? 'active' : ''} type="button" onClick={() => setMode('preview')}>
                预览
              </button>
            </div>
          </div>
          {mode === 'write' ? (
            <textarea
              className="body-editor"
              value={post.body}
              onChange={(event) => updatePost('body', event.target.value)}
              placeholder="在这里写正文。可以使用 Markdown，也可以用上方按钮快速插入格式。"
            />
          ) : (
            <article className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body || '还没有正文内容。'}</ReactMarkdown>
            </article>
          )}
        </div>
        </main>

        <aside className="inspector">
        <h2>文章设置</h2>
        <label className="field">
          <span>
            <Folder size={15} />
            分类
          </span>
          <input
            list="categories"
            value={post.category}
            onChange={(event) => updatePost('category', event.target.value)}
            placeholder="例如：工程实践"
          />
          <datalist id="categories">
            {taxonomy.categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
        <div className="quick-add">
          <input
            value={categoryDraft}
            onChange={(event) => setCategoryDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addCategory();
            }}
            placeholder="新增分类"
          />
          <button type="button" onClick={addCategory}>
            添加
          </button>
        </div>
        <div className="choice-section">
          <div className="choice-title">点击选择分类</div>
          <div className="chip-shelf">
            {taxonomy.categories.length > 0 ? (
              taxonomy.categories.map((category) => (
                <button
                  className={`chip ${post.category === category ? 'selected' : ''}`}
                  key={category}
                  type="button"
                  onClick={() => updatePost('category', category)}
                >
                  {category}
                </button>
              ))
            ) : (
              <span className="choice-empty">还没有分类，先添加一个。</span>
            )}
          </div>
        </div>
        <label className="field">
          <span>
            <Tag size={15} />
            标签
          </span>
          <input value={tagText} onChange={(event) => updatePost('tags', parseTags(event.target.value))} placeholder="已选标签，可用逗号编辑" />
        </label>
        <div className="selected-tags">
          {post.tags.length > 0 ? (
            post.tags.map((tag) => (
              <button className="selected-tag" key={tag} type="button" onClick={() => removeTag(tag)} title="移除标签">
                {tag}
                <X size={12} />
              </button>
            ))
          ) : (
            <span>还没有选中标签。</span>
          )}
        </div>
        <div className="quick-add">
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addTag();
            }}
            placeholder="新增标签"
          />
          <button type="button" onClick={() => addTag()}>
            添加
          </button>
        </div>
        <div className="choice-section">
          <div className="choice-title">点击添加已有标签</div>
          <div className="chip-shelf">
            {taxonomy.tags.length > 0 ? (
              taxonomy.tags.map((tag) => (
                <button
                  className={`chip ${post.tags.includes(tag) ? 'selected' : ''}`}
                  key={tag}
                  type="button"
                  onClick={() => (post.tags.includes(tag) ? removeTag(tag) : addTag(tag))}
                >
                  {tag}
                </button>
              ))
            ) : (
              <span className="choice-empty">还没有标签，先添加一个。</span>
            )}
          </div>
        </div>
        <label className="field">
          <span>
            <Calendar size={15} />
            发布日期
          </span>
          <input type="date" value={post.pubDate} onChange={(event) => updatePost('pubDate', event.target.value)} />
        </label>
        <label className="field">
          <span>
            <Calendar size={15} />
            更新日期
          </span>
          <input type="date" value={post.updatedDate} onChange={(event) => updatePost('updatedDate', event.target.value)} />
        </label>
        <label className="field">
          <span>
            <FileText size={15} />
            文件名
          </span>
          <input value={post.filename} onChange={(event) => updatePost('filename', event.target.value)} placeholder="post-20260602-1530.md" />
        </label>
        <label className="switch-row">
          <span>草稿模式</span>
          <input type="checkbox" checked={post.draft} onChange={(event) => updatePost('draft', event.target.checked)} />
        </label>
        <div className="save-state">{status}</div>
        </aside>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
