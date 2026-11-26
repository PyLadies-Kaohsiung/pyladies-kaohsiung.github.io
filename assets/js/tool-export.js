/* 社群工具共用：把 #card 輸出成 PNG。
 * 全程在瀏覽器裡處理，上傳的照片不會傳到任何伺服器。
 * 需要先載入 html-to-image（window.htmlToImage）。
 *
 * downloadCardPng({
 *   button,          // 觸發的按鈕（產生中會暫時停用）
 *   filename,        // 下載檔名
 *   lock,            // 切換鎖定的函式（截圖時隱藏提示字與工具列）
 *   beforeShot,      // 選填：截圖前要跑的排版函式
 *   pixelRatio,      // 選填：輸出倍率，預設 2
 * })
 */
(function () {
  var SKIP = ['tools', 'hint', 'editor-only'];

  // ?preview=1：只顯示卡片本身（產生工具頁縮圖用）
  if (new URLSearchParams(location.search).has('preview')) {
    var st = document.createElement('style');
    st.textContent = '.toolbar,.tool-back,.hint{display:none!important}'
      + 'body{padding:0!important;display:block!important;background:#fff!important}'
      + '.card{transform:none!important;margin:0!important;box-shadow:none!important}';
    document.head.appendChild(st);
  } else {
    // 依視窗寬度縮放卡片（只影響畫面，輸出的 PNG 仍是原尺寸），並讓卡片避開浮動工具列
    var fitView = function () {
      var card = document.getElementById('card');
      if (!card || document.body.classList.contains('shot')) return;
      var w = card.offsetWidth, h = card.offsetHeight;
      var k = Math.min(1, (document.documentElement.clientWidth - 24) / w);
      card.style.transformOrigin = 'top left';
      card.style.transform = k < 1 ? 'scale(' + k + ')' : 'none';
      card.style.marginRight = -(w * (1 - k)) + 'px';
      card.style.marginBottom = -(h * (1 - k)) + 'px';
      var top = 0;
      document.querySelectorAll('.toolbar, .tool-back').forEach(function (el) {
        top = Math.max(top, el.getBoundingClientRect().bottom);
      });
      document.body.style.paddingTop = Math.max(40, top + 16) + 'px';
    };
    window.addEventListener('load', fitView);
    window.addEventListener('resize', fitView);
    // 切換尺寸 / 版型時卡片大小會變（本檔在 body 結尾載入，#card 已存在）
    var c0 = document.getElementById('card');
    if (c0 && window.ResizeObserver) new ResizeObserver(fitView).observe(c0);
    fitView();
  }

  window.downloadCardPng = async function (opts) {
    var card = document.getElementById('card');
    var btn = opts.button;
    var label = btn ? btn.textContent : '';
    var wasLocked = document.body.classList.contains('locked');

    if (!wasLocked) opts.lock();
    if (opts.beforeShot) opts.beforeShot();
    if (btn) { btn.disabled = true; btn.textContent = '產生中…'; }

    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      var url = await window.htmlToImage.toPng(card, {
        width: card.offsetWidth,
        height: card.offsetHeight,
        pixelRatio: opts.pixelRatio || 2,
        backgroundColor: '#ffffff',
        style: { transform: 'none', margin: '0', boxShadow: 'none' },
        filter: function (node) {
          return !(node.classList && SKIP.some(function (c) { return node.classList.contains(c); }));
        },
      });
      var a = document.createElement('a');
      a.href = url;
      a.download = opts.filename;
      a.click();
    } catch (err) {
      console.error(err);
      alert('PNG 產生失敗，請重新整理頁面後再試一次。');
    } finally {
      if (!wasLocked) opts.lock();
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  };
})();
