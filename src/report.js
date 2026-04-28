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
    '',
    '## Нарушения и предупреждения',
    ''
  ];

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
  const dir = join(reportRoot, timestamp, result.scenarioId);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(dir, 'summary.md'), buildSummaryMarkdown(result));
  writeFileSync(join(dir, 'transcript.md'), transcriptToMarkdown(result.transcript));

  return dir;
}
