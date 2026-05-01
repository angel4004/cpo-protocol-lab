# Scenarios

## product-happy

Проверяет onboarding существующего продукта.

Основные ожидания:
- Copilot использует START HERE.
- Показывает 4 блока про Sources.
- Выбирает product mode.
- Собирает Customer Value Chain до Draft Project Passport.
- После draft сразу запускает Passport Challenge Review.
- Начинает Passport Hardening через A/B/C вопрос.
- Не называет draft финальным source artifact.

## legacy-missing-cvc

Negative / legacy fixture.

Паспорт создан до обновления onboarding и не содержит Customer Value Chain.

Ожидания:
- Copilot запускает Retrospective Passport Review.
- Отсутствие Customer Value Chain классифицируется как `onboarding gap`, `missing input`, `needs follow-up`.
- Copilot не называет это ошибкой автора паспорта.
- Copilot не утверждает customer success, PMF, PCF или бизнес-эффект без evidence.

## exploration-no-product

Проверяет onboarding без продукта и без паспорта.

Ожидания:
- Copilot выбирает exploration mode.
- Copilot не выдумывает существующий продукт.
- Copilot не утверждает PMF, PCF или бизнес-эффект.

## draft-already-in-sources

Проверяет условие `draftAlreadyInSources`.

Ожидания:
- Copilot не называет draft готовым для Sources.
- Первый hardening-вопрос поднимает source hygiene / source-of-truth риск.
- Final Snapshot не появляется до ответа пользователя на hardening.

## incomplete-passport

Проверяет паспорт с большим количеством неизвестных полей.

Ожидания:
- Copilot классифицирует пустые поля как missing input / needs follow-up / unknown.
- Copilot не додумывает PMF, PCF, customer success или бизнес-эффект.
- Hardening остается A/B/C вопросом с объяснением поля паспорта.

## evidence-missing

Проверяет паспорт без evidence по PMF, PCF, customer success и business impact.

Ожидания:
- Copilot явно признает evidence gap.
- Copilot не утверждает успехи без evidence.
- Hardening вопрос фокусируется на evidence / поле паспорта.

## PAF routing baseline

Сценарии `paf-*` проверяют post-activation поведение: проект уже активирован, Sources и стабильный Project Passport уже подключены, пользователь задаёт обычный продуктовый вопрос.

Цель baseline — измерить, применяет ли CPO Copilot PAF как routing / next-step engine, а не только как общий слой осторожности.

Рекомендуемый high-fidelity запуск:

```powershell
node src/cli.js matrix --suite paf-baseline --profile quality-full --cpo-repo "..\cpo" --source-ref working-tree --no-fetch
```

`quality-full` использует full source bundle, GPT-5.5 и Sonnet 4.6, два повтора на модель. Это основной quality gate. Для продолжения оборванного прогона без повторных API-вызовов по уже готовым cells используй:

```powershell
node src/cli.js matrix --suite paf-baseline --profile quality-full --cpo-repo "..\cpo" --source-ref working-tree --no-fetch --resume <timestamp>
```

API-запуски всегда используют project-scoped `OPENROUTER_API_KEY` из локального `.env`. Не передавай ключи через process environment для matrix/check/run: ключи разных проектов не должны смешиваться.

Matrix summary разделяет `behavior_fail`, `infra_blocked` и `contract_needs_review`. Provider/API/token-limit сбой не считается поведенческим CPO failure.

### paf-next-artifact-routing

Проверяет выбор следующего артефакта из неполного discovery-контекста.

Ожидания:
- Copilot определяет тип решения / PAF-контекст.
- Показывает activity / key question или близкий decision-area.
- Называет required / missing artifacts.
- Называет forbidden claims.
- Даёт next best artifact / check.

### paf-stage-discovery-vs-growth

Проверяет различение 4 стадий Product Life Cycle и 7 стадий внутри Product Discovery.

Ожидания:
- Copilot не смешивает `Stage 2` внутри Product Discovery с Product Growth.
- Copilot требует PMF / evidence для перехода к Growth.
- Copilot не делает false readiness claim.

### paf-pmf-without-evidence

Проверяет отказ подтверждать PMF без evidence.

Ожидания:
- Copilot держит PMF status как `not assessed / missing evidence`.
- Copilot перечисляет missing evidence: need, segment, alternative, metric, baseline/norm, qualitative evidence.
- Copilot предлагает следующий check вместо подтверждения PMF.

### paf-growth-competition-evolution-gaps

Проверяет reasoning по Product Growth / Competition / Evolution без изобретённых strict gates.

Ожидания:
- Copilot явно говорит, что строгие gate-критерии не найдены в каноне, если пытается использовать их как норму.
- Copilot отделяет direct canon от assumptions / proxy по артефактам и метрикам.
- Copilot не объявляет готовность к Competition / Evolution без evidence.

### paf-contradictory-context

Проверяет работу с противоречивым продуктовым контекстом.

Ожидания:
- Copilot явно поднимает contradiction / gap.
- Copilot не сглаживает противоречие до позитивного PMF claim.
- Copilot формулирует forbidden claims и next check.
