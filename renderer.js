"use strict";

function rendererInstaller(DICT) {
  const SKIP = [
    'pre','code','textarea','input','[contenteditable="true"]',
    '.monaco-editor','.xterm','.xterm-screen','.cm-editor',
    '[data-testid*="message"]','[class*="message-content"]',
    '[class*="markdown"]','article'
  ].join(',');
  const ATTRS = ['title','aria-label','placeholder'];

  function blocked(el) {
    return !!(el && el.closest && el.closest(SKIP));
  }

  function mapText(s) {
    if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];

    // Dynamic labels with user/project names; no regex serialization required.
    if (s.startsWith("New session in ")) {
      return "在 " + s.slice("New session in ".length) + " 中新建会话";
    }
    if (s.startsWith("Project actions for ")) {
      return s.slice("Project actions for ".length) + " 的项目操作";
    }
    if (s.startsWith("Archive ")) {
      const tail = s.slice("Archive ".length);
      return "归档 " + (DICT[tail] || tail);
    }
    if (s.startsWith("Pin ")) {
      const tail = s.slice("Pin ".length);
      return "固定 " + (DICT[tail] || tail);
    }
    if (s.startsWith("Open ")) {
      return "打开 " + s.slice("Open ".length);
    }
    if (s.startsWith("Actions for ")) {
      return s.slice("Actions for ".length) + " 的操作";
    }
    if (s.startsWith("Copy computer name: ")) {
      return "复制计算机名称：" + s.slice("Copy computer name: ".length);
    }
    if (s.startsWith("Active since ")) {
      return "生效日期：" + s.slice("Active since ".length);
    }
    if (s.startsWith("Subscription ending ")) {
      return "订阅结束日期：" + s.slice("Subscription ending ".length);
    }
    if (/^All \(\s*\d+\s*\)$/.test(s)) {
      return s.replace(/^All/, "全部");
    }
    if (/^Built-in \(\s*\d+\s*\)$/.test(s)) {
      return s.replace(/^Built-in/, "内置");
    }
    if (/^All integrations · \d+$/.test(s)) {
      return s.replace(/^All integrations/, "全部集成");
    }
    if (/^Custom Models · \d+$/.test(s)) {
      return s.replace(/^Custom Models/, "自定义模型");
    }
    if (s.startsWith("Model: ")) {
      return "模型：" + s.slice("Model: ".length);
    }
    if (s.startsWith("Org Settings (")) {
      return "组织设置 " + s.slice("Org Settings".length);
    }

    return null;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || blocked(parent)) return;

    const raw = node.nodeValue;
    if (!raw) return;

    const core = raw.trim();
    if (!core) return;

    const zh = mapText(core);
    if (zh == null) return;

    const start = raw.indexOf(core);
    node.nodeValue = raw.slice(0, start) + zh + raw.slice(start + core.length);
  }

  function translateAttrs(el) {
    if (!(el instanceof Element)) return;
    if (blocked(el) && !el.matches('input,textarea')) return;
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const zh = mapText(value.trim());
      if (zh != null) el.setAttribute(attr, zh);
    }
  }

  function translateTree(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }

    if (
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) return;

    if (root.nodeType === Node.ELEMENT_NODE) translateAttrs(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);

    if (root.querySelectorAll) {
      root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(translateAttrs);
    }
  }

  if (window.__factoryCnObserver) {
    try { window.__factoryCnObserver.disconnect(); } catch (_) {}
  }

  translateTree(document.body || document.documentElement);

  const queue = new Set();
  let scheduled = false;

  function flush() {
    scheduled = false;
    const items = Array.from(queue);
    queue.clear();
    for (const node of items) translateTree(node);
  }

  function enqueue(node) {
    queue.add(node);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        enqueue(mutation.target);
      } else if (mutation.type === 'attributes') {
        enqueue(mutation.target);
      } else {
        for (const node of mutation.addedNodes) enqueue(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS
  });

  const UI_SELECTOR = [
    'button','label','h1','h2','h3','h4','h5','h6','th','option','summary',
    '[role="button"]','[role="menuitem"]','[role="tab"]','[role="option"]',
    '[title]','[aria-label]','[placeholder]'
  ].join(',');

  function visible(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
      style.visibility !== 'hidden' && style.display !== 'none';
  }

  function covered(text) {
    return mapText(text) != null;
  }

  function isCandidate(text) {
    if (!text) return false;
    text = text.trim().replace(/\s+/g, ' ');
    if (text.length < 2 || text.length > 240) return false;
    if (!/[A-Za-z]/.test(text)) return false;
    // Factory's source UI is English. If a string already contains CJK, it is almost
    // certainly a translated result with a brand/model name left in English.
    if (/[\u3400-\u9fff]/.test(text)) return false;
    if (/^(https?:\/\/|file:\/\/)/.test(text)) return false;
    if (/^[A-Fa-f0-9]{24,}$/.test(text)) return false;
    if (/^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text)) return false;
    if (/^(user|org|req|request|health)_[A-Za-z0-9_-]{10,}$/i.test(text)) return false;
    if (/^[A-Za-z0-9]{20,}$/.test(text)) return false;
    if (/^Mozilla\/5\.0 /.test(text)) return false;
    if (/^[A-Za-z0-9_./:@-]+$/.test(text) && !/\s/.test(text) && text.length > 36) return false;
    return true;
  }

  function addCandidate(output, text) {
    if (!text) return;
    text = text.trim().replace(/\s+/g, ' ');
    if (!isCandidate(text)) return;
    if (covered(text)) return;
    output.add(text);
  }

  function scanUntranslated() {
    const output = new Set();

    // Pass 1: semantic controls anywhere in the app.
    document.querySelectorAll(UI_SELECTOR).forEach(el => {
      if (!visible(el) || blocked(el)) return;

      const ownText = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.nodeValue || '')
        .join(' ');
      addCandidate(output, ownText);

      for (const attr of ATTRS) {
        addCandidate(output, el.getAttribute(attr));
      }
    });

    // Pass 2: Settings pages contain many labels/descriptions rendered as plain div/span/p.
    // Scan visible leaf text nodes there, while still excluding editor/chat/code regions.
    const hash = String(location.hash || '');
    if (hash.includes('/settings')) {
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT
      );

      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent || blocked(parent) || !visible(parent)) continue;

        // Leaf-ish text only: this prevents collecting a whole panel's concatenated content.
        const hasVisibleElementChild = Array.from(parent.children || []).some(child => visible(child));
        if (hasVisibleElementChild && parent.childNodes.length > 4) continue;

        addCandidate(output, node.nodeValue || '');
      }
    }

    return Array.from(output).sort((a, b) => a.localeCompare(b));
  }

  window.__factoryCnObserver = observer;
  window.__factoryCnTranslateNow = () => translateTree(document.body || document.documentElement);
  window.__factoryCnScanUntranslated = scanUntranslated;

  console.info("[Factory CN] v0.8.0 injected");
}

module.exports = rendererInstaller;
