import { readFileSync } from 'node:fs';

import { evaluateTranscript } from './evaluator/deterministicRules.js';

export function replayReport(report) {
  if (!Array.isArray(report.transcript)) {
    throw new Error('Cannot replay report without transcript.');
  }

  const contract = report.contractSnapshot ?? report.contract;
  if (!contract?.id || !Array.isArray(contract.rules)) {
    throw new Error('Cannot replay report without embedded contract snapshot.');
  }

  return {
    ...report,
    evaluation: evaluateTranscript(report.transcript, contract),
    replay: {
      enabled: true,
      apiCalls: 0,
      sourceScenarioId: report.scenarioId,
      replayedAt: new Date().toISOString()
    }
  };
}

export function replayReportFile(filePath) {
  return replayReport(JSON.parse(readFileSync(filePath, 'utf8')));
}
