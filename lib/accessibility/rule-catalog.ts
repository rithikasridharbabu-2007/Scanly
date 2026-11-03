// Scanly explanation layer (mid-semester prototype, no live LLM).
//
// Looks up a plain-language explanation for an axe-core finding by rule ID
// and attaches it to the normalized violation the report displays.
//
// Rules this file follows (from the Responsible Design Rules):
// - Facts (ruleId, impact, wcagTags, helpUrl) always come from axe-core,
//   never from the catalog, so an explanation can't change them.
// - If a rule has no catalog entry, we fall back to axe-core's own text
//   instead of making something up.
// - "Needs review" findings are always marked for a manual check.
 
import catalogFile from "../../data/rule-explanations.json" with { type: "json" };
 
// ---------- Types ----------
 
export type Impact = "minor" | "moderate" | "serious" | "critical";
export type ResultType = "violation" | "needs_review";
export type ReviewStatus = "approved" | "pending_review" | "fallback";
 
export interface WcagCriterion {
  id: string; // e.g. "1.1.1"
  name: string; // e.g. "Non-text Content"
  level: "A" | "AA" | "AAA";
}
 
export interface CatalogEntry {
  ruleId: string;
  plainTitle: string;
  plainLanguageSummary: string;
  /** Optional wording for when axe-core couldn't decide ("needs review"). */
  needsReviewSummary?: string;
  whoIsAffected: string[];
  whyItMatters: string;
  suggestedFix: string;
  exampleFix: { before: string; after: string } | null;
  manualCheck: string | null;
  wcagCriteria: WcagCriterion[];
  isBestPractice: boolean;
  sourceUrl: string;
  reviewStatus: ReviewStatus;
}
 
// Shape of one normalized finding from the scanner (matches the README).
export interface NormalizedViolation {
  ruleId: string;
  impact: Impact | null;
  title: string; // axe "help" text
  description: string; // axe "description" text
  helpUrl: string;
  wcagTags: string[];
  affectedElements: { target: string[]; html: string; failureSummary?: string }[];
}
 
export interface Explanation {
  plainTitle: string;
  plainLanguageSummary: string;
  whoIsAffected: string[];
  whyItMatters: string;
  suggestedFix: string;
  exampleFix: { before: string; after: string } | null;
  manualCheckNeeded: boolean;
  manualCheck: string | null;
  wcagCriteria: WcagCriterion[];
  isBestPractice: boolean;
  sourceUrl: string;
  reviewStatus: ReviewStatus;
}
 
export type ExplainedViolation = NormalizedViolation & {
  resultType: ResultType;
  explanation: Explanation;
};
 
// ---------- Catalog ----------
 
const catalog = catalogFile.rules as Record<string, CatalogEntry>;
 
/** Returns the catalog entry for a rule, or undefined if there isn't one yet. */
export function getCatalogEntry(ruleId: string): CatalogEntry | undefined {
  return Object.hasOwn(catalog, ruleId) ? catalog[ruleId] : undefined;
}
 
/** Rule IDs the catalog currently covers. */
export function listCoveredRules(): string[] {
  return Object.keys(catalog);
}
 
// ---------- Main function ----------
 
/**
 * Attach a plain-language explanation to one normalized axe-core finding.
 *
 * @param violation  A normalized finding from the scanner.
 * @param resultType "violation" for confirmed failures, "needs_review" for
 *                   axe-core "incomplete" items that a person must check.
 */
export function explainFinding(
  violation: NormalizedViolation,
  resultType: ResultType = "violation",
): ExplainedViolation {
  const entry = getCatalogEntry(violation.ruleId);
  const isBestPractice = violation.wcagTags.includes("best-practice");
 
  if (!entry) {
    // No reviewed text yet: show axe-core's own words. Never invent an explanation.
    return {
      ...violation,
      resultType,
      explanation: {
        plainTitle: violation.title,
        plainLanguageSummary: violation.description,
        whoIsAffected: [],
        whyItMatters: "A plain-language explanation isn't available yet for this issue.",
        suggestedFix: "See the linked guide for how to fix this issue.",
        exampleFix: null,
        manualCheckNeeded: resultType === "needs_review",
        manualCheck: null,
        wcagCriteria: [],
        isBestPractice,
        sourceUrl: violation.helpUrl,
        reviewStatus: "fallback",
      },
    };
  }
 
  const needsReview = resultType === "needs_review";
 
  return {
    ...violation, // ruleId, impact, wcagTags, helpUrl stay exactly as axe-core reported them
    resultType,
    explanation: {
      plainTitle: entry.plainTitle,
      // A needs-review item is NOT a confirmed failure, so never describe it as one.
      plainLanguageSummary: needsReview
        ? (entry.needsReviewSummary ??
          "Scanly couldn't confirm this one automatically, so it needs a quick check by hand. If the problem is there, use the fix below.")
        : entry.plainLanguageSummary,
      whoIsAffected: entry.whoIsAffected,
      whyItMatters: entry.whyItMatters,
      suggestedFix: entry.suggestedFix,
      exampleFix: entry.exampleFix,
      manualCheckNeeded: needsReview || entry.manualCheck !== null,
      manualCheck: entry.manualCheck,
      wcagCriteria: entry.wcagCriteria,
      isBestPractice: entry.isBestPractice || isBestPractice,
      // Prefer the link axe-core gave for this exact scan; fall back to the catalog's.
      sourceUrl: violation.helpUrl || entry.sourceUrl,
      reviewStatus: entry.reviewStatus,
    },
  };
}
 
// ---------- Adapter for the scanner's current output (PR #10, lib/types/scan.ts) ----------
//
// The scanner currently returns { url, timestamp, totalViolations, violations },
// where each violation is { id, impact, description, helpUrl, affectedNodes, htmlSnippets }.
// These functions convert that shape so the report can use it today.
// If the scanner later adds axe-core's `tags`, `help`, or `incomplete` results,
// they are picked up automatically.
 
export interface ScannerViolation {
  id: string;
  impact?: string | null;
  description: string;
  helpUrl: string;
  affectedNodes?: number;
  htmlSnippets?: string[];
  tags?: string[]; // axe-core tags, if the scanner adds them
  help?: string; // axe-core short title, if the scanner adds it
}
 
export interface ScannerResult {
  url: string;
  timestamp: string;
  totalViolations: number;
  violations: ScannerViolation[];
  incomplete?: ScannerViolation[]; // axe-core "needs review" items, if the scanner adds them
}
 
const IMPACTS: readonly string[] = ["minor", "moderate", "serious", "critical"];
 
/** Convert one scanner violation into the shape explainFinding() expects. */
export function fromScannerViolation(v: ScannerViolation): NormalizedViolation {
  return {
    ruleId: v.id,
    impact: v.impact && IMPACTS.includes(v.impact) ? (v.impact as Impact) : null,
    title: v.help ?? v.description,
    description: v.description,
    helpUrl: v.helpUrl,
    wcagTags: v.tags ?? [],
    affectedElements: (v.htmlSnippets ?? []).map((html) => ({ target: [], html })),
  };
}
 
/** Explain a whole scan straight from the scanner's current output. */
export function explainScannerResult(result: ScannerResult): {
  url: string;
  timestamp: string;
  violations: ExplainedViolation[];
  needsReview: ExplainedViolation[];
} {
  const explained = explainScan({
    violations: result.violations.map(fromScannerViolation),
    needsReview: (result.incomplete ?? []).map(fromScannerViolation),
  });
  return { url: result.url, timestamp: result.timestamp, ...explained };
}
 
/** Explain every finding from one scan, keeping violations and needs-review items separate. */
export function explainScan(scan: {
  violations: NormalizedViolation[];
  needsReview: NormalizedViolation[];
}): { violations: ExplainedViolation[]; needsReview: ExplainedViolation[] } {
  return {
    violations: scan.violations.map((v) => explainFinding(v, "violation")),
    needsReview: scan.needsReview.map((v) => explainFinding(v, "needs_review")),
  };
}
