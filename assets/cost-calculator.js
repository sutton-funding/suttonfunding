(function () {
  'use strict';

  const form = document.getElementById('costCalculator');
  if (!form) return;

  const fundsReceived = document.getElementById('fundsReceived');
  const totalRepayment = document.getElementById('totalRepayment');
  const paymentCount = document.getElementById('paymentCount');
  const paymentFrequency = document.getElementById('paymentFrequency');
  const error = document.getElementById('calculatorError');
  const results = document.getElementById('calculatorResults');

  const moneyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });

  const percentFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });

  function presentValueOfPayments(periodicPayment, periods, rate) {
    if (Math.abs(rate) < 1e-10) return periodicPayment * periods;
    return periodicPayment * (1 - Math.pow(1 + rate, -periods)) / rate;
  }

  function solvePeriodicRate(principal, periodicPayment, periods) {
    if (Math.abs(periodicPayment * periods - principal) < 0.000001) return 0;

    let low = 0;
    let high = 1;
    while (presentValueOfPayments(periodicPayment, periods, high) > principal && high < 1024) {
      high *= 2;
    }

    for (let index = 0; index < 160; index += 1) {
      const midpoint = (low + high) / 2;
      if (presentValueOfPayments(periodicPayment, periods, midpoint) > principal) {
        low = midpoint;
      } else {
        high = midpoint;
      }
    }

    return (low + high) / 2;
  }

  function setText(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    error.textContent = '';
    results.hidden = true;

    const proceeds = Number(fundsReceived.value);
    const repayment = Number(totalRepayment.value);
    const periods = Number(paymentCount.value);
    const periodsPerYear = Number(paymentFrequency.value);

    if (!Number.isFinite(proceeds) || proceeds <= 0) {
      error.textContent = 'Enter a net amount received greater than zero.';
      fundsReceived.focus();
      return;
    }

    if (!Number.isFinite(repayment) || repayment < proceeds) {
      error.textContent = 'Total scheduled repayment must be at least the net amount received.';
      totalRepayment.focus();
      return;
    }

    if (!Number.isInteger(periods) || periods < 1 || periods > 5000) {
      error.textContent = 'Enter a whole number of scheduled payments between 1 and 5,000.';
      paymentCount.focus();
      return;
    }

    const financeCost = repayment - proceeds;
    const costPercentage = financeCost / proceeds * 100;
    const averagePayment = repayment / periods;
    const repaymentMultiple = repayment / proceeds;
    const periodicRate = solvePeriodicRate(proceeds, averagePayment, periods);
    const annualizedRate = (Math.pow(1 + periodicRate, periodsPerYear) - 1) * 100;

    setText('financeCostResult', moneyFormatter.format(financeCost));
    setText('costPercentageResult', percentFormatter.format(costPercentage) + '%');
    setText('averagePaymentResult', moneyFormatter.format(averagePayment));
    setText('repaymentMultipleResult', repaymentMultiple.toFixed(4) + '×');
    setText('annualizedRateResult', Number.isFinite(annualizedRate) ? percentFormatter.format(annualizedRate) + '%' : 'Not available');

    results.hidden = false;
    results.focus();
  });
})();
