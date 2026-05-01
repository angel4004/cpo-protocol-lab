export const MODEL_PROFILES = {
  smoke: {
    runs: 1,
    copilotModels: ['openai/gpt-5-mini'],
    simulatorModel: 'openai/gpt-5-mini',
    sourceProfile: 'full'
  },
  candidate: {
    runs: 2,
    copilotModels: ['openai/gpt-5.5', 'anthropic/claude-4.6-sonnet'],
    simulatorModel: 'openai/gpt-5-mini',
    sourceProfile: 'full'
  },
  'quality-full': {
    runs: 2,
    copilotModels: ['openai/gpt-5.5', 'anthropic/claude-4.6-sonnet'],
    simulatorModel: 'openai/gpt-5-mini',
    sourceProfile: 'full'
  },
  release: {
    runs: 3,
    copilotModels: ['openai/gpt-5.5', 'anthropic/claude-4.6-sonnet'],
    simulatorModel: 'openai/gpt-5-mini',
    sourceProfile: 'full'
  },
  'release-full': {
    runs: 3,
    copilotModels: ['openai/gpt-5.5', 'anthropic/claude-4.6-sonnet'],
    simulatorModel: 'openai/gpt-5-mini',
    sourceProfile: 'full'
  }
};

function splitCsv(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }

  return parsed;
}

export function buildMatrixPlan(options = {}, suiteSteps = []) {
  const profileName = options.profile ?? 'candidate';
  const profile = MODEL_PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unsupported matrix profile: ${profileName}`);
  }

  const copilotModels = splitCsv(options.copilotModels ?? options['copilot-models']);
  const selectedCopilotModels = copilotModels.length > 0 ? copilotModels : profile.copilotModels;
  const runs = parsePositiveInteger(options.runs, profile.runs);
  const simulatorModel = options.simulatorModel ?? options['simulator-model'] ?? profile.simulatorModel;

  const cells = [];
  for (const [scenarioIndex, step] of suiteSteps.entries()) {
    for (const [modelIndex, copilotModel] of selectedCopilotModels.entries()) {
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        cells.push({
          scenarioPath: step.scenarioPath,
          scenarioIndex,
          modelIndex,
          runIndex,
          copilotModel,
          simulatorModel
        });
      }
    }
  }

  return {
    profile: profileName,
    sourceProfile: profile.sourceProfile ?? 'full',
    runs,
    copilotModels: selectedCopilotModels,
    simulatorModel,
    cells
  };
}

export function safeMatrixName(value) {
  return String(value)
    .replace(/[^a-z0-9._-]+/giu, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildMatrixCellReportName(cell) {
  const scenarioBaseName = safeMatrixName(cell.scenarioPath.replace(/^scenarios[\\/]/u, '').replace(/\.scenario\.json$/u, ''));
  const modelName = safeMatrixName(cell.copilotModel);
  return `${scenarioBaseName}--${modelName}--run-${cell.runIndex + 1}`;
}

function verdict(result) {
  const rawVerdict = result.evaluation?.verdict ?? result.verdict;
  return rawVerdict === 'api_error' ? 'infra_blocked' : rawVerdict;
}

function isBehaviorFailure(result) {
  return ['hard_fail', 'behavior_fail'].includes(verdict(result));
}

function isInfraBlocked(result) {
  return ['api_error', 'infra_blocked'].includes(verdict(result));
}

function isContractReview(result) {
  return ['needs_review', 'warning', 'contract_needs_review'].includes(verdict(result));
}

export function matrixVerdict(results = []) {
  const failed = results.filter((result) => verdict(result) !== 'pass');
  if (failed.length === 0) {
    return 'pass';
  }

  if (failed.some(isBehaviorFailure)) {
    return 'behavior_fail';
  }

  if (failed.some(isInfraBlocked)) {
    return 'infra_blocked';
  }

  if (failed.some(isContractReview)) {
    return 'contract_needs_review';
  }

  return 'contract_needs_review';
}

function zeroUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0
  };
}

function addUsage(total, usage = {}) {
  total.inputTokens += usage.inputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
  total.totalTokens += usage.totalTokens ?? 0;
}

export function sanitizeProviderErrorMessage(message) {
  return String(message)
    .replace(/"user_id"\s*:\s*"[^"]+"/giu, '"user_id":"[redacted]"')
    .replace(/(Authorization:\s*Bearer\s+)[^\s"']+/giu, '$1[redacted]')
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"',\s]+/giu, '$1[redacted]');
}

export function estimatePromptTokensFromChars(chars) {
  if (!chars || chars < 1) {
    return 0;
  }

  return Math.ceil(chars / 1.5);
}

export function buildMatrixPreflightSummary(preflight = []) {
  const totalEstimatedPromptTokens = preflight.reduce((sum, item) => sum + (item.estimatedPromptTokens ?? 0), 0);
  const maxEstimatedPromptTokens = preflight.reduce((max, item) => Math.max(max, item.estimatedPromptTokens ?? 0), 0);
  const warningCount = preflight.filter((item) => item.budgetStatus === 'warning').length;
  const sourceProfile = preflight.find((item) => item.sourceProfile)?.sourceProfile ?? 'unknown';

  return {
    sourceProfile,
    totalEstimatedPromptTokens,
    maxEstimatedPromptTokens,
    warningCount
  };
}

export function buildMatrixSummary({ profile, copilotModels, simulatorModel, runs, expectedRuns, preflight = [], results = [] }) {
  const usageTotals = zeroUsage();
  for (const result of results) {
    addUsage(usageTotals, result.usage);
  }

  const failures = results
    .filter((result) => verdict(result) !== 'pass')
    .map((result) => ({
      scenarioId: result.scenarioId,
      copilotModel: result.copilotModel,
      runIndex: result.runIndex,
      verdict: verdict(result),
      error: result.error ? sanitizeProviderErrorMessage(result.error) : undefined,
      reportDir: result.reportDir
    }));
  const behaviorFailures = failures.filter((failure) => ['hard_fail', 'behavior_fail'].includes(failure.verdict));
  const infraFailures = failures.filter((failure) => ['api_error', 'infra_blocked'].includes(failure.verdict));
  const contractReviewFailures = failures.filter((failure) => ['needs_review', 'warning', 'contract_needs_review'].includes(failure.verdict));

  return {
    profile,
    copilotModels,
    simulatorModel,
    runs,
    verdict: matrixVerdict(results),
    expectedRuns: expectedRuns ?? results.length,
    totalRuns: results.length,
    passRuns: results.filter((result) => verdict(result) === 'pass').length,
    failRuns: failures.length,
    behaviorFailRuns: behaviorFailures.length,
    infraBlockedRuns: infraFailures.length,
    contractReviewRuns: contractReviewFailures.length,
    usageTotals,
    preflight,
    preflightSummary: buildMatrixPreflightSummary(preflight),
    failures,
    behaviorFailures,
    infraFailures,
    contractReviewFailures,
    results: results.map((result) => ({
      scenarioId: result.scenarioId,
      copilotModel: result.copilotModel,
      simulatorModel: result.simulatorModel,
      runIndex: result.runIndex,
      verdict: verdict(result),
      error: result.error ? sanitizeProviderErrorMessage(result.error) : undefined,
      usage: result.usage,
      reportDir: result.reportDir
    }))
  };
}
