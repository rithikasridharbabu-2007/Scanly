"use client";

import { FormEvent, useState } from "react";

type Severity = "critical" | "serious" | "moderate" | "minor";

type Issue = {
  id: number;
  severity: Severity;
  problem: string;
  explanation: string;
  suggestedFix: string;
};

const sampleIssues: Issue[] = [
  {
    id: 1,
    severity: "critical",
    problem: "Image is missing alternative text",
    explanation:
      "Screen reader users may not know what information or purpose this image provides.",
    suggestedFix:
      "Add a meaningful alt attribute that describes the image's purpose.",
  },
  {
    id: 2,
    severity: "serious",
    problem: "Form field does not have an accessible label",
    explanation:
      "Users of assistive technology may not know what information should be entered in this field.",
    suggestedFix:
      "Associate a visible label with the form control using the label element and htmlFor attribute.",
  },
  {
    id: 3,
    severity: "serious",
    problem: "Text has insufficient color contrast",
    explanation:
      "Low contrast can make text difficult to read for users with low vision or color-vision deficiencies.",
    suggestedFix:
      "Increase the contrast between the text and its background.",
  },
  {
    id: 4,
    severity: "moderate",
    problem: "Heading levels are not in a logical order",
    explanation:
      "An inconsistent heading structure can make the page harder to navigate with assistive technology.",
    suggestedFix:
      "Use heading levels in a logical hierarchy without skipping levels unnecessarily.",
  },
  {
    id: 5,
    severity: "minor",
    problem: "Page language is not specified",
    explanation:
      "Screen readers may not know which pronunciation rules to use for the page.",
    suggestedFix:
      'Add a lang attribute to the HTML element, such as lang="en".',
  },
];

const severityStyles: Record<Severity, string> = {
  critical: "bg-red-100 text-red-800",
  serious: "bg-orange-100 text-orange-800",
  moderate: "bg-yellow-100 text-yellow-800",
  minor: "bg-blue-100 text-blue-800",
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setShowResults(false);

    try {
      const parsedUrl = new URL(url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error();
      }

      setLoading(true);

      // Prototype behavior until the scanner backend is connected.
      setTimeout(() => {
        setLoading(false);
        setShowResults(true);
      }, 1200);
    } catch {
      setLoading(false);
      setError(
        "Please enter a valid website URL, including http:// or https://."
      );
    }
  }

  const counts = {
    critical: sampleIssues.filter((issue) => issue.severity === "critical")
      .length,
    serious: sampleIssues.filter((issue) => issue.severity === "serious")
      .length,
    moderate: sampleIssues.filter((issue) => issue.severity === "moderate")
      .length,
    minor: sampleIssues.filter((issue) => issue.severity === "minor").length,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">Scanly</h1>
            <p className="text-sm text-slate-600">
              AI-assisted web accessibility auditing
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            Accessibility Auditor
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <p className="mb-3 font-semibold text-blue-700">
            Build a more accessible web
          </p>

          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Check your website for accessibility issues
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Enter a public webpage URL to identify common accessibility
            barriers and view clear, developer-friendly guidance.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="website-url"
              className="block text-sm font-semibold"
            >
              Website URL
            </label>

            <p id="url-help" className="mt-1 text-sm text-slate-500">
              Enter the full URL of a publicly accessible webpage.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                id="website-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com"
                aria-describedby="url-help url-error"
                aria-invalid={Boolean(error)}
                disabled={loading}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              />

              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {loading ? "Scanning..." : "Scan website"}
              </button>
            </div>

            {error && (
              <p
                id="url-error"
                role="alert"
                className="mt-3 text-sm font-medium text-red-700"
              >
                {error}
              </p>
            )}

            {loading && (
              <div
                role="status"
                aria-live="polite"
                className="mt-5 rounded-lg bg-blue-50 p-4 text-sm text-blue-800"
              >
                Scanning the webpage for accessibility issues...
              </div>
            )}
          </form>
        </div>

        {showResults && (
          <section className="mt-14" aria-labelledby="results-heading">
            <div className="mb-7">
              <p className="text-sm font-semibold text-blue-700">
                Prototype scan complete
              </p>

              <h2
                id="results-heading"
                className="mt-1 text-3xl font-bold"
              >
                Accessibility report
              </h2>

              <p className="mt-2 text-slate-600">
                Sample results for{" "}
                <span className="font-medium text-slate-800">{url}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <SummaryCard
                label="Critical"
                count={counts.critical}
                className="bg-red-50 text-red-800"
              />
              <SummaryCard
                label="Serious"
                count={counts.serious}
                className="bg-orange-50 text-orange-800"
              />
              <SummaryCard
                label="Moderate"
                count={counts.moderate}
                className="bg-yellow-50 text-yellow-800"
              />
              <SummaryCard
                label="Minor"
                count={counts.minor}
                className="bg-blue-50 text-blue-800"
              />
            </div>

            <div className="mt-10">
              <h3 className="text-2xl font-bold">
                Detected issues
              </h3>

              <p className="mt-1 text-slate-600">
                {sampleIssues.length} sample issues require attention.
              </p>

              <div className="mt-6 space-y-5">
                {sampleIssues.map((issue) => (
                  <article
                    key={issue.id}
                    className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h4 className="text-lg font-semibold">
                        {issue.problem}
                      </h4>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${severityStyles[issue.severity]}`}
                      >
                        {issue.severity}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <div>
                        <h5 className="text-sm font-semibold">
                          Why this matters
                        </h5>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {issue.explanation}
                        </p>
                      </div>

                      <div>
                        <h5 className="text-sm font-semibold">
                          Suggested fix
                        </h5>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {issue.suggestedFix}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-100 p-5 text-sm text-slate-600">
              These are sample results used for the frontend prototype. The
              final application will display results returned by the Scanly
              scanner.
            </div>
          </section>
        )}

        <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-slate-500">
          Automated testing cannot detect every accessibility issue. Scanly
          provides guidance and does not replace a complete manual
          accessibility audit.
        </p>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  return (
    <div className={`rounded-xl p-5 ${className}`}>
      <p className="text-3xl font-bold">{count}</p>
      <p className="mt-1 text-sm font-semibold">{label}</p>
    </div>
  );
}