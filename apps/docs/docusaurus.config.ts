import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Omniscribe',
  tagline: 'Orchestrate multiple AI coding sessions in parallel',
  favicon: 'img/favicon.ico',

  url: 'https://shironex.github.io',
  baseUrl: '/omniscribe/',

  organizationName: 'Shironex',
  projectName: 'omniscribe',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/Shironex/omniscribe/tree/master/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // SDK docs as a separate docs instance
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'sdk',
        path: 'sdk',
        routeBasePath: 'sdk',
        sidebarPath: './sidebarsSDK.ts',
        editUrl: 'https://github.com/Shironex/omniscribe/tree/master/apps/docs/',
      },
    ],
    // Auto-generated API reference from TypeDoc (generates Markdown into docs/api/)
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../../packages/plugin-api/src/index.ts'],
        tsconfig: '../../packages/plugin-api/tsconfig.json',
        outputFileStrategy: 'members',
        indexFormat: 'table',
        parametersFormat: 'table',
        enumMembersFormat: 'table',
        expandObjects: true,
        sidebar: {
          autoConfiguration: false,
        },
      },
    ],
    // Generate llms.txt and llms-full.txt for AI consumption
    [
      'docusaurus-plugin-llms',
      {
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        title: 'Omniscribe Documentation',
        description:
          'Omniscribe is a desktop app for orchestrating multiple AI coding sessions. Build provider plugins to add new AI tools.',
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: ['docs', 'sdk'],
        indexBlog: false,
      },
    ],
  ],

  themeConfig: {
    image: 'img/logo.png',
    metadata: [
      {
        name: 'keywords',
        content:
          'AI coding assistant, Claude Code, Codex, Electron, desktop app, multi-session, plugin system',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    announcementBar: {
      id: 'v1_release',
      content:
        'Omniscribe v1.0.0 is here! <a target="_blank" rel="noopener noreferrer" href="https://github.com/Shironex/omniscribe/releases/tag/v1.0.0">See what\'s new</a>',
      backgroundColor: '#7c3aed',
      textColor: '#fff',
      isCloseable: true,
    },
    navbar: {
      title: 'Omniscribe',
      logo: {
        alt: 'Omniscribe Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/sdk/overview',
          label: 'Plugin SDK',
          position: 'left',
          activeBaseRegex: '/sdk/',
        },
        {
          to: '/docs/api',
          label: 'API Reference',
          position: 'left',
        },
        {
          to: '/download',
          label: 'Download',
          position: 'left',
        },
        {
          href: 'https://github.com/Shironex/omniscribe',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started/installation' },
            { label: 'Features', to: '/docs/features/multi-session-grid' },
            { label: 'Plugin SDK', to: '/sdk/overview' },
            { label: 'API Reference', to: '/docs/api' },
          ],
        },
        {
          title: 'Download',
          items: [
            { label: 'Download Omniscribe', to: '/download' },
            {
              label: 'Releases',
              href: 'https://github.com/Shironex/omniscribe/releases',
            },
            { label: 'Changelog', to: '/docs/changelog' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Shironex/omniscribe',
            },
            {
              label: 'Issues',
              href: 'https://github.com/Shironex/omniscribe/issues',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Omniscribe.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
