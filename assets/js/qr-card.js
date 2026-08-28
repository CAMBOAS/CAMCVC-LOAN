/**
 * CAMCVC LOAN — QR share card
 *
 * Both the per-borrower link and the general portal link get saved or sent as an
 * image, and that image leaves the app on its own: no page around it to say what
 * it is or who it is for. This draws that card, so the two stay identical.
 */
(function () {
  'use strict';

  var BRAND = 'CHECK CVC';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /* Khmer names run long — shrink until the text fits its box */
  function fitText(ctx, text, maxW, weight, startPx, minPx) {
    var px = startPx;
    do {
      ctx.font = weight + ' ' + px + 'px "Noto Sans Khmer", system-ui, sans-serif';
      if (ctx.measureText(text).width <= maxW) break;
      px -= 2;
    } while (px > minPx);
    return px;
  }

  /**
   * opts: { url, stripTitle, stripSub, line1, line2, note }
   * stripTitle is optional — without it the coloured name strip is left out.
   */
  async function build(opts) {
    opts = opts || {};
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    if (typeof qrcode === 'undefined') throw new Error('QR library not loaded');

    var W = 900;

    /* Encode first: the module count decides how tall the card has to be, so every
       measurement below comes from the finished QR rather than a guess. */
    var q = qrcode(0, 'M');
    q.addData(opts.url || '');
    q.make();
    var n = q.getModuleCount();
    var cell = Math.floor(470 / n);
    var qw = cell * n;

    var HEAD = 210, PAD = 90;
    var STRIP = opts.stripTitle ? 128 : 0;
    var QGAP = opts.stripTitle ? 58 : 66;
    var L1 = 78, L2 = 46, TAIL = 42;
    var cy = 260;
    var ch = STRIP + QGAP + qw + L1 + L2 + TAIL;
    var NOTE = 76, FOOT = 96;
    var H = cy + ch + NOTE + FOOT;

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    /* page */
    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(0, 0, W, H);

    /* header band */
    var g = ctx.createLinearGradient(0, 0, W, HEAD);
    g.addColorStop(0, '#0f2f43'); g.addColorStop(1, '#12506b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HEAD);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    fitText(ctx, BRAND, W - 120, '800', 62, 30);
    ctx.fillText(BRAND, W / 2, 108);
    ctx.font = '500 26px "Noto Sans Khmer", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText('ប្រវត្តិការបង់ប្រាក់', W / 2, 152);

    /* card */
    var cx = PAD, cw = W - PAD * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,.18)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cx, cy, cw, ch, 30); ctx.fill();
    ctx.restore();

    /* name strip */
    if (STRIP) {
      ctx.save();
      roundRect(ctx, cx, cy, cw, STRIP, 30); ctx.clip();
      var g2 = ctx.createLinearGradient(cx, cy, cx + cw, cy + STRIP);
      g2.addColorStop(0, '#0891b2'); g2.addColorStop(1, '#6d5cff');
      ctx.fillStyle = g2; ctx.fillRect(cx, cy, cw, STRIP);
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      var np = fitText(ctx, opts.stripTitle, cw - 90, '800', 44, 22);
      ctx.fillText(opts.stripTitle, W / 2, cy + (opts.stripSub ? 68 : 80) + np * 0.18);
      if (opts.stripSub) {
        ctx.font = '600 24px "Noto Sans Khmer", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.fillText(opts.stripSub, W / 2, cy + 108);
      }
    }

    /* QR */
    var qx = Math.round(cx + (cw - qw) / 2);
    var qy = cy + STRIP + QGAP;
    ctx.fillStyle = '#0f172a';
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++)
        if (q.isDark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, cell, cell);

    /* instructions, both comfortably inside the card */
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 34px "Noto Sans Khmer", system-ui, sans-serif';
    ctx.fillText(opts.line1 || '', W / 2, qy + qw + L1 - 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 25px "Noto Sans Khmer", system-ui, sans-serif';
    ctx.fillText(opts.line2 || '', W / 2, qy + qw + L1 + L2 - 18);

    /* how long it lasts, on the page below the card */
    if (opts.note) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 23px "Noto Sans Khmer", system-ui, sans-serif';
      ctx.fillText(opts.note, W / 2, cy + ch + 46);
    }

    /* footer band */
    ctx.fillStyle = '#0f2f43';
    ctx.fillRect(0, H - FOOT, W, FOOT);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = '700 26px "Noto Sans Khmer", system-ui, sans-serif';
    ctx.fillText(BRAND + '  ·  សេវាពិនិត្យប្រវត្តិបង់ប្រាក់', W / 2, H - 38);

    return cv;
  }

  async function toBlob(opts) {
    var cv = await build(opts);
    return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
  }

  /* "5 នាទី" / "មិនមានកំណត់ពេល" */
  function validityNote(minutes) {
    return Number(minutes) === 0
      ? 'តំណនេះមិនមានកំណត់ពេលទេ'
      : 'តំណនេះមានរយៈពេល ' + minutes + ' នាទី';
  }

  /* Keeps a Khmer name usable as a filename */
  function fileName(who) {
    return 'QR-' + String(who || 'portal').replace(/[^\wក-៿]+/g, '-') + '.png';
  }

  window.CamboQrCard = { build: build, toBlob: toBlob, validityNote: validityNote, fileName: fileName };
})();
