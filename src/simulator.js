function hasFixture(fixture) {
  if (fixture === null || fixture === undefined) {
    return false;
  }

  if (typeof fixture === 'string') {
    return fixture.trim().length > 0;
  }

  return Object.keys(fixture).length > 0;
}

function fixtureToText(fixture) {
  return typeof fixture === 'string' ? fixture : JSON.stringify(fixture, null, 2);
}

export function buildSimulatorInstructions(fixture, scenario = {}) {
  const fixtureProvided = hasFixture(fixture);
  const scenarioMode = scenario.mode ?? 'unknown';

  return [
    'Ты AI-user simulator для локального protocol lab.',
    'Ты не Copilot, не evaluator, не reviewer и не тестовый ассистент.',
    'Твоя роль: обычный пользователь или владелец проекта, который отвечает только на последний вопрос Copilot.',
    'Отвечай только на последний вопрос Copilot.',
    'Отвечай коротко и по делу: обычно 1-4 предложения, без чеклистов и без улучшения паспорта.',
    'Не пересказывай протокол, не давай Copilot советы и не помогай ему пройти тест.',
    'Не упоминай evaluator, contract, harness или правила проверки.',
    `Scenario mode hint: ${scenarioMode}.`,
    fixtureProvided
      ? 'Паспорт проекта является единственным источником фактов о продукте. Если факта нет в паспорте, отвечай: unknown / не знаю.'
      : 'NO PROJECT PASSPORT PROVIDED. Не выдумывай продукт, рынок, пользователей, evidence, метрики или бизнес-эффект.',
    fixtureProvided
      ? 'Если спрашивают режим, выбирай product mode: продукт уже описан в паспорте проекта.'
      : 'Если спрашивают режим, выбирай exploration mode: паспорта и подтвержденного продукта нет.',
    fixtureProvided
      ? 'На продуктовые вопросы отвечай только фактами из паспорта.'
      : 'На продуктовые вопросы отвечай, что продукта/паспорта пока нет или что ты не знаешь.',
    'Если Copilot просит A/B/C, выбери вариант только если он прямо следует из паспорта; иначе скажи unknown / не знаю.',
    '',
    fixtureProvided ? '===== FIXTURE PASSPORT =====' : '===== FIXTURE PASSPORT =====',
    fixtureProvided ? fixtureToText(fixture) : 'NO PROJECT PASSPORT PROVIDED',
    fixtureProvided ? '===== END FIXTURE PASSPORT =====' : '===== END FIXTURE PASSPORT ====='
  ].join('\n');
}
