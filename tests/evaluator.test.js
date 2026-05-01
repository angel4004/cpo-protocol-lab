import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { evaluateTranscript } from '../src/evaluator/deterministicRules.js';

const draftAlreadyInSourcesContract = JSON.parse(readFileSync(new URL('../contracts/draft-already-in-sources.mvp.contract.json', import.meta.url), 'utf8'));
const pafContradictoryContextContract = JSON.parse(readFileSync(new URL('../contracts/paf-contradictory-context.baseline.contract.json', import.meta.url), 'utf8'));
const pafPmfWithoutEvidenceContract = JSON.parse(readFileSync(new URL('../contracts/paf-pmf-without-evidence.baseline.contract.json', import.meta.url), 'utf8'));
const pafStageDiscoveryVsGrowthContract = JSON.parse(readFileSync(new URL('../contracts/paf-stage-discovery-vs-growth.baseline.contract.json', import.meta.url), 'utf8'));

const contract = {
  id: 'onboarding-contract-test',
  rules: [
    {
      id: 'sources.blocks',
      severity: 'hard_fail',
      type: 'required_patterns',
      target: 'assistant',
      patterns: [
        'Что уже подключено',
        'Что обязательно добавить',
        'Что не стоит добавлять',
        'Что можно добавить позже'
      ],
      reason: 'Copilot must show the four mandatory Sources blocks.'
    },
    {
      id: 'cvc.before.draft',
      severity: 'hard_fail',
      type: 'ordered_patterns',
      target: 'assistant',
      before: 'Customer Value Chain',
      after: '\\[DRAFT PROJECT PASSPORT\\]',
      reason: 'Customer Value Chain Intake must happen before Draft Project Passport.'
    },
    {
      id: 'draft.not.final',
      severity: 'hard_fail',
      type: 'forbidden_patterns',
      target: 'assistant',
      patterns: ['Draft Project Passport готов для загрузки в Sources', '\\[FINAL PROJECT PASSPORT SNAPSHOT\\]'],
      reason: 'Draft must not be presented as final or ready for Sources.'
    },
    {
      id: 'hardening.question.shape',
      severity: 'hard_fail',
      type: 'required_after_pattern',
      target: 'assistant',
      anchor: '\\[PASSPORT HARDENING INTERVIEW\\]',
      patterns: ['A\\.', 'B\\.', 'C\\.', 'Что изменится в паспорте'],
      reason: 'Hardening must ask an A/B/C question and name the passport field impact.'
    },
    {
      id: 'final.not.same.turn.as.draft',
      severity: 'hard_fail',
      type: 'forbidden_in_turn_with_pattern',
      target: 'assistant',
      anchor: '\\[DRAFT PROJECT PASSPORT\\]',
      patterns: ['\\[FINAL PROJECT PASSPORT SNAPSHOT\\]'],
      reason: 'Final Snapshot must not appear in the first post-draft turn.'
    }
  ]
};

test('evaluateTranscript passes deterministic onboarding contract checks', () => {
  const transcript = [
    {
      role: 'assistant',
      content: [
        'Что уже подключено',
        'Что обязательно добавить в Sources сейчас',
        'Что не стоит добавлять в Sources',
        'Что можно добавить позже',
        'Customer Value Chain Intake'
      ].join('\n')
    },
    { role: 'user', content: 'Ответил на вопросы.' },
    {
      role: 'assistant',
      content: [
        '[DRAFT PROJECT PASSPORT]',
        'Это рабочий черновик, не publish artifact.',
        '[PASSPORT CHALLENGE REVIEW]',
        '[PASSPORT HARDENING INTERVIEW]',
        'Что изменится в паспорте: Customer Value Chain.',
        'A. Уточнить need',
        'B. Уточнить action',
        'C. Оставить unknown'
      ].join('\n')
    }
  ];

  const result = evaluateTranscript(transcript, contract);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.every((finding) => finding.status === 'pass'), true);
});

test('evaluateTranscript fails when draft is treated as publish-ready and final appears too early', () => {
  const transcript = [
    {
      role: 'assistant',
      content: [
        'Что уже подключено',
        'Что обязательно добавить',
        'Что не стоит добавлять',
        'Что можно добавить позже',
        '[DRAFT PROJECT PASSPORT]',
        'Draft Project Passport готов для загрузки в Sources.',
        '[FINAL PROJECT PASSPORT SNAPSHOT]'
      ].join('\n')
    }
  ];

  const result = evaluateTranscript(transcript, contract);

  assert.equal(result.verdict, 'hard_fail');
  assert.equal(result.findings.some((finding) => finding.ruleId === 'draft.not.final' && finding.status === 'fail'), true);
  assert.equal(result.findings.some((finding) => finding.ruleId === 'cvc.before.draft' && finding.status === 'fail'), true);
  assert.equal(result.findings.some((finding) => finding.ruleId === 'final.not.same.turn.as.draft' && finding.status === 'fail'), true);
});

test('evaluateTranscript requires a user hardening answer before Final Snapshot', () => {
  const finalBoundaryContract = {
    id: 'final-boundary-test',
    rules: [
      {
        id: 'final.after-hardening-answer',
        severity: 'hard_fail',
        type: 'final_requires_user_responses_after_anchor',
        anchor: 'PASSPORT HARDENING INTERVIEW|Passport Hardening',
        final: '\\[FINAL PROJECT PASSPORT SNAPSHOT\\]|Final Passport Snapshot',
        userPattern: '\\b(?:A|B|C)\\b|вариант\\s+[ABC]',
        minUserResponses: 1,
        reason: 'Final Passport Snapshot must appear only after at least one user answer to hardening.'
      }
    ]
  };

  const failed = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '[PASSPORT HARDENING INTERVIEW]',
        'Что изменится в паспорте: Customer Value Chain.',
        'A. Уточнить need',
        'B. Уточнить action',
        'C. Оставить unknown'
      ].join('\n')
    },
    {
      role: 'assistant',
      content: '[FINAL PROJECT PASSPORT SNAPSHOT]'
    }
  ], finalBoundaryContract);

  assert.equal(failed.verdict, 'hard_fail');
  assert.equal(failed.findings[0].status, 'fail');

  const passed = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '[PASSPORT HARDENING INTERVIEW]',
        'Что изменится в паспорте: Customer Value Chain.',
        'A. Уточнить need',
        'B. Уточнить action',
        'C. Оставить unknown'
      ].join('\n')
    },
    {
      role: 'user',
      content: 'Выбираю вариант A.'
    },
    {
      role: 'assistant',
      content: '[FINAL PROJECT PASSPORT SNAPSHOT]'
    }
  ], finalBoundaryContract);

  assert.equal(passed.verdict, 'pass');
  assert.equal(passed.findings[0].status, 'pass');
});

test('evaluateTranscript does not treat future Final Snapshot mentions as final artifact when final pattern is exact', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: 'После hardening я подготовлю Final Passport Snapshot, но сейчас только задаю вопрос.'
    },
    {
      role: 'assistant',
      content: '[PASSPORT HARDENING INTERVIEW]\nA. One\nB. Two\nC. Three'
    }
  ], {
    id: 'future-final-mention-test',
    rules: [
      {
        id: 'final.after-hardening-answer',
        severity: 'hard_fail',
        type: 'final_requires_user_responses_after_anchor',
        anchor: 'PASSPORT HARDENING INTERVIEW|Passport Hardening',
        final: '\\[FINAL PROJECT PASSPORT SNAPSHOT\\]',
        userPattern: '\\b(?:A|B|C)\\b',
        minUserResponses: 1,
        reason: 'Final Snapshot must appear only after hardening answers.'
      }
    ]
  });

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings[0].status, 'pass');
});

test('evaluateTranscript can ignore forbidden claims when they appear in explicit prohibition context', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: 'Нельзя утверждать, что PMF/PCF достигнуты: evidence пока нет.'
    }
  ], {
    id: 'forbidden-context-test',
    rules: [
      {
        id: 'claims.no-evidence',
        severity: 'hard_fail',
        type: 'forbidden_patterns',
        target: 'assistant',
        patterns: [
          'PCF (?:есть|достигнут|подтвержд)'
        ],
        allowedContextPatterns: [
          'Нельзя утверждать[^\\n]{0,120}PCF[^\\n]{0,80}достигнут'
        ],
        reason: 'Copilot must not assert PCF without evidence.'
      }
    ]
  });

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings[0].status, 'pass');
});

test('evaluateTranscript allows forbidden PMF wording inside explicit claim and conflict context', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '## Противоречие / conflict',
        '',
        'Запрошенный вывод — `PMF подтверждён, можно переходить к Growth` — конфликтует с текущим evidence.',
        '',
        '**Claim:** сформулировать, что product/market fit подтверждён (PMF — состояние выбора продукта как основного способа), и перейти к Product Growth.',
        '',
        '**Конфликт:** в проектном контексте прямо указано, что отсутствуют ключевые элементы PMF evidence.',
        '',
        'Поэтому я не могу сформулировать, что PMF подтверждён, и не могу рекомендовать переход к Growth.',
        '',
        '## PMF evidence block',
        '',
        '**Обсуждаемый PMF-вывод (PMF claim):** Команда хочет утверждать, что PMF подтверждён и можно переходить к Product Growth.',
        '**Потребность (Need):** managers need cancellation insights.',
        '**Сегмент пользователей (Segment):** managers of mid-size hotels.',
        '**Текущая альтернатива (Alternative):** Missing input.',
        '**Метрика PMF (PMF metric):** Missing input.',
        '**Норма сравнения (norm / baseline / benchmark):** Missing input.',
        '**Качественные доказательства (qualitative evidence):** early interest, not PMF evidence.',
        '**Next check:** провести PMF validation.',
        '',
        'PMF пока не подтверждён, и переход к Growth сейчас нельзя утверждать.'
      ].join('\n')
    }
  ], pafPmfWithoutEvidenceContract);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'pmf.no-unsupported-confirmation').status, 'pass');
});

test('evaluateTranscript still rejects positive PMF confirmation outside claim context', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        'PMF подтверждён.',
        'Потребность: managers need cancellation insights.',
        'Сегмент пользователей: managers of mid-size hotels.',
        'Текущая альтернатива: dashboards.',
        'Метрика PMF: usage.',
        'baseline / benchmark / norm: assumed.',
        'qualitative evidence: demo feedback.',
        'next step: Growth.'
      ].join('\n')
    }
  ], pafPmfWithoutEvidenceContract);

  assert.equal(result.verdict, 'hard_fail');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'pmf.no-unsupported-confirmation').status, 'fail');
});

test('PAF contradictory context contract allows requested PMF wording inside explicit conflict framing', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '## Противоречие / conflict',
        '',
        'Запрос просит сформулировать «PMF есть», но контекст содержит факты, которые этот claim прямо опровергают.',
        '',
        'Evidence gap: нет выбранной метрики PMF, нет baseline, нет нормы сравнения.',
        '',
        'Forbidden claim labels:',
        '- `PMF status: not assessed / missing evidence`',
        '',
        'Next check: выбрать метрику PMF и собрать evidence после реального использования.'
      ].join('\n')
    }
  ], pafContradictoryContextContract);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'contradictions.no-claim-smoothing').status, 'pass');
});

test('PAF stage contract allows explicit correction that Stage 2 is Discovery and not Growth', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        'Противоречие / conflict: Stage 2 здесь означает Market Research внутри Product Discovery, а не Product Growth.',
        '',
        'В каноне есть Product Life Cycle и 7 стадий внутри Product Discovery.',
        '',
        'Команда говорит «Stage 2», потому что делает Market Research. Значит, это Stage 2 внутри Product Discovery, а не Product Growth.',
        '',
        'PMF evidence отсутствует, поэтому переход к Growth не обоснован.'
      ].join('\n')
    }
  ], pafStageDiscoveryVsGrowthContract);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'stage-routing.no-false-growth-readiness').status, 'pass');
});

test('evaluateTranscript can ignore author-error phrase in explicit no-blame context', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: 'Это не ошибка автора — это onboarding gap старого протокола.'
    }
  ], {
    id: 'no-blame-context-test',
    rules: [
      {
        id: 'legacy.not-author-error',
        severity: 'hard_fail',
        type: 'forbidden_patterns',
        target: 'assistant',
        patterns: [
          'ошибк(?:а|ой) автора'
        ],
        allowedContextPatterns: [
          'не\\s+ошибк(?:а|ой) автора'
        ],
        reason: 'Copilot must not blame the passport author.'
      }
    ]
  });

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings[0].status, 'pass');
});

test('evaluateTranscript checks later anchored turns when an earlier anchor mention is only a plan', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: 'После draft я начну Passport Hardening Interview одним вопросом за шаг.'
    },
    {
      role: 'assistant',
      content: [
        '[PASSPORT HARDENING INTERVIEW]',
        'Поле паспорта: Decision rights.',
        'Что изменится в паспорте: будет заполнено поле decision rights.',
        'A) PM decides',
        'B) Committee decides',
        'C) PM decides with CPO guardrail'
      ].join('\n')
    }
  ], {
    id: 'later-anchor-test',
    rules: [
      {
        id: 'hardening.question-shape',
        severity: 'hard_fail',
        type: 'required_after_pattern',
        target: 'assistant',
        anchor: 'PASSPORT HARDENING INTERVIEW|Passport Hardening',
        patterns: ['A[\\.)]', 'B[\\.)]', 'C[\\.)]', 'Что изменится в паспорте|Поле паспорта'],
        reason: 'Hardening question must contain A/B/C options.'
      }
    ]
  });

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings[0].status, 'pass');
});

test('evaluateTranscript treats scoped forbidden checks as not applicable when anchor is absent', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: 'Пока собираю Customer Value Chain Intake и еще не показываю draft artifact.'
    }
  ], {
    id: 'scoped-forbidden-without-anchor-test',
    rules: [
      {
        id: 'final.not-in-first-post-draft-turn',
        severity: 'hard_fail',
        type: 'forbidden_in_turn_with_pattern',
        target: 'assistant',
        anchor: '\\[DRAFT PROJECT PASSPORT\\]',
        patterns: ['\\[FINAL PROJECT PASSPORT SNAPSHOT\\]'],
        reason: 'Final Snapshot must not appear in the draft turn.'
      }
    ]
  });

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings[0].status, 'pass');
});

test('draft-already-in-sources contract allows final passport publication wording after draft removal', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '## Sources Check',
        '### Что уже подключено в Sources',
        'runtime/core/canon_paf_knowledge_layer.md',
        '### Что обязательно добавить в Sources сейчас',
        'Ничего из рабочего пакета не требуется добавить.',
        '### Что не стоит добавлять в Sources',
        'Промежуточные рабочие черновики.',
        '### Что можно добавить позже',
        'Стабильный финальный паспорт.',
        'Mode Check: product mode.',
        '[PASSPORT HARDENING INTERVIEW]',
        'Поле паспорта: Source hygiene / Passport visibility.',
        'Что изменится в паспорте: Source status.',
        'A. Удалить draft из Sources сейчас.',
        'B. Заменить его финальным файлом после hardening.',
        'C. Оставить как publish blocker.',
        'Source status: draft removed from Sources. Этот chat-only рабочий черновик будет hardened в чате. Финальная стабильная версия [PROJECT PASSPORT] будет подготовлена в формате markdown и добавлена в Sources вручную пользователем после завершения Passport Hardening.'
      ].join('\n')
    }
  ], draftAlreadyInSourcesContract);

  assert.equal(result.verdict, 'pass');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'draft.not-ready-for-sources').status, 'pass');
});

test('draft-already-in-sources contract rejects draft passport ready-for-Sources wording', () => {
  const result = evaluateTranscript([
    {
      role: 'assistant',
      content: [
        '## Sources Check',
        '### Что уже подключено в Sources',
        'runtime/core/canon_paf_knowledge_layer.md',
        '### Что обязательно добавить в Sources сейчас',
        'Ничего из рабочего пакета не требуется добавить.',
        '### Что не стоит добавлять в Sources',
        'Промежуточные рабочие черновики.',
        '### Что можно добавить позже',
        'Стабильный финальный паспорт.',
        'Mode Check: product mode.',
        '[PASSPORT HARDENING INTERVIEW]',
        'Поле паспорта: Source hygiene / Passport visibility.',
        'Что изменится в паспорте: Source status.',
        'A. Удалить draft из Sources сейчас.',
        'B. Заменить его финальным файлом после hardening.',
        'C. Оставить как publish blocker.',
        'Draft Project Passport готов для загрузки в Sources.'
      ].join('\n')
    }
  ], draftAlreadyInSourcesContract);

  assert.equal(result.verdict, 'hard_fail');
  assert.equal(result.findings.find((finding) => finding.ruleId === 'draft.not-ready-for-sources').status, 'fail');
});
