import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site: URL }) {
  const siteTitle = 'sqkstt777的个人博客';
  const siteDescription = '记录工程实践、技术学习和长期写作的sqkstt777的个人博客。';
  const showDrafts = import.meta.env.DEV;
  const posts = (await getCollection('blog', ({ data }) => showDrafts || !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  const buildDate = new Date();

  return rss({
    title: siteTitle,
    description: siteDescription,
    site: context.site,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
    },
    customData: [
      '<language>zh-CN</language>',
      `<lastBuildDate>${buildDate.toUTCString()}</lastBuildDate>`,
      `<atom:link href="${new URL('/rss.xml', context.site).toString()}" rel="self" type="application/rss+xml" />`,
    ].join(''),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: new URL(`/blog/${post.id}/`, context.site).toString(),
      categories: [post.data.category, ...post.data.tags].filter(Boolean),
    })),
  });
}
