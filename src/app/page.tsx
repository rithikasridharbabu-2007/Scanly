"use client";

import { FormEvent, useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);

    try {
      const parsedUrl = new URL(url);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error();
      }

      setSubmitted(true);
    } catch {
      setError("Please enter a valid website URL, including http:// or https://.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scanly</h1>
            <p className="text-sm text-slate-600">
              AI-assisted web accessibility auditing
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            Accessibility Auditor
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-center">
          <p className="mb-3 font-semibold text-blue-700">
            Build a more accessible web
          </p>

          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Check your website for accessibility issues
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Enter a public webpage URL and Scanly will help identify common
            accessibility barriers and present the findings in a clear,
            developer-friendly report.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="website-url"
              className="block text-sm font-semibold text-slate-800"
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
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />

              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                Scan website
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

            {submitted && (
              <div
                role="status"
                className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
              >
                URL accepted. The accessibility scan will begin when the
                scanner API is connected.
              </div>
            )}
          </form>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold">Automated checks</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Identify common accessibility issues using automated testing.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold">Clear explanations</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Understand what detected issues mean and why they matter.
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold">Suggested fixes</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Get developer-friendly guidance for addressing accessibility
              barriers.
            </p>
          </article>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-slate-500">
          Automated testing cannot detect every accessibility issue. Scanly
          provides guidance and does not replace a complete manual
          accessibility audit.
        </p>
      </section>
    </main>
  );
}