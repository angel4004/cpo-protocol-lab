# Harness Mode

Harness mode checks whether a pushed CPO markdown branch passes the onboarding protocol contract.

It does not compare the branch with `main`.
It does not test GPT Project UI.
It does not use real Project Sources retrieval.

## Relation to Salamander

`cpo-protocol-lab` and `Salamander` are complementary quality layers around CPO Copilot.

This lab is responsible for protocol behavior: it runs scenario dialogues and evaluates transcript-level pass/fail/warning contracts.

`Salamander` is responsible for methodology audit and observability: it compares the PAF reference layer with the CPO Copilot working package and reports lost, distorted, underpacked, unused or invented-strictness elements.

Use this lab for onboarding protocol verification. Use `Salamander` for PAF-to-CPO methodology mapping checks. See [ecosystem.md](./ecosystem.md).

## Inputs

1. Pushed CPO branch
   - default: current branch upstream from `../cpo`;
   - resolved as `@{u}`, usually `origin/<branch>`;
   - fetched before reading unless `--no-fetch` is passed.

2. Source bundle
   - all `.md` files from `runtime/core`;
   - all `.md` files from `runtime/project_setup`;
   - read through `git show <ref>:<path>`.

3. Fixture passport
   - synthetic fixtures are in `fixtures/passports`;
   - real local passports must go to `fixtures/local/` or another gitignored path.
   - pass a real passport with `--fixture <path>`;
   - pass no passport with `--no-fixture` for no-product exploration-style runs.

4. Contract
   - JSON rules in `contracts/`;
   - evaluator checks events, order and forbidden outputs, not a golden transcript.

Every report stores hashes for scenario, fixture and contract, plus source commit SHA, source bundle hash, provider, models, seed, temperature and reasoning settings.

## Standard Run

```powershell
cd C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\cpo-protocol-lab
npm run check:bundle
npm run check:branch
```

The bundle output must show:

```json
{
  "requestedRef": "upstream",
  "ref": "origin/<branch>",
  "fetchBeforeRead": true,
  "fileCount": 14
}
```

## Real Passport Run

For a product that already exists:

```powershell
npm run check -- --passport fixtures/local/my-project-passport.md
```

Mental model:

- the pushed `cpo` branch is the protocol under test;
- the real passport file is the only source of project facts for AI-user simulator;
- the evaluator contract is the pass/fail standard;
- there is no comparison with `main`.

AI-user simulator must answer like an ordinary project owner:

- answer only the last Copilot question;
- use only the passport facts;
- say `unknown / не знаю` when the passport has no fact;
- not improve the passport;
- not help Copilot pass the contract.

For a no-product case:

```powershell
npm run check:exploration
```

In this mode the simulator is told that no project passport exists and it must not invent a product.
The scenario has its own exploration contract.

## Replay

Replay re-runs deterministic evaluation over a saved transcript without API calls:

```powershell
node src/cli.js replay --report reports/<timestamp>/<scenario-id>/report.json
```

Use replay when:

- a contract changed and you want to re-check an old transcript;
- you want to debug evaluator behavior without spending OpenRouter credits;
- you need to separate model flakiness from deterministic evaluator logic.

## Reports

Reports are written to:

```text
reports/<timestamp>/<scenario-id>/
  summary.md
  transcript.md
  report.json
```

Read `summary.md` first.
Open `transcript.md` only when the reason is unclear.

## Verdicts

- `pass`: hard rules passed.
- `hard_fail`: required protocol rule failed.
- `warning`: risky wording or weak behavior, but not a protocol break by itself.
- `needs_review`: evaluator is unsure or a semantic check needs human review.

## Current MVP Scenarios

- `product-happy`: existing product onboarding on a synthetic product fixture.
- `legacy-missing-cvc`: old passport without Customer Value Chain.
- `exploration-no-product`: no existing product and no passport.
- `draft-already-in-sources`: draft passport already appeared in Sources; hardening must start with source hygiene.
- `incomplete-passport`: many missing fields must stay missing input / needs follow-up.
- `evidence-missing`: no PMF/PCF/customer-success/business-impact evidence.

## Important Risks

1. API harness is not GPT Project UI.
   - We check protocol behavior, not the UI.

2. Inline context is not retrieval.
   - Runtime files are passed inline as already connected Project Sources.
   - The runner tells the copilot not to ask the user to verify those runtime files manually.

3. AI-user simulator can drift.
   - It sees only fixture data, not expected assertions.
   - Missing fixture data must be answered as `unknown / не знаю`.

4. Contracts can be too literal.
   - Hard deterministic rules are useful, but some wording checks may need refinement after reviewing transcripts.

5. Reports can contain sensitive data.
   - `reports/` is gitignored.
   - Real passports should be stored only in gitignored local fixtures.

6. OpenRouter calls cost money.
   - `run-all` currently runs six API scenarios.
   - Prefer targeted `run --scenario ...` while iterating.
   - GPT-5 Mini uses `reasoning.effort=minimal` and `reasoning.exclude=true`.

7. Pushed branch check depends on Git remote access.
   - Default uses `upstream` and fetches before reading.
   - If fetch fails, the run should be treated as not valid for pushed-state verification.
