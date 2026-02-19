import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import path from 'path';

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
    // Auto-generated API reference from TypeDoc
    [
      'docusaurus-plugin-typedoc-api',
      {
        projectRoot: path.join(__dirname, '../..'),
        packages: [
          {
            path: 'packages/plugin-api',
            entry: 'src/index.ts',
          },
        ],
        removeScopes: ['omniscribe'],
        gitRefName: 'master',
        tsconfigName: 'tsconfig.json',
        readmes: true,
        minimal: false,
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
    navbar: {
      title: 'Omniscribe',
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
          to: '/api',
          label: 'API Reference',
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
            { label: 'Getting Started', to: '/docs/intro' },
            { label: 'Plugin SDK', to: '/sdk/overview' },
            { label: 'API Reference', to: '/api' },
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
      copyright: `Copyright ${new Date().getFullYear()} Omniscribe. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
