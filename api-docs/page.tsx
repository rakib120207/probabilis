import Link from 'next/link';

export default function ApiDocs() {
  const baseUrl = "https://web-production-810f7.up.railway.app";

  const endpoints = [
    {
      method: "POST",
      path: "/api/v1/simulate",
      description: "Run a Beta Monte Carlo simulation with full uncertainty decomposition.",
      request: JSON.stringify({
        description: "Launching a SaaS product with 50 beta users",
        base_probability: 0.45,
        confidence: 0.6,
        trials: 10000
      }, null, 2),
      response: JSON.stringify({
        mean: 0.4521,
        std_dev: 0.1082,
        confidence_interval_low: 0.2487,
        confidence_interval_high: 0.6612,
        rhat: 1.0023,
        eviu: 0.0041,
        uncertainty_type: "epistemic-dominant",
        "...": "full response fields"
      }, null, 2)
    },
    {
      method: "POST",
      path: "/api/v1/extract",
      description: "Extract probability estimate from natural language description.",
      request: JSON.stringify({
        description: "I have 3 years experience and a referral for a senior dev role"
      }, null, 2),
      response: JSON.stringify({
        suggested_probability: 0.52,
        suggested_confidence: 0.68,
        reasoning: "Referral and experience signals present...",
        extraction_mode: "ai (llama-3.3-70b-versatile)"
      }, null, 2)
    }
  ];

  return (
    <main className="min-h-screen p-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 mb-4 inline-block">
            ← Back to Probabilis
          </Link>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            API Reference
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
            Probabilis v1.0 — REST API for programmatic access
          </p>
        </div>

        {/* Auth */}
        <div className="mb-8 p-4 rounded-lg border"
             style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: 'var(--text-label)' }}>Authentication</p>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Pass your API key in the <code className="text-blue-400">X-API-Key</code> header.
          </p>
          <code className="text-xs block p-2 rounded"
                style={{ background: 'var(--surface-2)', color: '#34d399' }}>
            X-API-Key: demo-key-2026
          </code>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Base URL: <span className="text-blue-400">{baseUrl}</span>
          </p>
        </div>

        {/* Endpoints */}
        <div className="space-y-8">
          {endpoints.map(ep => (
            <div key={ep.path} className="rounded-lg border overflow-hidden"
                 style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 flex items-center gap-3"
                   style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{ background: '#1e3a6e', color: '#4f8ef7' }}>
                  {ep.method}
                </span>
                <code className="text-sm text-green-400">{ep.path}</code>
              </div>
              <div className="p-4" style={{ background: 'var(--surface-1)' }}>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {ep.description}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2"
                       style={{ color: 'var(--text-muted)' }}>Request body</p>
                    <pre className="text-xs p-3 rounded overflow-auto"
                         style={{ background: 'var(--surface-2)', color: '#a8b8d0' }}>
                      {ep.request}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2"
                       style={{ color: 'var(--text-muted)' }}>Response</p>
                    <pre className="text-xs p-3 rounded overflow-auto"
                         style={{ background: 'var(--surface-2)', color: '#a8b8d0' }}>
                      {ep.response}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t text-xs"
             style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Full OpenAPI spec available at{" "}
          <a href={`${baseUrl}/docs`} target="_blank" rel="noopener noreferrer"
             className="text-blue-400 hover:text-blue-300">
            {baseUrl}/docs
          </a>
        </div>
      </div>
    </main>
  );
}