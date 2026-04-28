import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function readTextWithHash(filePath) {
  const content = readFileSync(filePath, 'utf8');
  return {
    content,
    sha256: sha256Text(content)
  };
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function loadFixture(filePath) {
  const content = readFileSync(filePath, 'utf8');

  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }

  return content;
}

export function loadDotEnv(filePath = '.env', options = {}) {
  const resolved = resolve(filePath);
  const override = options.override ?? true;

  if (!existsSync(resolved)) {
    return;
  }

  const content = readFileSync(resolved, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, '');
    if (key && (override || !(key in process.env))) {
      process.env[key] = value;
    }
  }
}

export function loadScenarioPackage(scenarioPathInput, options = {}) {
  const scenarioPath = resolve(scenarioPathInput);
  const scenarioDir = dirname(scenarioPath);
  const scenarioFile = readTextWithHash(scenarioPath);
  const scenario = JSON.parse(scenarioFile.content);
  if (options.fixturePath && options.noFixture) {
    throw new Error('Use either fixturePath or noFixture, not both.');
  }

  const noFixture = options.noFixture || scenario.fixturePath === null || scenario.fixturePath === undefined;
  const fixturePath = noFixture
    ? null
    : resolve(options.fixturePath ?? resolve(scenarioDir, scenario.fixturePath));
  const contractPath = resolve(scenarioDir, scenario.contractPath);
  const contractFile = readTextWithHash(contractPath);
  const fixtureFile = fixturePath ? readTextWithHash(fixturePath) : null;
  const contract = JSON.parse(contractFile.content);

  return {
    scenario,
    fixture: fixturePath
      ? (fixturePath.endsWith('.json') ? JSON.parse(fixtureFile.content) : fixtureFile.content)
      : null,
    contract,
    inputs: {
      scenario: {
        path: scenarioPath,
        sha256: scenarioFile.sha256
      },
      fixture: {
        present: Boolean(fixturePath),
        path: fixturePath,
        sha256: fixtureFile?.sha256 ?? null
      },
      contract: {
        id: contract.id,
        path: contractPath,
        sha256: contractFile.sha256
      }
    },
    paths: {
      scenarioPath,
      fixturePath,
      contractPath
    }
  };
}
