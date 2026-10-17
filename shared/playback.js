// Shared playback preference; each client applies it to its own audio player.
const Playback = (function () {
  const key = 'german_playback_rate_v1';
  const rates = [0.75, 1, 1.25, 1.5];
  let rate = 1;
  function normalize(value) {
    const number = Number(value);
    return rates.includes(number) ? number : 1;
  }
  try { rate = normalize(localStorage.getItem(key)); } catch (_) {}
  function setRate(value) {
    rate = normalize(value);
    try { localStorage.setItem(key, String(rate)); } catch (_) {}
    return rate;
  }
  return {getRate: () => rate, setRate};
})();
