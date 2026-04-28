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
