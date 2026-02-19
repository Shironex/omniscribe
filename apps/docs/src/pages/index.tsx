import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="hero-gradient" style={{ padding: '5rem 0 4rem' }}>
      <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <img
          src={require('@site/static/img/logo.png').default}
          alt="Omniscribe"
          style={{ width: 96, height: 96, marginBottom: '1.5rem' }}
        />
        <h1
          className="hero__title"
          style={{
            fontSize: '3rem',
            background: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 50%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.75rem',
          }}
        >
          {siteConfig.title}
        </h1>
        <p
          className="hero__subtitle"
          style={{
            fontSize: '1.25rem',
            color: 'rgba(196, 181, 253, 0.8)',
            maxWidth: 560,
            margin: '0 auto 2.5rem',
            lineHeight: 1.6,
          }}
        >
          {siteConfig.tagline}
        </p>
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
    icon: '&#x2726;',
    iconClass: 'feature-icon--purple',
    description:
      'Run Claude Code, OpenAI Codex, and other AI assistants side by side. Switch between providers per session or run them in parallel across projects.',
  },
  {
    title: 'Plugin System',
    icon: '&#x29C9;',
    iconClass: 'feature-icon--blue',
    description:
      'Build provider plugins with a clean TypeScript API. Implement a backend service and frontend UI, then register your plugin to extend Omniscribe.',
  },
  {
    title: 'Real-Time Streaming',
    icon: '&#x25B6;',
    iconClass: 'feature-icon--emerald',
    description:
      'Live terminal output with automatic status detection, usage tracking, and task monitoring. Full PTY support with resize and input handling.',
  },
  {
    title: 'AI-Friendly Docs',
    icon: '&#x2728;',
    iconClass: 'feature-icon--amber',
    description:
      'Documentation ships as llms.txt for AI coding assistants. Point your AI tool at our docs and it can help you build and debug plugins.',
  },
];

function Features() {
  return (
    <section style={{ padding: '4rem 0' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            Built for AI-assisted development
          </h2>
          <p style={{ opacity: 0.7, maxWidth: 520, margin: '0 auto' }}>
            Everything you need to manage multiple AI coding sessions from a single desktop app.
          </p>
        </div>
        <div className="row">
          {features.map((feature, idx) => (
            <div key={idx} className="col col--6" style={{ marginBottom: '1.5rem' }}>
              <div className="feature-card">
                <div
                  className={`feature-icon ${feature.iconClass}`}
                  dangerouslySetInnerHTML={{ __html: feature.icon }}
                />
                <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>{feature.title}</h3>
                <p style={{ opacity: 0.75, margin: 0, lineHeight: 1.6 }}>{feature.description}</p>
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
    <section style={{ padding: '3rem 0 5rem' }}>
      <div className="container" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
          Get up and running in minutes
        </h2>
        <p style={{ opacity: 0.7, marginBottom: '2rem' }}>
          Clone, install, and start building with AI assistants.
        </p>
        <div
          style={{
            background: 'rgba(167, 139, 250, 0.05)',
            border: '1px solid rgba(167, 139, 250, 0.1)',
            borderRadius: 12,
            padding: '1.5rem 2rem',
            maxWidth: 500,
            margin: '0 auto',
            textAlign: 'left',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: 2,
          }}
        >
          <div>
            <span style={{ opacity: 0.5 }}>$</span> git clone https://github.com/Shironex/omniscribe
          </div>
          <div>
            <span style={{ opacity: 0.5 }}>$</span> pnpm install
          </div>
          <div>
            <span style={{ opacity: 0.5 }}>$</span> pnpm dev
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
      <main>
        <Features />
        <QuickStart />
      </main>
    </Layout>
  );
}
