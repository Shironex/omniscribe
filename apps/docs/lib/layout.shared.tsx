import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const layoutOptions: BaseLayoutProps = {
  nav: {
    title: 'Omniscribe',
  },
  githubUrl: 'https://github.com/Shironex/omniscribe',
  links: [
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'Download',
      url: '/download',
    },
  ],
};
