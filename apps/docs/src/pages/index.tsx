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
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get Started
          </Link>
          <Link className="button button--secondary button--lg" to="/sdk/overview">
            Plugin SDK
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/api">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: 'Multi-Provider Sessions',
    icon: '\u2726',
    iconClass: 'feature-icon--purple',
    description:
      'Run Claude Code, OpenAI Codex, and other AI assistants side by side. Switch between providers per session or run them in parallel across projects.',
  },
  {
    title: 'Plugin System',
    icon: '\u29C9',
    iconClass: 'feature-icon--blue',
    description:
      'Build provider plugins with a clean TypeScript API. Implement a backend service and frontend UI, then register your plugin to extend Omniscribe.',
  },
  {
    title: 'Real-Time Streaming',
    icon: '\u25B6',
    iconClass: 'feature-icon--emerald',
    description:
      'Live terminal output with automatic status detection, usage tracking, and task monitoring. Full PTY support with resize and input handling.',
  },
  {
    title: 'AI-Friendly Docs',
    icon: '\u2728',
    iconClass: 'feature-icon--amber',
    description:
      'Documentation ships as llms.txt for AI coding assistants. Point your AI tool at our docs and it can help you build and debug plugins.',
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

function QuickStart() {
  return (
    <section style={{ padding: '2rem 0 5rem' }}>
      <div className="container" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Get up and running in minutes
        </h2>
        <p className="hero__subtitle--styled" style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>
          Clone, install, and start building with AI assistants.
        </p>
        <div className="terminal-block">
          <div>
            <span className="prompt">$</span> git clone https://github.com/Shironex/omniscribe
          </div>
          <div>
            <span className="prompt">$</span> pnpm install
          </div>
          <div>
            <span className="prompt">$</span> pnpm dev
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
        <QuickStart />
      </main>
    </Layout>
  );
}
