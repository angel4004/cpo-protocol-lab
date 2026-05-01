# Evaluator Contracts

Contract — это JSON-файл с deterministic rules. MVP не сравнивает весь transcript с golden snapshot.

## Verdicts

- `hard_fail`: нарушено обязательное правило протокола.
- `warning`: протокол не сломан, но есть слабая формулировка или риск.
- `needs_review`: evaluator не уверен или встретил неподдержанный тип правила.
- `pass`: hard rules пройдены, critical/major проблем нет.

## Rule types

### required_patterns

Все regex patterns должны встретиться в transcript.

### ordered_patterns

`before` должен встретиться раньше `after`.

### ordered_patterns_if_both_present

Используй для staged flows, где `after` может ещё не появиться в текущем сценарии.
Если `after` отсутствует, правило считается not applicable и проходит.
Если `after` появился, `before` обязан встретиться раньше него.

### forbidden_patterns

Ни один forbidden regex не должен встретиться.

### required_after_pattern

Находит turn с `anchor` и проверяет, что в этом же turn есть все `patterns`.

### required_after_pattern_if_anchor_present

Используй для post-boundary checks, которые должны применяться только после фактического появления `anchor`.
Если `anchor` отсутствует, правило считается not applicable и проходит.
Если `anchor` появился, в anchored turn должны быть все `patterns`.

### forbidden_in_turn_with_pattern

Находит turn с `anchor` и проверяет, что forbidden patterns не встречаются в этом же turn.

### max_question_marks_per_turn

Heuristic warning для правила “один следующий вопрос за шаг”.

### final_requires_user_responses_after_anchor

Проверяет, что Final Passport Snapshot не появился до ответа пользователя на hardening.

Поля:

- `anchor`: assistant-turn, после которого начинается hardening;
- `final`: marker финального снапшота;
- `userPattern`: допустимый ответ пользователя, например `A/B/C`;
- `minUserResponses`: минимальное число ответов пользователя между `anchor` и `final`.

## Semantic checks

MVP оставляет LLM-evaluator как следующий слой. Сейчас semantic ambiguity лучше помечать `needs_review` через отдельный contract rule после добавления соответствующего evaluator.
