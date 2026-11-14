// ==UserScript==
// @name         Rocket.Chat GFM Tables
// @namespace    https://github.com/pke
// x-release-please-start-version
// @version      0.6.0
// x-release-please-end
// @description  Renders GitHub Flavored Markdown tables in Rocket.Chat messages and copies them back as Markdown
// @author       Philipp Kursawe
// @license      MIT
// @homepageURL  https://github.com/pke/rocketchat-markdown-tables
// @supportURL   https://github.com/pke/rocketchat-markdown-tables/issues
// @match        https://*.rocket.chat/*
// @include      https://rocketchat.*/*
// @include      https://rocket.*/*
// @include      https://chat.*/*
// @include      https://rc.*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  if (window.__gfmTables) return;
  window.__gfmTables = true;

  // The host patterns above are only a guess (chat.example.com may be another
  // chat app), so bail out unless the page really is a Rocket.Chat workspace.
  // Rocket.Chat puts its own rc-* meta tags into the server-rendered <head>;
  // application-name is a fallback for older versions.
  const isRocketChat = () =>
    !!document.querySelector('meta[name^="rc-"], meta[name="application-name"][content^="Rocket.Chat"]');
  if (!isRocketChat()) return;

  // Enabled on every detected workspace by default; can be switched off per
  // host from the userscript manager's menu.
  const host = location.host;
  const disabledHosts = new Set(GM_getValue('disabledHosts', []));
  const disabled = disabledHosts.has(host);
  GM_registerMenuCommand(`${disabled ? '✗' : '✓'} GFM tables on ${host} (click to ${disabled ? 'enable' : 'disable'})`, () => {
    if (disabled) disabledHosts.delete(host);
    else disabledHosts.add(host);
    GM_setValue('disabledHosts', [...disabledHosts]);
    location.reload();
  });
  if (disabled) return;

  // Rocket.Chat renders every line of a message as a <div> inside the body,
  // with inline formatting (bold, code, links, mentions, emoji) already parsed.
  // We build the table from those line elements, so the inline rendering is kept.
  const BODY = '.rcx-message-body';
  const TABLE_ATTR = 'data-gfm-table';
  const HIDDEN_ATTR = 'data-gfm-hidden';
  const SIG = Symbol('gfmSignature');
  let tableCount = 0;

  const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
  const UNESCAPED_PIPE = /(?<!\\)\|/;

  const style = document.createElement('style');
  style.textContent = `
    ${BODY} > [${HIDDEN_ATTR}] { display: none !important; }
    .gfm-table { overflow-x: auto; max-width: 100%; margin: 4px 0; }
    .gfm-table table { border-collapse: collapse; font-size: 0.95em; line-height: 1.4; }
    .gfm-table th, .gfm-table td {
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      padding: 4px 10px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: break-word;
    }
    .gfm-table th { font-weight: 700; background: color-mix(in srgb, currentColor 8%, transparent); }
    .gfm-table tbody tr:nth-child(even) td { background: color-mix(in srgb, currentColor 3%, transparent); }
  `;
  document.head.append(style);

  const isLine = (el) => el.tagName === 'DIV' && !el.hasAttribute(TABLE_ATTR);
  const ownChildren = (body) => [...body.children].filter((el) => !el.hasAttribute(TABLE_ATTR));
  const signature = (body) => ownChildren(body).map((el) => el.textContent).join('\n');
  const isSeparator = (text) => text.includes('|') && SEPARATOR.test(text);
  const isBlank = (cell) => cell.every((n) => n.nodeType === Node.TEXT_NODE && !n.textContent.trim());

  function parseAlignments(text) {
    let s = text.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((cell) => {
      const c = cell.trim();
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
  }

  function trimCell(nodes) {
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first?.nodeType === Node.TEXT_NODE) first.textContent = first.textContent.replace(/^\s+/, '');
    if (last?.nodeType === Node.TEXT_NODE) last.textContent = last.textContent.replace(/\s+$/, '');
    return nodes;
  }

  // Splits a rendered line into cells. Only pipes in top-level text nodes count,
  // so pipes inside inline code or links stay part of their cell.
  function splitCells(line) {
    const cells = [[]];
    for (const node of line.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) {
        cells[cells.length - 1].push(node.cloneNode(true));
        continue;
      }
      node.textContent.split(UNESCAPED_PIPE).forEach((part, i) => {
        if (i > 0) cells.push([]);
        const text = part.replace(/\\\|/g, '|');
        if (text) cells[cells.length - 1].push(document.createTextNode(text));
      });
    }
    if (cells.length > 1 && isBlank(cells[0])) cells.shift();
    if (cells.length > 1 && isBlank(cells[cells.length - 1])) cells.pop();
    return cells.map(trimCell);
  }

  function buildTable(headerLine, separatorText, rowLines) {
    const aligns = parseAlignments(separatorText);
    const header = splitCells(headerLine);
    const columns = header.length;
    if (aligns.length !== columns) return null; // GFM: header and delimiter row must match

    const row = (cells, tag) => {
      const tr = document.createElement('tr');
      for (let i = 0; i < columns; i++) {
        const cell = document.createElement(tag);
        if (aligns[i]) cell.style.textAlign = aligns[i];
        cell.append(...(cells[i] || []));
        tr.append(cell);
      }
      return tr;
    };

    const table = document.createElement('table');
    const thead = table.createTHead();
    thead.append(row(header, 'th'));
    const tbody = table.createTBody();
    for (const line of rowLines) tbody.append(row(splitCells(line), 'td'));
    return table;
  }

  function reset(body) {
    body.querySelectorAll(`:scope > [${TABLE_ATTR}]`).forEach((n) => n.remove());
    body.querySelectorAll(`:scope > [${HIDDEN_ATTR}]`).forEach((n) => n.removeAttribute(HIDDEN_ATTR));
  }

  function process(body) {
    const sig = signature(body);
    if (body[SIG] === sig) return;
    reset(body);
    body[SIG] = sig;
    if (!sig.includes('|')) return;

    const lines = ownChildren(body);
    let created = 0;
    for (let i = 1; i < lines.length; i++) {
      const separatorText = lines[i].textContent;
      const header = lines[i - 1];
      if (!isLine(lines[i]) || !isSeparator(separatorText)) continue;
      if (!isLine(header) || !header.textContent.includes('|')) continue;

      let end = i + 1;
      while (
        end < lines.length &&
        isLine(lines[end]) &&
        lines[end].textContent.includes('|') &&
        !isSeparator(lines[end].textContent)
      ) end++;

      const table = buildTable(header, separatorText, lines.slice(i + 1, end));
      if (!table) continue;

      const wrapper = document.createElement('div');
      wrapper.className = 'gfm-table';
      wrapper.setAttribute(TABLE_ATTR, String(++tableCount));
      wrapper.dataset.gfmSource = lines.slice(i - 1, end).map((line) => line.textContent).join('\n');
      wrapper.append(table);
      header.before(wrapper);
      for (const line of lines.slice(i - 1, end)) line.setAttribute(HIDDEN_ATTR, '');
      created++;
      i = end;
    }
    if (created) attachRawSource(body, sig);
  }

  // The DOM only holds the rendered message, so the copy source above loses
  // inline Markdown (**bold**, [links](…)). Load the raw message text from the
  // workspace's own REST API, once per message that contains a table, so a
  // later copy (which must fill the clipboard synchronously) has it ready.
  const sourceCache = new Map(); // message id -> { sig, promise }
  const FENCE = /^\s*```/;

  function messageId(body) {
    return body.id.replace(/-content$/, '') || body.closest('[data-id]')?.dataset.id;
  }

  function fetchRawMessage(id) {
    const headers = {
      'X-User-Id': localStorage.getItem('Meteor.userId') || '',
      'X-Auth-Token': localStorage.getItem('Meteor.loginToken') || '',
    };
    const url = new URL(`api/v1/chat.getMessage?msgId=${encodeURIComponent(id)}`, document.baseURI);
    return fetch(url, { headers, credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => json?.message?.msg ?? null)
      .catch(() => null);
  }

  // Same detection as process(), on raw text; tables inside code fences are skipped
  // because Rocket.Chat renders those as code, not as lines.
  function rawTableBlocks(text) {
    const lines = text.split('\n');
    const blocks = [];
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      if (FENCE.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence || i === 0 || !isSeparator(lines[i]) || !lines[i - 1].includes('|')) continue;
      let end = i + 1;
      while (
        end < lines.length &&
        lines[end].trim() &&
        lines[end].includes('|') &&
        !isSeparator(lines[end]) &&
        !FENCE.test(lines[end])
      ) end++;
      blocks.push(lines.slice(i - 1, end).join('\n'));
      i = end - 1;
    }
    return blocks;
  }

  function attachRawSource(body, sig) {
    const id = messageId(body);
    if (!id) return;
    let entry = sourceCache.get(id);
    if (!entry || entry.sig !== sig) {
      entry = { sig, promise: fetchRawMessage(id) };
      sourceCache.set(id, entry);
    }
    entry.promise.then((raw) => {
      if (!raw || body[SIG] !== sig) return;
      const wrappers = body.querySelectorAll(`:scope > [${TABLE_ATTR}]`);
      const blocks = rawTableBlocks(raw);
      if (blocks.length !== wrappers.length) return; // can't pair them up safely; keep the DOM source
      wrappers.forEach((wrapper, k) => {
        const sameShape = blocks[k].split('\n').length === wrapper.dataset.gfmSource.split('\n').length;
        if (sameShape) wrapper.dataset.gfmSource = blocks[k];
      });
    });
  }

  // Copying a rendered table would otherwise put tab-separated cell text on the
  // clipboard. Put the Markdown source in text/plain (so it pastes back into
  // Rocket.Chat or GitHub as a table) and the rendered table in text/html
  // (for rich editors like Confluence, Docs or Word).
  const TABLE_SEL = `[${TABLE_ATTR}]`;
  const elementOf = (node) => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);

  function innerTextOf(root) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre-wrap';
    box.append(root);
    document.body.append(box);
    const text = box.innerText;
    box.remove();
    return text;
  }

  document.addEventListener('copy', (event) => {
    const selection = document.getSelection();
    if (!event.clipboardData || !selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);

    const inside = elementOf(range.commonAncestorContainer)?.closest(TABLE_SEL);
    if (inside) {
      // Text within a single cell keeps the browser's default copy.
      const cell = (node) => elementOf(node)?.closest('td, th');
      if (cell(range.startContainer) === cell(range.endContainer)) return;
      event.clipboardData.setData('text/plain', inside.dataset.gfmSource);
      event.clipboardData.setData('text/html', inside.innerHTML);
      event.preventDefault();
      return;
    }

    const html = document.createElement('div');
    html.append(range.cloneContents());
    const clones = html.querySelectorAll(TABLE_SEL);
    if (!clones.length) return;

    html.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((n) => n.remove());
    // A partially selected table is copied whole.
    for (const clone of clones) {
      const original = document.querySelector(`[${TABLE_ATTR}="${clone.getAttribute(TABLE_ATTR)}"]`);
      if (original) clone.replaceWith(original.cloneNode(true));
    }

    const plain = html.cloneNode(true);
    for (const table of plain.querySelectorAll(TABLE_SEL)) {
      const source = document.createElement('div');
      source.textContent = table.dataset.gfmSource;
      table.replaceWith(source);
    }

    // The block <div> plus Rocket.Chat's <br> for a blank line add one newline too many.
    event.clipboardData.setData('text/plain', innerTextOf(plain).replace(/\n{3,}/g, '\n\n'));
    event.clipboardData.setData('text/html', html.innerHTML);
    event.preventDefault();
  });

  let queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll(BODY).forEach(process);
  }

  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  scan();
})();
