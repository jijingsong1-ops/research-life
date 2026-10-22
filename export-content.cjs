const fs = require('node:fs');
const path = require('node:path');
const D = require('./data.js');
const G = require('./engine.js');
const parts = ['# 科研人生 · v0.3 游戏文案与事件库', '', '六专业全部启用；国内博士培养与高校青年教师背景。文案是模拟叙事，数值与院校合同为游戏设定，详细机制见 README.md。', '', `内容规模：${D.common.length + Object.values(D.special).flat().length} 条随机事件、${D.opportunities.length} 项主动机会、11 个当前结局（另含 1 个旧版兼容结局）。随机事件与主动机会各有两个取舍选项。`, '', '## 一、专业介绍与研究方向'];
for (const [id,m] of Object.entries(D.majors)) {
  parts.push('', `### ${m.name}｜${m.tag}`, '', m.desc, '', `- 学科归属：${m.group}`, `- 研究核心：${m.focus}`, `- 典型痛点：${m.pain}`, `- 典型产出周期：${m.cycle}；不是现实产出保证。`, `- 投稿层次：${m.tiers.join(' / ')}`, `- 审稿维度：${m.rubric.join('、')}`, `- 研究工作量：${m.work}；最短积累：${m.minAge} 回合。`, `- 可选方向：${m.topic.join('；')}`, `- 起始研究额度：${m.startFunds} 万；单次研究耗精力 ${m.energy}、经费 ${m.cost} 万、健康 ${m.health}。`, '', `**氛围文案：** ${m.flavor}`, '', `**博士里程碑：** ${G.requirements(G.make(id,1)).map(r=>`${r.label} ${r.target}`).join('；')}；第 8 学期起答辩。`);
}
parts.push('', '## 二、公共事件与专业事件', '', '设计字段说明：科研精力、学术积累、导师好感、身心健康、学术声望为 0–100；经费以万元计。道德、人际与追责风险为隐藏系统，下列完整数值供策划使用，玩家界面不直接显示。每个选项必须承担即时资源、时间、关系或长期风险成本。');
for (const [group,events] of [['全专业公共事件',D.common],...Object.entries(D.special).map(([id,es])=>[D.majors[id].name+'专属事件',es])]) {
  parts.push('', `### ${group}`);
  for (const e of events) {
    parts.push('', `#### ${e.id}｜${e.type}｜${e.title}`, '', e.text, '', `**延期规则：** ${G.deferral(e.id).label}；${G.deferral(e.id).note}（${G.costs(G.deferral(e.id).effects)}）。`);
    e.choices.forEach((c,i)=>parts.push('', `**${String.fromCharCode(65+i)}. ${c.text}**`, '', `- 数值：${G.costs(c.effects,true)}`, `- 后续叙事：${c.note}`));
  }
}
parts.push('', '## 三、可主动参加的机会', '', '每回合展示最多三项适用机会，包含当前专业与公共内容；每回合最多参与一项，消耗一次行动并承担所选分支的资源成本。机会可以跳过，不增加强制弹窗。专业训练次数仍须通过对应研究行动完成，机会提供的进度不能替代训练。');
for (const op of D.opportunities) {
  const audience = op.major === 'all' ? '全专业' : D.majors[op.major].name;
  const phase = op.phase === 'all' ? '博士与青椒' : op.phase === 'phd' ? '博士阶段' : '青椒阶段';
  parts.push('', `### ${op.id}｜${op.tag}｜${op.title}`, '', `适用：${audience}；${phase}${op.minTerm ? `；第 ${op.minTerm} 回合起` : ''}${op.requiresProposal ? '；需通过开题' : ''}。`, '', op.desc);
  op.choices.forEach((c,i)=>parts.push('',`**${String.fromCharCode(65+i)}. ${c.text}**`,'',`- 消耗：1 次行动；${G.costs(c.effects,true)}`,`- 后续叙事：${c.note}`));
}
parts.push('', '## 四、多结局文案', '', '高校六年聘期有六种主要去向；博士毕业的博后、企业与行政分支在去向确定后结束本 Demo；另有退学 / 培养届满与健康暂停结局；学术不端结局仅用于兼容旧存档，新版本不会触发。');
for (const [id,[title,body]] of Object.entries(D.endings)) parts.push('',`### ${title}（${id}）`,'',body);
parts.push('', '## 五、剧情回合模板', '', '1. 开始回合：显示学期 / 年度、六维属性、培养目标与当前最值得处理的事项。尚未行动时可选择稳步、冲刺或恢复节奏。', '2. 安排行动：把研读、研究、写作、交流、休息等加入计划，预览已知资源变化，再一次执行；也可以只安排一项。', '3. 主动机会：从本回合开放的机会中挑选一项参与，或把行动全部留给主线。', '4. 稿件成熟：工作量与周期同时满足后生成成稿；玩家主动选择投稿层次和表达策略。', '5. 结束回合：依次抽取并解决一条公共事件、一条当前专业事件。持续性问题可进入下期待办，限时窗口错过后失效；跨期跟进消耗 1 次行动。', '6. 结算与回顾：检查规范风险、年度教学与指导、健康消耗，并推进外审；回顾本回合资源变化、成果与关键消息。', '7. 更新回合：行动次数更新；精力在原值上恢复，六项状态、成果、稿件、遗留事项与手记持续保留。', '8. 节点处理：达到博士答辩条件时进入择业；六年聘期结束时显示终期评审去向。', '', '所有细化公式、毕业与聘期门槛、当前版本范围及现实政策出处，详见同目录 README.md。', '');
fs.writeFileSync(path.join(__dirname,'游戏文案与事件库.md'), parts.join('\n'), 'utf8');
fs.writeFileSync(path.join(__dirname,'游戏内容.json'), JSON.stringify(D,null,2)+'\n', 'utf8');
console.log('已导出：游戏文案与事件库.md、游戏内容.json');
