// Fit the card's German word after text, available width or system font changes.
(() => {
  const word = document.getElementById('cardGerman');
  function fit() {
    word.style.fontSize = '';
    word.classList.remove('article-stacked');
    if (!word.clientWidth) return;
    if (word.querySelector('.article-hint') && word.scrollWidth > word.clientWidth) word.classList.add('article-stacked');
    for (let i = 0; i < 3 && word.scrollWidth > word.clientWidth; i++) {
      // WebView text zoom is already included in computed styles, but not inline CSS pixels.
      const size = parseFloat(word.style.fontSize) || parseFloat(getComputedStyle(word).fontSize);
      word.style.fontSize = size * (word.clientWidth - 1) / word.scrollWidth + 'px';
    }
  }
  new MutationObserver(fit).observe(word, {childList:true, characterData:true, subtree:true});
  // Fit outside observer delivery: changing the word also changes the observed height.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestAnimationFrame(fit)).observe(document.getElementById('germanArea'));
  window.addEventListener('resize', fit);
  fit();
})();
