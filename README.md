# CPO Protocol Lab

Локальный MVP для проверки onboarding-протокола CPO Copilot.

Цель: прогонять API-диалог между Copilot under test и AI-user simulator, затем получать pass/fail/warnings report по protocol contract.

## Related CPO Copilot quality layers

`cpo-protocol-lab` — protocol harness layer: он проверяет наблюдаемое поведение CPO Copilot в API-диалоге по сценариям, фикстурам и deterministic contracts.

Соседний проект `Salamander` решает другую задачу: это methodology audit / observability layer для CPO Copilot. Он сравнивает PAF reference layer и CPO Copilot working package, чтобы находить методологические расхождения: что потеряно, искажено, недоупаковано, не используется или стало изобретенной строгостью.

Эти проекты дополняют друг друга, но не являются runtime-зависимостями друг друга. Подробнее: [docs/ecosystem.md](./docs/ecosystem.md).

## Что проверяется

- Поведение onboarding-протокола.
- Inline Sources-like контекст из markdown-пакета `cpo`.
- Порядок событий: Sources blocks, mode selection, Customer Value Chain, Draft Project Passport, Passport Challenge Review, Passport Hardening.
- Forbidden outputs: draft как publish artifact, ранний Final Snapshot, unsupported claims про customer success / PMF / PCF / бизнес-эффект.
- Legacy case: старый паспорт без Customer Value Chain должен считаться onboarding gap / missing input / needs follow-up.

## Что не проверяется

- GPT Project UI.
- Реальный retrieval Project Sources.
- Автоматическое обновление Sources.
- Продуктовая правильность ответов beyond MVP contract.

## Source bundle

`cpo` читается как внешний Git source bundle:

```text
../cpo
  runtime/core/*.md
  runtime/project_setup/*.md
```

Builder читает файлы через Git ref:

```text
git show <ref>:runtime/core/...
git show <ref>:runtime/project_setup/...
```

По умолчанию используется `upstream`, то есть upstream remote-tracking ref текущей ветки (`@{u}`, например `origin/my-branch`), `fetchBeforeRead: true` и `requireClean: true`.
Это значит, что проверяется pushed snapshot ветки, а не локальный unpushed `HEAD` и не незакоммиченные файлы.

Перед чтением builder делает `git fetch <remote>`, чтобы обновить remote-tracking ref. В CI можно также передать конкретный commit SHA через `--source-ref`.

## Commands

```powershell
npm test
npm run check:bundle
npm run check -- --passport fixtures/local/my-project-passport.md
npm run check:exploration
npm run check:branch
```

Use `npm run check -- --passport ...` when the product exists and the AI-user must answer from a real local project passport.
Use `scenarios/exploration-no-product.scenario.json` when no product/passport exists.
Use `replay` to re-run deterministic evaluation over a saved transcript without API calls.

Advanced commands are still available through `node src/cli.js run`, `run-all`, `bundle` and `replay`.

См. [GETTING_STARTED.md](./GETTING_STARTED.md).
Подробный режим использования описан в [docs/harness-mode.md](./docs/harness-mode.md).

## Safety

- `.env` не коммитится.
- `reports/` не коммитится.
- `fixtures/local/` не коммитится.
- OpenRouter API key не пишется в reports, transcript или CLI output.
- Полные request dumps не сохраняются.

## Model API provider

Primary provider для MVP — OpenRouter:

```text
OPENROUTER_API_KEY=...
COPILOT_MODEL=openai/gpt-5-mini
SIMULATOR_MODEL=openai/gpt-5-mini
```

Клиент вызывает OpenRouter Chat Completions endpoint. Direct OpenAI через `OPENAI_API_KEY` оставлен как fallback, если это явно понадобится позже.

Для GPT-5 Mini сценарии задают `reasoning.effort=minimal` и `reasoning.exclude=true`, чтобы reasoning не съедал весь output budget и не попадал в transcript.

Reports include source commit SHA, source bundle hash, scenario hash, fixture hash, contract hash, provider, models, seed, temperature and reasoning settings.
