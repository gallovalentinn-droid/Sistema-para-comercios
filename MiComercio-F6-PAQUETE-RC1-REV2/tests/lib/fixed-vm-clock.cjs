const vm = require('node:vm');

const fixedNowMs = Date.parse('2026-09-02T12:00:00.000Z');
const runInNewContext = vm.runInNewContext;

class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedNowMs]));
  }

  static now() {
    return fixedNowMs;
  }
}

// F5 rev10 is an immutable baseline. Its browser-core tests execute inside a
// VM and one capture uses Date.now() by design. Fix only that test VM clock so
// the approved seven-day fixture does not expire as the calendar advances.
vm.runInNewContext = function runWithFixedTestClock(code, context = {}, options) {
  if (!Object.prototype.hasOwnProperty.call(context, 'Date')) context.Date = FixedDate;
  return runInNewContext(code, context, options);
};
