const isVerboseEnabled = process.env.TE_VERBOSE === 'true';

function createVerboseLogger(tag) {
  return (...args) => {
    if (!isVerboseEnabled) {
      return;
    }
    if (tag) {
      console.log(`[${tag}]`, ...args);
    } else {
      console.log(...args);
    }
  };
}

module.exports = {
  createVerboseLogger,
  isVerboseEnabled
};
