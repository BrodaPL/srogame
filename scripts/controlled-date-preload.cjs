const fs = require('fs');

const RealDate = Date;
const clockPath = process.env.SROGAME_CONTROLLED_CLOCK_PATH;

function controlledNow() {
  if (!clockPath) {
    return RealDate.now();
  }

  const value = fs.readFileSync(clockPath, 'utf8').trim();
  const timestamp = RealDate.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid controlled clock value: ${value}`);
  }
  return timestamp;
}

global.Date = class ControlledDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(controlledNow());
      return;
    }
    super(...args);
  }

  static now() {
    return controlledNow();
  }
};
