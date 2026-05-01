const BRANCH_SUITE_SCENARIOS = [
  'scenarios/draft-already-in-sources.scenario.json',
  'scenarios/evidence-missing.scenario.json',
  'scenarios/exploration-no-product.scenario.json',
  'scenarios/incomplete-passport.scenario.json',
  'scenarios/legacy-missing-cvc.scenario.json',
  'scenarios/product-happy.scenario.json'
];

const PAF_BASELINE_SCENARIOS = [
  'scenarios/paf-next-artifact-routing.scenario.json',
  'scenarios/paf-stage-discovery-vs-growth.scenario.json',
  'scenarios/paf-pmf-without-evidence.scenario.json',
  'scenarios/paf-growth-competition-evolution-gaps.scenario.json',
  'scenarios/paf-contradictory-context.scenario.json'
];

export function buildCheckPlan(options = {}) {
  const suite = options.suite ?? (options.full ? 'branch' : undefined);
  if (suite === 'branch' || suite === 'full') {
    return {
      label: 'branch protocol suite',
      steps: BRANCH_SUITE_SCENARIOS.map((scenarioPath) => ({ scenarioPath }))
    };
  }

  if (suite === 'paf-baseline') {
    return {
      label: 'PAF routing behavior baseline',
      steps: PAF_BASELINE_SCENARIOS.map((scenarioPath) => ({ scenarioPath }))
    };
  }

  if (suite) {
    throw new Error(`Unsupported check suite: ${suite}`);
  }

  const mode = options.mode ?? (options.exploration ? 'exploration' : 'product');
  if (mode === 'exploration') {
    return {
      label: 'exploration no-product check',
      steps: [
        {
          scenarioPath: 'scenarios/exploration-no-product.scenario.json'
        }
      ]
    };
  }

  if (mode !== 'product') {
    throw new Error(`Unsupported check mode: ${mode}`);
  }

  const passport = options.passport ?? options.fixture;
  if (!passport) {
    throw new Error('Product check requires --passport <path>. Use --mode exploration for no-product checks.');
  }

  return {
    label: 'product passport check',
    steps: [
      {
        scenarioPath: 'scenarios/product-happy.scenario.json',
        fixture: passport
      }
    ]
  };
}
