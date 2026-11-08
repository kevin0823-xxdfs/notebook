/* ==========================================================================
   一本小本子 · 阅读器
   纯手写 JS，零依赖。双击 index.html 就能用（file:// 也可以）。
   数据来自两个文件：data/pages.js（图片）、data/notebook.js（文字）。
   ========================================================================== */

(function () {
  'use strict';

  var FALLBACK_IMAGE = 'images/placeholder.svg';
  var TILTS = ['-0.7deg', '0.45deg', '-0.25deg', '0.6deg', '-0.5deg', '0.3deg'];
  var DEFAULT_TITLE = '一本小本子 · 高三记事本';

  // 可选的图片 CDN。默认空着（用仓库里的 images/）；
  // 在国内打开 github.io 很慢时，可以把 data/notebook.js 里
  // window.NOTEBOOK_CDN 设成 "https://cdn.jsdelivr.net/gh/用户名/仓库@main/"
  var CDN_BASE = String(window.NOTEBOOK_CDN || '').replace(/\/+$/, '');
  function assetUrl(path) {
    if (!path || !CDN_BASE) return path;
    if (/^https?:\/\//i.test(path) || path.charAt(0) === '/') return path;
    return CDN_BASE + '/' + path;
  }

  var hasStorage = (function () {
    try {
      localStorage.setItem('__nb_probe__', '1');
      localStorage.removeItem('__nb_probe__');
      return true;
    } catch (err) {
      return false;
    }
  })();

  /* ---------------- 工具 ---------------- */

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeTags(tags) {
    if (!tags) return [];
    if (typeof tags === 'string') {
      return tags.split(/[,，、\s]+/).filter(Boolean);
    }
    return tags
      .map(function (tag) { return String(tag).trim(); })
      .filter(Boolean);
  }

  function pad(number) {
    var text = String(number);
    while (text.length < 2) text = '0' + text;
    return text;
  }

  function prettyDate(iso) {
    return iso ? String(iso).replace(/-/g, '.') : '';
  }

  function attachImage(img, src, fallback) {
    img.decoding = 'async';
    img.onerror = function () {
      // 先退到 dataset.fallback（比如 360px 小图失败就换 520px 缩略图），
      // 再退到占位图。慢网络下偶尔有一张请求失败时不会留下白块。
      var next = img.dataset.fallback;
      if (next) {
        img.dataset.fallback = '';
        img.src = next;
        return;
      }
      img.onerror = null;
      img.src = fallback;
      img.classList.add('is-fallback');
    };
    img.src = src;
  }

  /* ---------------- 数据 ---------------- */

  function buildEntries() {
    var map = {};

    asList(window.NOTEBOOK_PAGES).forEach(function (item) {
      var page = Number(item && item.page);
      if (!isFinite(page)) return;
      if (!map[page]) map[page] = { page: page, image: '', thumb: '', grid: '' };
      if (item.image) {
        map[page].image = String(item.image);
        map[page].thumb = String(item.thumb || item.image);
        map[page].grid = String(item.grid || item.thumb || item.image);
      }
    });

    asList(window.NOTEBOOK_TEXT).forEach(function (item) {
      var page = Number(item && item.page);
      if (!isFinite(page)) return;
      if (!map[page]) map[page] = { page: page, image: '', thumb: '' };
      var entry = map[page];
      entry.title = String(item.title || '').trim();
      entry.date = String(item.date || '').trim();
      entry.place = String(item.place || '').trim();
      entry.text = String(item.text || '').trim();
      entry.note = String(item.note || '').trim();
      entry.tags = normalizeTags(item.tags);
    });

    var entries = [];
    Object.keys(map).forEach(function (key) {
      var entry = map[key];
      entry.title = entry.title || '';
      entry.text = entry.text || '';
      entry.tags = entry.tags || [];
      entry.hasText = !!(entry.text || entry.title);
      if (!entry.image && !entry.hasText) return;
      entries.push(entry);
    });

    entries.sort(function (a, b) { return a.page - b.page; });
    return entries;
  }

  var entries = buildEntries();
  var byPage = {};
  entries.forEach(function (entry) { byPage[entry.page] = entry; });

  var state = { query: '', tag: '', pending: false };

  /* ---------------- 元素 ---------------- */

  var grid = document.getElementById('grid');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var chipsEl = document.getElementById('chips');
  var searchEl = document.getElementById('search');
  var reader = document.getElementById('reader');
  var readerBody = reader ? reader.querySelector('.reader-body') : null;
  var readerMedia = reader ? reader.querySelector('.reader-media') : null;
  var closeBtn = document.getElementById('reader-close');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var currentIndex = -1;
  var lastFocus = null;

  /* ---------------- 页卡 ---------------- */

  function excerptOf(entry) {
    if (!entry.text) return '';
    return entry.text.replace(/\s+/g, ' ').trim();
  }

  function searchTextOf(entry) {
    return [
      entry.title,
      entry.date,
      entry.place,
      entry.text,
      entry.note,
      entry.tags.join(' '),
      '第' + entry.page + '页',
      String(entry.page)
    ].join(' ').toLowerCase();
  }

  function buildCard(entry, index) {
    var card = document.createElement('article');
    card.className = 'card' + (entry.hasText ? '' : ' is-pending');
    card.dataset.index = String(index);
    card.style.setProperty('--tilt', TILTS[index % TILTS.length]);

    var link = document.createElement('a');
    link.className = 'card-link';
    link.href = '#page-' + entry.page;
    link.setAttribute(
      'aria-label',
      '打开第 ' + entry.page + ' 页' + (entry.title ? '：' + entry.title : '')
    );

    var media = document.createElement('div');
    media.className = 'card-media';
    if (entry.w && entry.h) {
      media.style.aspectRatio = entry.w + ' / ' + entry.h;
    }
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '第 ' + entry.page + ' 页' + (entry.title ? '：' + entry.title : '');
    img.addEventListener('load', function () {
      if (img.naturalWidth && img.naturalHeight) {
        media.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
      }
    });
    // 首页照片墙用 360px 的小图（每张约 20KB），点开阅读器才用 520px / 原图。
    var gridPath = entry.grid || entry.thumb || entry.image;
    var thumbPath = entry.thumb || entry.image;
    if (thumbPath && thumbPath !== gridPath) {
      img.dataset.fallback = assetUrl(thumbPath);
    }
    var source = assetUrl(gridPath) || FALLBACK_IMAGE;
    attachImage(img, source, FALLBACK_IMAGE);
    media.appendChild(img);

    var body = document.createElement('div');
    body.className = 'card-body';

    var meta = document.createElement('div');
    meta.className = 'card-meta';

    var pageNo = document.createElement('span');
    pageNo.className = 'page-no';
    pageNo.textContent = pad(entry.page);
    meta.appendChild(pageNo);

    if (entry.date) {
      var time = document.createElement('time');
      time.dateTime = entry.date;
      time.textContent = prettyDate(entry.date);
      meta.appendChild(time);
    }
    body.appendChild(meta);

    var title = document.createElement('h3');
    title.textContent = entry.title || (entry.hasText ? '第 ' + entry.page + ' 页' : '还没转录');
    body.appendChild(title);

    var text = document.createElement('p');
    text.className = 'excerpt';
    var excerpt = excerptOf(entry);
    if (excerpt) {
      text.textContent = excerpt;
    } else {
      text.classList.add('is-empty');
      text.textContent = '这一页的字还没抄上来。';
    }
    body.appendChild(text);

    if (entry.tags.length) {
      var tagList = document.createElement('ul');
      tagList.className = 'tags';
      entry.tags.forEach(function (tag) {
        var item = document.createElement('li');
        item.textContent = tag;
        tagList.appendChild(item);
      });
      body.appendChild(tagList);
    }

    card.appendChild(link);
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  /* ---------------- 卡片列表（分批加载） ---------------- */

  // 一次只插 12 张卡片：先把看得见的那几屏铺好，剩下的点一下再加载。
  // 手机网络差时，36 张一起请求会把慢速通道堵死，表现就是「后面的图一直不出来」。
  var BATCH_SIZE = 12;
  var renderedCount = 0;
  var moreBtn = null;

  function ensureMoreButton() {
    if (moreBtn || !grid) return;
    moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'load-more';
    moreBtn.hidden = true;
    moreBtn.addEventListener('click', function () {
      appendCards(BATCH_SIZE);
      applyFilter();
    });
    grid.parentNode.insertBefore(moreBtn, grid.nextSibling);
  }

  function updateMoreButton(forceHide) {
    if (!moreBtn) return;
    var left = entries.length - renderedCount;
    moreBtn.hidden = Boolean(forceHide) || left <= 0;
    moreBtn.textContent = left > 0
      ? '再看 ' + Math.min(BATCH_SIZE, left) + ' 页（还有 ' + left + ' 页）'
      : '';
  }

  function appendCards(count) {
    if (!grid) return;
    var end = Math.min(renderedCount + count, entries.length);
    if (end <= renderedCount) return;
    var fragment = document.createDocumentFragment();
    for (var i = renderedCount; i < end; i += 1) {
      fragment.appendChild(buildCard(entries[i], i));
    }
    grid.appendChild(fragment);
    renderedCount = end;
    updateMoreButton();
  }

  function renderCards() {
    if (!grid) return;
    ensureMoreButton();
    appendCards(BATCH_SIZE);
  }

  function renderAllCards() {
    if (!grid) return;
    if (renderedCount < entries.length) appendCards(entries.length);
  }

  /* ---------------- 筛选 ---------------- */

  function renderChips() {
    if (!chipsEl) return;

    var counts = {};
    entries.forEach(function (entry) {
      entry.tags.forEach(function (tag) {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    var tags = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b, 'zh');
    });

    var make = function (label, dataset, pending) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (pending ? ' is-pending' : '');
      chip.textContent = label;
      chip.setAttribute('aria-pressed', 'false');
      Object.keys(dataset).forEach(function (key) {
        chip.dataset[key] = dataset[key];
      });
      return chip;
    };

    chipsEl.appendChild(make('全部', { tag: '' }, false));
    tags.forEach(function (tag) {
      chipsEl.appendChild(make(tag + ' · ' + counts[tag], { tag: tag }, false));
    });

    var pendingCount = entries.filter(function (entry) { return !entry.hasText; }).length;
    if (pendingCount > 0) {
      chipsEl.appendChild(make('待转录 · ' + pendingCount, { pending: '1' }, true));
    }

    chipsEl.addEventListener('click', function (event) {
      var chip = event.target.closest ? event.target.closest('.chip') : null;
      if (!chip) return;
      var pending = chip.dataset.pending === '1';
      var tag = pending ? '' : (chip.dataset.tag || '');
      state.pending = pending;
      state.tag = tag;
      Array.prototype.forEach.call(chipsEl.querySelectorAll('.chip'), function (item) {
        var active = pending
          ? item.dataset.pending === '1'
          : !item.dataset.pending && (item.dataset.tag || '') === tag;
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      applyFilter();
    });
  }

  function applyFilter() {
    if (!grid) return;
    var query = state.query.trim().toLowerCase();
    var filtering = Boolean(state.pending || state.tag || query);
    // 一旦开始搜索/筛选，就把剩下的卡片全补上，否则只能在已加载的 12 页里找。
    if (filtering) renderAllCards();
    var shown = 0;

    Array.prototype.forEach.call(grid.children, function (card) {
      var entry = entries[Number(card.dataset.index)];
      if (!entry) return;
      var ok = true;
      if (state.pending) {
        ok = !entry.hasText;
      } else if (state.tag) {
        ok = entry.tags.indexOf(state.tag) !== -1;
      }
      if (ok && query) {
        ok = searchTextOf(entry).indexOf(query) !== -1;
      }
      card.hidden = !ok;
      if (ok) shown += 1;
    });

    if (emptyEl) emptyEl.hidden = shown !== 0;
    if (countEl) {
      // 分批加载时不能说「显示 12 / 36」，那看着像筛选结果；分页进度交给下面的按钮说明。
      countEl.textContent = filtering
        ? '显示 ' + shown + ' / ' + entries.length + ' 页'
        : '共 ' + entries.length + ' 页';
    }
    updateMoreButton(filtering);
  }

  function updateStats() {
    var total = entries.length;
    var transcribed = entries.filter(function (entry) {
      return entry.hasText;
    }).length;

    var years = {};
    entries.forEach(function (entry) {
      if (entry.date && entry.date.length >= 4) years[entry.date.slice(0, 4)] = true;
    });
    var yearList = Object.keys(years).sort();
    var fallbackYear = String(window.NOTEBOOK_YEAR || '').trim();
    var span = yearList.length === 0
      ? (fallbackYear || '—')
      : (yearList.length === 1 ? yearList[0] : yearList[0] + '—' + yearList[yearList.length - 1]);

    var pagesEl = document.getElementById('stat-pages');
    var textEl = document.getElementById('stat-text');
    var spanEl = document.getElementById('stat-span');
    if (pagesEl) pagesEl.textContent = total || '0';
    if (textEl) textEl.textContent = transcribed;
    if (spanEl) spanEl.textContent = span;
  }

  /* ---------------- 阅读器 ---------------- */

  function fillReader(entry, index) {
    var img = document.getElementById('reader-img');
    var orig = document.getElementById('reader-orig');
    var narrow = window.matchMedia('(max-width: 760px)').matches;

    if (entry.image) {
      var fullSrc = assetUrl(entry.image);
      var thumbSrc = assetUrl(entry.thumb) || fullSrc;
      img.onclick = null;
      if (narrow) {
        // 手机上只下 520px 的小图（每张约 50KB），点一下才换成高清大图
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.dataset.full = fullSrc;
        img.classList.add('can-zoom');
        img.title = '点一下看高清';
        img.onclick = function () {
          if (!img.dataset.full) return;
          var full = img.dataset.full;
          img.dataset.full = '';
          img.classList.remove('can-zoom');
          img.removeAttribute('title');
          attachImage(img, full, FALLBACK_IMAGE);
        };
        attachImage(img, thumbSrc, FALLBACK_IMAGE);
      } else {
        img.dataset.full = '';
        img.classList.remove('can-zoom');
        img.removeAttribute('title');
        if (thumbSrc !== fullSrc) {
          img.srcset = thumbSrc + ' 520w, ' + fullSrc + ' 1800w';
          img.sizes = '62vw';
        } else {
          img.removeAttribute('srcset');
          img.removeAttribute('sizes');
        }
        attachImage(img, fullSrc, FALLBACK_IMAGE);
      }
      orig.href = fullSrc;
      orig.removeAttribute('aria-hidden');
      orig.style.pointerEvents = '';
      img.alt = '第 ' + entry.page + ' 页' + (entry.title ? '：' + entry.title : '');
    } else {
      img.onclick = null;
      img.dataset.full = '';
      img.classList.remove('can-zoom');
      img.src = FALLBACK_IMAGE;
      img.alt = '第 ' + entry.page + ' 页（图片还没传上来）';
      orig.removeAttribute('href');
      orig.setAttribute('aria-hidden', 'true');
      orig.style.pointerEvents = 'none';
    }

    document.getElementById('reader-page').textContent = 'P.' + pad(entry.page);

    var dateEl = document.getElementById('reader-date');
    dateEl.textContent = entry.date ? '· ' + prettyDate(entry.date) : '';
    dateEl.hidden = !entry.date;

    var placeEl = document.getElementById('reader-place');
    placeEl.textContent = entry.place ? '· ' + entry.place : '';
    placeEl.hidden = !entry.place;

    document.getElementById('reader-title').textContent = entry.title || '第 ' + entry.page + ' 页';

    var textEl = document.getElementById('reader-text');
    if (entry.text) {
      textEl.textContent = entry.text;
      textEl.classList.remove('is-empty');
    } else {
      textEl.textContent = '这一页的字还没抄上来。纸上是什么，只有这本子知道。';
      textEl.classList.add('is-empty');
    }

    var note = document.getElementById('reader-note');
    if (entry.note) {
      note.hidden = false;
      document.getElementById('reader-note-text').textContent = entry.note;
    } else {
      note.hidden = true;
    }

    var tagList = document.getElementById('reader-tags');
    tagList.innerHTML = '';
    entry.tags.forEach(function (tag) {
      var item = document.createElement('li');
      item.textContent = tag;
      tagList.appendChild(item);
    });

    document.getElementById('reader-pos').textContent = (index + 1) + ' / ' + entries.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === entries.length - 1;

    if (readerBody) readerBody.scrollTop = 0;
    if (readerMedia) readerMedia.scrollTop = 0;

    // 顺手把前后两页也拉下来，翻页就不用等（手机只拉小图，省流量）
    [entries[index - 1], entries[index + 1]].forEach(function (near) {
      if (near && near.image) {
        var preload = new Image();
        preload.src = assetUrl(narrow && near.thumb ? near.thumb : near.image);
      }
    });
  }

  function openEntry(entry) {
    if (!reader) return;
    var index = entries.indexOf(entry);
    if (index < 0) return;

    currentIndex = index;
    var wasOpen = !reader.hidden;

    fillReader(entry, index);

    if (!wasOpen) {
      lastFocus = document.activeElement;
      reader.hidden = false;
      document.body.classList.add('no-scroll');
      if (closeBtn) closeBtn.focus();
    }

    document.title = (entry.title || '第 ' + entry.page + ' 页') + ' · 一本小本子';
  }

  function closeReader() {
    if (!reader || reader.hidden) return;
    reader.hidden = true;
    document.body.classList.remove('no-scroll');
    document.title = DEFAULT_TITLE;
    currentIndex = -1;
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (err) { /* 忽略 */ }
    }
    lastFocus = null;
  }

  function closeFromUser() {
    if (location.hash) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
        syncFromHash();
        return;
      } catch (err) {
        location.hash = '';
        return;
      }
    }
    closeReader();
  }

  function step(delta) {
    if (currentIndex < 0) return;
    var target = entries[currentIndex + delta];
    if (!target) return;
    location.hash = 'page-' + target.page;
  }

  function syncFromHash() {
    var match = /^#page-(\d+)$/.exec(location.hash || '');
    if (match) {
      var entry = byPage[Number(match[1])];
      if (entry) {
        openEntry(entry);
        return;
      }
    }
    closeReader();
  }

  /* ---------------- 事件 ---------------- */

  function bindReader() {
    if (!reader) return;

    if (closeBtn) closeBtn.addEventListener('click', closeFromUser);

    reader.addEventListener('click', function (event) {
      if (event.target.hasAttribute && event.target.hasAttribute('data-close')) {
        closeFromUser();
      }
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { step(1); });

    document.addEventListener('keydown', function (event) {
      var tag = (event.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable;

      if (event.key === 'Escape' && !reader.hidden) {
        closeFromUser();
        return;
      }

      if (!reader.hidden && event.key === 'Tab') {
        var focusables = Array.prototype.filter.call(
          reader.querySelectorAll('a[href], button:not([disabled])'),
          function (el) { return el.offsetParent !== null; }
        );
        if (focusables.length) {
          var first = focusables[0];
          var last = focusables[focusables.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }

      if (!reader.hidden && event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      if (!reader.hidden && event.key === 'ArrowRight') { event.preventDefault(); step(1); }

      if (event.key === '/' && !typing && searchEl) {
        event.preventDefault();
        searchEl.focus();
      }
    });

    window.addEventListener('hashchange', syncFromHash);
  }

  function bindPage() {
    var randomBtn = document.getElementById('random');
    if (randomBtn) {
      randomBtn.addEventListener('click', function () {
        if (!entries.length) return;
        var picked = entries[Math.floor(Math.random() * entries.length)];
        location.hash = 'page-' + picked.page;
      });
    }

    var printBtn = document.getElementById('print');
    if (printBtn) {
      printBtn.addEventListener('click', function () { window.print(); });
    }

    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.query = searchEl.value;
        applyFilter();
      });
    }

    var demo = document.getElementById('demo');
    var demoClose = document.getElementById('demo-close');
    if (demo) {
      var dismissed = false;
      if (hasStorage) {
        try { dismissed = localStorage.getItem('notebook-demo-dismissed') === '1'; } catch (err) { dismissed = false; }
      }
      demo.hidden = dismissed;
      if (demoClose) {
        demoClose.addEventListener('click', function () {
          demo.hidden = true;
          if (hasStorage) {
            try { localStorage.setItem('notebook-demo-dismissed', '1'); } catch (err) { /* 忽略 */ }
          }
        });
      }
    }
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    renderChips();
    renderCards();
    updateStats();
    applyFilter();
    bindPage();
    bindReader();
    syncFromHash();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
