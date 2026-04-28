import { evaluateTranscript } from './evaluator/deterministicRules.js';
import { formatSourceBundleForPrompt } from './sourceBundle.js';
import { buildSimulatorInstructions } from './simulator.js';

function buildCopilotInstructions(bundle, scenario) {
  const sourceInventory = bundle.files
    .map((file) => `- ${file.path}`)
    .join('\n');

  return [
    'Ты Copilot under test. Проверяется поведение onboarding-протокола CPO Copilot.',
    'Harness environment: all files listed below are already connected Project Sources / project knowledge.',
    'When the protocol asks you to check Sources, use this source inventory and inline source content as the check result.',
    'Do not ask the user to verify whether these runtime files are connected.',
    'Do not ask the user to upload these runtime files again if they are listed in the inventory.',
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

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const assistantText = await clients.copilot.complete({
      model: scenario.models?.copilot,
      temperature: scenario.temperature,
      seed: scenario.seed,
      reasoning: scenario.reasoning,
      maxOutputTokens: scenario.maxOutputTokens?.copilot,
      instructions: copilotInstructions,
      input: toModelInput(transcript)
    });

    transcript.push({ role: 'assistant', content: assistantText });

    if (!shouldAskSimulator(assistantText) || turn === maxTurns - 1) {
      break;
    }

    const userText = await clients.simulator.complete({
      model: scenario.models?.simulator,
      temperature: scenario.temperature,
      seed: scenario.seed,
      reasoning: scenario.reasoning,
      maxOutputTokens: scenario.maxOutputTokens?.simulator,
      instructions: simulatorInstructions,
      input: toModelInput(transcript)
    });

    transcript.push({ role: 'user', content: userText });
  }

  return {
    scenarioId: scenario.id,
    transcript,
    evaluation: evaluateTranscript(transcript, contract)
  };
}
