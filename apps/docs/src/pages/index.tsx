import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="hero-section" style={{ padding: '5rem 0 4rem' }}>
      <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <img
          src={require('@site/static/img/logo.png').default}
          alt="Omniscribe"
          style={{ width: 88, height: 88, marginBottom: '1.5rem' }}
        />
        <h1 className="hero__title--styled">{siteConfig.title}</h1>
        <p className="hero__subtitle--styled">{siteConfig.tagline}</p>
        <div
          style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <Link className="button button--primary button--lg" to="/download">
            Download
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Documentation
          </Link>
          <Link className="button button--secondary button--lg" to="/sdk/overview">
            Plugin SDK
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: '12 Parallel Sessions',
    icon: '\u2726',
    iconClass: 'feature-icon--purple',
    description:
      'Run up to 12 AI coding sessions simultaneously in a resizable grid. Launch presets let you set up 2x2, 3x2, or custom layouts in one click.',
  },
  {
    title: 'Session History & Resume',
    icon: '\u29C9',
    iconClass: 'feature-icon--blue',
    description:
      'Browse, search, and resume past sessions. Fork conversations into new branches or continue your last session with a single click.',
  },
  {
    title: 'Git Worktree Isolation',
    icon: '\u25B6',
    iconClass: 'feature-icon--emerald',
    description:
      'Each session can work on its own branch without conflicts. Omniscribe manages git worktrees automatically so parallel development just works.',
  },
  {
    title: '41 Themes & Customization',
    icon: '\u2728',
    iconClass: 'feature-icon--amber',
    description:
      'Choose from 41 UI themes and 12 terminal themes. Per-project theme persistence, configurable shortcuts, and a full settings system.',
  },
];

function Features() {
  return (
    <section style={{ padding: '4rem 0 3rem' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
            Built for AI-assisted development
          </h2>
          <p className="hero__subtitle--styled" style={{ fontSize: '1rem', marginBottom: 0 }}>
            Everything you need to manage multiple AI coding sessions from a single desktop app.
          </p>
        </div>
        <div className="row">
          {features.map((feature, idx) => (
            <div key={idx} className="col col--6" style={{ marginBottom: '1rem' }}>
              <div className="feature-card">
                <div className={`feature-icon ${feature.iconClass}`}>{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const highlights = [
  {
    label: 'MCP Integration',
    description: 'Real-time status and task reporting from AI assistants',
    link: '/docs/features/mcp-integration',
  },
  {
    label: 'Quick Actions',
    description: 'Git commit, push, and more from the terminal header',
    link: '/docs/features/quick-actions',
  },
  {
    label: 'Terminal Search',
    description: 'Regex-powered search across terminal output',
    link: '/docs/features/terminal',
  },
  {
    label: 'Keyboard Shortcuts',
    description: 'Launch, navigate, and control sessions from the keyboard',
    link: '/docs/features/keyboard-shortcuts',
  },
  {
    label: 'Auto Updates',
    description: 'Stable and beta channels with automatic update detection',
    link: '/docs/features/auto-update',
  },
  {
    label: 'Plugin System',
    description: 'Add new AI providers with a TypeScript plugin API',
    link: '/sdk/overview',
  },
];

function Highlights() {
  return (
    <section style={{ padding: '2rem 0 3rem' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>And much more</h2>
        </div>
        <div className="row">
          {highlights.map((item, idx) => (
            <div key={idx} className="col col--4" style={{ marginBottom: '1rem' }}>
              <Link to={item.link} className="highlight-card">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GetStarted() {
  return (
    <section style={{ padding: '2rem 0 5rem' }}>
      <div className="container" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Ready to get started?</h2>
        <p className="hero__subtitle--styled" style={{ fontSize: '1rem', marginBottom: '2rem' }}>
          Download Omniscribe and start running AI sessions in parallel.
        </p>
        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="cta-card">
            <h3>For Users</h3>
            <p>Download the app and start using AI assistants right away.</p>
            <Link className="button button--primary" to="/download">
              Download Omniscribe
            </Link>
          </div>
          <div className="cta-card">
            <h3>For Developers</h3>
            <p>Build plugins or contribute to the open-source project.</p>
            <Link className="button button--secondary" to="/docs/contributing/quickstart">
              Development Setup
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <hr className="section-divider" />
      <main>
        <Features />
        <hr className="section-divider" />
        <Highlights />
        <hr className="section-divider" />
        <GetStarted />
      </main>
    </Layout>
  );
}
