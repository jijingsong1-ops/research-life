const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');
const D = require('./data.js');

function resolveAll(s) {
  for (let n=0;s.pending && !s.ending && n<4;n++) {
    const ev=G.eventById(s.queue[0]);
    const affordable=ev.choices.map((c,i)=>({c,i})).filter(({c})=>!G.affordability(s,c.effects));
    affordable.push({ i: -1, c: { effects: G.deferral(ev.id).effects } });
    affordable.sort((a,b)=>choiceScore(b.c,s)-choiceScore(a.c,s));
    assert.equal(G.resolve(s,affordable.length?affordable[0].i:-1),'');
  }
}
function choiceScore(c,s) {
  const e=c.effects;
  return (e.health||0)*(s.health<50?3:1)+(e.ethics||0)*2-(e.risk||0)*2+(e.knowledge||0)*.7+(e.progress||0)*2+(e.funds||0)*.5+(e.eq||0)*.5+(e.energy||0)*.15;
}
function finishRound(s){assert.equal(G.next(s),'');resolveAll(s);}
test('six distinct disciplines and 56 valid events with actual tradeoffs',()=>{
  assert.equal(Object.keys(D.majors).length,6);
  const events=[...D.common,...Object.values(D.special).flat()];
  assert.equal(events.length,56);assert.equal(new Set(events.map(e=>e.id)).size,56);
  for(const e of events) for(const c of e.choices) assert.ok(Object.values(c.effects).some(v=>v<0),`${e.id} has no cost`);
  for(const id of ['lit','marx','news']) for(const e of D.special[id]) assert.ok(!/算力|服务器|仪器|流片/.test(JSON.stringify(e)));
});
test('actions consume finite budget, reject unaffordable work without mutation',()=>{
  const s=G.make('cs',1);const before=JSON.stringify(s);s.energy=0;
  const depleted=JSON.stringify(s);assert.ok(G.act(s,'research'));assert.equal(JSON.stringify(s),depleted);
  assert.equal(G.act(s,'rest'),'');assert.equal(s.actions,3);assert.ok(s.energy>0);
  for(let i=0;i<3;i++)assert.equal(G.act(s,'rest'),'');const after=JSON.stringify(s);
  assert.ok(G.act(s,'read'));assert.equal(JSON.stringify(s),after);assert.notEqual(before,after);
});
test('mathematics manuscripts require time as well as accumulated work',()=>{
  const s=G.make('math',10);s.project.progress=7;s.tick=1;
  G.act(s,'read');assert.equal(s.papers.length,0);
  s.tick=3;G.act(s,'read');assert.equal(s.papers.length,1);assert.equal(s.papers[0].status,'draft');
});
test('every round queues one common and one matching discipline event',()=>{
  for(const id of Object.keys(D.majors)){
    const s=G.make(id,11);G.next(s);assert.equal(s.queue.length,2);
    assert.ok(D.common.some(e=>e.id===s.queue[0]));assert.ok(D.special[id].some(e=>e.id===s.queue[1]));
    assert.ok(G.act(s,'rest'));resolveAll(s);assert.equal(s.pending,false);assert.equal(s.semester,2);
  }
});
test('empty resources cannot deadlock events',()=>{
  const s=G.make('ee',2);G.next(s);s.energy=0;s.funds=0;
  const ev=G.eventById(s.queue[0]); const index=ev.choices.findIndex(c=>!G.affordability(s,c.effects));
  assert.equal(G.resolve(s,index<0?-1:index),'');resolveAll(s);assert.ok(!s.pending);
});
test('unaffordable event choice is atomic',()=>{
  const s=G.make('ee',2);s.pending=true;s.queue=['ee2'];s.funds=0;
  const before=JSON.stringify(s);assert.ok(G.resolve(s,0));assert.equal(JSON.stringify(s),before);
});
test('submission, revision, acceptance and journal-specific scoring',()=>{
  const s=G.make('lit',5);s.project.progress=5;s.tick=3;G.act(s,'read');
  assert.equal(G.submit(s,1,0,'honest'),'');assert.equal(s.papers[0].due,5);
  const p=s.papers[0];p.status='revision';assert.equal(G.revise(s,1),'');assert.equal(p.due,4);
  p.status='accepted';p.acceptedPhase='phd';assert.equal(G.points(s),3);assert.equal(G.points(s,true),0);
  p.status='withdrawn';assert.equal(G.points(s),0);
});
test('differential graduation requirements and proposal / blind review gates',()=>{
  const labels=new Set();
  for(const id of Object.keys(D.majors)){
    const s=G.make(id,1);assert.ok(G.act(s,'proposal'));s.semester=3;s.knowledge=50;
    assert.equal(G.act(s,'proposal'),'');assert.ok(s.proposal);assert.ok(G.act(s,'blind'));
    labels.add(G.requirements(s)[2].label);
  }
  assert.equal(labels.size,6);
});
test('annual grant attempts cannot be spammed',()=>{
  const s=G.make('marx',9);assert.equal(G.act(s,'grant'),'');assert.ok(G.act(s,'grant'));
  finishRound(s);assert.equal(G.act(s,'grant'),'');
});
test('funds are nonnegative and health exhaustion ends the run',()=>{
  const s=G.make('ee',4);s.health=1;assert.equal(G.act(s,'research'),'');assert.equal(s.ending,'health');
  assert.ok(G.act(s,'rest'));assert.ok(s.funds>=0);
});
test('misconduct causes recoverable work rather than ending the career',()=>{
  const s=G.make('cs',2000);s.risk=100;s.ethics=0;s.health=100;s.reputation=50;
  s.papers.push({id:1,title:'test',status:'accepted',quality:[90,90,90,90,90],tier:0,acceptedPhase:'phd',evidenceRisk:38});
  s.pending=true;s.queue=['c4'];assert.equal(G.resolve(s,0),'');
  assert.equal(s.ending,null);assert.equal(s.semester,2);assert.equal(s.papers[0].status,'withdrawn');assert.equal(G.points(s),0);
  assert.equal(s.reputation,42);assert.ok(s.risk<100);
  const risk=s.risk, actions=s.actions;assert.equal(G.act(s,'integrity'),'');
  assert.ok(s.risk<risk);assert.equal(s.actions,actions-1);assert.equal(s.papers[0].status,'draft');
  assert.equal(G.submit(s,1,1,'honest'),'');assert.equal(s.papers[0].status,'review');
});
test('career transition starts six years and preserves pending manuscripts',()=>{
  const s=G.make('cs',6);s.career=true;s.defense=true;s.grants=2;s.papers.push({id:1,title:'pending',status:'review',quality:[80,80,80,80,80],due:99,rounds:1,tier:1});
  assert.equal(G.chooseCareer(s,'faculty'),'');assert.equal(s.actions,6);assert.equal(s.facultyBase,2);assert.equal(s.phase,'faculty');assert.equal(s.papers.length,1);
});
test('six faculty rounds end at final review and no later',()=>{
  const s=G.make('cs',8);s.career=true;G.chooseCareer(s,'faculty');
  for(let y=1;y<=6;y++){assert.equal(s.year,y);s.health=100;s.energy=100;G.act(s,'teach');if(y>1)G.act(s,'supervise');finishRound(s);}
  assert.ok(s.career);assert.equal(s.year,6);assert.equal(s.teachingYears,6);assert.equal(s.studentYears,5);
  assert.equal(G.chooseCareer(s,'dismissed'),'');assert.equal(s.ending,'dismissed');
});
test('tenure checks public performance without a hidden ethics veto',()=>{
  const s=G.make('cs',7);s.phase='faculty';s.career=true;s.year=6;s.grants=1;s.teachingYears=5;s.studentYears=3;s.reputation=40;
  s.papers=[1,2].map(id=>({id,status:'accepted',tier:0,acceptedPhase:'faculty'}));
  assert.ok(G.careerOptions(s).find(c=>c.id==='tenure').enabled);
  s.teachingYears=4;assert.ok(!G.careerOptions(s).find(c=>c.id==='tenure').enabled);
  s.teachingYears=5;s.ethics=20;assert.ok(G.careerOptions(s).find(c=>c.id==='tenure').enabled);
});
test('each advertised career ending can be selected when conditions match',()=>{
  for(const id of ['tenure','lecturer','admin','regional','industry','dismissed']){
    const s=G.make('cs',6);Object.assign(s,{phase:'faculty',career:true,year:6,grants:3,teachingYears:6,teaching:8,studentYears:5,reputation:80,knowledge:90,eq:80,advisor:80});
    s.papers=[1,2,3].map(id=>({id,status:'accepted',tier:0,acceptedPhase:'faculty'}));
    assert.equal(G.chooseCareer(s,id),'');assert.equal(s.ending,id);
  }
  for(const id of ['postdoc','employed','civil']){const s=G.make('lit',1);s.career=true;s.knowledge=80;assert.equal(G.chooseCareer(s,id),'');assert.equal(s.ending,id);}
});
test('delayed graduation has a hard twelve-semester limit',()=>{
  const s=G.make('lit',5);s.semester=8;finishRound(s);assert.equal(s.semester,9);assert.equal(s.ending,null);
  s.semester=12;finishRound(s);assert.equal(s.ending,'dropout');
});
test('save serialization preserves deterministic future events',()=>{
  const a=G.make('news',123);G.act(a,'read');const b=JSON.parse(JSON.stringify(a));
  G.next(a);G.next(b);assert.deepEqual(a,b);resolveAll(a);resolveAll(b);assert.deepEqual(a,b);
});
test('initial direction changes the active project and survives serialization',()=>{
  const s=G.make('math',1,2);assert.equal(G.topic(s),D.majors.math.topic[2]);
  assert.equal(G.topic(JSON.parse(JSON.stringify(s))),D.majors.math.topic[2]);
});
test('applied and research grants share one annual application slot',()=>{
  const s=G.make('news',5);s.career=true;G.chooseCareer(s,'faculty');s.reputation=50;
  assert.equal(G.act(s,'applied'),'');assert.ok(G.act(s,'grant'));assert.ok(G.act(s,'applied'));
});
test('literature chapters require three paid actions and use book review labels',()=>{
  const s=G.make('lit',1);s.career=true;G.chooseCareer(s,'faculty');
  for(let i=0;i<3;i++)assert.equal(G.act(s,'chapter'),'');
  const p=s.papers.find(p=>p.kind==='chapter');assert.ok(p);assert.equal(p.due,s.tick+2);
  assert.equal(G.venue(s,p),'学术专著章节 / 古籍整理成果');assert.equal(p.tier,1);
  p.status='rejected';assert.equal(G.submit(s,p.id,0,'honest'),'');assert.equal(p.tier,1);assert.equal(p.due,s.tick+2);
});
test('active doctorate withdrawal is an explicit terminal action',()=>{
  const s=G.make('cs',1);assert.equal(G.withdraw(s),'');assert.equal(s.ending,'dropout');assert.ok(G.act(s,'read'));
});
test('focus has real tradeoffs, no instant reward and locks after an action',()=>{
  const s=G.make('cs',32);const health=s.health, energy=s.energy;
  assert.equal(G.setFocus(s,'sprint'),'');assert.equal(s.health,health);assert.equal(s.energy,energy);
  const research=G.actionList(s).find(a=>a.id==='research');
  assert.equal(research.effects.progress,2);assert.equal(research.effects.energy,-28);assert.equal(research.effects.health,-8);
  assert.equal(G.setFocus(s,'recover'),'');assert.equal(s.health,health);
  const recovery=G.actionList(s);assert.equal(recovery.find(a=>a.id==='rest').effects.health,21);assert.equal(recovery.find(a=>a.id==='read').effects.knowledge,7);
  s.knowledge=70;assert.equal(G.actionList(s).find(a=>a.id==='research').effects.progress,1);
  assert.equal(G.act(s,'read'),'');const before=JSON.stringify(s);assert.ok(G.setFocus(s,'balanced'));assert.equal(JSON.stringify(s),before);
  finishRound(s);assert.equal(G.setFocus(s,'balanced'),'');
});
test('plan preview is read-only, conservative and does not reveal hidden or random gains',()=>{
  const s=G.make('marx',42);const before=JSON.stringify(s);
  const preview=G.previewPlan(s,['grant','read']);
  assert.ok(preview.ok);assert.equal(JSON.stringify(s),before);assert.equal(preview.effects.energy,-29);
  assert.equal(preview.effects.funds,undefined);assert.equal(preview.effects.reputation,undefined);
  assert.ok(!('ethics' in preview.effects));assert.ok(!('risk' in preview.effects));assert.ok(!('eq' in preview.effects));
  s.funds=0;assert.ok(!G.previewPlan(s,['grant','research']).ok); // An uncertain grant cannot be prepaid.
});
test('plans are atomic, consume the same budget and preserve seeded outcomes',()=>{
  const s=G.make('cs',71), direct=JSON.parse(JSON.stringify(s));
  const before=JSON.stringify(s);assert.ok(G.executePlan(s,['read','not-an-action']));assert.equal(JSON.stringify(s),before);
  assert.ok(G.executePlan(s,['read','read','read','read','read']));assert.equal(JSON.stringify(s),before);
  const ids=['read','research','rest','grant'];for(const id of ids)assert.equal(G.act(direct,id),'');
  assert.equal(G.executePlan(s,ids),'');assert.deepEqual(s,direct);assert.equal(s.actions,0);
  G.next(s);const pending=JSON.stringify(s);assert.ok(G.executePlan(s,['rest']));assert.equal(JSON.stringify(s),pending);
});
test('plans permit prerequisites in sequence and keep uncertain reviews last',()=>{
  const s=G.make('lit',90);s.semester=3;s.knowledge=50;
  assert.ok(G.previewPlan(s,['proposal','thesis','rest']).ok);assert.equal(s.proposal,false);
  assert.equal(G.executePlan(s,['proposal','thesis','rest']),'');assert.equal(s.proposal,true);assert.equal(s.thesis,25);
  const later=G.make('lit',2);later.semester=8;later.knowledge=90;later.proposal=true;later.thesis=100;later.researchRuns=4;
  later.papers=[{id:1,status:'accepted',tier:1,acceptedPhase:'phd'}];
  const before=JSON.stringify(later);assert.ok(!G.previewPlan(later,['blind','defense']).ok);assert.equal(JSON.stringify(later),before);
});
test('recommendations prioritize actionable milestones, health and pending manuscripts',()=>{
  const s=G.make('cs',1);assert.equal(G.recommendation(s).id,'read');
  s.health=30;assert.equal(G.recommendation(s).id,'rest');s.health=80;
  s.papers=[{id:1,status:'revision'}];assert.equal(G.recommendation(s).id,'revise');assert.equal(G.recommendation(s).paperId,1);
  s.papers[0].status='draft';assert.equal(G.recommendation(s).id,'submit');
  s.semester=3;s.knowledge=45;assert.equal(G.recommendation(s).id,'proposal');
  s.career=true;assert.equal(G.recommendation(s).id,'career');
  G.chooseCareer(s,'faculty');assert.equal(G.recommendation(s).id,'teach');
});
test('opportunities are stable, filtered and cost one limited action',()=>{
  assert.equal(D.opportunities.length,12);
  for(const m of Object.keys(D.majors)){
    const s=G.make(m,31),before=JSON.stringify(s),pool=G.opportunities(s);
    assert.ok(pool.length>0&&pool.length<=3);assert.ok(pool.some(o=>o.major===m));assert.deepEqual(pool,G.opportunities(s));assert.equal(JSON.stringify(s),before);
    assert.ok(pool.every(o=>o.major==='all'||o.major===m));
    const opportunity=pool.find(o=>o.choices.some(c=>!G.affordability(s,c.effects)));
    const index=opportunity.choices.findIndex(c=>!G.affordability(s,c.effects));
    assert.equal(G.pursueOpportunity(s,opportunity.id,index),'');assert.equal(s.actions,3);assert.equal(s.opportunityHistory.length,1);
    const after=JSON.stringify(s);assert.ok(G.pursueOpportunity(s,opportunity.id,index));assert.equal(JSON.stringify(s),after);
    assert.ok(G.setFocus(s,'sprint'));finishRound(s);assert.ok(!s.annual.opportunity);
  }
});
test('opportunity costs cannot overdraft and thesis workshops respect prerequisites',()=>{
  const s=G.make('lit',31);s.semester=3;s.tick=3;s.energy=0;s.funds=0;
  assert.ok(!G.opportunities(s).some(o=>o.requiresProposal));
  const opportunity=G.opportunities(s).find(o=>o.choices.some(c=>G.affordability(s,c.effects)));
  const index=opportunity.choices.findIndex(c=>G.affordability(s,c.effects));
  const before=JSON.stringify(s);assert.ok(G.pursueOpportunity(s,opportunity.id,index));assert.equal(JSON.stringify(s),before);
});
test('ethical postponement remains possible when only misconduct is affordable',()=>{
  const s=G.make('cs',2);s.pending=true;s.queue=['c4'];s.energy=0;const ethics=s.ethics;
  assert.equal(G.resolve(s,-1),'');assert.equal(s.ethics,ethics);assert.equal(s.risk,0);assert.equal(s.advisor,54);
  assert.equal(s.backlog[0].id,'c4');assert.ok(s.logs.some(l=>l.text.includes('留到下期')));
});
test('round summaries include whole-round changes and survive reload',()=>{
  const s=G.make('cs',8);G.act(s,'read');G.act(s,'research');finishRound(s);
  assert.equal(s.lastRound.time,'博士 · 第1年上学期');assert.equal(s.lastRound.before.knowledge,28);
  assert.ok(s.lastRound.after.knowledge>28);assert.equal(s.semester,2);assert.ok(s.lastRound.highlights.length>0);
  assert.ok(!('ethics' in s.lastRound.before));assert.ok(!('eq' in s.lastRound.after));
  assert.deepEqual(JSON.parse(JSON.stringify(s)).lastRound,s.lastRound);
  assert.equal(s.roundStart.energy,s.energy);assert.equal(s.roundTime,'博士 · 第1年下学期');
});
test('legacy save migration fills new fields without changing existing progress',()=>{
  const s=G.make('news',27);G.act(s,'read');
  for(const key of ['focus','lastRound','opportunityHistory','roundStart','roundTime','roundLogStart','backlog'])delete s[key];
  const old=JSON.parse(JSON.stringify(s));assert.equal(G.migrate(s),s);
  for(const [key,value]of Object.entries(old))assert.deepEqual(s[key],value);
  assert.equal(s.focus,'balanced');assert.deepEqual(s.opportunityHistory,[]);assert.equal(s.lastRound,null);
  assert.deepEqual(s.backlog,[]);
  assert.ok(G.setFocus(s,'sprint'));const once=JSON.stringify(s);G.migrate(s);assert.equal(JSON.stringify(s),once);
});

test('energy and other attributes retain their history across semesters',()=>{
  const low=G.make('cs',1),high=G.make('cs',1);low.energy=20;high.energy=40;
  for(const s of [low,high]){s.pending=true;s.queue=['c4'];assert.equal(G.resolve(s,0),'');}
  assert.equal(high.energy-low.energy,20);assert.equal(low.energy,54);
  for(const k of ['knowledge','reputation','funds'])assert.equal(low[k],G.make('cs',1)[k]);
  assert.equal(low.health,78);assert.equal(low.lastRound.after.energy,14);assert.equal(low.roundStart.energy,54);
});
test('withdrawn manuscripts remain repairable after personal risk has faded',()=>{
  const s=G.make('lit',3);s.risk=0;s.ethics=100;
  s.papers=[{id:1,status:'accepted',evidenceRisk:5,quality:[80,80,80,80,80]},{id:2,status:'withdrawn',evidenceRisk:0,quality:[80,80,80,80,80]}];
  assert.equal(G.act(s,'integrity'),'');assert.equal(s.papers[1].status,'draft');assert.equal(s.papers[0].status,'accepted');
});
test('deferred problems survive reload and are resolved with an action next term',()=>{
  const s=G.make('lit',1);s.pending=true;s.queue=['c6'];assert.equal(G.resolve(s,-1),'');
  const loaded=JSON.parse(JSON.stringify(s));assert.equal(loaded.backlog[0].from,'博士 · 第1年上学期');assert.equal(loaded.semester,2);
  const energy=loaded.energy,funds=loaded.funds,actions=loaded.actions;
  assert.equal(G.resolveBacklog(loaded,'c6',0),'');assert.equal(loaded.backlog.length,0);
  assert.equal(loaded.actions,actions-1);assert.equal(loaded.energy,energy-9);assert.equal(loaded.funds,funds+1);
  const done=JSON.stringify(loaded);assert.ok(G.resolveBacklog(loaded,'c6',0));assert.equal(JSON.stringify(loaded),done);
});
test('deadline opportunities expire instead of remaining available next semester',()=>{
  const s=G.make('cs',1);s.pending=true;s.queue=['cs6'];assert.equal(G.resolve(s,-1),'');
  assert.equal(s.backlog.length,0);assert.equal(s.semester,2);assert.ok(s.logs.some(l=>l.text.includes('错过后不会保留')));
});
test('open issues are not redrawn, remain optional, and cannot alter a later project',()=>{
  const s=G.make('cs',1);s.pending=true;s.queue=['cs5'];G.resolve(s,-1);
  G.next(s);assert.ok(!s.queue.includes('cs5'));resolveAll(s);
  assert.ok(s.backlog.some(b=>b.id==='cs5'));assert.ok(s.logs.some(l=>l.title==='遗留事项仍待跟进'));
  s.project.number++;s.project.progress=2;const before=s.project.progress;
  assert.equal(G.resolveBacklog(s,'cs5',1),'');assert.equal(s.project.progress,before);
});
test('unaffordable followups are atomic and can be closed without energy',()=>{
  const s=G.make('ee',1);s.pending=true;s.queue=['ee2'];G.resolve(s,-1);s.funds=0;s.energy=0;
  const before=JSON.stringify(s);assert.ok(G.resolveBacklog(s,'ee2',0));assert.equal(JSON.stringify(s),before);
  const actions=s.actions;assert.equal(G.resolveBacklog(s,'ee2',-1),'');assert.equal(s.actions,actions-1);assert.equal(s.backlog.length,0);
});
test('doctoral state and unfinished problems carry into all six faculty years',()=>{
  const s=G.make('lit',3);s.pending=true;s.queue=['c6'];G.resolve(s,-1);
  Object.assign(s,{career:true,defense:true,energy:12,health:48});const old=JSON.parse(JSON.stringify(s));
  assert.equal(G.chooseCareer(s,'faculty'),'');assert.equal(s.energy,32);assert.equal(s.health,58);
  for(const k of ['knowledge','reputation','advisor','ethics','risk'])assert.equal(s[k],old[k]);
  assert.deepEqual(s.backlog,old.backlog);
  assert.equal(G.resolveBacklog(s,'c6',0),'');
  for(let y=1;y<=6;y++){assert.equal(s.year,y);while(s.actions)assert.equal(G.act(s,'rest'),'');finishRound(s);}
  assert.equal(s.year,6);assert.ok(s.career);assert.equal(s.ending,null);
});

// A strategy player uses only public game actions; no fabricated progress or boosted resources.
function autoPlay(major,seed,focus='balanced') {
  const s=G.make(major,seed);
  assert.equal(G.setFocus(s,focus),'');
  for(let guard=0;guard<180&&!s.ending;guard++) {
    if(s.career){G.chooseCareer(s,s.phase==='phd'?'faculty':G.careerOptions(s).find(c=>c.enabled).id);continue;}
    if(!s.actions){finishRound(s);continue;}
    const valid=G.actionList(s).filter(a=>!a.disabled&&!G.affordability(s,a.effects));
    const can=id=>valid.some(a=>a.id===id);
    const finish=id=>{assert.equal(G.act(s,id),'');};
    if(s.health<43||s.energy<23){finish('rest');continue;}
    if(s.phase==='phd'&&can('defense')){finish('defense');continue;}
    if(s.phase==='phd'&&can('blind')){finish('blind');continue;}
    if(s.phase==='phd'&&can('proposal')){finish('proposal');continue;}
    if(s.phase==='faculty'&&!s.annual.teach&&can('teach')){finish('teach');continue;}
    if(s.phase==='faculty'&&s.year>=2&&!s.annual.supervise&&can('supervise')){finish('supervise');continue;}
    if(s.phase==='phd'&&s.knowledge<G.targetKnowledge(s)){finish('read');continue;}
    if(can('grant')&&(s.funds<D.majors[major].cost*3||major==='marx'&&s.grants===0||s.phase==='faculty'&&s.grants===s.facultyBase)){finish('grant');continue;}
    const revision=s.papers.find(p=>p.status==='revision');
    if(revision&&s.energy>=18){assert.equal(G.revise(s,revision.id),'');continue;}
    const draft=s.papers.find(p=>['draft','rejected'].includes(p.status));
    if(draft&&s.energy>=14){assert.equal(G.submit(s,draft.id,1,'honest'),'');continue;}
    if(s.phase==='phd'&&can('thesis')&&s.semester>=4){finish('thesis');continue;}
    if(can('research')){finish('research');continue;}
    if(s.energy<60||s.health<85){finish('rest');continue;}
    if(can('mentor')){finish('mentor');continue;}
    finish('read');
  }
  return s;
}
test('all six disciplines can naturally graduate and complete the faculty stage',()=>{
  for(const major of Object.keys(D.majors)){
    const runs=Array.from({length:12},(_,i)=>autoPlay(major,1200+i));
    const graduated=runs.filter(s=>s.defense),facultyCompleted=runs.filter(s=>s.phase==='faculty'&&s.ending);
    console.log(`${D.majors[major].name}: ${graduated.length}/12 graduated, ${facultyCompleted.length}/12 faculty endings; ${runs.map(s=>s.ending).join(', ')}`);
    assert.ok(graduated.length>0,`${major} cannot graduate with a reasonable strategy`);
    assert.ok(facultyCompleted.length>0,`${major} cannot finish faculty stage`);
    for(const s of runs) for(const k of ['energy','health','funds','knowledge','reputation'])assert.ok(Number.isFinite(s[k])&&s[k]>=0,`${major} invalid ${k}`);
  }
});
test('each new focus preserves a viable full career path for every discipline',()=>{
  for(const focus of ['sprint','recover'])for(const major of Object.keys(D.majors)){
    const runs=Array.from({length:4},(_,i)=>autoPlay(major,2300+i,focus));
    assert.ok(runs.some(s=>s.defense&&s.phase==='faculty'&&s.ending),`${focus}/${major} has no completed full-career path`);
    for(const s of runs)assert.ok(s.ending,`${focus}/${major} stalled before an ending`);
  }
});
