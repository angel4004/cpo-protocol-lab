import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSimulatorInstructions } from '../src/simulator.js';

test('buildSimulatorInstructions treats provided passport as the only project fact source', () => {
  const instructions = buildSimulatorInstructions(
    '# Project Passport\n\nProduct: Real Product\nCustomer: hotel manager\n',
    { mode: 'product' }
  );

  assert.match(instructions, /Ты не Copilot/);
  assert.match(instructions, /отвечай только на последний вопрос/i);
  assert.match(instructions, /паспорт проекта является единственным источником фактов/i);
  assert.match(instructions, /если спрашивают режим, выбирай product mode/i);
  assert.match(instructions, /Real Product/);
  assert.doesNotMatch(instructions, /expected assertions/i);
});

test('buildSimulatorInstructions does not invent a product when no passport is provided', () => {
  const instructions = buildSimulatorInstructions(null, { mode: 'exploration' });

  assert.match(instructions, /NO PROJECT PASSPORT PROVIDED/);
  assert.match(instructions, /не выдумывай продукт/i);
  assert.match(instructions, /если спрашивают режим, выбирай exploration mode/i);
  assert.match(instructions, /на продуктовые вопросы отвечай/i);
  assert.doesNotMatch(instructions, /\nnull\n/);
});
