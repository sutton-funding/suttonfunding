import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../assets/cost-calculator.js', import.meta.url), 'utf8');

function createElement(value = '') {
  return {
    value,
    textContent: '',
    hidden: false,
    focusCount: 0,
    focus() {
      this.focusCount += 1;
    },
  };
}

function loadCalculator() {
  let submitHandler;
  let clickHandler;
  const elements = {
    costCalculator: {
      addEventListener(type, handler) {
        if (type === 'submit') submitHandler = handler;
      },
    },
    calculateCost: {
      addEventListener(type, handler) {
        if (type === 'click') clickHandler = handler;
      },
    },
    fundsReceived: createElement(),
    totalRepayment: createElement(),
    paymentCount: createElement(),
    paymentFrequency: createElement('12'),
    calculatorError: createElement(),
    calculatorResults: createElement(),
    financeCostResult: createElement(),
    costPercentageResult: createElement(),
    averagePaymentResult: createElement(),
    repaymentMultipleResult: createElement(),
    annualizedRateResult: createElement(),
  };
  elements.calculatorResults.hidden = true;

  vm.runInNewContext(script, {
    document: {
      getElementById(id) {
        return elements[id] ?? null;
      },
    },
    Intl,
    Number,
    Math,
  });

  return {
    elements,
    submit() {
      let prevented = false;
      submitHandler({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      clickHandler();
    },
  };
}

test('calculates dollar cost, simple cost, payment, multiple and a positive annualized estimate', () => {
  const { elements, submit } = loadCalculator();
  elements.fundsReceived.value = '1000';
  elements.totalRepayment.value = '1100';
  elements.paymentCount.value = '10';
  elements.paymentFrequency.value = '12';

  submit();

  assert.equal(elements.calculatorError.textContent, '');
  assert.equal(elements.financeCostResult.textContent, '$100.00');
  assert.equal(elements.costPercentageResult.textContent, '10.00%');
  assert.equal(elements.averagePaymentResult.textContent, '$110.00');
  assert.equal(elements.repaymentMultipleResult.textContent, '1.1000×');
  assert.match(elements.annualizedRateResult.textContent, /^\d[\d,.]*\.\d{2}%$/);
  assert.ok(Number.parseFloat(elements.annualizedRateResult.textContent) > 0);
  assert.equal(elements.calculatorResults.hidden, false);
  assert.equal(elements.calculatorResults.focusCount, 1);
});

test('returns a zero annualized estimate when repayment equals proceeds', () => {
  const { elements, submit } = loadCalculator();
  elements.fundsReceived.value = '5000';
  elements.totalRepayment.value = '5000';
  elements.paymentCount.value = '5';
  elements.paymentFrequency.value = '12';

  submit();

  assert.equal(elements.financeCostResult.textContent, '$0.00');
  assert.equal(elements.annualizedRateResult.textContent, '0.00%');
});

test('rejects repayment below proceeds and focuses the relevant input', () => {
  const { elements, submit } = loadCalculator();
  elements.fundsReceived.value = '1000';
  elements.totalRepayment.value = '999';
  elements.paymentCount.value = '10';

  submit();

  assert.equal(elements.calculatorError.textContent, 'Total scheduled repayment must be at least the net amount received.');
  assert.equal(elements.totalRepayment.focusCount, 1);
  assert.equal(elements.calculatorResults.hidden, true);
});

test('rejects fractional, zero and excessive payment counts', () => {
  for (const count of ['2.5', '0', '5001']) {
    const { elements, submit } = loadCalculator();
    elements.fundsReceived.value = '1000';
    elements.totalRepayment.value = '1100';
    elements.paymentCount.value = count;
    submit();
    assert.equal(elements.calculatorError.textContent, 'Enter a whole number of scheduled payments between 1 and 5,000.');
    assert.equal(elements.paymentCount.focusCount, 1);
  }
});
