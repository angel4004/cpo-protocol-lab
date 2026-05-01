#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildCheckPlan } from './checkCommand.js';
import { loadDotEnv, loadScenarioPackage } from './config.js';
import {
  buildMatrixCellReportName,
  buildMatrixPlan,
  buildMatrixSummary,
  estimatePromptTokensFromChars,
  sanitizeProviderErrorMessage
} from './matrixCommand.js';
import { createModelClient, inferModelProvider } from './modelClient.js';
import { writeMatrixReport, writeRunReport } from './report.js';
import { replayReportFile } from './replay.js';
import { runScenarioWithClients } from './runner.js';
import { buildRunSettings, resolveScenarioModels } from './runSettings.js';
import { formatSourceBundleForPrompt, readGitRefBundle } from './sourceBundle.js';

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
    '  npm run check -- --suite paf-baseline',
    '  npm run check:exploration',
    '',
    'Advanced:',
    '  node src/cli.js check --passport fixtures/local/my-project-passport.md',
    '  node src/cli.js check --mode exploration',
    '  node src/cli.js check --suite branch',
    '  node src/cli.js bundle --scenario scenarios/product-happy.scenario.json',
    '  node src/cli.js run --scenario scenarios/product-happy.scenario.json',
    '  node src/cli.js replay --report reports/<timestamp>/<scenario>/report.json',
    '  node src/cli.js matrix --suite paf-baseline --profile quality-full',
    '  node src/cli.js run-all',
    '',
    'Options:',
    '  --cpo-repo <path>       Override scenario.source.repoPath',
    '  --source-ref <ref>      Override scenario.source.ref. Use upstream for pushed branch snapshot or working-tree for local candidate files',
    '  --fixture <path>        Override scenario.fixturePath with a real local project passport',
    '  --no-fixture            Run without a project passport; simulator must not invent a product',
    '  --no-fetch              Do not fetch before reading upstream/origin ref',
    '  --allow-dirty           Do not fail when source repo working tree is dirty',
    '  --report-root <path>    Override reports directory',
    '  --report <path>         Report JSON for replay command',
    '  --passport <path>       Friendly alias for --fixture in check command',
    '  --mode <mode>           check mode: product or exploration',
    '  --suite <name>          check suite: branch',
    '  --profile <name>        matrix profile: smoke, candidate, quality-full, release or release-full',
    '  --copilot-models <csv>  matrix Copilot models override',
    '  --runs <n>              matrix runs per Copilot model',
    '  --simulator-model <id>  matrix simulator model override',
    '  --resume <timestamp>    Reuse existing matrix cell reports from reports/<timestamp> and run only missing cells',
    '  --prompt-token-warning <n>  Warn in preflight when estimated prompt tokens exceed n'
  ].join('\n');
}

function loadEnvironment() {
  loadDotEnv('.env', {
    requiredKeys: ['OPENROUTER_API_KEY']
  });
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

function matrixTimestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

function reportRoot(options) {
  return resolve(options['report-root'] ?? 'reports');
}

function reportDirectory(options, timestamp, scenarioDirName) {
  return join(reportRoot(options), timestamp, scenarioDirName);
}

function readExistingRunReport(options, timestamp, scenarioDirName) {
  const reportDir = reportDirectory(options, timestamp, scenarioDirName);
  const reportPath = join(reportDir, 'report.json');
  if (!existsSync(reportPath)) {
    return null;
  }

  return {
    ...JSON.parse(readFileSync(reportPath, 'utf8')),
    reportDir
  };
}

function parseWarningThreshold(options) {
  if (options['prompt-token-warning'] === undefined) {
    return 120000;
  }

  const parsed = Number.parseInt(String(options['prompt-token-warning']), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--prompt-token-warning must be a positive integer, got: ${options['prompt-token-warning']}`);
  }

  return parsed;
}

function initialPromptForPreflight(scenario, bundle) {
  if (scenario.initialPrompt) {
    return scenario.initialPrompt;
  }

  if (scenario.initialUserMessage) {
    return `${bundle.initialPrompt.trimEnd()}\n\n${scenario.initialUserMessage}`;
  }

  return bundle.initialPrompt;
}

function buildPreflightEntry(cell, scenarioPath, options, warningThreshold) {
  const { scenario } = loadScenarioPackage(scenarioPath, {
    fixturePath: options.fixture,
    noFixture: options['no-fixture'] === true
  });
  scenario.models = resolveScenarioModels(scenario, {
    ...process.env,
    COPILOT_MODEL: cell.copilotModel,
    SIMULATOR_MODEL: cell.simulatorModel
  });

  const bundle = readGitRefBundle(sourceOptions(scenario, options));
  const sourceInventory = bundle.files.map((file) => `- ${file.path}`).join('\n');
  const sourceContent = formatSourceBundleForPrompt(bundle);
  const promptChars = [
    sourceInventory,
    sourceContent,
    initialPromptForPreflight(scenario, bundle)
  ].join('\n\n').length;
  const estimatedPromptTokens = estimatePromptTokensFromChars(promptChars);

  return {
    scenarioId: scenario.id,
    scenarioPath,
    copilotModel: cell.copilotModel,
    simulatorModel: cell.simulatorModel,
    runIndex: cell.runIndex,
    sourceProfile: 'full',
    sourceFiles: bundle.fileCount,
    bundleSha256: bundle.bundleSha256,
    sourceChars: sourceContent.length,
    promptChars,
    estimatedPromptTokens,
    warningThreshold,
    budgetStatus: estimatedPromptTokens > warningThreshold ? 'warning' : 'ok'
  };
}

async function runScenario(scenarioPath, options) {
  loadEnvironment(options);
  const { scenario, fixture, contract, inputs } = loadScenarioPackage(scenarioPath, {
    fixturePath: options.fixture,
    noFixture: options['no-fixture'] === true
  });
  scenario.models = resolveScenarioModels(scenario, {
    ...process.env,
    COPILOT_MODEL: options['copilot-model'] ?? process.env.COPILOT_MODEL,
    SIMULATOR_MODEL: options['simulator-model'] ?? process.env.SIMULATOR_MODEL
  });

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
  const reportDir = writeRunReport(report, {
    reportRoot: options['report-root'],
    timestamp: options.timestamp,
    scenarioDirName: options.scenarioDirName
  });

  console.log(`${scenario.id}: ${report.evaluation.verdict}`);
  console.log(`Report: ${reportDir}`);

  for (const finding of report.evaluation.findings.filter((item) => item.status === 'fail')) {
    console.log(`- ${finding.severity}: ${finding.ruleId} - ${finding.reason}`);
  }

  return {
    ...report,
    reportDir
  };
}

function errorMessage(error) {
  return sanitizeProviderErrorMessage(error instanceof Error ? error.message : String(error));
}

function buildApiErrorReport(cell, scenarioPath, options, error) {
  const { scenario, fixture, contract, inputs } = loadScenarioPackage(scenarioPath, {
    fixturePath: options.fixture,
    noFixture: options['no-fixture'] === true
  });
  scenario.models = resolveScenarioModels(scenario, {
    ...process.env,
    COPILOT_MODEL: cell.copilotModel,
    SIMULATOR_MODEL: cell.simulatorModel
  });

  let source;
  try {
    const bundle = readGitRefBundle(sourceOptions(scenario, options));
    source = sourceSummary(bundle);
  } catch (sourceError) {
    source = {
      error: errorMessage(sourceError)
    };
  }

  const message = errorMessage(error);
  return {
    scenarioId: scenario.id,
    transcript: [],
    source,
    inputs,
    run: buildRunSettings(scenario, inferModelProvider()),
    contractSnapshot: contract,
    error: message,
    evaluation: {
      contractId: contract.id,
      verdict: 'infra_blocked',
      findings: [
        {
          ruleId: 'matrix.api-error',
          status: 'fail',
          severity: 'infra_blocked',
          reason: message
        }
      ]
    },
    scenarioPath,
    copilotModel: cell.copilotModel,
    simulatorModel: cell.simulatorModel,
    runIndex: cell.runIndex
  };
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

  if (options.command === 'matrix') {
    loadEnvironment(options);
    const matrixOptions = {
      ...options,
      suite: options.suite ?? 'paf-baseline'
    };
    const checkPlan = buildCheckPlan(matrixOptions);
    const matrixPlan = buildMatrixPlan(matrixOptions, checkPlan.steps);
    const timestamp = options.resume ?? options.timestamp ?? matrixTimestamp();
    const warningThreshold = parseWarningThreshold(options);
    const results = [];
    const preflight = matrixPlan.cells.map((cell) => buildPreflightEntry(
      cell,
      cell.scenarioPath,
      {
        ...options,
        fixture: checkPlan.steps[cell.scenarioIndex]?.fixture,
        'no-fixture': false
      },
      warningThreshold
    ));

    console.log(`Matrix: ${matrixPlan.profile}`);
    console.log(`Suite: ${matrixOptions.suite}`);
    console.log(`Source profile: ${matrixPlan.sourceProfile}`);
    console.log(`Copilot models: ${matrixPlan.copilotModels.join(', ')}`);
    console.log(`Simulator model: ${matrixPlan.simulatorModel}`);
    console.log(`Runs per model: ${matrixPlan.runs}`);
    console.log(`Scenario-runs: ${matrixPlan.cells.length}`);
    console.log(`Max estimated prompt tokens: ${Math.max(...preflight.map((item) => item.estimatedPromptTokens))}`);

    for (const [index, cell] of matrixPlan.cells.entries()) {
      const scenarioDirName = buildMatrixCellReportName(cell);
      console.log(`[${index + 1}/${matrixPlan.cells.length}] ${cell.scenarioPath} | ${cell.copilotModel} | run ${cell.runIndex + 1}`);
      if (options.resume) {
        const existingReport = readExistingRunReport(options, timestamp, scenarioDirName);
        if (existingReport) {
          console.log(`${existingReport.scenarioId}: ${existingReport.evaluation?.verdict} (resumed)`);
          console.log(`Report: ${existingReport.reportDir}`);
          results.push({
            ...existingReport,
            scenarioPath: cell.scenarioPath,
            copilotModel: cell.copilotModel,
            simulatorModel: cell.simulatorModel,
            runIndex: cell.runIndex
          });
          continue;
        }
      }

      const runOptions = {
        ...options,
        timestamp,
        scenarioDirName,
        fixture: checkPlan.steps[cell.scenarioIndex]?.fixture,
        'no-fixture': false,
        'copilot-model': cell.copilotModel,
        'simulator-model': cell.simulatorModel
      };
      let report;
      try {
        report = await runScenario(cell.scenarioPath, runOptions);
      } catch (error) {
        report = buildApiErrorReport(cell, cell.scenarioPath, runOptions, error);
        report.reportDir = writeRunReport(report, {
          reportRoot: options['report-root'],
          timestamp,
          scenarioDirName
        });
        console.log(`${report.scenarioId}: ${report.evaluation.verdict}`);
        console.log(`Report: ${report.reportDir}`);
        console.log(`- infra_blocked: ${report.error}`);
      }
      results.push({
        ...report,
        scenarioPath: cell.scenarioPath,
        copilotModel: cell.copilotModel,
        simulatorModel: cell.simulatorModel,
        runIndex: cell.runIndex
      });
    }

    const summary = buildMatrixSummary({
      profile: matrixPlan.profile,
      copilotModels: matrixPlan.copilotModels,
      simulatorModel: matrixPlan.simulatorModel,
      runs: matrixPlan.runs,
      expectedRuns: matrixPlan.cells.length,
      preflight,
      results
    });
    const matrixReportDir = writeMatrixReport(summary, {
      reportRoot: options['report-root'],
      timestamp
    });

    console.log(`Matrix verdict: ${summary.verdict}`);
    console.log(`Matrix report: ${matrixReportDir}`);
    if (summary.verdict !== 'pass') {
      process.exitCode = 1;
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
