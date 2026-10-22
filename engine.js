(function (root) {
  const D = typeof module !== 'undefined' ? require('./data.js') : root.GameData;
  const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
  const labels = { energy: '精力', knowledge: '积累', advisor: '导师好感', health: '健康', reputation: '声望', funds: '经费', progress: '研究进度', thesis: '学位论文', teaching: '教学', students: '培养', eq: '人际', ethics: '规范', risk: '追责风险' };
  const visibleKeys = ['energy', 'knowledge', 'advisor', 'health', 'reputation', 'funds'];
  const focusOptions = {
    balanced: { id: 'balanced', name: '稳步推进', description: '按正常节奏安排研究、积累与生活，保留调整余地。' },
    sprint: { id: 'sprint', name: '集中攻坚', description: '每次研究进度额外 +1，同时多消耗 5 精力、3 健康。' },
    recover: { id: 'recover', name: '休整蓄力', description: '休息额外恢复 5 健康；研究进度 −1（至少 1），研读积累 −2。' }
  };
  function visible(s) { return Object.fromEntries([...visibleKeys.map(k => [k, s[k]]), ['points', points(s, s.phase === 'faculty')]]); }
  function beginRound(s) { s.roundStart = visible(s); s.roundTime = time(s); s.roundLogStart = s.logs.length; }
  function recordRound(s) {
    const count = Math.max(0, s.logs.length - (s.roundLogStart || 0));
    const recent = s.logs.slice(0, count);
    const highlights = recent.filter(l => ['good', 'event', 'paper', 'bad', 'ending'].includes(l.kind));
    s.lastRound = { id: `${s.phase}:${s.semester}:${s.year}:${s.tick}`, time: s.roundTime || time(s), before: s.roundStart || visible(s), after: visible(s), highlights: (highlights.length ? highlights : recent).slice(0, 8).reverse() };
  }
  function migrate(s) {
    if (!Object.hasOwn(s, 'focus')) s.focus = 'balanced';
    if (!Object.hasOwn(s, 'lastRound')) s.lastRound = null;
    if (!Object.hasOwn(s, 'opportunityHistory')) s.opportunityHistory = [];
    if (!s.roundStart) beginRound(s);
    return s;
  }
  function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
  function time(s) { return s.phase === 'faculty' ? `青椒 · 第${s.year}年` : `博士 · 第${Math.ceil(s.semester / 2)}年${s.semester % 2 ? '上' : '下'}学期`; }
  function log(s, title, text, kind = 'normal') { s.logs.unshift({ time: time(s), title, text, kind }); }
  function make(major, seed = Date.now(), direction = 0) {
    if (!D.majors[major]) throw new Error('未知专业');
    const s = { version: 1, major, phase: 'phd', semester: 1, year: 1, tick: 1, seed: seed >>> 0, actions: 4, energy: 82, knowledge: 28, advisor: 55, health: 80, reputation: 8, funds: D.majors[major].startFunds, ethics: 85, eq: 40, risk: 0, thesis: 0, proposal: false, blind: false, defense: false, teaching: 0, students: 0, researchRuns: 0, grants: 0, grantWins: [], teachingYears: 0, studentYears: 0, project: { progress: 0, started: 1, number: 1 }, papers: [], logs: [], queue: [], usedEvents: [], ending: null, career: false, facultyBase: 0, annual: {}, pending: false, milestones: [] };
    s.direction = Number.isInteger(direction) && direction >= 0 && direction < 3 ? direction : 0;
    log(s, '入学报到', `你成为一名${D.majors[major].name}博士生。初定方向：${D.majors[major].topic[s.direction]}。四年八学期，从读懂第一篇文献开始。`);
    migrate(s);
    return s;
  }
  function apply(s, effects) {
    for (const [k, v] of Object.entries(effects)) {
      if (k === 'progress') s.project.progress = clamp(s.project.progress + v, 0, D.majors[s.major].work);
      else if (k === 'funds') s.funds = Math.max(0, Math.round((s.funds + v) * 10) / 10);
      else if (['teaching', 'students'].includes(k)) s[k] = Math.max(0, s[k] + v);
      else s[k] = clamp(s[k] + v);
    }
  }
  function costs(effects, showHidden = false) {
    return Object.entries(effects).filter(([k]) => showHidden || !['ethics', 'eq', 'risk'].includes(k)).map(([k,v]) => `${labels[k] || k} ${v > 0 ? '+' : ''}${v}${k === 'funds' ? '万' : ''}`).join(' · ');
  }
  function affordability(s, effects) {
    for (const k of ['energy', 'funds']) if ((effects[k] || 0) < 0 && s[k] + effects[k] < 0) return `${k === 'energy' ? '科研精力' : '科研经费'}不足`;
    return '';
  }
  function points(s, faculty = false) { return s.papers.filter(p => p.status === 'accepted' && (!faculty || p.acceptedPhase === 'faculty')).reduce((a,p) => a + (3 - p.tier), 0); }
  function targetKnowledge(s) { return s.major === 'math' ? 65 : s.major === 'lit' ? 60 : 55; }
  function specialtyRequirement(s) {
    const standards = { cs: ['可复现实验记录',3], ee: ['台架与外场验证',4], math: ['严格推导训练',5], lit: ['文献考证与细读',4], marx: ['项目研究经历',1], news: ['数据采集与编码',3] };
    const [label,target] = standards[s.major];
    return { label, value: s.major === 'marx' ? s.grants : s.researchRuns, target };
  }
  function requirements(s) {
    const m = D.majors[s.major];
    if (s.phase === 'faculty') return [
      { label: '聘期成果积分', value: points(s, true), target: m.tenure },
      { label: '获批研究项目', value: s.grants - s.facultyBase, target: 1 },
      { label: '教学达标年度', value: s.teachingYears, target: 5 },
      { label: '研究生指导年度', value: s.studentYears, target: 3 },
      { label: '学术声望', value: s.reputation, target: 35 }
    ];
    return [
      { label: '代表成果积分', value: points(s), target: m.graduation },
      { label: '学术积累', value: s.knowledge, target: targetKnowledge(s) },
      specialtyRequirement(s),
      { label: '学位论文完成度', value: s.thesis, target: 100 },
      { label: '开题答辩', value: s.proposal ? 1 : 0, target: 1 },
      { label: '盲审通过', value: s.blind ? 1 : 0, target: 1 }
    ];
  }
  function actionList(s) {
    const m = D.majors[s.major], faculty = s.phase === 'faculty';
    return [
      { id: 'read', title: '文献研读', text: m.group === '文科' ? '回到文献与原典，积累理论、材料与表达。' : '精读论文，梳理方法边界与前沿问题。', icon: 'book', effects: { energy: -12, knowledge: 9, health: -1 } },
      { id: 'research', title: m.research, text: `推进「${topic(s)}」。`, icon: m.icon, effects: { energy: -m.energy, funds: -m.cost * (faculty ? 1.5 : 1), health: -m.health, knowledge: s.major === 'math' ? 5 : 3, progress: (faculty ? 2 : 1) + (s.knowledge >= 65 ? 1 : 0) }, disabled: s.project.progress >= m.work ? '研究量已足，需等待研究周期完成' : '' },
      { id: 'mentor', title: faculty ? '同行交流' : '导师讨论', text: faculty ? '和国内同行讨论研究边界与合作分工。' : '带着具体问题讨论方向，争取有效指导。', icon: 'chat', effects: { energy: -10, advisor: 8, knowledge: 4, eq: 4, health: -1 } },
      { id: 'rest', title: '认真休息', text: '把一段完整的时间留给睡眠、散步与生活。', icon: 'leaf', effects: { energy: 26, health: 16 }, note: '占用 1 次行动，研究暂缓' },
      { id: 'grant', title: faculty ? '申报研究项目' : '参与课题申报', text: `${projectTitle(s)}${faculty ? '' : '的前期材料与校内研究生创新项目'}。`, icon: 'folder', effects: { energy: -17, health: -3, knowledge: 3 }, disabled: s.annual.grant ? '本回合已申报' : '', note: '竞争评审 · 可能不获资助' },
      ...(faculty ? [
        { id: 'teach', title: '备课与教学', text: '完成课程教学、作业反馈与课堂改进。每年需至少 1 次。', icon: 'board', effects: { energy: -18, health: -3, teaching: 1, reputation: 2 }, note: s.annual.teach ? '本年度已完成基础教学' : '年度责任' },
        { id: 'supervise', title: '指导研究生', text: '讨论研究设计与科研规范，检查真实进度。第二年起计入考核。', icon: 'people', effects: { energy: -14, health: -2, students: 1, reputation: 2 }, disabled: s.year < 2 ? '入职第二年开始安排指导' : '', note: s.annual.supervise ? '本年度已完成基础指导' : '培养责任' },
        { id: 'applied', title: m.group === '理工科' ? '承接横向项目' : s.major === 'marx' ? '申报思政教改课题' : '申报教学改革课题', text: m.group === '理工科' ? '把研究能力用于具体需求。合同交付会占用自由探索的时间。' : '从课堂问题形成教改设计，论证实施、评价与学生反馈。', icon: 'folder', effects: { energy: -21, health: -5, advisor: -2, knowledge: 2 }, disabled: s.annual.grant ? '本年度已申报项目' : s.reputation < 20 ? '需声望达到 20' : '', note: '与研究项目共用本年度申报机会' },
        ...(s.major === 'lit' ? [{ id: 'chapter', title: '撰写专著 / 古籍整理章节', text: '累计三次投入形成章节，交由学术编辑与同行评阅，至少等待两个年度。', icon: 'book', effects: { energy: -20, health: -4, funds: -.5, knowledge: 4 }, note: `章节工作量 ${s.chapterWork || 0} / 3` }] : [])
      ] : [
        { id: 'proposal', title: '开题答辩', text: '界定研究问题、研究路线与可行性。第 3 学期起，积累达到 40。', icon: 'flag', effects: { energy: -18, health: -3, advisor: 3 }, disabled: s.proposal ? '已通过开题' : s.semester < 3 ? '第 3 学期开放' : s.knowledge < 40 ? '学术积累需达到 40' : '' },
        { id: 'thesis', title: '撰写学位论文', text: '开题后整理论证链、研究材料与学术贡献。', icon: 'pen', effects: { energy: -18, health: -3, thesis: s.knowledge >= 65 ? 30 : 25, knowledge: 2 }, disabled: !s.proposal ? '需先通过开题' : s.thesis >= 100 ? '论文已完成' : '' },
        { id: 'blind', title: '提交学位论文盲审', text: '第 7 学期起，论文完成度 100、积累、成果与专业训练达标后送审。', icon: 'shield', effects: { energy: -15, health: -3 }, disabled: s.blind ? '盲审已通过' : s.semester < 7 ? '第 7 学期开放' : s.thesis < 100 ? '学位论文尚未完成' : s.knowledge < targetKnowledge(s) ? '学术积累尚未达标' : points(s) < m.graduation ? '代表成果积分尚未达标' : specialtyRequirement(s).value < specialtyRequirement(s).target ? '专业训练记录尚未达标' : s.annual.blind ? '本学期已送审，修改后下学期再审' : '', note: '规范核查与同行评议' },
        { id: 'defense', title: '申请毕业答辩', text: '第 8 学期起，在通过盲审后完成答辩与学位审核。', icon: 'cap', effects: { energy: -15, health: -2 }, disabled: s.semester < 8 ? '第 8 学期开放' : !s.blind ? '需先通过盲审' : '', note: '通过后进入择业' }
      ])
    ].map(a => {
      if (s.focus === 'sprint' && a.id === 'research') {
        a.effects.progress++; a.effects.energy -= 5; a.effects.health -= 3;
      } else if (s.focus === 'recover') {
        if (a.id === 'research') a.effects.progress = Math.max(1, a.effects.progress - 1);
        if (a.id === 'read') a.effects.knowledge -= 2;
        if (a.id === 'rest') a.effects.health += 5;
      }
      return a;
    });
  }
  function available(s) { return !s.ending && !s.career && !s.pending; }
  function setFocus(s, id) {
    if (!Object.hasOwn(focusOptions, id)) return '未知的学期节奏';
    if (!available(s)) return '请先完成当前事件或抉择';
    if (s.actions !== (s.phase === 'faculty' ? 6 : 4) || Object.keys(s.annual).length) return '本回合已经开始行动，下回合再调整节奏';
    s.focus = id;
    return '';
  }
  function recommendation(s) {
    if (s.ending) return { id: 'ended', title: '回看这段人生', reason: '本局已结束，手记保留了每一次选择。' };
    if (s.career) return { id: 'career', title: '选择下一站', reason: s.phase === 'faculty' ? '六年聘期已经结束，可以查看终评与岗位条件。' : '答辩已经通过，下一段路由你选择。' };
    if (s.pending) return { id: 'next', title: '处理待办事件', reason: '先完成当前事件，再安排新的工作。' };
    if (s.actions <= 0) return { id: 'next', title: '结束本回合', reason: '安排已完成，接下来处理两条期末事件。' };
    const actions = actionList(s);
    const can = id => actions.some(a => a.id === id && !a.disabled && !affordability(s, a.effects));
    const suggestion = (id, reason) => ({ id, title: actions.find(a => a.id === id).title, reason });
    if (s.health < 43 || s.energy < 23) return suggestion('rest', '先恢复精力与健康，给接下来的研究和期末事件留出余量。');
    for (const [id, reason] of [['defense', '毕业条件已经具备，先完成答辩，避免无谓延长培养。'], ['blind', '论文与培养条件已经达到，尽早送盲审，为可能的修改留出时间。'], ['proposal', '可以开题了。通过之后，学位论文写作就会开放。']]) {
      if (can(id)) return suggestion(id, reason);
    }
    if (s.phase === 'faculty' && !s.annual.teach && can('teach')) return suggestion('teach', '先落实年度基础教学，这项责任会在年末计入考核。');
    if (s.phase === 'faculty' && s.year >= 2 && !s.annual.supervise && can('supervise')) return suggestion('supervise', '别让论文挤掉学生指导；每年投入一次即可完成基础要求。');
    const revision = s.papers.find(p => p.status === 'revision');
    if (revision && s.energy >= 18) return { id: 'revise', title: '回应审稿意见', reason: '已有稿件等待修改，完成返修比另起一题更接近成果。', paperId: revision.id };
    const draft = s.papers.find(p => ['draft', 'rejected'].includes(p.status));
    if (draft && s.energy >= 14) return { id: 'submit', title: draft.status === 'rejected' ? '调整并重新投稿' : '提交现有稿件', reason: '已有成稿可以进入同行评议，不必等到所有研究都结束。', paperId: draft.id };
    if (s.phase === 'phd' && s.knowledge < targetKnowledge(s) && can('read')) return suggestion('read', '先补足文献与理论基础，能提高研究效率，也接近培养门槛。');
    if (can('grant') && (s.funds < D.majors[s.major].cost * 3 || s.major === 'marx' && !s.grants || s.phase === 'faculty' && s.grants === s.facultyBase)) return suggestion('grant', '当前经费或项目经历还不足，安排一次申报，为后续研究准备条件。');
    if (s.phase === 'phd' && s.semester >= 4 && can('thesis')) return suggestion('thesis', '分学期写作，避免把整篇学位论文压到毕业前夕。');
    if (can('research')) return suggestion('research', '基础条件具备，继续推进本专业研究，工作量与周期同时达标后会成稿。');
    if (s.energy < 60 || s.health < 85) return suggestion('rest', '当前研究需要等待周期，趁这段时间恢复状态。');
    if (can('mentor')) return suggestion('mentor', '和导师或同行核对问题，等待研究积累的同时增进理解。');
    return suggestion('read', '持续积累文献，为下一个问题准备更扎实的基础。');
  }
  function previewPlan(s, ids) {
    const fail = error => ({ ok: false, error, effects: {} });
    if (!available(s)) return fail('请先完成当前事件或抉择');
    if (!Array.isArray(ids) || !ids.length) return fail('先加入至少一项安排');
    if (ids.length > s.actions) return fail('安排数量超过本回合剩余行动');
    const trial = JSON.parse(JSON.stringify(s));
    const before = visible(trial);
    let progress = 0, forecastThesis = s.thesis;
    for (let i = 0; i < ids.length; i++) {
      const a = actionList(trial).find(a => a.id === ids[i]);
      if (!a) return fail(`第 ${i + 1} 项不是可安排的日常行动`);
      if (['blind', 'defense'].includes(a.id) && i !== ids.length - 1) return fail('盲审和毕业答辩会改变阶段，请放在安排的最后');
      const predicted = {};
      for (const k of visibleKeys) predicted[k] = k === 'funds' ? Math.max(0, Math.round((trial[k] + (a.effects[k] || 0)) * 10) / 10) : clamp(trial[k] + (a.effects[k] || 0));
      const addedProgress = Math.min(a.effects.progress || 0, D.majors[s.major].work - trial.project.progress);
      forecastThesis = clamp(forecastThesis + (a.effects.thesis || 0));
      const error = act(trial, a.id);
      if (error) return fail(`第 ${i + 1} 项「${a.title}」：${error}`);
      progress += addedProgress;
      // Preview never reveals a random grant award or spends funds not yet secured.
      Object.assign(trial, predicted);
    }
    const effects = Object.fromEntries(visibleKeys.map(k => [k, Math.round((trial[k] - before[k]) * 10) / 10]).filter(([,v]) => v !== 0));
    if (progress) effects.progress = progress;
    // Blind-review revisions are uncertain, so only preview deliberate thesis writing.
    const thesisGain = Math.max(0, forecastThesis - s.thesis);
    if (thesisGain) effects.thesis = thesisGain;
    return { ok: true, error: '', effects };
  }
  function executePlan(s, ids) {
    const preview = previewPlan(s, ids);
    if (!preview.ok) return preview.error;
    const trial = JSON.parse(JSON.stringify(s));
    for (const id of ids) { const error = act(trial, id); if (error) return error; }
    Object.assign(s, trial);
    return '';
  }
  function opportunities(s) {
    const term = s.phase === 'faculty' ? s.year : s.semester;
    const pool = (D.opportunities || []).filter(o => (o.major === 'all' || o.major === s.major) && (o.phase === 'all' || o.phase === s.phase) && term >= (o.minTerm || 1) && (!o.requiresProposal || s.proposal));
    const own = pool.filter(o => o.major === s.major), shared = pool.filter(o => o.major === 'all');
    const rotate = (items, limit) => items.length ? Array.from({ length: Math.min(limit, items.length) }, (_,i) => items[(s.tick - 1 + i) % items.length]) : [];
    return [...rotate(own, 1), ...rotate(shared, own.length ? 2 : 3)];
  }
  function pursueOpportunity(s, id, index) {
    if (!available(s)) return '请先完成当前事件或抉择';
    if (s.actions < 1) return '本回合行动已用完';
    if (s.annual.opportunity) return '本回合已参与一项机会，把余下时间留给主线';
    const opportunity = opportunities(s).find(o => o.id === id);
    const choice = opportunity && Number.isInteger(index) ? opportunity.choices[index] : null;
    if (!choice) return '这项机会当前不可参与';
    const lack = affordability(s, choice.effects); if (lack) return lack;
    s.actions--; s.annual.opportunity = 1; apply(s, choice.effects);
    if (!s.opportunityHistory) s.opportunityHistory = [];
    s.opportunityHistory.push({ id, title: opportunity.title, choice: choice.text, time: time(s), tick: s.tick });
    log(s, opportunity.title, `${choice.text}。${choice.note}（${costs(choice.effects)}）`, 'event');
    manuscript(s); checkHealth(s);
    return '';
  }
  function topic(s) { return D.majors[s.major].topic[(s.project.number - 1 + (s.direction || 0)) % 3]; }
  function projectTitle(s) {
    const m = D.majors[s.major];
    return s.phase === 'faculty' && s.grants > s.facultyBase ? (m.group === '理工科' ? '省部级自然科学 / 校内科研项目' : '省部级社科 / 校内人文项目') : m.grant;
  }
  function venue(s,p) { return p.kind === 'chapter' ? '学术专著章节 / 古籍整理成果' : D.majors[s.major].tiers[p.tier]; }
  function end(s, id) { s.ending = id; s.pending = false; s.queue = []; s.career = false; log(s, D.endings[id][0], D.endings[id][1], 'ending'); }
  function checkHealth(s) { if (s.health <= 0) end(s, 'health'); }
  function manuscript(s) {
    const m = D.majors[s.major];
    if (s.project.progress < m.work || s.tick - s.project.started + 1 < m.minAge) return;
    const quality = m.rubric.map((_,i) => clamp(Math.round(s.knowledge * .68 + 20 + random(s) * 15 + (s.major === 'marx' && i === 3 ? s.eq * .15 : 0)), 15, 96));
    s.papers.push({ id: s.papers.length + 1, title: topic(s) + (s.project.number > 3 ? `（续篇${Math.ceil(s.project.number / 3)}）` : ''), status: 'draft', quality, tier: 1, due: 0, rounds: 0, strategy: 'honest', evidenceRisk: 0 });
    s.project = { progress: 0, started: s.tick, number: s.project.number + 1 };
    log(s, '一份新稿件完成了', '研究达到必要的工作量与时间积累。请到「论文工作台」选择投稿层次与写作方式。', 'good');
  }
  function act(s, id) {
    if (!available(s)) return '请先完成当前事件或抉择';
    if (s.actions <= 0) return '本回合行动已用完，请结束回合';
    const a = actionList(s).find(a => a.id === id);
    if (!a) return '未知行动';
    if (a.disabled) return a.disabled;
    const lack = affordability(s, a.effects); if (lack) return lack;
    s.actions--; apply(s, a.effects); s.annual[id] = (s.annual[id] || 0) + 1;
    if (id === 'research') s.researchRuns++;
    let result = a.note ? `${a.note}（${costs(a.effects)}）` : costs(a.effects);
    if (id === 'proposal') { s.proposal = true; result = '开题通过。方向仍可调整，但学位论文终于有了清晰的问题。'; }
    if (id === 'chapter') {
      s.chapterWork = (s.chapterWork || 0) + 1;
      result = `专著 / 古籍整理章节工作量 ${s.chapterWork}/3，材料边界与引注同步整理。`;
      if (s.chapterWork >= 3) {
        s.chapterWork = 0;
        s.papers.push({ id: s.papers.length + 1, kind: 'chapter', title: `文献整理与文本阐释·专著章节 ${s.papers.filter(p=>p.kind==='chapter').length + 1}`, status: 'review', quality: Array.from({length:5},()=>clamp(s.knowledge*.7+20,0,95)), tier:1, due:s.tick+2, rounds:1, strategy:'honest', evidenceRisk:0 });
        result = '章节完成并送学术编辑与同行评阅，预计两年后反馈。录用计 2 积分，返修不保证录用。';
      }
    }
    if (id === 'applied') {
      s.annual.grant = 1;
      const name = D.majors[s.major].group === '理工科' ? '校企横向研究项目' : s.major === 'marx' ? '思想政治教育与教学改革课题' : '教学改革研究课题';
      if (random(s) < .55 + s.eq * .002) {
        const amount = D.majors[s.major].group === '理工科' ? 8 : 4;
        s.funds += amount; s.grants++; s.grantWins.push({ time:time(s),name,amount });
        result = `${name}获批，研究额度 +${amount}万元。已预留本年度实施或交付工作量，挤占了一部分自由研究时间。`;
      } else result = `${name}未能落实。申请与沟通已经占用时间，下一年度再评估机会。`;
    }
    if (id === 'grant') {
      const chance = clamp(.30 + s.knowledge * .003 + s.eq * .002 + (s.major === 'marx' ? .12 : 0), .2, .82);
      if (random(s) < chance) {
        const grant = s.phase === 'faculty' ? (s.major === 'ee' ? 22 : s.major === 'cs' ? 14 : 9) : (s.major === 'ee' ? 10 : 5);
        const name = s.phase === 'faculty' ? projectTitle(s) : '校内研究生创新项目 / 参与团队课题';
        s.funds += grant; s.grants++; s.grantWins.push({ time: time(s), name, amount: grant }); s.reputation = clamp(s.reputation + 4);
        result = `项目获得资助，本局可用研究额度 +${grant}万元。经费仅用于科研支出。`;
      } else result = '本轮未获资助。评审认为前期基础与研究设计还需要加强，申请书积累保留。';
    }
    if (id === 'blind') {
      if (s.ethics < 55 && random(s) < .5) { s.thesis = 75; result = '规范核查要求补充来源与材料说明。退回修改，完成后下学期再送审。'; }
      else if (random(s) < clamp(.72 + (s.knowledge - 55) * .006, .65, .95)) { s.blind = true; result = '同行评议通过。请整理答辩材料，第 8 学期起可申请毕业答辩。'; }
      else { s.thesis = 75; result = '盲审要求修改论证与材料。论文完成度回退至 75，下学期可再次送审。'; }
    }
    if (id === 'defense') { s.defense = true; s.career = true; result = '答辩与学位审核通过。博士阶段结束，现在选择下一段人生。'; }
    log(s, a.title, result, id === 'rest' ? 'life' : 'normal'); manuscript(s); checkHealth(s); return '';
  }
  const strategies = {
    honest: { name: '规范写作与适度润色', desc: '澄清表达、核对引注，不改变事实与贡献边界。', effects: { energy: -14 }, quality: 4 },
    hype: { name: '过度拔高研究贡献', desc: '短期提升稿件观感，增加被质疑及追责的风险。', effects: { energy: -8, ethics: -16, risk: 14 }, quality: 8 },
    padding: { name: '观点注水 / 恶意蹭热点', desc: '用未经论证的概括填充文章，留下质量与规范隐患。', effects: { energy: -6, ethics: -20, risk: 18 }, quality: 6 },
    fraud: { name: '伪造数据 / 编造论证', desc: '短期包装效果明显，调查成立后本局科研道路终止。', effects: { energy: -4, ethics: -38, risk: 38 }, quality: 17 }
  };
  function submit(s, id, tier, strategy) {
    if (!available(s)) return '请先完成当前事件';
    if (s.actions < 1) return '本回合行动已用完';
    const p = s.papers.find(p => p.id === id), st = strategies[strategy];
    if (!p || !['draft', 'rejected'].includes(p.status) || !st || !Number.isInteger(tier) || tier < 0 || tier > 2) return '当前稿件无法投稿';
    const lack = affordability(s, st.effects); if (lack) return lack;
    s.actions--; apply(s, st.effects); p.tier = p.kind === 'chapter' ? 1 : tier; p.strategy = strategy; p.evidenceRisk += Math.max(0, st.effects.risk || 0);
    p.quality = p.quality.map(q => clamp(q + st.quality, 0, 98));
    p.status = 'review'; p.due = s.tick + (p.kind === 'chapter' ? 2 : D.majors[s.major].review[tier]); p.rounds++;
    log(s, '稿件已送出', `《${p.title}》投往${venue(s,p)}。预计 ${p.due - s.tick} 个回合后收到意见。`, 'paper'); checkHealth(s); return '';
  }
  function revise(s, id) {
    if (!available(s) || s.actions < 1) return '需有剩余行动并先处理当前事件';
    const p = s.papers.find(p => p.id === id); if (!p || p.status !== 'revision') return '当前没有待返修的该稿件';
    const effects = { energy: -18, health: -3, knowledge: 4 }; const lack = affordability(s, effects); if (lack) return lack;
    s.actions--; apply(s, effects); p.quality = p.quality.map(q => clamp(q + 9, 0, 98)); p.status = 'review'; p.due = s.tick + 1; p.rounds++;
    log(s, '逐条回复审稿意见', `《${p.title}》已提交返修，下一回合等待复审。返修不保证录用，原有规范风险也不会被自动抹去。`, 'paper'); checkHealth(s); return '';
  }
  function pick(s, pool) {
    let candidates = pool.filter(e => !s.usedEvents.includes(e.id));
    if (!candidates.length) { s.usedEvents = s.usedEvents.filter(id => !pool.some(e => e.id === id)); candidates = pool; }
    const e = candidates[Math.floor(random(s) * candidates.length)]; s.usedEvents.push(e.id); return e.id;
  }
  function eventById(id) { return [...D.common, ...Object.values(D.special).flat()].find(e => e.id === id); }
  function next(s) {
    if (!available(s)) return '请先完成当前事件';
    s.pending = true;
    s.queue = [pick(s, D.common), pick(s, D.special[s.major])];
    return '';
  }
  function resolve(s, index) {
    if (!s.pending || !s.queue.length) return '没有待处理事件';
    const ev = eventById(s.queue[0]);
    if (index === -1) {
      apply(s, { health: -4, advisor: -4, progress: -1 });
      log(s, ev.title, '你暂不接受现有安排，选择延期协调：健康 -4、导师好感 -4、研究进度 -1。', 'event');
    } else {
      const c = ev.choices[index]; if (!c) return '未知选项'; const lack = affordability(s,c.effects); if (lack) return lack;
      apply(s,c.effects); log(s, ev.title, `${c.text}。${c.note}（${costs(c.effects)}）`, 'event');
    }
    s.queue.shift(); checkHealth(s); if (s.ending) recordRound(s); else if (!s.queue.length) finish(s); return '';
  }
  function reviews(s) {
    const m = D.majors[s.major];
    for (const p of s.papers.filter(p => p.status === 'review' && p.due <= s.tick)) {
      const avg = p.quality.reduce((a,b)=>a+b,0) / p.quality.length;
      const rate = clamp(.38 + (avg - 50) * .009 + [ -.13, 0, .16 ][p.tier] + (p.rounds > 1 ? .10 : 0), .16, .88);
      const r = random(s);
      const direction = m.group === '文科' && random(s) < (s.major === 'marx' ? .11 : .035);
      if (direction) { p.status = 'rejected'; p.feedback = '导向或选题适配问题退稿：请核对概念、表述与刊物范围。该结果仅为本局事件。'; }
      else if (r < rate) {
        p.status = 'accepted'; p.acceptedPhase = s.phase; p.feedback = '同行评议完成，稿件录用。';
        s.reputation = clamp(s.reputation + (3 - p.tier) * 6); apply(s, { advisor: 3, health: 3 });
      } else if (r < rate + .32) { p.status = 'revision'; p.feedback = `${m.rubric[p.rounds % m.rubric.length]}仍需补强，请逐条回应审稿意见。`; }
      else { p.status = 'rejected'; p.feedback = `${m.rubric[(p.rounds + 1) % m.rubric.length]}未达到本刊要求。可补足积累后重新投稿。`; }
      log(s, p.status === 'accepted' ? '收到录用通知' : p.status === 'revision' ? '收到返修意见' : '收到退稿意见', `《${p.title}》：${p.feedback}`, p.status === 'accepted' ? 'good' : 'paper');
    }
  }
  function finish(s) {
    manuscript(s);
    if (s.risk > 0 && random(s) < Math.min(.8, s.risk / 160)) {
      if (s.ethics < 45 || s.risk >= 60) { end(s, 'blacklist'); recordRound(s); return; }
      apply(s, { reputation: -12, advisor: -8, health: -7 });
      const questioned = s.papers.find(p => p.evidenceRisk > 0 && p.status !== 'withdrawn');
      if (questioned) { questioned.status = 'withdrawn'; questioned.feedback = '规范调查期间撤回，相关成果积分取消。'; }
      log(s, '学术规范质疑', '署名、引注或结论受到质疑，相关材料需要接受核查。问题记录将持续存在。', 'bad');
    }
    if (s.phase === 'faculty') {
      if (s.annual.teach) s.teachingYears++; else { apply(s,{ reputation: -6, advisor: -5, health: -3 }); log(s,'年度教学未达标','本年度没有完成基础教学，年度考核记一次缺项。','bad'); }
      if (s.year >= 2 && s.annual.supervise) s.studentYears++;
      log(s, '年度考核归档', `教学${s.annual.teach ? '达标' : '缺项'}；研究生指导${s.year < 2 ? '尚未安排' : s.annual.supervise ? '已完成' : '缺项'}。论文与项目按实际状态计入聘期。`);
    }
    apply(s, { health: s.major === 'math' && !s.papers.some(p => p.status === 'accepted') ? -5 : -2 });
    checkHealth(s); if (s.ending) { recordRound(s); return; }
    // The closing round delivers all manuscripts whose review interval has elapsed.
    s.tick++; reviews(s); manuscript(s);
    if (s.phase === 'faculty' && s.year === 6) { s.pending = false; s.career = true; log(s,'六年聘期结束','终期评审启动，可查看达标情况与可申请的岗位去向。','event'); recordRound(s); return; }
    if (s.phase === 'phd' && s.semester >= 12) { end(s, 'dropout'); recordRound(s); return; }
    recordRound(s);
    if (s.phase === 'faculty') s.year++; else s.semester++;
    if (s.phase === 'phd' && s.semester > 8) { apply(s, { health: -3, advisor: -2 }); log(s,'进入延期培养','本局最长允许培养至第 12 学期。毕业条件不变，时间与心理成本增加。','bad'); }
    s.actions = s.phase === 'faculty' ? 6 : 4;
    s.energy = Math.round(60 + s.health * .3); s.annual = {}; s.pending = false;
    log(s, '新的' + (s.phase === 'faculty' ? '年度' : '学期'), `可分配 ${s.actions} 次行动。科研精力恢复至 ${s.energy}；未完成稿件与经费结转。`);
    checkHealth(s);
    beginRound(s);
  }
  function careerOptions(s) {
    if (!s.career || s.ending) return [];
    if (s.phase === 'phd') return [
      { id: 'faculty', title: '进入高校 · 青椒六年', text: '接受本局高校的六年预聘合同，教学、指导学生与研究同时展开。', enabled: true },
      { id: 'postdoc', title: '国内博士后', text: '继续一段定期研究工作；Demo 在去向确定后收束。', enabled: true },
      { id: 'employed', title: '企业就业', text: '把研究方法转化为专业岗位能力；进入独立结局。', enabled: true },
      { id: 'civil', title: '体制内行政', text: '投入招录与岗位考核准备；本局积累 ≥60 且人际协调经验充足时可获录用。', enabled: s.knowledge >= 60 && s.eq >= 40 }
    ];
    const passed = requirements(s).every(r => r.value >= r.target) && s.ethics >= 60;
    return [
      { id: 'tenure', title: '申请长聘副教授', text: '全部聘期指标达标，且科研规范记录通过核查。', enabled: passed },
      { id: 'lecturer', title: '申请留校教学讲师', text: '本局有教学转聘名额：教学达标 ≥5 年，累计教学投入 ≥7，规范记录通过。', enabled: s.teachingYears >= 5 && s.teaching >= 7 && s.ethics >= 60 },
      { id: 'admin', title: '竞聘行政岗位', text: '本局有转岗名额：人际协调经验较好，导师 / 同行好感 ≥55。', enabled: s.eq >= 52 && s.advisor >= 55 && s.ethics >= 60 },
      { id: 'regional', title: '应聘地方本科高校', text: '聘期成果积分 ≥2，教学至少达标 3 年，规范记录通过。', enabled: points(s, true) >= 2 && s.teachingYears >= 3 && s.ethics >= 60 },
      { id: 'industry', title: '接受业界高薪岗位', text: '学术积累 ≥70、声望 ≥40，凭方法与项目经验通过面试。', enabled: s.knowledge >= 70 && s.reputation >= 40 && s.ethics >= 60 },
      { id: 'dismissed', title: '结束聘期，离开高校', text: '接受合同到期的结果，重新安排下一段职业生活。', enabled: true }
    ];
  }
  function chooseCareer(s, id) {
    const c = careerOptions(s).find(c=>c.id === id); if (!c || !c.enabled) return '尚未满足此去向的本局条件';
    if (id !== 'faculty') { end(s, id); return ''; }
    s.phase = 'faculty'; s.year = 1; s.tick++; s.career = false; s.facultyBase = s.grants; s.actions = 6; s.annual = {}; s.energy = 90;
    s.funds += s.major === 'ee' ? 38 : s.major === 'cs' ? 22 : 15; s.health = clamp(s.health + 10);
    log(s,'入职定岗 · 六年聘期开始','启动经费已拨入本局研究账户。博士阶段已录用论文不重复计入聘期；聘期内新录用成果按本局合同计入。每年别忘了教学与研究生指导。','good');
    beginRound(s);
    return '';
  }
  function withdraw(s) { if (!available(s) || s.phase !== 'phd') return '当前不能办理退学'; end(s,'dropout'); return ''; }
  const api = { make, act, submit, revise, next, resolve, points, requirements, actionList, costs, time, affordability, strategies, careerOptions, chooseCareer, eventById, withdraw, targetKnowledge, topic, venue, focusOptions, setFocus, recommendation, previewPlan, executePlan, opportunities, pursueOpportunity, migrate };
  if (typeof module !== 'undefined') module.exports = api; else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
