function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPositiveInteger(value) {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }
  const integer = Math.floor(numeric);
  return integer > 0 ? integer : null;
}

module.exports = {
  toNumber,
  toPositiveInteger
};
