// 수업 자료 받기: 서버가 확인·기록한 뒤 보내 준 파일에, PDF면 모든 쪽 아래 여백 가운데에 "이름 · 학교 · yyMMdd"를 작게 찍어 저장
(function () {
  var PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  // 글자를 그림으로 만들어 넣음 (휴대폰 글꼴을 그대로 써서 한글이 깨지지 않음)
  function stampImage(text) {
    var px = 48, cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    var font = '500 ' + px + 'px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.font = font;
    var w = Math.ceil(ctx.measureText(text).width) + 8;
    cv.width = w; cv.height = Math.ceil(px * 1.4);
    ctx = cv.getContext('2d'); ctx.font = font; ctx.fillStyle = '#7f7f7f'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 4, cv.height / 2);
    return { dataUrl: cv.toDataURL('image/png'), ratio: cv.width / cv.height };
  }
  async function stampPdf(bytes, text) {
    await UI.loadScript(PDFLIB);
    var L = window.PDFLib;
    var doc = await L.PDFDocument.load(bytes);
    var img = stampImage(text);
    var png = await doc.embedPng(img.dataUrl);
    var hgt = 9.8, wid = hgt * img.ratio; // 글자 크기 약 7pt
    doc.getPages().forEach(function (pg) {
      var box = pg.getCropBox();
      pg.drawImage(png, { x: box.x + (box.width - wid) / 2, y: box.y + 13 - (hgt - 7) / 2 - 1, width: wid, height: hgt });
    });
    return doc.save();
  }
  function b64ToBytes(b64) { var bin = atob(b64), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function saveBytes(bytes, name, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name || '자료'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }
  // r = { name, mime, data(base64), stamp }
  async function saveDownload(r) {
    var bytes = b64ToBytes(r.data);
    if (r.stamp) bytes = await stampPdf(bytes, r.stamp);
    saveBytes(bytes, r.name, r.mime);
    return !!r.stamp;
  }
  window.Stamp = { saveDownload: saveDownload, stampPdf: stampPdf, saveBytes: saveBytes, b64ToBytes: b64ToBytes };
})();
