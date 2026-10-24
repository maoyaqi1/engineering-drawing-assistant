const api = require('../../utils/api.js');

// 学习效果问卷的前端页面。
//
// 问卷分为单选题（q1–q4）、开放题（q5、q6）和多选题（q7）：
//   q1/q2：五级量表，值 1–5；
//   q3：AI 教师使用频率，1 = 从未使用，2–4 = 使用过；
//   q4：AI 帮助程度，仅在 q3 > 1 时必答；
//   q5/q6：自由文本；
//   q7：教学资源来源标签数组。
//
// 前端负责即时必填校验和交互反馈；作答人是否在册仍由云函数按服务端身份重新判定。
// 因此这里的提交按钮状态不能作为权限依据。
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
    // submitting 防止重复点击；submitted 仅表示本次页面会话中的提交结果。
    submitting: false,
    submitted: false
  },

  onLoad() {
    // R32/D17：问卷页必须先登录（未登录跳登录页）；是否可提交由服务端按名册判定（D15）
    const app = getApp();
    if (!app.globalData.user) {
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  // 单选题的值直接取自按钮的 data-value。
  // q3 选择“从没使用”时同步清空 q4，避免提交一个不适用的 AI 帮助评分。
  pickSingle(event) {
    const key = event.currentTarget.dataset.key;
    const value = Number(event.currentTarget.dataset.value);
    const patch = { [key]: value };
    if (key === 'q3' && value === 1) patch.q4 = 0; // 从没使用 → Q4 不适用
    this.setData(patch);
  },

  // 多选题同时维护两份状态：
  //   q7Options：供 WXML 渲染选项与勾选态；
  //   q7：提交给云函数的纯标签数组。
  // 先拷贝选项再修改，保持 setData 更新过程可预测。
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

  // 开放题只更新对应字段，具体长度和内容约束由提交阶段/服务端负责。
  onOpenInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  // 提交前的客户端门禁：
  //   1. 防止连点产生重复答卷；
  //   2. 校验三个必答题；
  //   3. 仅在确实使用过 AI 时要求 q4。
  // 云函数返回的业务错误码再映射为面向学生的提示，不直接展示服务端技术细节。
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
        const reasons = {
          SURVEY_NOT_IN_ROSTER: '问卷面向在册学生，你的资料还不在老师名册中',
          SURVEY_NO_PROFILE: '请先完善学校、姓名和学号',
          ACCESS_CHECK_FAILED: '系统繁忙，请稍后重试'
        };
        const title = (res && reasons[res.code]) || (res && res.msg) || '提交失败，请重试';
        wx.showToast({ title, icon: 'none' });
      }
    }).catch(() => {
      this.setData({ submitting: false });
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  // 问卷入口是独立页面，完成后返回首页而不是回退到可能已经失效的页面栈。
  backHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  }
});
