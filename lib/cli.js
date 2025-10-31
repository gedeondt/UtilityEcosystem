function parseArgs(argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError('argv must be an array');
  }

  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const entry = argv[index];
    if (typeof entry !== 'string' || !entry.startsWith('--')) {
      throw new Error(`Invalid argument "${entry}". Expected format --name value.`);
    }

    const name = entry.slice(2);
    if (!name) {
      throw new Error('Found option with empty name.');
    }
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new Error(`Option --${name} provided multiple times.`);
    }

    const next = argv[index + 1];
    if (next === undefined || (typeof next === 'string' && next.startsWith('--'))) {
      options[name] = true;
      continue;
    }

    options[name] = next;
    index += 1;
  }

  return options;
}

function requireOption(options, key, message) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, key)) {
    throw new Error(message || `Missing required option --${key}.`);
  }
  return options[key];
}

function ensureValue(optionValue, key) {
  if (optionValue === true) {
    throw new Error(`Option --${key} requires a value.`);
  }
  return optionValue;
}

function getRequiredString(options, key) {
  const raw = ensureValue(requireOption(options, key), key);
  const value = String(raw).trim();
  if (value.length === 0) {
    throw new Error(`Option --${key} cannot be empty.`);
  }
  return value;
}

function getRequiredStringOrNull(options, key) {
  const raw = ensureValue(requireOption(options, key), key);
  const value = String(raw).trim();
  if (value.length === 0 || value.toLowerCase() === 'null') {
    return null;
  }
  return value;
}

function getOptionalString(options, key) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, key)) {
    return null;
  }
  const raw = ensureValue(options[key], key);
  const value = String(raw).trim();
  if (value.length === 0 || value.toLowerCase() === 'null') {
    return null;
  }
  return value;
}

function parseInteger(value, key, { min, max } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Option --${key} must be an integer.`);
  }
  if (min !== undefined && parsed < min) {
    throw new Error(`Option --${key} must be greater than or equal to ${min}.`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Option --${key} must be less than or equal to ${max}.`);
  }
  return parsed;
}

function getRequiredPositiveInteger(options, key, { min = 1, max } = {}) {
  const raw = ensureValue(requireOption(options, key), key);
  return parseInteger(raw, key, { min, max });
}

function getRequiredPositiveIntegerOrNull(options, key, { min = 1, max } = {}) {
  const raw = ensureValue(requireOption(options, key), key);
  const value = String(raw).trim();
  if (value.toLowerCase() === 'null') {
    return null;
  }
  return parseInteger(value, key, { min, max });
}

function hasFlag(options, key) {
  return Boolean(options && options[key] === true);
}

module.exports = {
  parseArgs,
  requireOption,
  getRequiredString,
  getRequiredStringOrNull,
  getOptionalString,
  getRequiredPositiveInteger,
  getRequiredPositiveIntegerOrNull,
  hasFlag
};

