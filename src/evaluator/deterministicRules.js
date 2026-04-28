function asText(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(asText).join('\n');
  }

  if (value && typeof value === 'object' && 'content' in value) {
    return asText(value.content);
  }

  return '';
}

function textForTarget(transcript, target = 'assistant') {
  return transcript
    .filter((turn) => target === 'all' || turn.role === target)
    .map((turn) => asText(turn.content))
    .join('\n\n');
}

function regex(pattern, flags = 'iu') {
  return new RegExp(pattern, flags);
}

function firstMatch(text, pattern, flags) {
  const match = regex(pattern, flags).exec(text);
  return match ? { index: match.index, text: match[0] } : null;
}

function contextForMatch(text, match, windowSize = 160) {
  const start = Math.max(0, match.index - windowSize);
  const end = Math.min(text.length, match.index + match.text.length + windowSize);
  return text.slice(start, end);
}

function isAllowedForbiddenContext(text, match, rule) {
  if (!Array.isArray(rule.allowedContextPatterns) || rule.allowedContextPatterns.length === 0) {
    return false;
  }

  const context = contextForMatch(text, match);
  return rule.allowedContextPatterns.some((pattern) => regex(pattern, rule.flags).test(context));
}

function pass(rule, evidence = '') {
  return {
    ruleId: rule.id,
    severity: rule.severity ?? 'hard_fail',
    status: 'pass',
    reason: rule.reason ?? '',
    evidence
  };
}

function fail(rule, evidence = '') {
  return {
    ruleId: rule.id,
    severity: rule.severity ?? 'hard_fail',
    status: 'fail',
    reason: rule.reason ?? '',
    evidence
  };
}

function evaluateRequiredPatterns(transcript, rule) {
  const text = textForTarget(transcript, rule.target);
  const missing = rule.patterns.filter((pattern) => !regex(pattern, rule.flags).test(text));

  if (missing.length === 0) {
    return pass(rule);
  }

  return fail(rule, `Не найдены обязательные признаки: ${missing.join(', ')}`);
}

function evaluateForbiddenPatterns(transcript, rule) {
  const text = textForTarget(transcript, rule.target);
  const found = rule.patterns
    .map((pattern) => firstMatch(text, pattern, rule.flags))
    .filter(Boolean)
    .filter((match) => !isAllowedForbiddenContext(text, match, rule));

  if (found.length === 0) {
    return pass(rule);
  }

  return fail(rule, `Найден запрещенный вывод: ${found.map((item) => item.text).join(', ')}`);
}

function evaluateOrderedPatterns(transcript, rule) {
  const text = textForTarget(transcript, rule.target);
  const before = firstMatch(text, rule.before, rule.flags);
  const after = firstMatch(text, rule.after, rule.flags);

  if (!before || !after) {
    return fail(rule, `Не найден маркер порядка: before=${Boolean(before)}, after=${Boolean(after)}`);
  }

  if (before.index < after.index) {
    return pass(rule);
  }

  return fail(rule, `Нарушен порядок: "${after.text}" появился раньше "${before.text}"`);
}

function evaluateRequiredAfterPattern(transcript, rule) {
  const candidates = transcript.filter((turn) => {
    if (rule.target !== 'all' && turn.role !== rule.target) {
      return false;
    }

    return regex(rule.anchor, rule.flags).test(asText(turn.content));
  });

  if (candidates.length === 0) {
    return fail(rule, `Не найден anchor: ${rule.anchor}`);
  }

  const checked = candidates.map((candidate) => {
    const text = asText(candidate.content);
    return {
      text,
      missing: rule.patterns.filter((pattern) => !regex(pattern, rule.flags).test(text))
    };
  });

  if (checked.some((candidate) => candidate.missing.length === 0)) {
    return pass(rule);
  }

  const missing = checked[0].missing;
  return fail(rule, `После anchor не найдены признаки: ${missing.join(', ')}`);
}

function evaluateForbiddenInTurnWithPattern(transcript, rule) {
  const candidate = transcript.find((turn) => {
    if (rule.target !== 'all' && turn.role !== rule.target) {
      return false;
    }

    return regex(rule.anchor, rule.flags).test(asText(turn.content));
  });

  if (!candidate) {
    return pass(rule, `Anchor не найден: ${rule.anchor}. Scoped forbidden check не применялся.`);
  }

  const text = asText(candidate.content);
  const found = rule.patterns
    .map((pattern) => firstMatch(text, pattern, rule.flags))
    .filter(Boolean)
    .filter((match) => !isAllowedForbiddenContext(text, match, rule));

  if (found.length === 0) {
    return pass(rule);
  }

  return fail(rule, `В anchored turn найден запрещенный вывод: ${found.map((item) => item.text).join(', ')}`);
}

function evaluateMaxQuestionMarksPerTurn(transcript, rule) {
  const max = rule.max ?? 1;
  const offenders = transcript
    .filter((turn) => rule.target === 'all' || turn.role === rule.target)
    .map((turn, index) => ({
      index,
      count: (asText(turn.content).match(/\?/g) ?? []).length
    }))
    .filter((turn) => turn.count > max);

  if (offenders.length === 0) {
    return pass(rule);
  }

  return fail(rule, `Шаги со слишком большим числом вопросительных знаков: ${offenders.map((turn) => `${turn.index + 1}=${turn.count}`).join(', ')}`);
}

function evaluateFinalRequiresUserResponsesAfterAnchor(transcript, rule) {
  const finalIndex = transcript.findIndex((turn) => {
    if (turn.role !== 'assistant') {
      return false;
    }

    return regex(rule.final, rule.flags).test(asText(turn.content));
  });

  if (finalIndex === -1) {
    return pass(rule, 'Final Snapshot не появился.');
  }

  const anchorIndex = transcript.findIndex((turn, index) => {
    if (index >= finalIndex || turn.role !== 'assistant') {
      return false;
    }

    return regex(rule.anchor, rule.flags).test(asText(turn.content));
  });

  if (anchorIndex === -1) {
    return fail(rule, 'Final Snapshot появился до hardening anchor.');
  }

  const userPattern = regex(rule.userPattern, rule.flags);
  const matchingUserResponses = transcript
    .slice(anchorIndex + 1, finalIndex)
    .filter((turn) => turn.role === 'user' && userPattern.test(asText(turn.content)));
  const minUserResponses = rule.minUserResponses ?? 1;

  if (matchingUserResponses.length >= minUserResponses) {
    return pass(rule, `Ответов пользователя на hardening до final: ${matchingUserResponses.length}`);
  }

  return fail(rule, `Final Snapshot появился после ${matchingUserResponses.length} подходящих ответов пользователя на hardening; требуется ${minUserResponses}.`);
}

function verdictForFindings(findings) {
  const failed = findings.filter((finding) => finding.status === 'fail');

  if (failed.some((finding) => finding.severity === 'hard_fail')) {
    return 'hard_fail';
  }

  if (failed.some((finding) => finding.severity === 'needs_review')) {
    return 'needs_review';
  }

  if (failed.some((finding) => finding.severity === 'warning')) {
    return 'warning';
  }

  return 'pass';
}

export function evaluateTranscript(transcript, contract) {
  const findings = contract.rules.map((rule) => {
    if (rule.type === 'required_patterns') {
      return evaluateRequiredPatterns(transcript, rule);
    }

    if (rule.type === 'forbidden_patterns') {
      return evaluateForbiddenPatterns(transcript, rule);
    }

    if (rule.type === 'ordered_patterns') {
      return evaluateOrderedPatterns(transcript, rule);
    }

    if (rule.type === 'required_after_pattern') {
      return evaluateRequiredAfterPattern(transcript, rule);
    }

    if (rule.type === 'forbidden_in_turn_with_pattern') {
      return evaluateForbiddenInTurnWithPattern(transcript, rule);
    }

    if (rule.type === 'max_question_marks_per_turn') {
      return evaluateMaxQuestionMarksPerTurn(transcript, rule);
    }

    if (rule.type === 'final_requires_user_responses_after_anchor') {
      return evaluateFinalRequiresUserResponsesAfterAnchor(transcript, rule);
    }

    return fail({ ...rule, severity: 'needs_review' }, `Неподдерживаемый deterministic rule type: ${rule.type}`);
  });

  return {
    contractId: contract.id,
    verdict: verdictForFindings(findings),
    findings
  };
}
