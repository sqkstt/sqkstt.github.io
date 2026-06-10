import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ExternalLink,
  Eye,
  FileText,
  Folder,
  GitBranch,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Tag,
} from 'lucide-react';
import MarkdownEditor from './MarkdownEditor.jsx';
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

function App() {
  const [context, setContext] = useState({ rootDir: '', blogPreviewUrl: 'http://127.0.0.1:4321/' });
  const [posts, setPosts] = useState([]);
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [activeId, setActiveId] = useState('');
  const [post, setPost] = useState(emptyPost);
  const [filter, setFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('准备就绪');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [commitLog, setCommitLog] = useState([]);
  const [gitStatus, setGitStatus] = useState({ branch: '', ahead: 0, behind: 0, staged: [], unstaged: [] });
  const [wordCount, setWordCount] = useState(0);
  const [readingTime, setReadingTime] = useState(0);
  const savedBodyRef = useRef('');
  const wysiwygEditorRef = useRef(null);

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
    clearDeleteConfirm();
    setStatus(`已打开 ${nextPost.filename}`);
    // Fetch git log for this file
    try {
      const { entries } = await requestJson(`/api/git/log/${encodeURIComponent(id)}`);
      setCommitLog(entries || []);
    } catch {
      setCommitLog([]);
    }
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

  // Refresh current post from disk (called when returning from Typora)
  async function refreshCurrentPost() {
    if (!activeId) return;
    try {
      const { post: fresh } = await requestJson(`/api/posts/${encodeURIComponent(activeId)}`);
      setPost(fresh);
      savedBodyRef.current = fresh.body;
      setStatus('已刷新');
    } catch (error) {
      // ignore
    }
  }

  // Auto-refresh when user returns from Typora (window gets focus)
  useEffect(() => {
    function onFocus() {
      if (activeId) refreshCurrentPost();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeId]);

  // Save frontmatter (not body — body is managed by Typora)
  const saveMetaTimerRef = useRef(null);
  const lastMetaRef = useRef('');

  useEffect(() => {
    if (!activeId) return;
    const metaKey = JSON.stringify({
      title: post.title, description: post.description, category: post.category,
      tags: post.tags, pubDate: post.pubDate, updatedDate: post.updatedDate,
      draft: post.draft, filename: post.filename,
    });
    if (metaKey === lastMetaRef.current) return;

    clearTimeout(saveMetaTimerRef.current);
    saveMetaTimerRef.current = setTimeout(async () => {
      try {
        // Only save frontmatter — preserve body from disk
        const { post: current } = await requestJson(`/api/posts/${encodeURIComponent(activeId)}`);
        const payload = { ...post, body: current.body };
        await requestJson(`/api/posts/${encodeURIComponent(activeId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        lastMetaRef.current = metaKey;
        setStatus('已保存文章设置');
        const { posts: nextPosts } = await requestJson('/api/posts');
        setPosts(nextPosts);
      } catch (error) {
        setStatus(`保存设置失败: ${error.message}`);
      }
    }, 800);

    return () => clearTimeout(saveMetaTimerRef.current);
  }, [activeId, post.title, post.description, post.category, post.tags, post.pubDate, post.updatedDate, post.draft, post.filename]);

  // Word count
  useEffect(() => {
    const text = post.body || '';
    const chineseChars = (text.match(/[一-鿿＀-￯]/g) || []).length;
    const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
    const total = chineseChars + words;
    setWordCount(total);
    setReadingTime(Math.max(1, Math.ceil(total / 400)));
  }, [post.body]);

  // Fetch git status
  const refreshGitStatus = useCallback(async () => {
    try {
      const s = await requestJson('/api/git/status');
      setGitStatus(s);
    } catch {
      // offline or not a repo
    }
  }, []);

  useEffect(() => {
    refreshGitStatus();
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return posts.filter((item) => {
      if (filter === 'draft' && !item.draft) return false;
      if (filter === 'published' && item.draft) return false;
      if (scopeFilter === 'local' && item.git?.state === 'submitted') return false;
      if (scopeFilter === 'submitted' && item.git?.state !== 'submitted') return false;
      if (!keyword) return true;
      return [item.title, item.description, item.category, item.filename, item.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [filter, posts, query, scopeFilter]);

  const tagText = post.tags.join(', ');

  function updatePost(field, value) {
    setPost((current) => ({ ...current, [field]: value }));
  }

  function clearDeleteConfirm() {
    setDeleteOpen(false);
    setDeleteConfirm('');
  }

  function createDraft() {
    const draft = {
      ...emptyPost(),
      filename: nextFilename(),
      category: taxonomy.categories[0] ?? '未分类',
      body: '## 小标题\n\n这里写正文内容。\n',
    };
    savedBodyRef.current = draft.body;
    setActiveId('');
    setPost(draft);
    clearDeleteConfirm();
    setStatus('正在创建新草稿，请用 Typora 编辑');
  }

  async function openInTypora() {
    if (!activeId) {
      setStatus('请先选择一篇文章');
      return;
    }
    try {
      setStatus(`正在用外部编辑器打开 ${post.filename}...`);
      await requestJson(`/api/open-external/${encodeURIComponent(activeId)}`, { method: 'POST' });
      setStatus(`已在外部编辑器中打开 ${post.filename}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function openBlogPreview() {
    const previewWindow = window.open('about:blank', '_blank');
    try {
      setStatus('正在启动博客预览...');
      const result = await requestJson('/api/preview', { method: 'POST' });
      // If a post is selected, preview it directly
      const slug = activeId ? activeId.replace(/\.md$/, '') : '';
      const articlePath = slug ? `/blog/${encodeURIComponent(slug)}/` : '';
      const base = result.url.replace(/\/+$/, '');
      const url = articlePath ? `${base}${articlePath}` : result.url;
      if (previewWindow) {
        previewWindow.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
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

  async function deletePost() {
    if (!activeId || deleteConfirm !== post.filename) return;

    try {
      setStatus('正在删除文章...');
      const deletedTitle = post.title || post.filename;
      await requestJson(`/api/posts/${encodeURIComponent(activeId)}`, { method: 'DELETE' });
      setActiveId('');
      setPost(emptyPost());
      clearDeleteConfirm();
      await refreshPosts('');
      setStatus(`已删除 ${deletedTitle}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleCommit() {
    const message = post.title || post.filename;
    try {
      setCommitting(true);
      setStatus('正在提交...');
      const result = await requestJson('/api/git/commit', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      if (result.info) {
        setStatus(result.info);
      } else {
        setStatus('已提交到本地仓库');
      }
      await refreshGitStatus();
      await refreshPosts('');
      // Refresh commit log
      if (activeId) {
        try {
          const { entries } = await requestJson(`/api/git/log/${encodeURIComponent(activeId)}`);
          setCommitLog(entries || []);
        } catch {}
      }
    } catch (error) {
      setStatus(`提交失败: ${error.message}`);
    } finally {
      setCommitting(false);
    }
  }

  async function handleBatchDraft(targetDraft) {
    if (selectedIds.size === 0) return;
    try {
      setStatus('正在批量更新...');
      for (const id of selectedIds) {
        const { post: current } = await requestJson(`/api/posts/${encodeURIComponent(id)}`);
        const payload = { ...current, draft: targetDraft };
        await requestJson(`/api/posts/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      setSelectedIds(new Set());
      setBatchMode(false);
      setStatus(`已${targetDraft ? '撤回' : '发布'} ${selectedIds.size} 篇文章（仅本地，需提交推送同步远端）`);
      await refreshPosts(activeId);
    } catch (error) {
      setStatus(`批量操作失败: ${error.message}`);
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePush() {
    try {
      setPushing(true);
      setStatus('正在推送...');
      const result = await requestJson('/api/git/push', { method: 'POST' });
      if (result.info) {
        setStatus(result.info);
      } else {
        setStatus('已推送到 GitHub');
      }
      await refreshGitStatus();
      await refreshPosts('');
    } catch (error) {
      setStatus(`推送失败: ${error.message}`);
    } finally {
      setPushing(false);
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
        <span className="meteor meteor-seven"></span>
        <span className="meteor meteor-eight"></span>
        <span className="meteor meteor-nine"></span>
        <span className="meteor meteor-ten meteor-pink"></span>
        <span className="meteor meteor-eleven meteor-violet"></span>
        <span className="meteor meteor-twelve meteor-short"></span>
      </div>
      <div className="app-shell">
        <header className="topbar">
        <div>
          <div className="app-title">本地博客编辑器</div>
          <div className="path-label">{context.rootDir || 'D:\\MyCode\\Blog'}</div>
        </div>
        <div className="top-actions">
          <button
            className={`ghost-button ${batchMode ? 'batch-active' : ''}`}
            type="button"
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
          >
            批量操作
          </button>
          <button className="ghost-button" type="button" onClick={openBlogPreview}>
            <Eye size={16} />
            预览博客
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={openInTypora}
            title="用系统默认 Markdown 编辑器（如 Typora）打开当前文章"
          >
            <ExternalLink size={16} />
            Typora 编辑
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
        {batchMode && (
          <div className="batch-bar">
            <span>{selectedIds.size > 0 ? `${selectedIds.size} 篇选中` : '勾选文章后批量操作'}</span>
            <div className="batch-actions">
              <button
                className="batch-btn publish"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => handleBatchDraft(false)}
              >
                发布
              </button>
              <button
                className="batch-btn unpublish"
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => handleBatchDraft(true)}
              >
                撤回
              </button>
            </div>
          </div>
        )}
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
        <div className="segmented scope-segmented">
          {[
            ['all', '全部来源'],
            ['local', '本地'],
            ['submitted', '已提交'],
          ].map(([value, label]) => (
            <button className={scopeFilter === value ? 'active' : ''} key={value} type="button" onClick={() => setScopeFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="post-list">
          {filteredPosts.length > 0 ? (
            filteredPosts.map((item) => (
              <button
                className={`post-row ${item.id === activeId ? 'selected' : ''} ${batchMode ? 'has-check' : ''}`}
                key={item.id}
                type="button"
                onClick={() => batchMode ? toggleSelect(item.id) : loadPost(item.id)}
              >
                {batchMode && (
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div>
                <span className="row-title">{item.title}</span>
                <span className="row-meta">
                  {item.category} · {item.pubDate}
                </span>
                <span className={item.draft ? 'status-pill draft' : 'status-pill published'}>
                  {item.draft ? '草稿' : '已发布'}
                </span>
                <span className={`git-pill ${item.git?.state === 'submitted' ? 'submitted' : 'local'}`}>
                  {item.git?.label ?? '本地'}
                </span>
                </div>
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
          <div className="wysiwyg-wrapper">
            <MarkdownEditor
              ref={wysiwygEditorRef}
              content={post.body}
              onChange={() => {}}
              placeholder="选择左侧文章后在此预览，点击顶部「Typora 编辑」进行修改"
            />
          </div>
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
            <FileText size={15} />
            文件名
          </span>
          <input value={post.filename} onChange={(event) => updatePost('filename', event.target.value)} placeholder="post-20260602-1530.md" />
        </label>
        {activeId && (
          <div className="danger-zone">
            <div className="danger-head">
              <Trash2 size={15} />
              <span>删除文章</span>
            </div>
            <p>
              删除会移除本地 Markdown 文件。若文章已经提交，删除后还需要再次提交并推送，线上博客才会同步移除。
            </p>
            {!deleteOpen ? (
              <button className="danger-button" type="button" onClick={() => setDeleteOpen(true)}>
                删除这篇文章
              </button>
            ) : (
              <div className="delete-confirm">
                <span>二次确认：输入完整文件名</span>
                <code>{post.filename}</code>
                <input
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="输入完整文件名后才能删除"
                />
                <div className="delete-actions">
                  <button className="ghost-button compact-button" type="button" onClick={clearDeleteConfirm}>
                    取消
                  </button>
                  <button
                    className="danger-button compact-button"
                    type="button"
                    disabled={deleteConfirm !== post.filename}
                    onClick={deletePost}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <label className="switch-row">
          <span>草稿模式</span>
          <input type="checkbox" checked={post.draft} onChange={(event) => updatePost('draft', event.target.checked)} />
        </label>
        <div className={`draft-notice ${post.draft ? 'is-draft' : 'is-public'}`}>
          {post.draft
            ? '此文章为草稿，不会出现在公开博客中'
            : '此文章已发布，公开可见'}
        </div>
        {activeId && (
          <>
            <div className="commit-section">
              <div className="commit-head">
                <GitBranch size={14} />
                <span>{gitStatus.branch || 'main'}</span>
                {gitStatus.ahead > 0 && <span className="git-ahead">领先 {gitStatus.ahead}</span>}
                {gitStatus.behind > 0 && <span className="git-behind">落后 {gitStatus.behind}</span>}
              </div>
              <div className="commit-actions">
                <button
                  className="commit-btn commit-local"
                  type="button"
                  disabled={committing}
                  onClick={handleCommit}
                >
                  {committing ? '提交中...' : '本地提交'}
                </button>
                <button
                  className="commit-btn commit-remote"
                  type="button"
                  disabled={pushing}
                  onClick={handlePush}
                >
                  {pushing ? '推送中...' : '推送 GitHub'}
                </button>
              </div>
            </div>

            {commitLog.length > 0 && (
              <div className="changelog-section">
                <div className="changelog-head">变更记录</div>
                <div className="changelog-list">
                  {commitLog.map((entry) => (
                    <div className="changelog-item" key={entry.hash} title={entry.message}>
                      <code className="changelog-hash">{entry.hash}</code>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="outline-section">
          <div className="outline-head">
            <ListTree size={15} />
            <span>文档大纲</span>
            <span className="outline-count">{wordCount} 字 · {readingTime} 分钟</span>
          </div>
          <div className="outline-list">
            {(() => {
              const headings = [];
              const re = /^(#{1,3})\s+(.+)$/gm;
              let match;
              const text = post.body;
              while ((match = re.exec(text)) !== null) {
                headings.push({ level: match[1].length, text: match[2].trim(), pos: match.index });
              }
              if (headings.length === 0) return <span className="outline-empty">暂无标题</span>;
              return headings.map((h, i) => (
                <button
                  className={`outline-item level-${h.level}`}
                  key={i}
                  type="button"
                  onClick={() => {
                    const wrapper = document.querySelector('.wysiwyg-wrapper');
                    if (!wrapper) return;
                    // Find the nth heading element in the DOM
                    const headingEls = wrapper.querySelectorAll('h1, h2, h3');
                    if (headingEls[i]) {
                      headingEls[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                >
                  {h.text}
                </button>
              ));
            })()}
          </div>
        </div>

        <div className="save-state">{status}</div>
        </aside>
      </div>

    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
