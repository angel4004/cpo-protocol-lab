# AGENTS.md

Обращайся ко мне — Илья.

## CPO Quality Ecosystem

Этот проект является частью workspace:

`C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem`

Точные sibling-проекты:

- `../cpo` — source under test; рабочий markdown-пакет CPO Copilot.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\cpo`
  - Git remote: `https://github.com/angel4004/cpo.git`
- `../Salamander` — methodology audit / observability layer.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\Salamander`
  - Git remote: `https://github.com/angel4004/Salamander.git`
- `cpo-protocol-lab` — текущий protocol harness.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\cpo-protocol-lab`
  - Git remote: not configured yet; currently local-only.

Граница ответственности:

- Здесь проверяй observable protocol behavior CPO Copilot: API dialogue, scenarios, fixtures, transcript, replay, deterministic contracts и reports.
- В `../cpo` меняется сам рабочий пакет CPO Copilot.
- В `../Salamander` проверяется методологическое соответствие PAF reference layer → CPO working package.
- Общий pre-merge quality report и normalization относятся к root ecosystem / будущему quality-gate layer.

## Цели CPO Copilot и harness-системы

То, к чему мы идем с `cpo-protocol-lab`:

Harness-система должна проверять, что критичная методология из PAF reference layer корректно переведена в рабочий контур CPO Copilot и реально влияет на его поведение в ключевых сценариях: помогает команде принимать более обоснованные продуктовые решения, снижает неподтвержденные утверждения, выявляет gaps, связывает рекомендации с customer value и evidence, удерживает UX понятным, поддерживает legacy-кейсы и не ломает gradual adoption.

То, что делает CPO Copilot:

CPO Copilot должен помогать команде принимать более обоснованные продуктовые решения для достижения целей продукта и бизнеса, превращая разрозненный или неполный продуктовый контекст в явную, проверяемую и удобную рабочую опору: что мы делаем, для кого, какую ценность создаем, на чем основаны выводы, где есть неизвестность, какие есть риски, какие варианты решений доступны и какой следующий шаг наиболее разумен.

## Формат разбора fail / warning / review-замечаний

Когда показываешь Илье найденную проблему, warning, hard fail или review-замечание, обязательно показывай разницу на конкретных примерах в таком формате:

```md
### Как сейчас

Фактический фрагмент поведения, вывода, текста, кода или протокола.

### Как ожидаемый результат

Конкретный фрагмент, как должно быть после исправления.

### Почему это нужно править

Короткое объяснение, что именно ломается или ухудшается: контракт, UX, машиночитаемость, воспроизводимость, протокол, DX или поддержка legacy/gradual adoption.
```

Не ограничивайся только verdict/status. Если возможно, используй реальные фрагменты из transcript, summary, diff, тестового вывода или файла.

## Связанные проекты вокруг CPO Copilot

`cpo-protocol-lab` — protocol harness: проверяет наблюдаемое поведение CPO Copilot через API-диалоги, сценарии, фикстуры, deterministic contracts и reports.

`../Salamander` — отдельный sibling-проект: methodology audit / observability layer для CPO Copilot. Он сравнивает PAF reference layer и CPO Copilot working package, чтобы находить методологические расхождения: потерянные, искаженные, недоупакованные, неиспользуемые элементы и изобретенную строгость.

Граница ответственности:
- если задача про pass/fail конкретного onboarding-протокола, сценарии, фикстуры, transcript, replay или deterministic evaluator — работай в `cpo-protocol-lab`;
- если задача про методологический аудит PAF vs CPO working package — смотри `../Salamander`;
- не смешивай runtime, deploy, env и файлы этих проектов без явного запроса Ильи.

Подробная карта: `docs/ecosystem.md`.
