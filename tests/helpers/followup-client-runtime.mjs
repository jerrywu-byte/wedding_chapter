import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const index = fs.readFileSync(new URL('../../google-apps-script/followup-auth-test/Index.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../../google-apps-script/followup-auth-test/Client.html', import.meta.url), 'utf8');

// A small event/DOM adapter for executing the real Client script in Node.
// This does not emulate browser layout or replace the manual Workspace acceptance.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.dataset = {};
    this.attributes = {}; this.className = ''; this.value = ''; this.hidden = false; this.disabled = false;
    this._text = ''; this.open = false; this.readOnly = false;
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      toggle: (value, enabled) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const add = enabled === undefined ? !classes.has(value) : enabled;
        if (add) classes.add(value); else classes.delete(value);
        this.className = [...classes].join(' ');
      },
      add: value => this.classList.toggle(value, true),
      remove: value => this.classList.toggle(value, false),
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, listener) { (this.events[type] ||= []).push(listener); }
  emit(type, event = {}, force = false) {
    if (this.disabled && !force) return;
    for (const listener of this.events[type] || []) listener(event);
  }
  querySelectorAll(selector) {
    const matches = element => selector.startsWith('.')
      ? element.classList.contains(selector.slice(1)) : element.tagName.toLowerCase() === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

export function fixture(overrides = {}) {
  return { serialNumber: '115DX2031', groomName: '測試新郎', brideName: '測試新娘', salesName: 'Lisa',
    salesCode: 'LISA', groomPhone: '0911111111', bridePhone: '0922222222', weddingDate: '', dateUndecided: true,
    primaryContactName: '測試新娘', primaryContactPhone: '0922222222',
    banquetSession: '晚', submittedAt: '2026/09/01 10:00', estimatedTables: '20',
    firstConsultation: '原始洽談', secondConsultation: '', thirdConsultation: '', status: '洽談中', closedDate: '',
    identityToken: 'i'.repeat(43), revisionToken: 'r'.repeat(43), editable: false,
    canAddCollaborationNote: true, collaborationNotes: [], ...overrides };
}

export function clientRuntime() {
  const elements = {};
  for (const match of index.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const element = new Element(match[1]);
    element.hidden = /\bhidden\b/.test(match[2]); element.disabled = /\bdisabled\b/.test(match[2]);
    element.className = match[2].match(/class="([^"]+)"/)?.[1] || '';
    elements[match[3]] = element;
  }
  const statuses = Array.from(index.matchAll(/<button\b[^>]*data-status="([^"]+)"[^>]*>/g), match => {
    const button = new Element('button'); button.dataset.status = match[1]; return button;
  });
  const pending = []; const calls = []; const windowEvents = {}; const timers = new Map();
  let nextTimer = 1;
  const state = { confirm: false, confirmations: 0 };
  function runner() {
    const handlers = {};
    const chain = { withSuccessHandler(fn) { handlers.success = fn; return chain; },
      withFailureHandler(fn) { handlers.failure = fn; return chain; } };
    for (const method of ['listCases', 'getCase', 'updateCase', 'addCollaborationNote']) {
      chain[method] = payload => {
        const call = { method, payload, ...handlers }; pending.push(call); calls.push(call);
      };
    }
    return chain;
  }
  const script = {}; Object.defineProperty(script, 'run', { get: runner });
  const context = vm.createContext({
    document: { getElementById: id => { assert.ok(elements[id], id); return elements[id]; },
      createElement: tag => new Element(tag), querySelectorAll: selector => {
        assert.equal(selector, '[data-status]'); return statuses;
      } },
    window: {
      setTimeout(fn) { const id = nextTimer++; timers.set(id, fn); return id; },
      clearTimeout(id) { timers.delete(id); },
      addEventListener(type, listener) { windowEvents[type] = listener; },
      confirm() { state.confirmations++; return state.confirm; },
    }, google: { script }, console,
  });
  vm.runInContext(client.replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, ''), context, { filename: 'Client.html' });
  function respond(method, result, failure = false) {
    const index = pending.findIndex(call => call.method === method);
    assert.ok(index >= 0, 'Expected request ' + method);
    const call = pending.splice(index, 1)[0];
    if (failure) call.failure(result); else call.success(result);
    return call;
  }
  function open(detail = fixture()) {
    respond('listCases', [detail, fixture({ serialNumber: '115DX2032' })]);
    respond('getCase', detail);
  }
  return { elements, statuses, pending, calls, state, windowEvents, respond, open,
    flushTimers() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
    input(id, text) { elements[id].value = text; elements[id].emit('input'); },
    tables: () => elements.basicInformation.querySelector('input'),
    primaryMarkers: () => elements.basicInformation.querySelectorAll('.followup-primary-marker')
      .map(marker => marker.querySelector('input')),
    consultations: () => elements.consultations.querySelectorAll('textarea'),
  };
}
