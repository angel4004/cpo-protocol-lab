#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildCheckPlan } from './checkCommand.js';
import { loadDotEnv, loadScenarioPackage } from './config.js';
import { createModelClient, inferModelProvider } from './modelClient.js';
import { writeRunReport } from './report.js';
import { replayReportFile } from './replay.js';
import { runScenarioWithClients } from './runner.js';
import { buildRunSettings, resolveScenarioModels } from './runSettings.js';
import { readGitRefBundle } from './sourceBundle.js';

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  npm run check -- --passport fixtures/local/my-project-passport.md',
    '  npm run check:branch',
    '  npm run check:exploration',
    '',
    'Advanced:',
    '  node src/cli.js check --passport fixtures/local/my-project-passport.md',
    '  node src/cli.js check --mode exploration',
    '  node src/cli.js check --suite branch',
    '  node src/cli.js bundle --scenario scenarios/product-happy.scenario.json',
    '  node src/cli.js run --scenario scenarios/product-happy.scenario.json',
    '  node src/cli.js replay --report reports/<timestamp>/<scenario>/report.json',
    '  node src/cli.js run-all',
    '',
    'Options:',
    '  --cpo-repo <path>       Override scenario.source.repoPath',
    '  --source-ref <ref>      Override scenario.source.ref. Use upstream for pushed branch snapshot',
    '  --fixture <path>        Override scenario.fixturePath with a real local project passport',
    '  --no-fixture            Run without a project passport; simulator must not invent a product',
    '  --no-fetch              Do not fetch before reading upstream/origin ref',
    '  --allow-dirty           Do not fail when source repo working tree is dirty',
    '  --report-root <path>    Override reports directory',
    '  --report <path>         Report JSON for replay command',
    '  --passport <path>       Friendly alias for --fixture in check command',
    '  --mode <mode>           check mode: product or exploration',
    '  --suite <name>          check suite: branch'
  ].join('\n');
}

function sourceOptions(scenario, options) {
  const source = scenario.source ?? {};
  if (source.type && source.type !== 'git_ref') {
    throw new Error(`Unsupported source.type: ${source.type}`);
  }

  return {
    repoPath: options['cpo-repo'] ?? source.repoPath ?? '../cpo',
    ref: options['source-ref'] ?? source.ref ?? 'upstream',
    fetchBeforeRead: options['no-fetch'] ? false : source.fetchBeforeRead ?? true,
    requireClean: options['allow-dirty'] ? false : source.requireClean ?? true,
    sourceDirs: source.sourceDirs,
    initialPromptPath: source.initialPromptPath
  };
}

function sourceSummary(bundle) {
  return {
    type: bundle.type,
    repoPath: bundle.repoPath,
    requestedRef: bundle.requestedRef,
    ref: bundle.ref,
    fetchBeforeRead: bundle.fetchBeforeRead,
    branch: bundle.branch,
    commitSha: bundle.commitSha,
    sourceDirs: bundle.sourceDirs,
    initialPromptPath: bundle.initialPromptPath,
    fileCount: bundle.fileCount,
    bundleSha256: bundle.bundleSha256,
    dirty: bundle.dirty,
    files: bundle.files.map((file) => ({
      path: file.path,
      sha256: file.sha256
    }))
  };
}

async function runScenario(scenarioPath, options) {
  loadDotEnv();
  const { scenario, fixture, contract, inputs } = loadScenarioPackage(scenarioPath, {
    fixturePath: options.fixture,
    noFixture: options['no-fixture'] === true
  });
  scenario.models = resolveScenarioModels(scenario);

  const bundle = readGitRefBundle(sourceOptions(scenario, options));
  const modelClient = createModelClient();
  const result = await runScenarioWithClients({
    scenario,
    bundle,
    fixture,
    contract,
    clients: {
      copilot: modelClient,
      simulator: modelClient
    }
  });
  const report = {
    ...result,
    source: sourceSummary(bundle),
    inputs,
    run: buildRunSettings(scenario, inferModelProvider()),
    contractSnapshot: contract
  };
  const reportDir = writeRunReport(report, { reportRoot: options['report-root'] });

  console.log(`${scenario.id}: ${report.evaluation.verdict}`);
  console.log(`Report: ${reportDir}`);

  for (const finding of report.evaluation.findings.filter((item) => item.status === 'fail')) {
    console.log(`- ${finding.severity}: ${finding.ruleId} - ${finding.reason}`);
  }

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === 'help' || options.command === '--help' || options.help) {
    console.log(usage());
    return;
  }

  if (options.command === 'replay') {
    if (!options.report) {
      throw new Error('--report is required for replay command.');
    }

    const report = replayReportFile(options.report);
    console.log(`${report.scenarioId}: ${report.evaluation.verdict}`);
    console.log('Replay: no API calls');

    for (const finding of report.evaluation.findings.filter((item) => item.status === 'fail')) {
      console.log(`- ${finding.severity}: ${finding.ruleId} - ${finding.reason}`);
    }
    return;
  }

  if (options.command === 'check') {
    const plan = buildCheckPlan(options);
    console.log(`Check: ${plan.label}`);
    console.log(`Scenarios: ${plan.steps.length}`);

    for (const [index, step] of plan.steps.entries()) {
      console.log(`[${index + 1}/${plan.steps.length}] ${step.scenarioPath}`);
      await runScenario(step.scenarioPath, {
        ...options,
        fixture: step.fixture,
        'no-fixture': false
      });
    }
    return;
  }

  if (options.command === 'bundle') {
    if (!options.scenario) {
      throw new Error('--scenario is required for bundle command.');
    }

    const { scenario } = loadScenarioPackage(options.scenario);
    const bundle = readGitRefBundle(sourceOptions(scenario, options));
    console.log(JSON.stringify(sourceSummary(bundle), null, 2));
    return;
  }

  if (options.command === 'run') {
    if (!options.scenario) {
      throw new Error('--scenario is required for run command.');
    }

    await runScenario(options.scenario, options);
    return;
  }

  if (options.command === 'run-all') {
    const scenarioDir = options['scenario-dir'] ?? 'scenarios';
    const scenarios = readdirSync(scenarioDir)
      .filter((name) => name.endsWith('.scenario.json'))
      .sort()
      .map((name) => join(scenarioDir, name));

    for (const scenarioPath of scenarios) {
      await runScenario(scenarioPath, options);
    }
    return;
  }

  throw new Error(`Unknown command: ${options.command}\n${usage()}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
