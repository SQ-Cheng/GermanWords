// Data operations shared by both clients; no UI or platform dependencies.
const Vocabulary = (function () {
  function normalize(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  }
  function matches(word, query) {
    const text = normalize(query);
    return !text || normalize(word.german).includes(text) || normalize(word.chinese).includes(text);
  }
  return {matches};
})();
