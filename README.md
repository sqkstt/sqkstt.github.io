# 中文技术博客

基于 Astro 的个人技术博客模板，适合部署到 `<github-username>.github.io` GitHub Pages 仓库。

## 功能

- Markdown 内容集合：`src/content/blog/`
- 首页文章列表、文章详情、分类页、标签页、关于页
- RSS：`/rss.xml`
- Sitemap：`/sitemap-index.xml`
- GitHub Actions 自动构建并发布到 GitHub Pages
- 浅色中文阅读排版、代码高亮和移动端适配

## 本地开发

```sh
npm install
npm run dev
```

生产构建：

```sh
npm run build
```

## 写文章

在 `src/content/blog/` 新建 Markdown 文件：

```md
---
title: "文章标题"
description: "文章摘要"
category: "工程实践"
pubDate: 2026-06-01
updatedDate: 2026-06-02
tags: ["Astro", "博客"]
draft: false
---

正文内容。
```

每篇文章使用一个 `category` 作为主分类，并用 `tags` 补充更细的主题。`draft: true` 的文章不会出现在生产页面、RSS 或 sitemap 中。

## 部署

1. 将仓库命名为 `sqkstt.github.io`。
2. 推送到 `main` 分支。
3. 在 GitHub 仓库设置中启用 Pages，并选择 GitHub Actions 作为发布来源。

Actions 构建时会把 `SITE_URL` 设置为 `https://sqkstt.github.io`。如果使用自定义域名，请同步修改 workflow 环境变量，并新增 `public/CNAME`。
