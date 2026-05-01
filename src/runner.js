import { evaluateTranscript } from './evaluator/deterministicRules.js';
import { formatSourceBundleForPrompt } from './sourceBundle.js';
import { buildSimulatorInstructions } from './simulator.js';

function scenarioHarnessMode(scenario) {
  return scenario.harnessMode ?? 'onboarding';
}

function buildCopilotInstructions(bundle, scenario) {
  const sourceInventory = bundle.files
    .map((file) => `- ${file.path}`)
    .join('\n');
  const harnessMode = scenarioHarnessMode(scenario);
  const modeInstructions = harnessMode === 'post_activation'
    ? [
        'Ты Copilot under test. Проверяется post-activation поведение CPO Copilot по обычному продуктовому вопросу.',
        'Harness environment: all files listed below are already connected Project Sources / project knowledge.',
        'Project setup is already complete: Project instructions are applied and stable project context is available in the user prompt when needed.',
        'Answer the current product question directly. Do not restart activation, onboarding, Sources setup or Project Passport creation unless the user explicitly asks for that.',
        'When the question touches PAF, use the connected CPO runtime sources as the source of truth.'
      ]
    : [
        'Ты Copilot under test. Проверяется поведение onboarding-протокола CPO Copilot.',
        'Harness environment: all files listed below are already connected Project Sources / project knowledge.',
        'When the protocol asks you to check Sources, use this source inventory and inline source content as the check result.',
        'Do not ask the user to verify whether these runtime files are connected.',
        'Do not ask the user to upload these runtime files again if they are listed in the inventory.'
      ];

  return [
    ...modeInstructions,
    `Source files count: ${bundle.files.length}`,
    'Project Sources inventory:',
    sourceInventory,
    'Не утверждай, что можешь обновлять Sources автоматически.',
    scenario.draftAlreadyInSources
      ? 'Scenario condition: Draft Project Passport already appeared in Sources before Final Passport Snapshot.'
      : '',
    '',
    '===== INLINE PROJECT SOURCES =====',
    formatSourceBundleForPrompt(bundle),
    '===== END INLINE PROJECT SOURCES ====='
  ].filter(Boolean).join('\n');
}

function toModelInput(transcript) {
  return transcript.map((turn) => ({
    role: turn.role,
    content: turn.content
  }));
}

function shouldAskSimulator(assistantText) {
  if (/\[FINAL PROJECT PASSPORT SNAPSHOT\]/iu.test(assistantText)) {
    return false;
  }

  return /\?|Ответь\s+A\/B\/C|один\s+следующий\s+вопрос/iu.test(assistantText);
}

function completionText(result) {
  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result.text === 'string') {
    return result.text;
  }

  throw new Error('Model client returned completion without text.');
}

function completionUsage(result) {
  if (!result || typeof result === 'string' || !result.usage) {
    return undefined;
  }

  return result.usage;
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    modelCalls: []
  };
}

function recordUsage(total, role, model, usage) {
  if (!usage) {
    return;
  }

  const item = {
    role,
    model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0
  };
  total.inputTokens += item.inputTokens;
  total.outputTokens += item.outputTokens;
  total.totalTokens += item.totalTokens;
  total.modelCalls.push(item);
}

function initialPromptContent(scenario, bundle) {
  if (scenario.initialPrompt) {
    return scenario.initialPrompt;
  }

  if (scenario.initialUserMessage) {
    return `${bundle.initialPrompt.trimEnd()}\n\n${scenario.initialUserMessage}`;
  }

  return bundle.initialPrompt;
}

export async function runScenarioWithClients({ scenario, bundle, fixture, contract, clients }) {
  const maxTurns = scenario.maxTurns ?? 12;
  const transcript = [
    {
      role: 'user',
      content: initialPromptContent(scenario, bundle)
    }
  ];
  const copilotInstructions = buildCopilotInstructions(bundle, scenario);
  const simulatorInstructions = buildSimulatorInstructions(fixture, scenario);
  const usage = emptyUsage();

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const assistantCompletion = await clients.copilot.complete({
      model: scenario.models?.copilot,
      temperature: scenario.temperature,
      seed: scenario.seed,
      reasoning: scenario.reasoning,
      maxOutputTokens: scenario.maxOutputTokens?.copilot,
      instructions: copilotInstructions,
      input: toModelInput(transcript)
    });
    const assistantText = completionText(assistantCompletion);
    recordUsage(usage, 'copilot', scenario.models?.copilot, completionUsage(assistantCompletion));

    transcript.push({ role: 'assistant', content: assistantText });

    if (!shouldAskSimulator(assistantText) || turn === maxTurns - 1) {
      break;
    }

    const simulatorCompletion = await clients.simulator.complete({
      model: scenario.models?.simulator,
      temperature: scenario.temperature,
      seed: scenario.seed,
      reasoning: scenario.reasoning,
      maxOutputTokens: scenario.maxOutputTokens?.simulator,
      instructions: simulatorInstructions,
      input: toModelInput(transcript)
    });
    const userText = completionText(simulatorCompletion);
    recordUsage(usage, 'simulator', scenario.models?.simulator, completionUsage(simulatorCompletion));

    transcript.push({ role: 'user', content: userText });
  }

  return {
    scenarioId: scenario.id,
    transcript,
    usage: usage.modelCalls.length > 0 ? usage : undefined,
    evaluation: evaluateTranscript(transcript, contract)
  };
}
