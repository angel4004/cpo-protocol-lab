import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function failedFindings(evaluation) {
  return evaluation.findings.filter((finding) => finding.status === 'fail');
}

export function buildSummaryMarkdown(result) {
  const failed = failedFindings(result.evaluation);
  const source = result.source ?? {};
  const inputs = result.inputs ?? {};
  const run = result.run ?? {};
  const models = run.models ?? {};
  const usage = result.usage;

  const lines = [
    `# Отчет Protocol Lab: ${result.scenarioId}`,
    '',
    `**Итог:** ${result.evaluation.verdict}`,
    '',
    '## Снимок источников',
    '',
    `- Репозиторий: ${source.repoPath ?? 'unknown'}`,
    `- Запрошенный ref: ${source.requestedRef ?? source.ref ?? 'unknown'}`,
    `- Ref: ${source.ref ?? 'unknown'}`,
    `- Fetch перед чтением: ${source.fetchBeforeRead ?? 'unknown'}`,
    `- Ветка: ${source.branch ?? 'unknown'}`,
    `- Commit: ${source.commitSha ?? 'unknown'}`,
    `- Bundle SHA-256: ${source.bundleSha256 ?? 'unknown'}`,
    `- Source files: ${source.fileCount ?? 'unknown'}`,
    '',
    '## Входные артефакты',
    '',
    `- Сценарий: ${inputs.scenario?.path ?? 'unknown'}`,
    `- Scenario SHA-256: ${inputs.scenario?.sha256 ?? 'unknown'}`,
    `- Паспорт подключен: ${inputs.fixture?.present ?? 'unknown'}`,
    `- Fixture: ${inputs.fixture?.path ?? 'none'}`,
    `- Fixture SHA-256: ${inputs.fixture?.sha256 ?? 'none'}`,
    `- Контракт: ${inputs.contract?.path ?? 'unknown'}`,
    `- Contract ID: ${inputs.contract?.id ?? result.evaluation.contractId ?? 'unknown'}`,
    `- Contract SHA-256: ${inputs.contract?.sha256 ?? 'unknown'}`,
    '',
    '## Настройки запуска',
    '',
    `- Provider: ${run.provider ?? 'unknown'}`,
    `- Модель Copilot: ${models.copilot ?? 'unknown'}`,
    `- Модель simulator: ${models.simulator ?? 'unknown'}`,
    `- Evaluator: ${models.evaluator ?? 'deterministic'}`,
    `- Temperature: ${run.temperature ?? 'unknown'}`,
    `- Seed: ${run.seed ?? 'none'}`,
    `- Reasoning: ${run.reasoning ? JSON.stringify(run.reasoning) : 'unknown'}`,
    `- Max output tokens: ${run.maxOutputTokens ? JSON.stringify(run.maxOutputTokens) : 'unknown'}`,
    ''
  ];

  if (usage) {
    lines.push(
      '## Usage',
      '',
      `- Usage input tokens: ${usage.inputTokens ?? 0}`,
      `- Usage output tokens: ${usage.outputTokens ?? 0}`,
      `- Usage total tokens: ${usage.totalTokens ?? 0}`,
      ''
    );
  }

  lines.push(
    '## Нарушения и предупреждения',
    ''
  );

  if (failed.length === 0) {
    lines.push('Падающих проверок нет.');
  } else {
    for (const finding of failed) {
      lines.push(`### ${finding.ruleId}`);
      lines.push('');
      lines.push(`- Критичность: ${finding.severity}`);
      lines.push(`- Причина: ${finding.reason || 'Причина не указана.'}`);
      if (finding.evidence) {
        lines.push(`- Доказательство: ${finding.evidence}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function transcriptToMarkdown(transcript) {
  return `${transcript.map((turn, index) => [
    `## ${index + 1}. ${turn.role}`,
    '',
    turn.content
  ].join('\n')).join('\n\n')}\n`;
}

export function writeRunReport(result, options = {}) {
  const reportRoot = resolve(options.reportRoot ?? 'reports');
  const timestamp = options.timestamp ?? new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  const scenarioDirName = options.scenarioDirName ?? result.scenarioId;
  const dir = join(reportRoot, timestamp, scenarioDirName);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(dir, 'summary.md'), buildSummaryMarkdown(result));
  writeFileSync(join(dir, 'transcript.md'), transcriptToMarkdown(result.transcript));

  return dir;
}

export function buildMatrixSummaryMarkdown(summary) {
  const usage = summary.usageTotals ?? {};
  const lines = [
    '# Matrix Baseline Report',
    '',
    `**Итог:** ${summary.verdict}`,
    '',
    '## Matrix settings',
    '',
    `- Profile: ${summary.profile}`,
    `- Copilot models: ${(summary.copilotModels ?? []).join(', ')}`,
    `- Simulator model: ${summary.simulatorModel}`,
    `- Runs per model: ${summary.runs}`,
    `- Expected scenario-runs: ${summary.expectedRuns ?? summary.totalRuns}`,
    `- Total scenario-runs: ${summary.totalRuns}`,
    `- Passed scenario-runs: ${summary.passRuns}`,
    `- Failed scenario-runs: ${summary.failRuns}`,
    `- Behavior failed scenario-runs: ${summary.behaviorFailRuns ?? 0}`,
    `- Infra blocked scenario-runs: ${summary.infraBlockedRuns ?? 0}`,
    `- Contract review scenario-runs: ${summary.contractReviewRuns ?? 0}`,
    '',
    '## Usage',
    '',
    `- Usage input tokens: ${usage.inputTokens ?? 0}`,
    `- Usage output tokens: ${usage.outputTokens ?? 0}`,
    `- Usage total tokens: ${usage.totalTokens ?? 0}`,
    '',
    '## Preflight',
    '',
    `- Source profile: ${summary.preflightSummary?.sourceProfile ?? 'unknown'}`,
    `- Total estimated prompt tokens: ${summary.preflightSummary?.totalEstimatedPromptTokens ?? 0}`,
    `- Max estimated prompt tokens: ${summary.preflightSummary?.maxEstimatedPromptTokens ?? 0}`,
    `- Preflight warnings: ${summary.preflightSummary?.warningCount ?? 0}`,
    '',
    '## Failures',
    ''
  ];

  if ((summary.failures ?? []).length === 0) {
    lines.push('Падающих проверок нет.');
  } else {
    for (const failure of summary.failures) {
      const error = failure.error ? ` | ${failure.error}` : '';
      lines.push(`- ${failure.scenarioId} | ${failure.copilotModel} | run ${failure.runIndex + 1} | ${failure.verdict} | ${failure.reportDir}${error}`);
    }
  }

  lines.push('', '## Scenario Runs', '');
  for (const result of summary.results ?? []) {
    const error = result.error ? ` | ${result.error}` : '';
    lines.push(`- ${result.scenarioId} | ${result.copilotModel} | run ${result.runIndex + 1} | ${result.verdict} | ${result.reportDir}${error}`);
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeMatrixReport(summary, options = {}) {
  const reportRoot = resolve(options.reportRoot ?? 'reports');
  const timestamp = options.timestamp ?? new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  const dir = join(reportRoot, timestamp);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'matrix-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, 'matrix-summary.md'), buildMatrixSummaryMarkdown(summary));

  return dir;
}
