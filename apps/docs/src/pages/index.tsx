import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header
      style={{
        padding: '4rem 0',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Get Started
          </Link>
          <Link className="button button--secondary button--lg" to="/sdk/overview">
            Plugin SDK
          </Link>
          <Link className="button button--secondary button--lg" to="/api">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

function Features() {
  const features = [
    {
      title: 'Multi-Provider Support',
      description:
        'Run Claude Code, OpenAI Codex, and other AI coding assistants side by side. Each provider is a plugin that can be enabled or disabled independently.',
    },
    {
      title: 'Plugin System',
      description:
        'Build provider plugins with a clean TypeScript API. Implement 3 methods to get started, or use the full API for advanced features like usage tracking and session history.',
    },
    {
      title: 'AI-Friendly Docs',
      description:
        'Documentation is available as llms.txt for AI coding assistants. Point your AI tool at our docs and it can help you build plugins.',
    },
  ];

  return (
    <section style={{ padding: '2rem 0' }}>
      <div className="container">
        <div className="row">
          {features.map((feature, idx) => (
            <div key={idx} className="col col--4" style={{ marginBottom: '2rem' }}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
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
      </main>
    </Layout>
  );
}
