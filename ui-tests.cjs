// Unit-level checks for UI state orchestration. Browser layout is verified separately.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const G = require('./engine.js');
const D = require('./data.js');

function harness(saved = null) {
  const listeners = new Map(), elements = new Map(), storage = new Map();
  if (saved) storage.set('research-life-save-v1', JSON.stringify(saved));
  function element(key) {
    if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', open: false, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, append() {}, click() {}, focus() {}, close() { this.open = false; }, showModal() { this.open = true; } });
    return elements.get(key);
  }
  const context = vm.createContext({
    GameData: D, Game: G, icon: name => `<svg data-icon="${name}"></svg>`, console,
    document: { querySelector: element, createElement: () => element('created'), addEventListener: (event, fn) => listeners.set(event, fn), activeElement: null },
    window: { scrollTo() {} }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout() {}, Blob, URL, FormData
  });
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context, { filename: 'app.js' });
  return {
    context, elements, storage,
    call(expression) { return vm.runInContext(expression, context); },
    setState(s) { context.fixture = s; vm.runInContext("state=fixture;setupMode=false;page='overview';feedback=null;", context); },
    validate(s) { context.fixture = s; return vm.runInContext('validateSave(fixture)', context); },
    click(dataset) { return listeners.get('click')({ target: { closest: () => ({ disabled: false, dataset }) }, preventDefault() {} }); }
  };
}
function clone(s) { return JSON.parse(JSON.stringify(s)); }

test('six disciplines render all UI pages across doctorate, faculty and ending states', () => {
  const ui = harness();
  for (const major of Object.keys(D.majors)) {
    const s = G.make(major, 6);
    for (const phase of ['phd', 'faculty']) {
      if (phase === 'faculty') { s.career = true; G.chooseCareer(s, 'faculty'); }
      ui.setState(s);
      for (const page of ['overview', 'papers', 'achievements', 'journal', 'guide']) {
        assert.doesNotThrow(() => ui.call(`page='${page}';render()`), `${major}/${phase}/${page}`);
        assert.ok(ui.elements.get('#app').innerHTML.length > 1000);
      }
    }
    s.ending = 'tenure'; ui.setState(s); assert.doesNotThrow(() => ui.call('render()'));
  }
});

test('UI automatic planning is read-only until execution and produces a valid starter plan', () => {
  const ui = harness();
  for (const major of Object.keys(D.majors)) for (const focus of Object.keys(G.focusOptions)) {
    const s = G.make(major, 42); G.setFocus(s, focus); s.ui = { plan: [] };
    const before = clone(s); ui.setState(s); ui.call('autoPlan()');
    assert.ok(s.ui.plan.length > 0, `${major}/${focus}`); assert.ok(G.previewPlan(s, s.ui.plan).ok);
    assert.equal(s.seed, before.seed); assert.equal(s.actions, before.actions); assert.equal(s.energy, before.energy);
    const ids = [...s.ui.plan]; ui.click({ command: 'execute' });
    assert.equal(ui.call('state.actions'), before.actions - ids.length);
    assert.equal(ui.call('plan().length'), 0);
  }
});

test('automatic planning does not rely on an uncertain future grant when funds are empty', () => {
  const ui = harness(), s = G.make('ee', 1);
  Object.assign(s, { semester: 4, knowledge: 70, proposal: true, thesis: 100, funds: 0, ui: { plan: [] } });
  ui.setState(s); ui.call('autoPlan()');
  assert.ok(s.ui.plan.length > 0, ui.elements.get('#toast').textContent);
  assert.ok(G.previewPlan(s, s.ui.plan).ok);
});

test('UI budget feedback consumes preview effects without exposing hidden attributes', () => {
  const ui = harness(), s = G.make('cs', 10); s.ui = { plan: ['read', 'research'] }; ui.setState(s);
  const html = ui.call('planner()');
  assert.ok(html.includes('预计消耗与收获')); assert.ok(html.includes('精力')); assert.ok(html.includes('研究进度'));
  assert.ok(!html.includes('ethics')); assert.ok(!html.includes('eq')); assert.ok(!html.includes('risk'));
});

test('removing a prerequisite from a plan exposes the resulting problem before execution', () => {
  const ui = harness(), s = G.make('cs', 5);
  s.energy = 0; s.ui = { plan: ['rest', 'research'] }; ui.setState(s);
  assert.ok(G.previewPlan(s, s.ui.plan).ok);
  ui.click({ removePlan: '0' });
  const error = G.previewPlan(s, s.ui.plan).error;
  assert.ok(!s.ui.plan.length || ui.call('planner()').includes(error), 'invalid remaining plan should be cleared or explain its blocker');
  if (s.ui.plan.length) assert.match(ui.call('dock()'), /data-command="execute"\s+disabled/, 'invalid plan must not present an enabled execution button');
});

test('queued proposal unlocks thesis planning and executes both actions in order', () => {
  const ui = harness(), s = G.make('cs', 5);
  Object.assign(s, { semester: 3, knowledge: 55, ui: { plan: ['proposal'] } });
  ui.setState(s); ui.call("filter='degree'");
  const thesisButton = ui.call('planner()').match(/<button\b[^>]*data-add-action="thesis"[^>]*>/)?.[0];
  assert.ok(thesisButton, 'thesis should be present in degree planning');
  assert.ok(!/\bdisabled\b/.test(thesisButton), 'queued proposal satisfies the prerequisite');
  assert.equal(s.proposal, false, 'planning does not execute the prerequisite early');
  ui.click({ addAction: 'thesis' });
  assert.equal(ui.call('plan().join(",")'), 'proposal,thesis');
  ui.click({ command: 'execute' });
  assert.equal(ui.call('state.proposal'), true);
  assert.equal(ui.call('state.thesis'), 25);
  assert.equal(ui.call('state.actions'), 2);
  assert.equal(ui.call('plan().length'), 0);
});

test('refresh migrates old saves and restores a valid queued plan without executing it', () => {
  const s = G.make('lit', 12); s.ui = { plan: ['read', 'rest'] };
  for (const key of ['focus', 'lastRound', 'opportunityHistory', 'roundStart', 'roundTime', 'roundLogStart']) delete s[key];
  const ui = harness(s);
  assert.equal(ui.call('state.focus'), 'balanced'); assert.equal(ui.call('state.actions'), 4);
  assert.equal(ui.call('plan().join(",")'), 'read,rest');
});

test('pending event refresh and completed-round summary are both restorable', () => {
  const s = G.make('cs', 22); G.act(s, 'read'); G.next(s);
  const pending = harness(s); assert.equal(pending.call('modalKind'), 'event'); assert.ok(pending.elements.get('#modal').open);
  G.resolve(s, -1); G.resolve(s, -1);
  const summary = harness(s); assert.equal(summary.call('modalKind'), 'round'); assert.ok(summary.elements.get('#modal').innerHTML.includes(s.lastRound.time));
  summary.click({ command: 'close' }); assert.equal(summary.call('state.ui.seenRound'), s.lastRound.id);
});

test('invalid optional round summaries cannot crash the UI after import', () => {
  const ui = harness();
  for (const broken of [{}, { id: 'broken', time: 'test', before: {}, after: {}, highlights: null }]) {
    const s = G.make('cs', 1); s.lastRound = broken;
    let accepted;
    try { accepted = ui.validate(s); } catch { continue; }
    ui.setState(accepted);
    assert.doesNotThrow(() => ui.call('render();showPending()'));
  }
});

test('inconsistent pending saves and malformed grant entries are rejected or normalized', () => {
  const ui = harness();
  const stuck = G.make('cs', 1); stuck.pending = true; stuck.queue = [];
  let pendingAccepted;
  try { pendingAccepted = ui.validate(stuck); } catch {}
  assert.ok(!pendingAccepted || !pendingAccepted.pending || pendingAccepted.queue.length, 'empty pending queue permanently blocks actions');
  const grant = G.make('cs', 1); grant.grantWins = [null];
  let grantAccepted;
  try { grantAccepted = ui.validate(grant); } catch {}
  if (grantAccepted) { ui.setState(grantAccepted); assert.doesNotThrow(() => ui.call('achievements()')); }
});

test('reviewing papers cannot silently lose their review schedule during import', () => {
  const ui = harness(), s = G.make('cs', 1);
  s.papers = [{ id: 1, title: '测试稿件', status: 'review', tier: 1, quality: [60, 60, 60, 60, 60] }];
  let accepted;
  try { accepted = ui.validate(s); } catch {}
  assert.ok(!accepted || accepted.papers.every(p => p.status !== 'review' || Number.isFinite(p.due) && Number.isFinite(p.rounds)), 'unscheduled paper will never be reviewed');
});

test('fractional timeline counters and future project starts cannot enter a playable save', () => {
  const ui = harness();
  const corruptions = [
    s => { s.semester = 1.5; },
    s => { s.year = 1.5; },
    s => { s.actions = 3.5; },
    s => { s.tick = 1.5; },
    s => { s.project.number = 1.5; },
    s => { s.project.started = 1.5; },
    s => { s.project.number = 0; },
    s => { s.project.started = s.tick + 1; },
    s => { s.actions = 5; }
  ];
  for (const corrupt of corruptions) {
    const s = G.make('cs', 2); corrupt(s);
    assert.throws(() => ui.validate(s), undefined, corrupt.toString());
  }
  const valid = G.make('ee', 2); valid.funds = 12.5;
  assert.doesNotThrow(() => ui.validate(valid), 'fractional financial amounts remain valid');
});
