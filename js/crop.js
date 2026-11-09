// 강사: 숙제 PDF에서 문항별 사진 자르기
// PDF를 열면 글자 위치에서 "1." "2." 같은 문항 번호를 찾아 네모를 미리 그려 둠 → 강사가 고치고 저장.
// 한글에서 PDF로 저장한 문제지(글자가 살아 있는 PDF)는 잘 잡히고, 스캔한 PDF는 손으로 그려야 해요.
(function () {
  var h = UI.h, icon = UI.icon;
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var RENDER_W = 1400; // 자를 때 쓰는 해상도 (가로 픽셀)

  async function loadPdf(file) {
    await UI.loadScript(PDFJS);
    var lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = WORKER;
    var buf = await file.arrayBuffer();
    return lib.getDocument({ data: buf }).promise;
  }
  // 쪽 하나: 그림(canvas) + 글자 조각 위치
  async function renderPage(pdf, n) {
    var page = await pdf.getPage(n);
    var v1 = page.getViewport({ scale: 1 });
    var scale = RENDER_W / v1.width;
    var vp = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    var g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    var tc = await page.getTextContent();
    var items = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var p = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      var fh = Math.hypot(it.transform[2], it.transform[3]) * scale || 12;
      return { str: it.str, x: p[0], y: p[1], w: (it.width || 0) * scale, fh: fh };
    });
    return { n: n, canvas: canvas, W: canvas.width, H: canvas.height, items: items, boxes: [] };
  }
  // 문항 번호 후보 찾기 → 순서대로 1, 2, 3… 맞는 것만 골라 네모 만들기
  function detect(pages, count, start) {
    var cands = [];
    pages.forEach(function (pg) {
      var W = pg.W, its = pg.items;
      var twoCol = its.some(function (it) { return it.x > W * 0.5 && /^\s*0?\d{1,2}\s*[.)]/.test(it.str); });
      pg.twoCol = twoCol;
      pg.cols = [0, 1].map(function (c) {
        var inCol = its.filter(function (it) { return !twoCol || (c === 0 ? it.x < W / 2 : it.x >= W / 2); });
        if (!inCol.length) return null;
        return {
          minX: Math.min.apply(null, inCol.map(function (i) { return i.x; })),
          maxX: Math.max.apply(null, inCol.map(function (i) { return i.x + i.w; })),
          maxY: Math.max.apply(null, inCol.map(function (i) { return i.y; }))
        };
      });
      var med = its.map(function (i) { return i.fh; }).sort(function (a, b) { return a - b; })[Math.floor(its.length / 2)] || 12;
      its.forEach(function (it) {
        var c = twoCol && it.x >= W / 2 ? 1 : 0;
        var col = pg.cols[c];
        if (!col || it.x > col.minX + W * 0.08) return; // 문항 번호는 칸 왼쪽 끝에 있음
        var s = it.str.trim(), m = s.match(/^0?(\d{1,2})\s*[.)](?:\s|$|[^\d])/) || s.match(/^0?(\d{1,2})[.)]?$/);
        if (!m) return;
        if (/^0?\d{1,2}$/.test(s) && it.fh < med * 1.05) return; // 점 없는 숫자는 크게 쓴 것만
        cands.push({ page: pg, col: c, num: Number(m[1]), x: it.x, y: it.y, fh: it.fh });
      });
    });
    cands.sort(function (a, b) { return a.page.n - b.page.n || a.col - b.col || a.y - b.y; });
    var picked = [], want = start;
    cands.forEach(function (c) { if (c.num === want && picked.length < count) { picked.push(c); want++; } });
    pages.forEach(function (pg) { pg.boxes = []; });
    picked.forEach(function (c, i) {
      var pg = c.page, col = pg.cols[c.col];
      var next = picked[i + 1] && picked[i + 1].page === pg && picked[i + 1].col === c.col ? picked[i + 1] : null;
      var top = Math.max(0, c.y - c.fh * 1.4);
      var bottom = next ? next.y - next.fh * 1.4 - 4 : Math.min(pg.H, col.maxY + c.fh * 0.8);
      var left = Math.max(0, col.minX - 10);
      var right = pg.twoCol ? (c.col === 0 ? pg.W / 2 - 4 : Math.min(pg.W, col.maxX + 10)) : Math.min(pg.W, col.maxX + 10);
      pg.boxes.push({ no: i + 1, x: left, y: top, w: Math.max(40, right - left), h: Math.max(30, bottom - top) });
    });
    return picked.length;
  }

  // opts: { count, onSave: async (list[{no, dataUrl}], progress) }
  function open(opts) {
    var pages = [], sel = null, drawMode = false;
    var status = h('p', { class: 'small muted', text: (opts.hint || '숙제 PDF') + '를 고르면 문항 번호를 찾아서 네모를 미리 그려 줘요.' });
    var fileIn = h('input', { type: 'file', accept: 'application/pdf', class: 'input' });
    var startIn = h('input', { type: 'number', class: 'input sm', value: '1', min: '1', style: 'width:70px', 'aria-label': '시작 번호' });
    var area = h('div');
    var noSel = h('select', { class: 'input sm', style: 'width:auto', 'aria-label': '선택한 네모의 문항 번호', disabled: true });
    for (var i = 1; i <= opts.count; i++) noSel.appendChild(h('option', { value: String(i), text: i + '번' }));
    var drawBtn = h('button', { class: 'btn small', type: 'button' }, icon('plus', 16), '네모 그리기');
    var delBtn = h('button', { class: 'btn small danger', type: 'button', disabled: true }, '선택 지우기');
    var saveBtn = h('button', { class: 'btn primary small', type: 'button', disabled: true }, '저장 (사진 올리기)');
    var foundEl = h('span', { class: 'small bold' });
    var toolbar = h('div', { class: 'card inline', style: 'position:sticky;top:0;z-index:5;padding:10px 12px;justify-content:space-between' },
      foundEl, h('div', { class: 'inline' }, noSel, delBtn, drawBtn, saveBtn));
    toolbar.classList.add('hidden');
    var body = h('div', { class: 'sec', style: 'gap:12px' },
      h('div', { class: 'inline' }, fileIn, h('label', { class: 'small muted' }, '시작 번호 ', startIn),
        h('button', { class: 'btn small', type: 'button', onclick: function () { if (pages.length) { var n = detect(pages, opts.count, Number(startIn.value) || 1); sel = null; drawAll(); status.textContent = n + '개를 찾았어요.'; } } }, '다시 찾기')),
      status, toolbar, area);
    var sh = UI.sheet(opts.title || '문제 사진 자르기', body, { wide: true, sticky: true, noFocus: true });

    function boxesCount() { return pages.reduce(function (a, p) { return a + p.boxes.length; }, 0); }
    function missing() {
      var have = {};
      pages.forEach(function (p) { p.boxes.forEach(function (b) { have[b.no] = 1; }); });
      var m = [];
      for (var i = 1; i <= opts.count; i++) if (!have[i]) m.push(i);
      return m;
    }
    function updateBar() {
      var m = missing();
      foundEl.textContent = '네모 ' + boxesCount() + '개 / ' + opts.count + '문항' + (m.length ? ' · 빠진 번호 ' + m.slice(0, 8).join(', ') + (m.length > 8 ? '…' : '') : ' · 모두 찾음');
      noSel.disabled = !sel; delBtn.disabled = !sel;
      if (sel) noSel.value = String(sel.box.no);
      saveBtn.disabled = !boxesCount();
      drawBtn.classList.toggle('primary', drawMode);
    }
    function drawAll() {
      area.innerHTML = '';
      pages.forEach(function (pg) { area.appendChild(pageView(pg)); });
      updateBar();
    }
    function pageView(pg) {
      var wrap = h('div', { class: 'crop-page', style: 'max-width:820px;touch-action:' + (drawMode ? 'none' : 'pan-y') });
      var cv = h('canvas');
      cv.width = pg.W; cv.height = pg.H;
      cv.getContext('2d').drawImage(pg.canvas, 0, 0);
      wrap.appendChild(cv);
      function pct(v, total) { return (v / total * 100) + '%'; }
      function place(el, b) { el.style.left = pct(b.x, pg.W); el.style.top = pct(b.y, pg.H); el.style.width = pct(b.w, pg.W); el.style.height = pct(b.h, pg.H); }
      function toPx(e) { var r = wrap.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * pg.W, y: (e.clientY - r.top) / r.height * pg.H }; }
      pg.boxes.forEach(function (b) {
        var hd = h('div', { class: 'hd', 'aria-hidden': 'true' });
        var el = h('div', { class: 'cbox' + (sel && sel.box === b ? ' sel' : '') }, h('span', { class: 'tag', text: b.no + '번' }), hd);
        place(el, b);
        el.addEventListener('pointerdown', function (e) {
          e.stopPropagation(); e.preventDefault();
          sel = { page: pg, box: b };
          area.querySelectorAll('.cbox.sel').forEach(function (x) { x.classList.remove('sel'); });
          el.classList.add('sel'); updateBar();
          var p0 = toPx(e), start = { x: b.x, y: b.y, w: b.w, h: b.h }, resize = e.target === hd;
          el.setPointerCapture(e.pointerId);
          function mv(ev) {
            var p = toPx(ev), dx = p.x - p0.x, dy = p.y - p0.y;
            if (resize) { b.w = Math.max(30, start.w + dx); b.h = Math.max(20, start.h + dy); }
            else { b.x = Math.min(Math.max(0, start.x + dx), pg.W - b.w); b.y = Math.min(Math.max(0, start.y + dy), pg.H - b.h); }
            place(el, b);
          }
          function up() { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); }
          el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        });
        wrap.appendChild(el);
      });
      // 빈 곳: 그리기 모드면 드래그로 새 네모, 아니면 선택 해제
      wrap.addEventListener('pointerdown', function (e) {
        if (e.target !== cv) return;
        if (!drawMode) { if (sel) { sel = null; area.querySelectorAll('.cbox.sel').forEach(function (x) { x.classList.remove('sel'); }); updateBar(); } return; }
        e.preventDefault();
        var p0 = toPx(e), m = missing();
        var b = { no: m.length ? m[0] : opts.count, x: p0.x, y: p0.y, w: 1, h: 1 };
        var ghost = h('div', { class: 'cbox sel' }, h('span', { class: 'tag', text: b.no + '번' }));
        place(ghost, b); wrap.appendChild(ghost);
        wrap.setPointerCapture(e.pointerId);
        function mv(ev) { var p = toPx(ev); b.x = Math.min(p0.x, p.x); b.y = Math.min(p0.y, p.y); b.w = Math.abs(p.x - p0.x); b.h = Math.abs(p.y - p0.y); place(ghost, b); }
        function up() {
          wrap.removeEventListener('pointermove', mv); wrap.removeEventListener('pointerup', up);
          if (b.w > 20 && b.h > 15) { pg.boxes.push(b); sel = { page: pg, box: b }; drawMode = false; }
          drawAll();
        }
        wrap.addEventListener('pointermove', mv); wrap.addEventListener('pointerup', up);
      });
      return h('div', null, h('p', { class: 'tiny muted', style: 'margin:0 0 26px', text: pg.n + '쪽' }), wrap);
    }
    noSel.addEventListener('change', function () { if (sel) { sel.box.no = Number(noSel.value); drawAll(); } });
    delBtn.addEventListener('click', function () { if (!sel) return; sel.page.boxes.splice(sel.page.boxes.indexOf(sel.box), 1); sel = null; drawAll(); });
    drawBtn.addEventListener('click', function () { drawMode = !drawMode; drawAll(); if (drawMode) UI.toast('문제 둘레를 손가락이나 마우스로 끌어서 네모를 그려 주세요.'); });
    fileIn.addEventListener('change', async function () {
      var f = fileIn.files[0];
      if (!f) return;
      area.innerHTML = ''; area.appendChild(UI.loading('PDF를 여는 중…'));
      try {
        var pdf = await loadPdf(f);
        pages = [];
        var max = Math.min(pdf.numPages, 30);
        for (var n = 1; n <= max; n++) { status.textContent = n + ' / ' + max + '쪽 읽는 중…'; pages.push(await renderPage(pdf, n)); }
        var found = detect(pages, opts.count, Number(startIn.value) || 1);
        status.textContent = found ? found + '개를 찾았어요. 네모가 어긋난 건 끌어서 옮기거나 오른쪽 아래 점으로 크기를 바꿔 주세요.'
          : '문항 번호를 찾지 못했어요. 스캔한 PDF라면 "네모 그리기"로 직접 그려 주세요.';
        toolbar.classList.remove('hidden');
        drawAll();
      } catch (e) { area.innerHTML = ''; status.textContent = e.message || 'PDF를 열지 못했어요.'; }
    });
    saveBtn.addEventListener('click', async function () {
      var all = [];
      pages.forEach(function (pg) { pg.boxes.forEach(function (b) { all.push({ pg: pg, b: b }); }); });
      var seen = {};
      all = all.filter(function (x) { if (seen[x.b.no]) return false; seen[x.b.no] = 1; return true; }).sort(function (a, b) { return a.b.no - b.b.no; });
      var list = [];
      for (var i = 0; i < all.length; i++) {
        var x = all[i], c = document.createElement('canvas');
        c.width = Math.round(x.b.w); c.height = Math.round(x.b.h);
        c.getContext('2d').drawImage(x.pg.canvas, x.b.x, x.b.y, x.b.w, x.b.h, 0, 0, c.width, c.height);
        list.push({ no: x.b.no, dataUrl: await UI.shrinkImage(c, 1200, 0.85) });
      }
      UI.busy(saveBtn, async function () {
        await opts.onSave(list, function (done, total) { saveBtn.textContent = '올리는 중 ' + done + '/' + total; });
        sh.close();
      }).catch(function () { });
    });
  }
  window.Crop = { open: open };
})();
