export function resolveScenarioModels(scenario, env = process.env) {
  return {
    copilot: env.COPILOT_MODEL ?? env.OPENROUTER_MODEL ?? env.OPENAI_MODEL ?? scenario.models?.copilot,
    simulator: env.SIMULATOR_MODEL ?? env.OPENROUTER_MODEL ?? env.OPENAI_MODEL ?? scenario.models?.simulator,
    evaluator: scenario.models?.evaluator ?? 'deterministic'
  };
}

export function buildRunSettings(scenario, provider) {
  return {
    provider,
    models: {
      copilot: scenario.models?.copilot,
      simulator: scenario.models?.simulator,
      evaluator: scenario.models?.evaluator ?? 'deterministic'
    },
    temperature: scenario.temperature,
    seed: scenario.seed,
    reasoning: scenario.reasoning,
    maxOutputTokens: scenario.maxOutputTokens
  };
}
