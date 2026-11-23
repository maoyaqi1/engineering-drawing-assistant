// 三项育人能力的静态内容配置。
//
// 三个页面使用同一 WXML 模板和样式，只通过本文件提供各自文案和视觉语义。
const abilityPages = {
  thinking: {
    key: 'thinking',
    navigationTitle: '动脑思考',
    eyebrow: '育人理念 · 空间思维',
    title: '动脑思考',
    subtitle: '从平面图形认识空间世界',
    heroGlyph: '△',
    themeClass: 'ability-thinking',
    introduction: [
      '工程制图学习不仅仅是识读和绘制图形，更重要的是建立空间与平面之间的联系。',
      '面对一个空间几何问题，我们需要学会观察几何元素之间的位置关系，分析空间结构，理解空间形体与投影图之间的对应关系，并通过逻辑推理得出正确结论。'
    ],
    abilities: [
      {
        index: '01',
        mark: '空',
        title: '空间思维能力',
        description: '能够从二维投影图理解三维空间形体，也能够从空间形体判断其投影特征。'
      },
      {
        index: '02',
        mark: '析',
        title: '几何分析能力',
        description: '能够分析点、直线、平面之间的位置关系，判断几何元素的空间性质，理解不同投影之间的联系。'
      },
      {
        index: '03',
        mark: '推',
        title: '逻辑推理能力',
        description: '能够依据投影规律和几何原理，分析问题、推导结果，而不是单纯依赖记忆和经验。'
      }
    ],
    prompt: {
      title: '学习时，不妨多想一想',
      items: [
        '这个点在空间中的位置在哪里？',
        '这条直线与投影面有什么关系？',
        '图形发生变化时，空间中的几何关系是否发生了变化？'
      ],
      closing: '学会观察空间、分析关系、推导结论，让思考成为学习的起点。'
    },
    practice: {
      label: '课堂学习约定',
      title: '把思考落实到准确图面',
      rule: '每节课请带齐铅笔、直尺、圆规和橡皮。',
      items: [
        '先用铅笔轻画空间关系和投影，不要只在脑中判断。',
        '再用尺规核对长对正、高平齐、宽相等，避免凭眼睛估计。',
        '完成判断前回看图面：交点、线型和空间关系是否一致。'
      ],
      closing: '想法只有落到准确图面上，才能被发现、检验和修正。'
    }
  },
  exploring: {
    key: 'exploring',
    navigationTitle: '动手探索',
    eyebrow: '育人理念 · 实践验证',
    title: '动手探索',
    subtitle: '在操作中发现几何规律',
    heroGlyph: '◇',
    themeClass: 'ability-exploring',
    introduction: [
      '画法几何中的许多知识，仅仅通过阅读教材和观看图形，很难真正理解。',
      '通过主动操作几何元素，观察形体变化和投影变化，在不断尝试、比较和验证中，可以逐步建立对空间几何规律的认识。'
    ],
    abilities: [
      {
        index: '01',
        mark: '探',
        title: '主动探究能力',
        description: '主动改变点、直线、平面和立体的位置，观察几何关系的变化，发现其中的规律。'
      },
      {
        index: '02',
        mark: '比',
        title: '观察比较能力',
        description: '比较不同位置、不同状态下的投影结果，寻找共同点与差异，理解几何变化的本质。'
      },
      {
        index: '03',
        mark: '验',
        title: '实践验证能力',
        description: '将自己的判断转化为具体操作，通过观察结果验证推理是否正确，在发现问题的过程中修正认识。'
      }
    ],
    prompt: {
      title: '不要急于寻找答案',
      items: [
        '先自己动手试一试，观察发生了什么，再想一想为什么会这样。'
      ],
      closing: '在操作中发现问题，在比较中理解规律，在验证中深化认识。'
    },
    practice: {
      label: '课堂学习约定',
      title: '先动手，再用尺规验证',
      rule: '每节课请带齐铅笔、直尺、圆规和橡皮。',
      items: [
        '改变位置前，用铅笔轻画基准线、辅助线和投影。',
        '比较不同状态时保留轻线痕迹，确认变化后再加深结论。',
        '用直尺和圆规复核距离、垂直、平行和交点，不只依赖屏幕结果。'
      ],
      closing: '草稿线可以轻，作图结果必须准；探索过程要留下可检查的证据。'
    }
  },
  tools: {
    key: 'tools',
    navigationTitle: '善用工具',
    eyebrow: '育人理念 · 工程表达',
    title: '善用工具',
    subtitle: '让工具成为思考与表达的助手',
    heroGlyph: '⌁',
    themeClass: 'ability-tools',
    introduction: [
      '工程技术的发展离不开工具。从传统的绘图仪器到现代计算机辅助设计软件，工具不断改变着工程设计与表达的方式。',
      '学习工程制图，不仅要掌握几何原理，还要学会选择和使用合适的工具，将自己的空间认识转化为准确、规范、清晰的工程表达。'
    ],
    abilities: [
      {
        index: '01',
        mark: '选',
        title: '工具选择能力',
        description: '根据不同的学习任务和工程问题，选择合适的绘图工具、数字化学习工具和设计软件。'
      },
      {
        index: '02',
        mark: '数',
        title: '数字化操作能力',
        description: '掌握数字化工具的基本操作，利用交互式学习环境和计算机辅助设计工具，提高分析、绘制和解决问题的效率。'
      },
      {
        index: '03',
        mark: '达',
        title: '工程表达能力',
        description: '能够运用规范的工程制图方法和数字化工具，准确表达空间形体、几何关系和设计意图。'
      }
    ],
    prompt: {
      title: '工具不是目的，解决问题才是目的。',
      items: [
        '学会使用工具，更要理解工具背后的原理，知道什么时候使用、为什么使用，以及如何用好它。'
      ],
      closing: '善用工具，让思考和实践转化为准确、规范的工程表达。'
    },
    practice: {
      label: '课堂学习约定',
      title: '铅笔和尺规是工程制图基本功',
      rule: '每节课请带齐铅笔、直尺、圆规和橡皮。',
      items: [
        '辅助线用铅笔轻画，结论线用直尺或圆规准确加深。',
        '养成“先构造、后成图，先核对、再描深”的作图顺序。',
        '数字工具可以帮助观察，但不能代替手工作图的基本校核。'
      ],
      closing: '工具用得规范，思考才能被准确表达，探索结果才能被可靠验证。'
    }
  }
};

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return Object.freeze(value);
  }
  return value;
}

module.exports = deepFreeze(abilityPages);
