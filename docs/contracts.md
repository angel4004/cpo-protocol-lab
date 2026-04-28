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

### forbidden_patterns

Ни один forbidden regex не должен встретиться.

### required_after_pattern

Находит turn с `anchor` и проверяет, что в этом же turn есть все `patterns`.

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
