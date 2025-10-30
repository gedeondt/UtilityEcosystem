function slugify(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .normalize('NFD')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

  return normalized.length > 0 ? normalized : null;
}

module.exports = {
  slugify
};
