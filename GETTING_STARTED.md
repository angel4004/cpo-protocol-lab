# Getting Started

Локальный MVP проверяет onboarding-протокол CPO Copilot через API. Он не проверяет GPT Project UI.

## 1. Подготовь ключ

Создай локальный `.env` рядом с `package.json`:

```text
OPENROUTER_API_KEY=...
COPILOT_MODEL=openai/gpt-5-mini
SIMULATOR_MODEL=openai/gpt-5-mini
EVALUATOR_MODEL=openai/gpt-5-mini
```

Сейчас evaluator в MVP deterministic, поэтому `EVALUATOR_MODEL` не обязателен для обычного запуска.

`.env` исключён из git. Ключ не добавляй в tracked-файлы, fixtures, reports или transcript.

## 2. Проверь source bundle из ветки cpo

```powershell
npm run check:bundle
```

По умолчанию builder читает `../cpo` через upstream remote-tracking ref текущей ветки:

```text
git show @{u}:<path>
```

На практике это обычно `origin/<branch>`.
Перед чтением lab делает `git fetch <remote>`, чтобы обновить remote-tracking ref.
Локальный unpushed `HEAD` и незакоммиченные изменения в `cpo` не попадают в bundle.
Если `cpo` dirty, команда остановится, потому что сценарии включают `requireClean: true`.

## 3. Самый простой запуск

Если есть реальный паспорт продукта:

```powershell
npm run check -- --passport fixtures/local/my-project-passport.md
```

Если продукта и паспорта нет:

```powershell
npm run check:exploration
```

Если хочешь прогнать весь protocol suite по ветке:

```powershell
npm run check:branch
```

`check:branch` запускает 6 API-сценариев, поэтому для быстрой проверки дешевле начинать с `npm run check -- --passport ...`.

## 4. Advanced: запусти конкретный сценарий

```powershell
node src/cli.js run --scenario scenarios/product-happy.scenario.json
node src/cli.js run --scenario scenarios/legacy-missing-cvc.scenario.json
node src/cli.js run --scenario scenarios/exploration-no-product.scenario.json
node src/cli.js run --scenario scenarios/draft-already-in-sources.scenario.json
node src/cli.js run --scenario scenarios/incomplete-passport.scenario.json
node src/cli.js run --scenario scenarios/evidence-missing.scenario.json
```

Или весь набор:

```powershell
node src/cli.js run-all
```

`run-all` и `npm run check:branch` запускают один и тот же полный набор.

Reports пишутся в `reports/<timestamp>/<scenario>/` и исключены из git.

### Запуск с реальным паспортом проекта

Если проверяешь продуктовый onboarding, положи реальный паспорт в локальный gitignored путь, например:

```text
fixtures/local/my-project-passport.md
```

Запуск:

```powershell
node src/cli.js run --scenario scenarios/product-happy.scenario.json --fixture fixtures/local/my-project-passport.md
```

В этом режиме ветка `cpo` даёт protocol sources, а файл из `--fixture` даёт факты для AI-user simulator.
Simulator отвечает как пользователь проекта: только по паспорту, без улучшения паспорта и без знания expected checks.
Если в паспорте нет факта, simulator должен отвечать `unknown / не знаю`.

Если продукта и паспорта нет, запускай без паспорта:

```powershell
node src/cli.js run --scenario scenarios/exploration-no-product.scenario.json
```

Этот scenario уже идет без fixture: simulator не будет выдумывать продукт и должен выбирать exploration mode.

### Replay без API

Если нужно перепроверить уже сохраненный transcript после изменения deterministic contract:

```powershell
node src/cli.js replay --report reports/<timestamp>/<scenario>/report.json
```

Replay не вызывает OpenRouter и повторно прогоняет evaluator по сохраненному transcript и embedded contract snapshot.

MVP использует OpenRouter Chat Completions API:

```text
POST https://openrouter.ai/api/v1/chat/completions
```

Для GPT-5 Mini сценарии используют минимальный reasoning:

```json
"reasoning": {
  "effort": "minimal",
  "exclude": true
}
```

## 5. Проверить другую ветку или commit

```powershell
npm run check:branch -- --source-ref upstream
npm run check:branch -- --source-ref origin/feature-cpo-onboarding
npm run check:branch -- --source-ref <commit-sha>
```

Для проверки именно запушенного состояния используй `upstream` или явный `origin/<branch>`.
По умолчанию lab сам делает `git fetch` перед чтением. Если нужно отключить fetch, добавь `--no-fetch`.

## 6. Как читать результат

Сначала открой `summary.md`:

```powershell
Get-ChildItem reports -Recurse -Filter summary.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

Если verdict не `pass`, открой рядом `transcript.md` и посмотри, что реально сказал copilot.

`summary.md` также показывает:

- commit SHA ветки `cpo`;
- source bundle hash;
- scenario / fixture / contract hashes;
- provider, models, seed, temperature и reasoning settings.

Подробности режима: [docs/harness-mode.md](./docs/harness-mode.md).
