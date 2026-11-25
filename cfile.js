/* ==========================================================================
   Roitx Studio IDE - Pro Engine (HTML, CSS, JS & Python Support) [Complete]
   ========================================================================== */

const STORAGE_KEY_HTML = "roitx_v5_html";
const STORAGE_KEY_CSS = "roitx_v5_css";
const STORAGE_KEY_JS = "roitx_v5_js";
const STORAGE_KEY_PY = "roitx_v5_py";

let logCount = 0;

const defaultHTML = `<div class=\"card\">\n  <h1>Roitx Studio v5</h1>\n  <p>HTML, CSS, JS & Python IDE!</p>\n  <button onclick=\"sayHello()\">Click JS</button>\n</div>`;
const defaultCSS = `body {\n  background: #0a0c10;\n  color: #fff;\n  font-family: sans-serif;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n  margin: 0;\n}\n\n.card {\n  background: #12161f;\n  padding: 30px;\n  border-radius: 12px;\n  border: 1px solid #00f0ff;\n  box-shadow: 0 0 20px rgba(0,240,255,0.2);\n  text-align: center;\n}\n\nh1 { color: #00f0ff; }\nbutton {\n  background: #00ff70;\n  border: none;\n  padding: 10px 20px;\n  font-weight: bold;\n  border-radius: 6px;\n  cursor: pointer;\n}`;
const defaultJS = `function sayHello() {\n  console.log("Button Clicked inside Roitx Studio!");\n  alert("Welcome to Roitx v5 Studio!");\n}`;
const defaultPY = `# Python Script Runner via Brython\ndef greet_user(name):\n    print(f"Hello from Python, {name}!")\n\ngreet_user("Roitx")`;

let htmlInput, cssInput, jsInput, pyInput;
let htmlHighlight, cssHighlight, jsHighlight, pyHighlight;
let htmlLineNums, cssLineNums, jsLineNums, pyLineNums;
let liveFrame, consoleOutput, consoleBadge, autoSaveStatus, editorStats;

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ==========================================================================
   1. Syntax Highlighting Engines (HTML, CSS, JS, Python)
   ========================================================================== */
function highlightHTML(code) {
    let escaped = escapeHTML(code);
    escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="hl-comment">$1</span>');
    escaped = escaped.replace(/(&lt;\/?)([a-zA-Z0-9-]+)([^&]*?)(&gt;)/g, function(match, p1, p2, p3, p4) {
        let attrs = p3.replace(/([a-zA-Z0-9-]+)=\s*("[^"]*"|'[^']*')/g, function(m, aName, aVal) {
            return `<span class="hl-attr-name">${aName}</span>=<span class="hl-attr-val">${aVal}</span>`;
        });
        return `${p1}<span class="hl-tag">${p2}</span>${attrs}${p4}`;
    });
    return escaped;
}

function highlightCSS(code) {
    let escaped = escapeHTML(code);
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
    escaped = escaped.replace(/([^{]+)\{/g, '<span class="hl-css-selector">$1</span>{');
    escaped = escaped.replace(/([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g, '<span class="hl-css-prop">$1</span>: <span class="hl-attr-val">$2</span>;');
    return escaped;
}

// Single-pass tokenizer: har match ek hi baar color hota hai, HTML kabhi corrupt nahi hota
function tokenize(code, re, classes) {
    let out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(code)) !== null) {
        if (m[0] === '') { re.lastIndex++; continue; }
        out += escapeHTML(code.slice(last, m.index));
        let g = 1; while (g < m.length && m[g] === undefined) g++;
        out += `<span class="${classes[g - 1]}">${escapeHTML(m[0])}</span>`;
        last = m.index + m[0].length;
    }
    return out + escapeHTML(code.slice(last));
}

function highlightJS(code) {
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\b(function|let|const|var|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|import|export|from|default|try|catch|finally|throw|async|await|typeof|instanceof|in|of|true|false|null|undefined)\b|\b(\d+\.?\d*)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g;
    return tokenize(code, re, ['hl-comment', 'hl-string', 'hl-keyword', 'hl-number', 'hl-function']);
}

function highlightPY(code) {
    const re = /("""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#[^\n]*)|(@[A-Za-z_][\w.]*)|\b(def|return|if|else|elif|for|while|import|from|in|as|class|try|except|finally|raise|with|lambda|pass|break|continue|global|nonlocal|del|assert|yield|async|await|and|or|not|is|True|False|None)\b|\b(\d+\.?\d*)\b|\b([A-Za-z_]\w*)(?=\()/g;
    return tokenize(code, re, ['hl-string', 'hl-comment', 'hl-function', 'hl-keyword', 'hl-number', 'hl-function']);
}

/* ==========================================================================
   2. Core Panel Sync, Toast & Auto-Save
   ========================================================================== */
const LANGS = ['html', 'css', 'js', 'py'];
const INDENT = '    ';
const ta = (l) => document.getElementById(l + 'Input');
let suspendSave = false, saveTimer = null;

window.toast = function(msg) {
    let t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), 2200);
};

// Sirf screen par dikhne wali lines (+ buffer) highlight hoti hain -> badi file par bhi lag nahi
const WIN_BUF = 40;
const winState = {};
const PARSERS = { html: highlightHTML, css: highlightCSS, js: highlightJS, py: highlightPY };

function codeLH(el) { return parseFloat(getComputedStyle(el).lineHeight) || 22; }

function renderWindow(type, force) {
    const input = ta(type);
    const code = document.getElementById(type + 'Highlight');
    const lineNums = document.getElementById(type + 'LineNums');
    if (!input || !code || !lineNums) return;

    const st = winState[type] || (winState[type] = { first: -1, last: -1, lines: null });
    if (force || !st.lines) st.lines = input.value.split('\n');
    const total = st.lines.length, LH = codeLH(input);
    const vFirst = Math.max(0, Math.floor((input.scrollTop - 16) / LH));
    const vLast = Math.min(total - 1, Math.ceil((input.scrollTop + (input.clientHeight || 600) - 16) / LH));

    const stale = st.first < 0 || vFirst < st.first || vLast > st.last ||
                  (st.first > 0 && vFirst < st.first + 10) || (st.last < total - 1 && vLast > st.last - 10);
    if (force || stale) {
        st.first = Math.max(0, vFirst - WIN_BUF);
        st.last = Math.min(total - 1, vLast + WIN_BUF);
        code.innerHTML = PARSERS[type](st.lines.slice(st.first, st.last + 1).join('\n')) + '\n';
        let nums = '';
        for (let i = st.first; i <= st.last; i++) nums += (i + 1) + '<br>';
        lineNums.innerHTML = '<div class="ln-inner">' + nums + '</div>';
    }
    const y = st.first * LH - input.scrollTop;
    code.style.transform = `translate(${-input.scrollLeft}px, ${y}px)`;
    if (lineNums.firstElementChild) lineNums.firstElementChild.style.transform = `translateY(${y}px)`;
}

let statsTimer = null;
function updatePanel(type) {
    if (!ta(type)) return;
    renderWindow(type, true);
    scheduleSave();
    clearTimeout(statsTimer);
    statsTimer = setTimeout(updateGlobalStats, 250);
}

function updateGlobalStats() {
    if (!htmlInput || !cssInput || !jsInput || !pyInput) return;
    const totalLines = LANGS.reduce((n, l) => n + ta(l).value.split('\n').length, 0);
    const totalChars = LANGS.reduce((n, l) => n + ta(l).value.length, 0);
    if (editorStats) editorStats.innerText = `Lines: ${totalLines} | Characters: ${totalChars}`;
}

function setupScrollSync(type) {
    const input = ta(type);
    if (!input) return;
    input.addEventListener('scroll', () => renderWindow(type, false));
    if (window.ResizeObserver) new ResizeObserver(() => renderWindow(type, false)).observe(input);
}

/* ==========================================================================
   3. Multi-Project Storage (localStorage)
   ========================================================================== */
const STORE_KEY = 'roitx_projects_v1';
let store = null;

function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function makeProject(name, data) {
    const id = uid();
    return { id, name, html: '', css: '', js: '', py: '', updated: Date.now(), ...(data || {}) };
}

function loadStore() {
    try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY));
        if (s && s.projects && Object.keys(s.projects).length) {
            if (!s.projects[s.current]) s.current = Object.keys(s.projects)[0];
            return s;
        }
    } catch (e) {}
    // Pehli baar: purana single-project data (agar ho) naye format me migrate karo
    const p = makeProject('My Project', {
        html: localStorage.getItem(STORAGE_KEY_HTML) || defaultHTML,
        css: localStorage.getItem(STORAGE_KEY_CSS) || defaultCSS,
        js: localStorage.getItem(STORAGE_KEY_JS) || defaultJS,
        py: localStorage.getItem(STORAGE_KEY_PY) || defaultPY
    });
    return { current: p.id, projects: { [p.id]: p } };
}

function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { toast('Storage full - export your project!'); return false; }
}

function currentProject() { return store.projects[store.current]; }

function scheduleSave() {
    if (suspendSave || !store) return;
    if (autoSaveStatus) autoSaveStatus.innerText = 'Saving...';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commitSave, 400);
}

function commitSave() {
    clearTimeout(saveTimer);
    if (!store || !htmlInput) return false;
    const p = currentProject();
    if (!p) return false;
    LANGS.forEach(l => { p[l] = ta(l).value; });
    p.updated = Date.now();
    const ok = saveStore();
    if (ok && autoSaveStatus) autoSaveStatus.innerText = 'Auto-Saved';
    return ok;
}

function openProjectInEditors(id) {
    if (store.projects[id] === undefined) return;
    if (store.current !== id) commitSave();
    store.current = id;
    const p = currentProject();
    suspendSave = true;
    LANGS.forEach(l => { ta(l).value = p[l] || ''; updatePanel(l); });
    suspendSave = false;
    saveStore();
    const nameEl = document.getElementById('projectName');
    if (nameEl) nameEl.textContent = p.name;
    triggerLivePreview();
}

window.saveProjectNow = function() {
    if (commitSave()) toast('Project saved: ' + currentProject().name);
    const m = document.getElementById('exportMenu'); if (m) m.classList.add('hidden');
};

/* ---- Projects modal ---- */
function renderProjects() {
    const list = document.getElementById('projectList');
    if (!list) return;
    const items = Object.values(store.projects).sort((a, b) => b.updated - a.updated);
    list.innerHTML = items.map(p => `
        <div class="project-item ${p.id === store.current ? 'current' : ''}" data-id="${p.id}">
            <div class="project-info" data-act="open">
                <div class="project-title">${escapeHTML(p.name)}</div>
                <div class="project-meta">${new Date(p.updated).toLocaleString()}</div>
            </div>
            <button class="mini-btn" data-act="rename" title="Rename"><i class="fas fa-pen"></i></button>
            <button class="mini-btn" data-act="dup" title="Duplicate"><i class="fas fa-copy"></i></button>
            <button class="mini-btn" data-act="del" title="Delete"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}

window.openProjects = function() {
    commitSave();
    renderProjects();
    document.getElementById('projectsModal').classList.remove('hidden');
};
window.closeProjects = function() { document.getElementById('projectsModal').classList.add('hidden'); };

window.newProject = function() {
    const name = prompt('New project ka naam:', 'Untitled ' + (Object.keys(store.projects).length + 1));
    if (!name || !name.trim()) return;
    commitSave();
    const p = makeProject(name.trim(), { html: '<h1>Hello World</h1>\n' });
    store.projects[p.id] = p;
    openProjectInEditors(p.id);
    renderProjects();
};

function handleProjectClick(e) {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('.project-item');
    if (!btn || !row) return;
    const id = row.dataset.id, p = store.projects[id], act = btn.dataset.act;
    if (act === 'open') { openProjectInEditors(id); closeProjects(); }
    else if (act === 'rename') {
        const n = prompt('Naya naam:', p.name);
        if (n && n.trim()) {
            p.name = n.trim(); saveStore(); renderProjects();
            if (id === store.current) document.getElementById('projectName').textContent = p.name;
        }
    } else if (act === 'dup') {
        commitSave();
        const c = makeProject(p.name + ' (copy)', { html: p.html, css: p.css, js: p.js, py: p.py });
        store.projects[c.id] = c; saveStore(); renderProjects();
    } else if (act === 'del') {
        if (!confirm(`"${p.name}" delete kar du? Ye wapas nahi aayega.`)) return;
        delete store.projects[id];
        if (!Object.keys(store.projects).length) {
            const f = makeProject('My Project', { html: defaultHTML, css: defaultCSS, js: defaultJS, py: defaultPY });
            store.projects[f.id] = f;
        }
        if (id === store.current) { store.current = null; openProjectInEditors(Object.keys(store.projects)[0]); }
        else saveStore();
        renderProjects();
    }
}
/* ==========================================================================
   4. Editing Engine: undo-safe edits, auto-close brackets, auto-indent, Tab, Emmet
   ========================================================================== */
let _busy = false;

// execCommand use karte hain taaki native Undo/Redo (Ctrl+Z) kaam karta rahe
function editText(el, start, end, text, selStart, selEnd) {
    const before = el.value;
    const expected = before.slice(0, start) + text + before.slice(end);
    _busy = true;
    try {
        el.focus({ preventScroll: true });
        el.setSelectionRange(start, end);
        if (text === '') { if (start !== end) document.execCommand('delete'); }
        else document.execCommand('insertText', false, text);
    } catch (err) {}
    if (el.value !== expected) {
        el.value = expected;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    _busy = false;
    const pos = start + text.length;
    el.setSelectionRange(selStart === undefined ? pos : selStart, selEnd === undefined ? (selStart === undefined ? pos : selStart) : selEnd);
}

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set([')', ']', '}', '"', "'", '`']);
const isWord = (c) => !!c && /[A-Za-z0-9_]/.test(c);

function setupSmartKeyboard(input, type) {
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); handleTab(input, type, e.shiftKey); }
    });

    // beforeinput mobile keyboards par bhi chalta hai (keydown wahan 'Unidentified' deta hai)
    input.addEventListener('beforeinput', (e) => {
        if (_busy) return;
        const s = input.selectionStart, en = input.selectionEnd, v = input.value;
        const t = e.inputType;

        // Enter: auto-indent + brackets/tags ke beech me block
        if (t === 'insertLineBreak' || t === 'insertParagraph' || (t === 'insertText' && e.data === '\n')) {
            e.preventDefault();
            const ls = v.lastIndexOf('\n', s - 1) + 1;
            const indent = v.slice(ls, s).match(/^[ \t]*/)[0];
            const prev = v[s - 1], next = v[en];
            const open = '([{'.includes(prev) && prev, pyColon = type === 'py' && /:\s*$/.test(v.slice(ls, s));
            const between = (prev && '([{'.includes(prev) && PAIRS[prev] === next) ||
                            (type === 'html' && prev === '>' && v.slice(en, en + 2) === '</');
            if (between) {
                const mid = '\n' + indent + INDENT;
                editText(input, s, en, mid + '\n' + indent, s + mid.length);
            } else if (open || pyColon) {
                editText(input, s, en, '\n' + indent + INDENT);
            } else {
                editText(input, s, en, '\n' + indent);
            }
            return;
        }

        // Backspace: khali pair () {} [] "" ek saath delete
        if (t === 'deleteContentBackward' && s === en && s > 0) {
            if (PAIRS[v[s - 1]] !== undefined && PAIRS[v[s - 1]] === v[s]) {
                e.preventDefault();
                editText(input, s - 1, s + 1, '');
            }
            return;
        }

        if (t !== 'insertText' || !e.data || e.data.length !== 1) return;
        const ch = e.data;

        // HTML: '>' dabate hi closing tag
        if (ch === '>' && type === 'html' && s === en) {
            const tagString = v.substring(v.lastIndexOf('<', s - 1), s);
            const m = tagString.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
            if (m && tagString.indexOf('>') === -1 && !tagString.endsWith('/')) {
                e.preventDefault();
                const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link'];
                if (selfClosing.includes(m[1].toLowerCase())) editText(input, s, en, '>');
                else editText(input, s, en, `></${m[1]}>`, s + 1);
                return;
            }
        }

        // Closing char already aage hai to uske upar se nikal jao
        if (s === en && CLOSERS.has(ch) && v[s] === ch) {
            e.preventDefault();
            input.setSelectionRange(s + 1, s + 1);
            return;
        }

        const close = PAIRS[ch];
        if (!close) return;

        // Selection ho to usse wrap karo
        if (s !== en) {
            e.preventDefault();
            editText(input, s, en, ch + v.slice(s, en) + close, s + 1, en + 1);
            return;
        }
        const prev = v[s - 1], next = v[s];
        const isQuote = ch === close;
        if (isQuote && (isWord(prev) || prev === ch || isWord(next))) return; // don't, it's, '''
        if (!isQuote && next && !/[\s)\]}>,;.:]/.test(next)) return;
        e.preventDefault();
        editText(input, s, en, ch + close, s + 1);
    });

    input.addEventListener('input', () => updatePanel(type));
}

function handleTab(el, type, shift) {
    const s = el.selectionStart, e = el.selectionEnd, v = el.value;
    const multi = s !== e && v.slice(s, e).includes('\n');
    if (multi || shift) {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        let le = v.indexOf('\n', e);
        if (le === -1) le = v.length;
        if (e > s && v[e - 1] === '\n') le = e - 1;
        const lines = v.slice(ls, le).split('\n');
        const out = lines.map(l => shift ? l.replace(/^( {1,4}|\t)/, '') : (l.trim() ? INDENT + l : l)).join('\n');
        if (s === e) {
            const removed = (le - ls) - out.length;
            editText(el, ls, le, out, Math.max(ls, s - removed));
        } else editText(el, ls, le, out, ls, ls + out.length);
        return;
    }
    if (type === 'html' && s === e && tryEmmet(el)) return;
    editText(el, s, e, INDENT);
}

window.tabKey = function() {
    const el = getActiveEditorTextArea();
    if (el) handleTab(el, el.id.replace('Input', ''), false);
};
window.undoEdit = function() { const el = getActiveEditorTextArea(); if (el) { el.focus(); document.execCommand('undo'); } };
window.redoEdit = function() { const el = getActiveEditorTextArea(); if (el) { el.focus(); document.execCommand('redo'); } };
window.expandEmmet = function() {
    const el = getActiveEditorTextArea();
    if (!el || el.id !== 'htmlInput') { toast('Emmet sirf HTML tab me chalta hai'); return; }
    el.focus();
    if (!tryEmmet(el)) toast('Emmet abbreviation nahi mila (e.g. div.card>p*3)');
};

/* ---- Emmet (HTML) ---- */
const KNOWN_TAGS = new Set('div span p a ul ol li h1 h2 h3 h4 h5 h6 img input button form label table tr td th thead tbody section article header footer nav main aside select option textarea pre code strong em small br hr video audio canvas iframe'.split(' '));
const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
const IMPLICIT = { ul: 'li', ol: 'li', table: 'tr', tbody: 'tr', thead: 'tr', tr: 'td', select: 'option', datalist: 'option', p: 'span', span: 'span', em: 'span', strong: 'span', button: 'span', label: 'span' };
const DEFAULT_ATTRS = { a: [['href', '']], img: [['src', ''], ['alt', '']], input: [['type', 'text']], link: [['rel', 'stylesheet'], ['href', '']], form: [['action', '']] };
const BOILERPLATE = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' + INDENT + '<meta charset="UTF-8">\n' + INDENT + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' + INDENT + '<title>Document</title>\n</head>\n<body>\n' + INDENT + '\u0001\n</body>\n</html>';

function emmetParse(src) {
    let i = 0;
    const peek = () => src[i];
    const rest = (re) => { const m = re.exec(src.slice(i)); const r = m ? m[0] : ''; i += r.length; return r; };
    const fail = () => { throw new Error('emmet'); };

    function readBlock(open, close) {
        i++; let depth = 1, out = '';
        while (i < src.length) {
            const c = src[i++];
            if (c === open) depth++;
            else if (c === close && --depth === 0) return out;
            out += c;
        }
        fail();
    }
    function parseAttrs(str) {
        const attrs = [], re = /([^\s=]+)(?:=("[^"]*"|'[^']*'|[^\s]*))?/g; let m;
        while ((m = re.exec(str))) attrs.push([m[1], m[2] === undefined ? '' : m[2].replace(/^["']|["']$/g, '')]);
        return attrs;
    }
    function parseUnit() {
        let u;
        if (peek() === '(') {
            i++; const kids = parseExpr();
            if (peek() !== ')') fail();
            i++; u = { group: true, children: kids };
        } else {
            u = { tag: rest(/^[A-Za-z][A-Za-z0-9:-]*/), id: '', classes: [], attrs: [], text: '', children: null };
            for (;;) {
                const c = peek();
                if (c === '.') { i++; const n = rest(/^[\w$@-]+/); if (!n) fail(); u.classes.push(n); }
                else if (c === '#') { i++; u.id = rest(/^[\w$@-]+/); if (!u.id) fail(); }
                else if (c === '[') u.attrs = u.attrs.concat(parseAttrs(readBlock('[', ']')));
                else if (c === '{') u.text = readBlock('{', '}');
                else break;
            }
            if (!u.tag && !u.id && !u.classes.length && !u.attrs.length && !u.text) fail();
        }
        u.count = 1;
        if (peek() === '*') { i++; u.count = parseInt(rest(/^\d+/), 10); if (!u.count || u.count > 100) fail(); }
        return u;
    }
    function parseExpr() {
        const nodes = [];
        for (;;) {
            const u = parseUnit(); nodes.push(u);
            if (peek() === '>') { i++; u.children = parseExpr(); }
            const c = peek();
            if (c === '+') { i++; continue; }
            if (c === '^' && u.children) { i++; if (peek() === '^') return nodes; continue; }
            return nodes;
        }
    }
    const tree = parseExpr();
    if (i < src.length) fail();
    return tree;
}

function emmetRender(nodes, level, parentTag, ctx, k) {
    const pad = INDENT.repeat(level);
    const num = (s) => s.replace(/\$+/g, (m) => String(k).padStart(m.length, '0'));
    let lines = [];
    nodes.forEach(u => {
        for (let n = 1; n <= u.count; n++) {
            const kk = u.count > 1 ? n : k;
            const sub = { ...ctx };
            const nn = (s) => s.replace(/\$+/g, (m) => String(kk).padStart(m.length, '0'));
            if (u.group) { lines = lines.concat(emmetRender(u.children, level, parentTag, ctx, kk)); continue; }
            const tag = u.tag || IMPLICIT[parentTag] || 'div';
            let attrs = '';
            if (u.id) attrs += ` id="${nn(u.id)}"`;
            if (u.classes.length) attrs += ` class="${nn(u.classes.join(' '))}"`;
            const given = u.attrs.map(a => a[0]);
            (DEFAULT_ATTRS[tag] || []).forEach(a => { if (!given.includes(a[0])) attrs += ` ${a[0]}="${a[1]}"`; });
            u.attrs.forEach(a => { attrs += ` ${a[0]}="${nn(a[1])}"`; });
            const open = `<${tag}${attrs}>`;
            if (VOID_TAGS.has(tag)) { lines.push(pad + open); continue; }
            const text = nn(u.text);
            if (!u.children) {
                let inner = text;
                if (!text && !ctx.marked) { inner = '\u0001'; ctx.marked = true; }
                lines.push(pad + open + inner + `</${tag}>`);
            } else {
                lines.push(pad + open);
                if (text) lines.push(pad + INDENT + text);
                lines = lines.concat(emmetRender(u.children, level + 1, tag, ctx, kk));
                lines.push(pad + `</${tag}>`);
            }
        }
    });
    return lines;
}

function findAbbrev(line) {
    let depth = 0, i = line.length;
    while (i > 0) {
        const c = line[i - 1];
        if (c === '}' || c === ']') depth++;
        else if (c === '{' || c === '[') { if (depth === 0) break; depth--; }
        else if (depth === 0 && (/\s/.test(c) || c === '<')) break;
        i--;
    }
    let tok = line.slice(i);
    if (i > 0 && line[i - 1] === '<') {          // "<div>p*3" jaisa case: tag ka hissa kaat do
        const gt = tok.indexOf('>');
        if (gt === -1) return null;
        tok = tok.slice(gt + 1);
    }
    return /^[A-Za-z!.#\[(]/.test(tok) ? tok : null;
}

function tryEmmet(el) {
    const s = el.selectionStart, v = el.value;
    if (v[s] && !/[\s<]/.test(v[s])) return false;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const lineBefore = v.slice(ls, s);
    const tok = findAbbrev(lineBefore);
    if (!tok) return false;
    let out;
    if (tok === '!' || tok === 'html:5') out = BOILERPLATE;
    else {
        if (/^[A-Za-z][A-Za-z0-9]*$/.test(tok) && !KNOWN_TAGS.has(tok.toLowerCase())) return false;
        try { out = emmetRender(emmetParse(tok), 0, '', { marked: false }, 1).join('\n'); }
        catch (err) { return false; }
    }
    const baseIndent = lineBefore.match(/^[ \t]*/)[0];
    out = out.split('\n').map((l, idx) => idx === 0 ? l : baseIndent + l).join('\n');
    let cursor = out.indexOf('\u0001');
    out = out.replace('\u0001', '');
    if (cursor === -1) cursor = out.length;
    const from = s - tok.length;
    editText(el, from, s, out, from + cursor);
    return true;
}
/* ==========================================================================
   5. Find & Replace (case-insensitive option, undo-safe)
   ========================================================================== */
let searchMatches = [];
let currentMatchIndex = -1;

window.toggleFindReplaceModal = function() {
    const modal = document.getElementById('findReplaceModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        const el = getActiveEditorTextArea();
        const sel = el ? el.value.slice(el.selectionStart, el.selectionEnd) : '';
        const f = document.getElementById('findInput');
        if (sel && !sel.includes('\n')) f.value = sel;
        f.focus(); f.select();
        handleSearchInput();
    }
};

function getActiveEditorTextArea() {
    for (const l of LANGS) if (document.getElementById(l + 'Panel').classList.contains('active')) return ta(l);
    return null;
}

function buildSearchRegex(q) {
    const matchCase = document.getElementById('matchCase');
    return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase && matchCase.checked ? 'g' : 'gi');
}

window.handleSearchInput = function() {
    const query = document.getElementById('findInput').value;
    const textArea = getActiveEditorTextArea();
    const counterSpan = document.getElementById('matchCounter');

    searchMatches = [];
    currentMatchIndex = -1;

    if (!query || !textArea) { counterSpan.innerText = "0/0"; return; }

    const re = buildSearchRegex(query);
    let m;
    while ((m = re.exec(textArea.value)) !== null) {
        searchMatches.push({ start: m.index, end: m.index + m[0].length });
    }

    if (searchMatches.length > 0) {
        currentMatchIndex = 0;
        counterSpan.innerText = `1/${searchMatches.length}`;
        highlightAndSelectMatch();
    } else {
        counterSpan.innerText = "0/0";
    }
};

window.navigateMatch = function(direction) {
    if (searchMatches.length === 0) return;
    currentMatchIndex += direction;
    if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;
    if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;
    document.getElementById('matchCounter').innerText = `${currentMatchIndex + 1}/${searchMatches.length}`;
    highlightAndSelectMatch();
};

// Focus find box me hi rehta hai, taaki typing beech me na ruke
function highlightAndSelectMatch() {
    const textArea = getActiveEditorTextArea();
    if (!textArea || searchMatches.length === 0) return;
    const match = searchMatches[currentMatchIndex];
    textArea.setSelectionRange(match.start, match.end);
    const line = textArea.value.substring(0, match.start).split("\n").length;
    textArea.scrollTop = Math.max(0, (line - 3) * codeLH(textArea));
}

window.executeSingleReplace = function() {
    const replaceText = document.getElementById('replaceInput').value;
    const textArea = getActiveEditorTextArea();
    if (!textArea || searchMatches.length === 0) return;
    const match = searchMatches[currentMatchIndex];
    editText(textArea, match.start, match.end, replaceText);
    handleSearchInput();
};

window.executeReplaceAll = function() {
    const query = document.getElementById('findInput').value;
    const replaceText = document.getElementById('replaceInput').value;
    const textArea = getActiveEditorTextArea();
    if (!query || !textArea) return;

    let count = 0;
    const out = textArea.value.replace(buildSearchRegex(query), () => { count++; return replaceText; });
    if (count) editText(textArea, 0, textArea.value.length, out);

    document.getElementById('matchCounter').innerText = "0/0";
    searchMatches = [];
    toast(count ? `${count} replaced` : 'No matches');
};
/* ==========================================================================
   5. Custom Font Size Adjuster (Code Text & Line Numbers Fixed)
   ========================================================================== */
let currentFontSize = 13.5;

window.changeFontSize = function(direction) {
    currentFontSize += direction * 1.5;
    if (currentFontSize < 10) currentFontSize = 10;
    if (currentFontSize > 24) currentFontSize = 24;

    const textareas = document.querySelectorAll('textarea');
    const highlights = document.querySelectorAll('.highlight-layer');
    const lineNumbers = document.querySelectorAll('.line-numbers');

    textareas.forEach(el => {
        el.style.fontSize = currentFontSize + 'px';
        el.style.lineHeight = '1.6';
    });

    highlights.forEach(el => {
        el.style.fontSize = currentFontSize + 'px';
        el.style.lineHeight = '1.6';
    });

    lineNumbers.forEach(el => {
        el.style.fontSize = currentFontSize + 'px';
        el.style.lineHeight = '1.6';
    });
};

/* ==========================================================================
   6. Keyboard Shortcut Toolbar Helper & Device Mode
   ========================================================================== */
   window.toggleThemeMode = function() {
    document.body.classList.toggle('light-theme');
    
    // Icon change logic (Moon <-> Sun)
    const icon = document.querySelector('#mode-toggle i');
    if (icon) {
        if (document.body.classList.contains('light-theme')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun'); // Light mode me Suraj dikhega
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon'); // Dark mode me Chand dikhega
        }
    }
};


window.setDeviceMode = function(mode) {
    const previewWrapper = document.getElementById('previewWrapper');
    const btnFull = document.getElementById('btnDeviceFull');
    const btnMobile = document.getElementById('btnDeviceMobile');

    if (mode === 'mobile') {
        if (previewWrapper) previewWrapper.classList.add('mobile-mode');
        if (btnMobile) btnMobile.classList.add('active');
        if (btnFull) btnFull.classList.remove('active');
    } else {
        if (previewWrapper) previewWrapper.classList.remove('mobile-mode');
        if (btnFull) btnFull.classList.add('active');
        if (btnMobile) btnMobile.classList.remove('active');
    }
};

/* ==========================================================================
   6. Toolbar Insert Helper (works on active editor, cursor marker "$|")
   ========================================================================== */
window.insertAtCursor = function(textareaId, textToInsert) {
    const el = textareaId ? document.getElementById(textareaId) : getActiveEditorTextArea();
    if (!el) return;

    let text = textToInsert, cursorOffset = text.length;
    const marker = text.indexOf('$|');
    if (marker !== -1) { text = text.replace('$|', ''); cursorOffset = marker; }
    else if (text.length === 2 && PAIRS[text[0]] === text[1]) cursorOffset = 1;

    const start = el.selectionStart;
    editText(el, start, el.selectionEnd, text, start + cursorOffset);
};

/* ==========================================================================
   7. Live Preview & Virtual Console Engine
   ========================================================================== */
let manualRun = false, autoOpened = false;
window.runManualCode = function() { manualRun = true; triggerLivePreview(); };

window.togglePreviewPanel = function() {
    const previewContainer = document.querySelector('.output-container');
    if (previewContainer) previewContainer.classList.toggle('collapsed-preview');
};

window.openPreviewFullscreen = function() {
    if (liveFrame && liveFrame.requestFullscreen) liveFrame.requestFullscreen();
};

// Ye function iframe ke ANDAR chalta hai (toString() se inject hota hai)
function iframeBootstrap(cfg) {
    function fmt(a) {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.name + ': ' + a.message;
        if (typeof a === 'function') return String(a).split('\n')[0] + ' ...';
        if (a === null || typeof a !== 'object') return String(a);
        try {
            const seen = new WeakSet();
            return JSON.stringify(a, function(k, v) {
                if (typeof v === 'bigint') return v + 'n';
                if (typeof v === 'function') return '[Function]';
                if (typeof v === 'undefined') return 'undefined';
                if (v instanceof Map) return { Map: Array.from(v.entries()) };
                if (v instanceof Set) return { Set: Array.from(v) };
                if (typeof Node !== 'undefined' && v instanceof Node) return '<' + v.nodeName.toLowerCase() + '>';
                if (v && typeof v === 'object') {
                    if (seen.has(v)) return '[Circular]';
                    seen.add(v);
                }
                return v;
            }, 2);
        } catch (e) { return String(a); }
    }
    function send(type, data, extra) {
        window.parent.postMessage(Object.assign({ __roitx: 1, type: type, data: data }, extra || {}), '*');
    }
    ['log', 'info', 'debug', 'warn', 'error'].forEach(function(m) {
        const orig = console[m];
        console[m] = function() {
            send(m === 'error' ? 'error' : (m === 'warn' ? 'warn' : 'log'), Array.prototype.map.call(arguments, fmt).join(' '));
            orig.apply(console, arguments);
        };
    });
    window.addEventListener('error', function(e) {
        let line = null;
        if (e.lineno && e.lineno > cfg.off && e.lineno <= cfg.off + cfg.jsLines) line = e.lineno - cfg.off;
        send('error', (e.message || 'Error') + (line ? ' (JS line ' + line + ')' : ''), line ? { line: line, lang: 'js' } : {});
    });
    window.addEventListener('unhandledrejection', function(e) {
        send('error', 'Unhandled promise rejection: ' + fmt(e.reason && e.reason.message ? e.reason.message : e.reason));
    });
    window.roitxPrint = function(msg, type) { send(type || 'log', String(msg)); };
}

const PY_SETUP = `import sys
from browser import window
class _Out:
    def __init__(self, kind):
        self.kind = kind
        self.buf = ''
    def write(self, s):
        if self.kind == 'error':
            if s.strip():
                window.roitxPrint(s.rstrip(), 'error')
            return
        self.buf += s
        while '\\n' in self.buf:
            line, self.buf = self.buf.split('\\n', 1)
            window.roitxPrint(line, 'log')
    def flush(self):
        if self.buf:
            window.roitxPrint(self.buf, 'log')
            self.buf = ''
sys.stdout = _Out('log')
sys.stderr = _Out('error')`;

function buildPreviewSource() {
    const safe = (s) => (s || '').replace(/<\/script/gi, '<\\/script');
    const js = safe(jsInput.value), py = pyInput.value.trim() ? safe(pyInput.value) : '';
    const jsLines = js.split('\n').length;
    const makeBefore = (off) => `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${cssInput.value}</style>${py ? `
<script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython_stdlib.js"><\/script>` : ''}
</head>
<body${py ? ' onload="brython()"' : ''}>
${htmlInput.value}
<script>(${iframeBootstrap.toString()})(${JSON.stringify({ off, jsLines })});<\/script>
<script>`;
    // User JS ki pehli line se pehle kitni lines hain -> error ka line number sahi nikalta hai
    const off = (makeBefore(0).match(/\n/g) || []).length;
    let src = makeBefore(off) + js + '<\/script>';
    // Python code seedha apne <script> me (exec nahi) -> traceback me asli line number aata hai
    if (py) src += `\n<script type="text/python">${PY_SETUP}<\/script>\n<script type="text/python">${py}<\/script>`;
    return src + '\n</body>\n</html>';
}

function triggerLivePreview() {
    if (!liveFrame || !htmlInput) return;
    autoOpened = false;
    liveFrame.srcdoc = buildPreviewSource();
}

let lastLog = { text: '', time: 0 };

window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || !d.__roitx || !consoleOutput || (liveFrame && e.source !== liveFrame.contentWindow)) return;

    const text = String(d.data);
    const now = Date.now();
    if (d.type === 'error' && text === lastLog.text && now - lastLog.time < 150) return; // duplicate error
    lastLog = { text, time: now };

    let line = d.line, lang = d.lang;
    if (d.type === 'error' && !line) {                       // Python traceback se line nikalo
        const nums = text.match(/line (\d+)/g);
        if (nums && /Error|Traceback/.test(text)) { line = parseInt(nums[nums.length - 1].replace(/\D/g, ''), 10); lang = 'py'; }
    }

    if (manualRun && !autoOpened && (d.type === 'error' || !htmlInput.value.trim())) { autoOpened = true; switchOutputTab('console'); }

    logCount++;
    if (consoleBadge) consoleBadge.innerText = logCount;

    const entry = document.createElement('div');
    entry.className = `log-entry ${d.type === 'error' ? 'log-error' : d.type === 'warn' ? 'log-warn' : ''}`;
    entry.textContent = `> ${text}`;
    if (line && lang) {
        entry.classList.add('log-link');
        entry.title = `Tap to jump to ${lang.toUpperCase()} line ${line}`;
        entry.addEventListener('click', () => jumpToLine(lang, line));
    }
    consoleOutput.appendChild(entry);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
});

window.jumpToLine = function(lang, n) {
    switchEditorTab(lang);
    const el = ta(lang), lines = el.value.split('\n');
    if (n < 1 || n > lines.length) return;
    const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
    el.focus();
    el.setSelectionRange(start, start + lines[n - 1].length);
    el.scrollTop = Math.max(0, (n - 3) * codeLH(el));
};
/* ==========================================================================
   8. Global Actions, Tabs & Initialization
   ========================================================================== */
window.switchEditorTab = function(tabName) {
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabName + 'Panel').classList.add('active');
    document.getElementById('tabBtn' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
    renderWindow(tabName, false);
};

window.switchOutputTab = function(tabName) {
    const previewWrapper = document.getElementById('previewWrapper');
    const consoleWrapper = document.getElementById('consoleWrapper');
    const btnPreviewTab = document.getElementById('btnPreviewTab');
    const btnConsoleTab = document.getElementById('btnConsoleTab');

    if (tabName === 'preview') {
        previewWrapper.classList.remove('hidden');
        consoleWrapper.classList.add('hidden');
        btnPreviewTab.classList.add('active');
        btnConsoleTab.classList.remove('active');
    } else {
        previewWrapper.classList.add('hidden');
        consoleWrapper.classList.remove('hidden');
        btnConsoleTab.classList.add('active');
        btnPreviewTab.classList.remove('active');
    }
};


window.clearEditor = function(type) {
    const el = ta(type);
    if (el && el.value) editText(el, 0, el.value.length, '');   // Ctrl+Z se wapas aa sakta hai
    triggerLivePreview();
};

/* ==========================================================================
   10. ZIP Export (no library, store-only ZIP writer)
   ========================================================================== */
const CRC_TABLE = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
})();
function crc32(bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    files.forEach(f => {
        const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
        lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
        lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
        parts.push(new Uint8Array(lh.buffer), name, data);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
        ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
        ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);
        central.push(new Uint8Array(ch.buffer), name);
        offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

window.exportZip = function() {
    const p = currentProject();
    const slug = (p.name || 'roitx').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roitx';
    const hasPy = pyInput.value.trim() !== '';
    const index = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHTML(p.name)}</title>
    <link rel="stylesheet" href="style.css">${hasPy ? `
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython_stdlib.js"><\/script>` : ''}
</head>
<body${hasPy ? ' onload="brython()"' : ''}>
${htmlInput.value}
    <script src="script.js"><\/script>${hasPy ? `
    <script type="text/python">
${pyInput.value}
    <\/script>` : ''}
</body>
</html>`;
    const files = [
        { name: 'index.html', data: index },
        { name: 'style.css', data: cssInput.value },
        { name: 'script.js', data: jsInput.value }
    ];
    if (hasPy) files.push({ name: 'main.py', data: pyInput.value });
    triggerDownload(slug + '.zip', makeZip(files), 'application/zip');
    const m = document.getElementById('exportMenu'); if (m) m.classList.add('hidden');
    toast('ZIP downloaded');
};

/* ==========================================================================
   11. Share Link (code URL hash me compress hota hai, backend nahi chahiye)
   ========================================================================== */
function toB64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(str) {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function pipeBytes(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function encodeShare() {
    const bytes = new TextEncoder().encode(JSON.stringify({
        n: currentProject().name, h: htmlInput.value, c: cssInput.value, j: jsInput.value, p: pyInput.value
    }));
    if (window.CompressionStream) return 'z.' + toB64Url(await pipeBytes(bytes, new CompressionStream('deflate-raw')));
    return 'r.' + toB64Url(bytes);
}

async function decodeShare(code) {
    const kind = code.slice(0, 2);
    let bytes = fromB64Url(code.slice(2));
    if (kind === 'z.') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
}

window.copyShareLink = async function() {
    const m = document.getElementById('exportMenu'); if (m) m.classList.add('hidden');
    try {
        const url = location.href.split('#')[0] + '#c=' + await encodeShare();
        try { await navigator.clipboard.writeText(url); toast(url.length > 8000 ? `Link copied (${url.length} chars - bahut lamba)` : 'Share link copied!'); }
        catch (e) { prompt('Link copy karo:', url); }
    } catch (e) { toast('Share link banane me error'); }
};

async function importSharedFromHash() {
    if (!location.hash.startsWith('#c=')) return false;
    try {
        const d = await decodeShare(location.hash.slice(3));
        commitSave();
        const p = makeProject('Shared: ' + (d.n || 'project'), { html: d.h || '', css: d.c || '', js: d.j || '', py: d.p || '' });
        store.projects[p.id] = p;
        openProjectInEditors(p.id);
        toast('Shared project naye project me khul gaya');
        history.replaceState(null, '', location.href.split('#')[0]);
        return true;
    } catch (e) { toast('Share link kharab hai'); return false; }
}

/* ==========================================================================
   12. Keyboard Shortcuts & Initialization
   ========================================================================== */
document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProjectNow(); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); runManualCode(); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFindReplaceModal(); }
    else if (e.key === 'Escape') {
        closeProjects();
        const fr = document.getElementById('findReplaceModal');
        if (fr && !fr.classList.contains('hidden')) fr.classList.add('hidden');
    }
});

window.addEventListener('pagehide', () => { if (saveTimer) commitSave(); });

window.addEventListener('DOMContentLoaded', async () => {
    htmlInput = document.getElementById('htmlInput');
    cssInput = document.getElementById('cssInput');
    jsInput = document.getElementById('jsInput');
    pyInput = document.getElementById('pyInput');

    htmlHighlight = document.getElementById('htmlHighlight');
    cssHighlight = document.getElementById('cssHighlight');
    jsHighlight = document.getElementById('jsHighlight');
    pyHighlight = document.getElementById('pyHighlight');

    htmlLineNums = document.getElementById('htmlLineNums');
    cssLineNums = document.getElementById('cssLineNums');
    jsLineNums = document.getElementById('jsLineNums');
    pyLineNums = document.getElementById('pyLineNums');

    liveFrame = document.getElementById('liveFrame');
    consoleOutput = document.getElementById('consoleOutput');
    consoleBadge = document.getElementById('consoleBadge');
    autoSaveStatus = document.getElementById('autoSaveStatus');
    editorStats = document.getElementById('editorStats');

    LANGS.forEach(l => {
        setupScrollSync(l);
        setupSmartKeyboard(ta(l), l);
    });

    // Toolbar buttons editor ka focus na churaye (mobile keyboard band na ho)
    const bar = document.querySelector('.shortcut-bar');
    if (bar) ['mousedown', 'touchstart'].forEach(ev => bar.addEventListener(ev, (e) => { if (e.target.closest('button')) e.preventDefault(); }, { passive: false }));

    const list = document.getElementById('projectList');
    if (list) list.addEventListener('click', handleProjectClick);
    const pn = document.getElementById('projectName');

    store = loadStore();
    openProjectInEditors(store.current);
    if (pn) pn.textContent = currentProject().name;

    await importSharedFromHash();
});

/* ==========================================================================
   9. Save & Export Engine (With Custom Naming & Extension Support)
   ========================================================================== */

// Export Dropdown Toggle
window.toggleExportMenu = function() {
    const menu = document.getElementById('exportMenu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
};

// Click outside to close dropdown
window.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.export-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        const menu = document.getElementById('exportMenu');
        if (menu) menu.classList.add('hidden');
    }
});

// Generic File Downloader Utility
function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// 1. Save Currently Active File (Custom Name & Extension)
window.saveCurrentActiveFile = function() {
    let content = '';
    let defaultName = 'roitx.txt';

    if (document.getElementById('htmlPanel').classList.contains('active')) {
        content = htmlInput ? htmlInput.value : '';
        defaultName = 'index.html';
    } else if (document.getElementById('cssPanel').classList.contains('active')) {
        content = cssInput ? cssInput.value : '';
        defaultName = 'roitx.css';
    } else if (document.getElementById('jsPanel').classList.contains('active')) {
        content = jsInput ? jsInput.value : '';
        defaultName = 'roitx.js';
    } else if (document.getElementById('pyPanel').classList.contains('active')) {
        content = pyInput ? pyInput.value : '';
        defaultName = 'main.py';
    }

    const userFileName = prompt("फ़ाइल का नाम और एक्सटेंशन दर्ज करें (e.g., roitx.txt, mystyle.css):", defaultName);

    if (userFileName && userFileName.trim() !== "") {
        triggerDownload(userFileName.trim(), content, 'text/plain;charset=utf-8');
    }

    toggleExportMenu();
};

// 2. Export Full Web Page File (Custom Name & Extension)
window.exportFullHTMLProject = function() {
    const defaultName = 'roitx_project.html';
    const userFileName = prompt("वेबपेज फ़ाइल का नाम और एक्सटेंशन दर्ज करें (e.g., roitx.html, page.txt):", defaultName);

    if (!userFileName || userFileName.trim() === "") {
        toggleExportMenu();
        return;
    }

    const fullSource = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roitx Exported Project</title>
    <style>
${cssInput ? cssInput.value : ''}
    </style>
    <!-- Brython Engine for Python Support -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/brython/3.11.1/brython_stdlib.js"><\/script>
</head>
<body onload="brython()">

${htmlInput ? htmlInput.value : ''}

    <script>
${jsInput ? jsInput.value : ''}
    <\/script>

    <script type="text/python">
${pyInput ? pyInput.value : ''}
    <\/script>
</body>
</html>`;

    triggerDownload(userFileName.trim(), fullSource, 'text/plain;charset=utf-8');
    toggleExportMenu();
};

// 3. Export All Separate Files (Custom Base Name Prefix)
window.exportAllSeparateFiles = function() {
    const basePrefix = prompt("फ़ाइलों का मुख्य नाम (Prefix) दर्ज करें:", "roitx");

    if (!basePrefix || basePrefix.trim() === "") {
        toggleExportMenu();
        return;
    }

    const prefix = basePrefix.trim();

    // अब डिफॉल्ट रूप से roitx_index.html, roitx.css, roitx.js नाम से सेव होगा (अगर यूज़र ने 'roitx' रखा)
    triggerDownload(`${prefix}_index.html`, htmlInput ? htmlInput.value : '', 'text/plain;charset=utf-8');
    setTimeout(() => triggerDownload(`${prefix}.css`, cssInput ? cssInput.value : '', 'text/plain;charset=utf-8'), 200);
    setTimeout(() => triggerDownload(`${prefix}.js`, jsInput ? jsInput.value : '', 'text/plain;charset=utf-8'), 400);
    
    if (pyInput && pyInput.value.trim() !== '') {
        setTimeout(() => triggerDownload(`${prefix}_main.py`, pyInput.value, 'text/plain;charset=utf-8'), 600);
    }

    toggleExportMenu();
};
