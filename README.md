# sqkstt 的个人博客

这是我的个人技术博客，使用 Astro 构建，并通过 GitHub Pages 发布。

访问地址：<https://sqkstt.github.io/>

## 内容

- 首页：<https://sqkstt.github.io/>
- 分类：<https://sqkstt.github.io/categories/>
- 标签：<https://sqkstt.github.io/tags/>
- 关于：<https://sqkstt.github.io/about/>
- RSS：<https://sqkstt.github.io/rss.xml>

## 本地编辑博客

先安装依赖：

```sh
npm install
```

启动本地预览：

```sh
npm run dev
```

然后在浏览器打开终端里显示的地址，通常是：

```text
http://127.0.0.1:4321/
```

## 新增文章

在 `src/content/blog/` 目录中新建一个 Markdown 文件，例如：

```text
src/content/blog/my-first-post.md
```

文章格式：

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

这里写正文内容。
```

字段说明：

- `title`：文章标题
- `description`：文章摘要，会显示在列表和 RSS 中
- `category`：主分类，每篇文章一个
- `pubDate`：发布日期
- `updatedDate`：可选，更新日期
- `tags`：标签数组，可以写多个
- `draft`：是否草稿，`true` 不会发布到线上

## 更新并发布

写完文章后，先本地构建检查：

```sh
npm run build
```

确认没有报错后提交并推送：

```sh
git add .
git commit -m "Add new blog post"
git push
```

推送到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages。

## 修改分类和标签

分类和标签不需要提前创建。只要在文章 frontmatter 里写：

```md
category: "前端"
tags: ["Astro", "性能优化"]
```

发布后，博客会自动生成对应的分类页和标签页。
