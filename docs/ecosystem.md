# CPO Copilot Quality Ecosystem

This document explains how `cpo-protocol-lab` relates to the sibling `Salamander` project.

## Short version

`cpo-protocol-lab` is the protocol harness for CPO Copilot.
It runs API dialogues between Copilot under test and an AI-user simulator, then evaluates the transcript with deterministic scenario contracts.

`Salamander` is the methodology audit and observability layer for CPO Copilot.
It compares the PAF reference layer with the CPO Copilot working package and reports methodology drift or underpacked behavior.

They are complementary quality layers around the same CPO Copilot domain, not runtime dependencies of each other.

## Responsibilities

| Layer | Primary question | Main inputs | Main output |
| --- | --- | --- | --- |
| `cpo-protocol-lab` | Does the copilot follow the onboarding protocol in a dialogue? | CPO source bundle, scenario, fixture passport, deterministic contract | `pass`, `hard_fail`, `warning`, `needs_review`, transcript and report |
| `Salamander` | Did the PAF methodology survive translation into the CPO Copilot working package? | PAF reference layer, CPO Copilot method/setup/use files | Findings about lost, distorted, underpacked, unused or invented-strictness elements |

## When to use which

Use `cpo-protocol-lab` when changing onboarding behavior, protocol wording, sources packaging, scenario contracts, AI-user simulation, or release checks for pushed CPO branches.

Use `Salamander` when checking whether methodology from PAF is correctly represented in the CPO Copilot working package, especially after changing PAF reference material, method files, launch/use/setup files, or product decision guardrails.

Use both before a meaningful CPO Copilot release:

1. Run `Salamander` to inspect methodology mapping and surface human-review findings.
2. Run `cpo-protocol-lab` to verify observable protocol behavior on concrete scenarios.

## Boundaries

`cpo-protocol-lab` does not decide whether the methodology itself is correct.
It checks whether the observed dialogue satisfies the configured protocol contract.

`Salamander` does not execute protocol scenarios and does not assign a final pass/fail status to a dialogue transcript.
It gives evidence-backed audit signals for human review.

Neither project should write to CPO source files as part of its default check.
The `cpo` repository remains the source bundle under test.

## Shared DevEx principles

Both layers should preserve gradual adoption:

- checks should support targeted runs before full suites;
- reports should be human-readable and machine-readable enough for later automation;
- warnings and hard failures should be distinguishable;
- legacy CPO cases should be represented explicitly instead of treated as accidental noise;
- expensive model calls should be avoidable through replay, targeted runs or scoped audits where possible.
