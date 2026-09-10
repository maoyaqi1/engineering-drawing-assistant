const api = require('../../utils/api.js');

const SCALES = ['1 非常没有帮助', '2 帮助较小', '3 一般', '4 比较有帮助', '5 非常有帮助'];
const UNDERSTAND = ['1 非常困难', '2 比较困难', '3 基本理解', '4 理解较好', '5 理解非常清楚'];
const AI_USE = ['从没使用', '偶尔使用', '经常使用', '每次遇到问题都会用'];
const AI_HELP = ['1 非常没有帮助', '2 帮助较小', '3 一般', '4 比较有帮助', '5 非常有帮助'];

Page({
  data: {
    title: '工程制图学习助手学习效果调查',
    scales: SCALES,
    understand: UNDERSTAND,
    aiUse: AI_USE,
    aiHelp: AI_HELP,
    q7Options: [
      { label: '教材', selected: false },
      { label: '教师PPT', selected: false },
      { label: '教学视频', selected: false },
      { label: 'CAD/三维软件', selected: false },
      { label: '和同学讨论', selected: false },
      { label: '自己想象', selected: false },
      { label: '其他', selected: false }
    ],
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    q5: '',
    q6: '',
    q7: [],
    submitting: false,
    submitted: false
  },

  pickSingle(event) {
    const key = event.currentTarget.dataset.key;
    const value = Number(event.currentTarget.dataset.value);
    const patch = { [key]: value };
    if (key === 'q3' && value === 1) patch.q4 = 0; // 从没使用 → Q4 不适用
    this.setData(patch);
  },

  toggleMulti(event) {
    const key = event.currentTarget.dataset.key;
    const label = event.currentTarget.dataset.value;
    const optionsPath = `${key}Options`;
    const options = this.data[optionsPath].map((option) => Object.assign({}, option));
    const target = options.find((option) => option.label === label);
    if (target) target.selected = !target.selected;
    const selectedLabels = options.filter((option) => option.selected).map((option) => option.label);
    this.setData({ [optionsPath]: options, [key]: selectedLabels });
  },

  onOpenInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  submit() {
    const { q1, q2, q3, q4, q5, q6, q7, submitting } = this.data;
    if (submitting) return;
    const aiUsed = q3 > 1; // 1=从没使用, 2~4=用过
    if (!q1 || !q2 || !q3) {
      wx.showToast({ title: '请完成带星号的必答题', icon: 'none' });
      return;
    }
    if (aiUsed && !q4) {
      wx.showToast({ title: '请为 AI 教师的帮助程度评分', icon: 'none' });
      return;
    }
    const answers = { q1, q2, q3, q4: aiUsed ? q4 : 0, q5, q6, q7 };
    this.setData({ submitting: true });
    api.submitSurvey(answers).then((res) => {
      this.setData({ submitting: false });
      if (res && res.ok) {
        this.setData({ submitted: true });
        wx.showToast({ title: '已提交，感谢反馈', icon: 'success' });
      } else {
        wx.showToast({ title: (res && res.msg) || '提交失败，请重试', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  backHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  }
});
