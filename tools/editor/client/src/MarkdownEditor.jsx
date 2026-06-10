import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import { common, createLowlight } from 'lowlight';
import { marked } from 'marked';
import 'highlight.js/styles/atom-one-dark.css';

const lowlight = createLowlight(common);

// Register additional languages that aren't in lowlight's "common" set
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
lowlight.register('cpp', cpp);
lowlight.register('java', java);
lowlight.register('bash', bash);
lowlight.register('json', json);
lowlight.register('yaml', yaml);
lowlight.register('sql', sql);
lowlight.register('markdown', markdown);

// ---------- Markdown ↔ HTML converters ----------

function htmlToMarkdown(html) {
  if (!html || html === '<p></p>') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let md = '';
  const nodes = Array.from(doc.body.childNodes);

  function processList(listEl, ordered, indent = '') {
    let result = '';
    const items = listEl.querySelectorAll(':scope > li');
    let num = 1;
    items.forEach((li) => {
      const prefix = ordered ? `${num}. ` : '- ';
      num++;

      // Get direct text content (not nested lists)
      let text = '';
      const nestedLists = [];
      for (const child of li.childNodes) {
        if (child.nodeType === 3) {
          text += child.textContent;
        } else if (child.nodeName === 'UL') {
          nestedLists.push({ el: child, ordered: false });
        } else if (child.nodeName === 'OL') {
          nestedLists.push({ el: child, ordered: true });
        } else if (child.nodeName === 'P') {
          text += inlineToMd(child.innerHTML);
        } else if (child.nodeName === 'STRONG') {
          text += `**${child.textContent}**`;
        } else if (child.nodeName === 'EM') {
          text += `*${child.textContent}*`;
        } else if (child.nodeName === 'CODE') {
          text += `\`${child.textContent}\``;
        } else if (child.nodeName === 'A') {
          text += `[${child.textContent}](${child.getAttribute('href')})`;
        } else if (child.nodeName === 'DEL') {
          text += `~~${child.textContent}~~`;
        } else {
          text += child.textContent || '';
        }
      }

      // Task list detection
      const taskMatch = text.match(/^\[([ xX])\]\s*(.*)/);
      if (taskMatch && !ordered) {
        result += `${indent}- [${taskMatch[1]}] ${taskMatch[2]}\n`;
      } else {
        result += `${indent}${prefix}${text.trim()}\n`;
      }

      nestedLists.forEach((nl) => {
        result += processList(nl.el, nl.ordered, `${indent}  `);
      });
    });
    return result + '\n';
  }

  function blockToMd(el) {
    const name = el.nodeName;
    if (name === 'P') {
      const img = el.querySelector('img');
      if (img && el.childNodes.length === 1) {
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        return `![${alt}](${src})\n\n`;
      }
      return `${inlineToMd(el.innerHTML)}\n\n`;
    }
    if (name === 'H1') return `# ${el.textContent.trim()}\n\n`;
    if (name === 'H2') return `## ${el.textContent.trim()}\n\n`;
    if (name === 'H3') return `### ${el.textContent.trim()}\n\n`;
    if (name === 'H4') return `#### ${el.textContent.trim()}\n\n`;
    if (name === 'H5') return `##### ${el.textContent.trim()}\n\n`;
    if (name === 'H6') return `###### ${el.textContent.trim()}\n\n`;
    if (name === 'BLOCKQUOTE') {
      const lines = el.textContent.trim().split('\n');
      return lines.map((l) => `> ${l}`).join('\n') + '\n\n';
    }
    if (name === 'UL') return processList(el, false);
    if (name === 'OL') return processList(el, true);
    if (name === 'PRE') {
      const code = el.querySelector('code');
      const langMatch = code?.className?.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';
      const content = code?.textContent || el.textContent;
      return `\`\`\`${lang}\n${content.trim()}\n\`\`\`\n\n`;
    }
    if (name === 'HR') return '---\n\n';
    if (name === 'TABLE') {
      const rows = el.querySelectorAll('tr');
      let table = '';
      rows.forEach((row, ri) => {
        const cells = row.querySelectorAll('th, td');
        const cellContents = Array.from(cells).map((c) => c.textContent.trim());
        table += `| ${cellContents.join(' | ')} |\n`;
        if (ri === 0) {
          table += `| ${cellContents.map(() => '---').join(' | ')} |\n`;
        }
      });
      return table + '\n';
    }
    return el.textContent + '\n\n';
  }

  function inlineToMd(html) {
    let result = html;
    // Images
    result = result.replace(/<img\s+[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/g, '![$1]($2)');
    result = result.replace(/<img\s+[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/g, '![$2]($1)');
    // Links
    result = result.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g, '[$2]($1)');
    // Bold
    result = result.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    // Italic
    result = result.replace(/<em>(.*?)<\/em>/g, '*$1*');
    // Code
    result = result.replace(/<code>(.*?)<\/code>/g, '`$1`');
    // Strikethrough
    result = result.replace(/<del>(.*?)<\/del>/g, '~~$1~~');
    // Strip remaining tags
    result = result.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    result = result.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    return result;
  }

  nodes.forEach((node) => {
    md += blockToMd(node);
  });

  return md.trimEnd();
}

function markdownToHtml(md) {
  if (!md) return '<p></p>';
  // Use marked with GFM (tables, task lists, strikethrough)
  return marked.parse(md, { breaks: false, gfm: true });
}

// ---------- Component ----------

const MarkdownEditor = forwardRef(function MarkdownEditor({ content, onChange, placeholder }, ref) {
  const isSyncingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false, // disabled — using CodeBlockLowlight instead
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: null,
      }),
      Placeholder.configure({ placeholder: placeholder || '开始写 Markdown...' }),
    ],
    content: markdownToHtml(content),
    editable: false,
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
    onUpdate: ({ editor }) => {
      // Use ref to avoid stale closure — isSyncingRef is set synchronously
      // before setContent fires, so onUpdate sees the true value.
      if (isSyncingRef.current) return;
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      lastContentRef.current = md;
      onChange(md);
    },
  });

  useImperativeHandle(ref, () => editor, [editor]);

  // Sync external content changes into the editor
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (content === lastContentRef.current) return;

    const html = markdownToHtml(content);
    const currentHtml = editor.getHTML();
    if (html === currentHtml) {
      lastContentRef.current = content;
      return;
    }

    // Set ref BEFORE setContent so onUpdate sees it and skips
    isSyncingRef.current = true;
    editor.commands.setContent(html);
    lastContentRef.current = content;
    isSyncingRef.current = false;
  }, [content, editor]);

  // Destroy editor on unmount
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, []);

  if (!editor) return <div className="tiptap-editor" />;

  return <EditorContent editor={editor} />;
});

export default MarkdownEditor;
