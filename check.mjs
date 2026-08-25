/**
 * journal-desk 自检:宿主同款 `new Function('ctx', src)(mockCtx)` + DOM 垫片 + 冻钟 + 内存 vault。
 *
 * 覆盖 SPEC-journal-desk §7 的全部断言:
 *   20260814 BRIEF 八项 —— ①贡献点齐全(视图/6 命令/10 设置 default 为中文常量/状态栏一次)
 *     ②disposer 收干净 ③核心纯函数已知向量(**四时区子进程扫描**,四轮结果必须一致)
 *     ④XSS(恶意文件夹名走渲染器后无 attrs 注入)⑤数据契约往返(resolvePath → parse+matchAnchor 回到同一 anchor)
 *     ⑥旧宿主 ctx 下 setup 不抛 ⑦词表两侧键集合相等 ⑧切 en 后重渲出现英文 + ⑧a zh→en→zh 逐字往返
 *     + ⑧b 切语言不丢月份游标
 *   20260821 BRIEF 两项 —— ⑨v4 路由自检(blocks/order/text getter 访问计数为 0、块寻址 + insertMarkdown 零调用、
 *     每一次 writeFile 之前该路径的 readFile 都返回过 null)⑩活动页写保护三档(a 短路零 IPC / b 已存在不写 / c 读失败中止)
 *   本插件特有 —— ⑪串行写队列(同 tick 三连点只写 1 次)⑫读回自校验软硬两档 ⑬模板三态
 *     ⑭prev/next 跟随活动页 ⑮非法路径零 IPC ⑯listPages 缺席/空的降级 ⑰常量路径降级 ⑱午夜定时器 + 零 setInterval
 *
 * 跑法:node check.mjs
 */
process.env.TZ = process.env.JD_TZ || 'Asia/Shanghai'

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { strict as A } from 'node:assert'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8')
const realSetTimeout = setTimeout
const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms))
const flush = async () => { for (let i = 0; i < 12; i++) await sleep(0) }
const CHILD = !!process.env.JD_TZ_CHILD

// ══════════════════════════════════════════════════════════════════════════
// 静态纪律
// ══════════════════════════════════════════════════════════════════════════
/** 静态禁令只该看**真代码**:注释里出现 setInterval / insertMarkdown 恰恰是在写明「为什么不用它」。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\\:'"`])\/\/[^\n]*/g, '$1')
const code = stripComments(src)
if (!CHILD) {
  A.ok(!/innerHTML/.test(code), 'main.js 禁 innerHTML(XSS 面归零)')
  A.ok(!/querySelector/.test(code), 'main.js 禁 querySelector(全部直引用)')
  A.ok(!/setInterval/.test(code), '轮询用 setTimeout 自排程,禁 setInterval')
  A.ok(!/new Date\(\)/.test(code), '「现在」一律 Date.now(),禁裸 new Date()')
  A.ok(!/color:\s*#[0-9a-f]{3,6}/i.test(code), 'CSS 不许硬编码前景 hex(一律 var(--…) + 回退)')
  A.ok(!/workFolder\s*\(\s*\)/.test(code), '本插件刻意不使用 workFolder(SPEC §2.1 显式豁免)')
  A.ok(!/insertMarkdown|insertBlockAfter|deleteBlock|mountBlocks|setFmExtra|requestFocus|getActivePageText/.test(code),
    '块寻址 API / insertMarkdown / getActivePageText 在代码里一次都不该出现')
  A.ok(!/\.text\b|\.blocks\b|\.order\b|\.fmExtra\b/.test(code.replace(/textContent/g, '')),
    'v4 页的正文字段(text/blocks/order/fmExtra)一次都不该被读到')
  // 批次门禁 20260821/verify-all.mjs 的 B2 段用这条**同款**正则从 main.js 里扫插件视图名去喂
  // parseSpaceJson。扫不到 → plugin:journal-desk:calendar 进不了白名单 → Space 解析当场判红,
  // 而插件本身完全正常。两个雷:id 不是第一个键 / id 写成变量而不是字面量。这里原样复刻它。
  {
    const gate = /registerView(?:\?\.)?\s*\(\s*\{[^}]*?id\s*:\s*['"]([\w-]+)['"]/gs
    const found = [...src.matchAll(gate)].map((m) => m[1])
    A.deepEqual(found, ['calendar'], '批次门禁的视图名正则必须能从 main.js 扫出 calendar(id 须是第一个键 + 字面量字符串)')
  }
  {
    const lines = src.split('\n')
    const asi = [...lines.keys()].filter((i) => {
      if (!/^\s*[([]/.test(lines[i])) return false
      let p = i - 1
      while (p >= 0 && !lines[p].trim()) p--
      return p >= 0 && /[)\]'"`\w]\s*$/.test(lines[p])
    }).map((i) => i + 1)
    A.equal(asi.length, 0, `以 ( [ 开头的行会被 ASI 粘到上一句:第 ${asi.join(',')} 行`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 冻钟:2026-08-21 10:00(**本地**)—— 四时区扫描下各自的本地毫秒
// ══════════════════════════════════════════════════════════════════════════
const RealDate = Date
const NOW = new RealDate(2026, 7, 21, 10, 0, 0, 0).getTime()
Date.now = () => NOW

// ══════════════════════════════════════════════════════════════════════════
// DOM 垫片
// ══════════════════════════════════════════════════════════════════════════
function mkText(v) {
  const n = { tag: '#text', children: [], attrs: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }
  let s = String(v)
  Object.defineProperty(n, 'textContent', { get: () => s, set: (x) => { s = String(x) } })
  return n
}
function mkEl(tag) {
  const el = {
    tag,
    children: [],
    attrs: {},
    listeners: {},
    parentElement: null,
    isConnected: true,
    className: '',
    style: { setProperty() {}, removeProperty() {} },
    setAttribute(k, v) { el.attrs[k] = String(v) },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null },
    addEventListener(type, fn) { const a = el.listeners[type] || (el.listeners[type] = []); a.push(fn) },
    removeEventListener() {},
    remove() {
      const p = el.parentElement
      if (p) p.children = p.children.filter((x) => x !== el)
      el.parentElement = null
    },
  }
  el.classList = {
    add: (...cs) => { const s = new Set(el.className.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); el.className = [...s].join(' ') },
    remove: (...cs) => { el.className = el.className.split(/\s+/).filter((c) => c && !cs.includes(c)).join(' ') },
    contains: (c) => el.className.split(/\s+/).includes(c),
  }
  let own = ''
  el.appendChild = (c) => {
    el.children.push(c)
    if (c && typeof c === 'object') c.parentElement = el
    return c
  }
  Object.defineProperty(el, 'textContent', {
    get: () => own + el.children.map((c) => (c && c.textContent) || '').join(''),
    set: (v) => { el.children.length = 0; own = String(v) },
  })
  return el
}
globalThis.document = { createElement: mkEl, createTextNode: mkText, createDocumentFragment: () => mkEl('#frag'), addEventListener() {}, body: mkEl('body') }
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', color: 'rgb(28,28,28)' })

const findAll = (node, pred) => {
  const out = []
  const walk = (n) => { for (const c of (n.children || [])) { if (pred(c)) out.push(c); walk(c) } }
  walk(node)
  return out
}
const byTag = (node, tag) => findAll(node, (c) => c.tag === tag)
const anyAttr = (node, key) => findAll(node, (c) => c.attrs && key in c.attrs).length > 0
const byClass = (node, cls) => findAll(node, (c) => typeof c.className === 'string' && c.className.split(/\s+/).includes(cls))
const clickEl = (node) => { const fs = node.listeners && node.listeners.click; if (fs) fs.forEach((f) => f()) }

// ══════════════════════════════════════════════════════════════════════════
// localStorage 垫片
// ══════════════════════════════════════════════════════════════════════════
const _ls = new Map()
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
}

// ══════════════════════════════════════════════════════════════════════════
// 假定时器:收集后手动 fire —— 验证午夜定时器排了但不自己跑;setInterval 一律炸
// ══════════════════════════════════════════════════════════════════════════
let timerSeq = 0
let timers = []
const cleared = []
globalThis.setTimeout = (fn, ms) => { const id = ++timerSeq; timers.push({ id, fn, ms }); return id }
globalThis.clearTimeout = (id) => { cleared.push(id); timers = timers.filter((x) => x.id !== id) }
globalThis.setInterval = () => { throw new Error('setInterval 被禁用') }

// ══════════════════════════════════════════════════════════════════════════
// mock ctx 工厂
// ══════════════════════════════════════════════════════════════════════════
function makeHarness(opt) {
  const o = opt || {}
  const V = new Map(o.vault || [])
  const reg = {
    views: [], commands: [], settings: [], status: [], statusUpdates: [], statusDisposed: 0,
    notes: [], appNotes: [], activity: [], openedViews: [], loads: [], openFiles: [],
    reads: [], writes: [], lists: 0, io: [],
  }
  const fieldHits = { text: 0, blocks: 0, order: 0, fmExtra: 0, activePageText: 0 }
  const blockCalls = { insertMarkdown: 0, insertBlockAfter: 0, deleteBlock: 0, mountBlocks: 0, setFmExtra: 0, undo: 0, redo: 0, requestFocus: 0 }
  const subs = { locale: new Set(), page: new Set(), localeOff: 0, pageOff: 0 }
  const state = {
    locale: o.locale || 'zh',
    activePage: o.activePage == null ? null : o.activePage,
    readHook: o.readHook || null,
    writeHook: o.writeHook || null,
    listPagesOff: !!o.listPagesOff,
    pages: o.pages || null,
  }
  let tokenSeq = 0
  const readCount = new Map()

  const v4page = () => {
    const p = { token: 'tok-' + (++tokenSeq), path: state.activePage, status: 'ready', model: 'text' }
    Object.defineProperty(p, 'text', { get() { fieldHits.text++; return '# 正在写\n\n正文' }, enumerable: true })
    Object.defineProperty(p, 'blocks', { get() { fieldHits.blocks++; return {} }, enumerable: true })
    Object.defineProperty(p, 'order', { get() { fieldHits.order++; return [] }, enumerable: true })
    Object.defineProperty(p, 'fmExtra', { get() { fieldHits.fmExtra++; return '' }, enumerable: true })
    return p
  }

  const ctx = {
    registerView: (v) => reg.views.push(v),
    registerCommand: (c) => reg.commands.push(c),
    registerSetting: (s) => reg.settings.push(s),
    registerStatusItem: (s) => {
      reg.status.push(s)
      return { update: (p) => reg.statusUpdates.push(p), dispose: () => { reg.statusDisposed++ } }
    },
    openView: (id) => reg.openedViews.push(id),
    notify: (m, oo) => reg.notes.push({ m, o: oo || {} }),
    getLocale: () => state.locale,
    subscribeLocale: (cb) => { subs.locale.add(cb); return () => { subs.localeOff++; subs.locale.delete(cb) } },
    activity: { log: (e, d) => reg.activity.push({ e, d }) },
    achievements: { registerSeries: () => {}, track: () => {} },
    app: {
      notify: (m) => reg.appNotes.push(m),
      getActivePage: () => state.activePage,
      getActivePageText: () => { fieldHits.activePageText++; return '' },
      loadPage: (p) => reg.loads.push(p),
      openFile: (p) => reg.openFiles.push(p),
      createPage: () => {},
      prompt: async () => null,
      workFolder: () => '周期笔记台',
      readFile: async (p) => {
        const n = (readCount.get(p) || 0) + 1
        readCount.set(p, n)
        reg.reads.push(p)
        let out
        if (state.readHook) {
          const r = state.readHook(p, n) // 抛错 = 宿主 readFile 抛;返回 undefined = 走内存 vault
          if (r !== undefined) out = r
        }
        if (out === undefined) out = V.has(p) ? V.get(p) : null
        reg.io.push({ op: 'read', path: p, result: out })
        return out
      },
      writeFile: async (p, txt) => {
        if (state.writeHook) state.writeHook(p, txt)
        reg.writes.push({ p, txt: String(txt) })
        reg.io.push({ op: 'write', path: p })
        V.set(p, String(txt))
      },
      subscribePage: (cb) => { subs.page.add(cb); return () => { subs.pageOff++; subs.page.delete(cb) } },
      getPage: () => v4page(),
      insertMarkdown: () => { blockCalls.insertMarkdown++; return true },
      insertBlockAfter: () => { blockCalls.insertBlockAfter++; return 'b1' },
      deleteBlock: async () => { blockCalls.deleteBlock++ },
      mountBlocks: () => { blockCalls.mountBlocks++; return () => {} },
      setFmExtra: () => { blockCalls.setFmExtra++ },
      undo: () => { blockCalls.undo++ },
      redo: () => { blockCalls.redo++ },
      requestFocus: () => { blockCalls.requestFocus++ },
    },
  }
  if (state.listPagesOff) delete ctx.app.listPages
  else ctx.app.listPages = async () => { reg.lists++; return state.pages || Array.from(V.keys()) }

  return {
    ctx, reg, V, state, subs, fieldHits, blockCalls,
    setLocale(l) { state.locale = l; subs.locale.forEach((cb) => cb(l)) },
    firePage(path) { state.activePage = path; subs.page.forEach((cb) => cb({ token: 'tk', path, status: 'ready', model: 'text' })) },
    cmd(id) { const c = reg.commands.find((x) => x.id === id); A.ok(c, `命令 ${id} 未注册`); return c.run() },
  }
}

function loadPlugin(ctx) {
  globalThis.__JOURNAL_TEST__ = {}
  const dispose = new Function('ctx', src)(ctx)
  return { dispose, T: globalThis.__JOURNAL_TEST__ }
}
function reset() {
  _ls.clear()
  timers = []
  cleared.length = 0
  timerSeq = 0
}

// ══════════════════════════════════════════════════════════════════════════
// ③ 核心纯函数已知向量(SPEC §5.6 全表)—— 四时区扫描下必须逐条一致
// ══════════════════════════════════════════════════════════════════════════
function runPureVectors(T) {
  const need = ['dayKeyOf', 'daySerial', 'serialToKey', 'shiftDays', 'isoWeekOf', 'isoWeekStartOf', 'isoWeekStartFrom',
    'quarterOf', 'anchorOf', 'neighborAnchor', 'formatDate', 'formatPattern', 'resolvePath', 'isSafeVaultPath',
    'parsePatternToRegex', 'matchAnchor', 'currentPeriodOf', 'markedDays', 'monthGrid', 'buildBodyText']
  for (const k of need) A.equal(typeof T[k], 'function', `钩子应暴露 ${k}`)

  // ── 冻钟本地日 ──
  A.equal(T.dayKeyOf(NOW), '2026-08-21', '冻钟今天 = 2026-08-21(本地)')
  A.equal(T.todayKey(), '2026-08-21')

  // ── shiftDays(DST) ──
  A.equal(T.shiftDays('2026-03-08', 1), '2026-03-09', '美东春令日 23h:正午锚定不许原地踏步')
  A.equal(T.shiftDays('2026-11-01', -1), '2026-10-31', '美东秋令日 25h')
  A.equal(T.shiftDays('2026-12-31', 1), '2027-01-01')
  A.equal(T.shiftDays('2026-03-01', -1), '2026-02-28')

  // ── isoWeekOf / isoWeekStartOf ──
  A.deepEqual(T.isoWeekOf('2026-08-21'), { isoYear: 2026, week: 34 })
  A.equal(T.isoWeekStartOf('2026-08-21'), '2026-08-17')
  A.deepEqual(T.isoWeekOf('2025-12-29'), { isoYear: 2026, week: 1 }, '日历年 2025,ISO 周年 2026')
  A.equal(T.isoWeekStartOf('2025-12-29'), '2025-12-29')
  A.deepEqual(T.isoWeekOf('2026-01-01'), { isoYear: 2026, week: 1 })
  A.equal(T.isoWeekStartOf('2026-01-01'), '2025-12-29')
  A.deepEqual(T.isoWeekOf('2027-01-03'), { isoYear: 2026, week: 53 }, '日历年 2027,ISO 周年 2026')
  A.equal(T.isoWeekStartOf('2027-01-03'), '2026-12-28')
  A.deepEqual(T.isoWeekOf('2026-12-28'), { isoYear: 2026, week: 53 }, '2026 是 53 周年')

  // ── isoWeekStartFrom ──
  A.equal(T.isoWeekStartFrom(2026, 1), '2025-12-29')
  A.equal(T.isoWeekStartFrom(2026, 53), '2026-12-28')
  A.equal(T.isoWeekStartFrom(2026, 34), '2026-08-17')

  // ── anchorOf / neighborAnchor ──
  A.equal(T.anchorOf('quarter', '2026-08-21'), '2026-07-01')
  A.equal(T.anchorOf('week', '2026-01-01'), '2025-12-29')
  A.equal(T.anchorOf('year', '2026-08-21'), '2026-01-01')
  A.equal(T.anchorOf('day', '2026-08-21'), '2026-08-21')
  A.equal(T.anchorOf('month', '2026-08-21'), '2026-08-01')
  A.equal(T.neighborAnchor('month', '2026-12-01', 1), '2027-01-01')
  A.equal(T.neighborAnchor('quarter', '2026-10-01', 1), '2027-01-01')
  A.equal(T.neighborAnchor('week', '2026-03-02', 1), '2026-03-09', '跨美东 DST 的一周')
  A.equal(T.neighborAnchor('year', '2026-01-01', -1), '2025-01-01')
  A.equal(T.neighborAnchor('day', '2026-01-01', -1), '2025-12-31')
  A.equal(T.neighborAnchor('month', '2026-01-01', -1), '2025-12-01')
  A.equal(T.quarterOf('2026-08-21'), 3)

  // ── formatDate(单趟) ──
  A.equal(T.formatDate('YYYY-MM-DD', '2026-01-05'), '2026-01-05')
  A.equal(T.formatDate('YYYY/M/D', '2026-01-05'), '2026/1/5')
  A.equal(T.formatDate('YYYY年MM月', '2026-01-05'), '2026年01月')
  A.equal(T.formatDate('YY-MM', '2026-01-05'), '26-01')

  // ── formatPattern / resolvePath ──
  A.equal(T.resolvePath('Journal/{{date:YYYY-MM-DD}}', 'day', '2026-08-21'), 'Journal/2026-08-21.md')
  A.equal(T.resolvePath('Journal/周/{{date:YYYY}}-W{{week}}', 'week', '2026-08-17'), 'Journal/周/2026-W34.md')
  A.equal(T.resolvePath('Journal/周/{{date:YYYY}}-W{{week}}', 'week', '2025-12-29'), 'Journal/周/2026-W01.md',
    '跨年周:{{date:YYYY}} 必须给 ISO 周年,否则与 2025 年 1 月那周撞同一个文件')
  A.equal(T.resolvePath('Journal/周/{{date:YYYY}}-W{{week}}', 'week', '2026-12-28'), 'Journal/周/2026-W53.md')
  A.equal(T.resolvePath('Journal/季/{{date:YYYY}}-Q{{quarter}}', 'quarter', '2026-07-01'), 'Journal/季/2026-Q3.md')
  A.equal(T.resolvePath('Journal/月/{{date:YYYY-MM}}', 'month', '2026-08-01'), 'Journal/月/2026-08.md')
  A.equal(T.resolvePath('/Journal//{{date:YYYY}}/', 'year', '2026-01-01'), 'Journal/2026.md', '首尾 / 与 // 归一')
  A.equal(T.resolvePath('Journal/{{date:YYYY-MM-DD}}.md', 'day', '2026-08-21'), 'Journal/2026-08-21.md', '不重复补 .md')
  A.equal(T.formatPattern('{{title}}', { period: 'day', anchor: '2026-08-21', title: '{{week}}' }), '{{week}}',
    '单趟证据:替进去的值不许被二次扫描')
  A.equal(T.formatPattern('{{foo}}', { period: 'day', anchor: '2026-08-21' }), '{{foo}}', '未知 token 原样保留')
  A.equal(T.formatPattern('{{title}}', { period: 'day', anchor: '2026-08-21' }), '{{title}}', '路径格式里 {{title}} 原样保留')

  // ── isSafeVaultPath ──
  A.equal(T.isSafeVaultPath('Journal/2026-08-21.md'), true)
  for (const bad of ['../etc/passwd.md', '/abs/x.md', 'a//b.md', 'a/./b.md', 'Journal/12:30.md',
    'Journal\\x.md', 'Journal/a*b.md', 'Journal/a?b.md', '', '   ', 'Journal/x.txt']) {
    A.equal(T.isSafeVaultPath(bad), false, `isSafeVaultPath 应拒 ${JSON.stringify(bad)}`)
  }
  A.equal(T.illegalCharOf('Journal/12:30.md'), ':')

  // ── parsePatternToRegex / matchAnchor ──
  const P = (pat, per) => T.parsePatternToRegex(pat, per)
  const M = (pat, per, path) => { const p = P(pat, per); return p ? T.matchAnchor(p, path, per) : null }
  A.equal(M('Journal/{{date:YYYY-MM-DD}}', 'day', 'Journal/2026-08-21.md'), '2026-08-21')
  A.equal(M('Journal/{{date:YYYY-MM-DD}}', 'day', 'Journal/sub/2026-08-21.md'), null, '\\d 不吃 /')
  A.equal(M('Journal/{{date:YYYY-MM-DD}}', 'day', 'Journal/2026-08-21-补.md'), null, '$ 锚定')
  A.equal(M('Journal/{{date:YYYY-MM-DD}}', 'day', 'Journal/2026-02-31.md'), null, '日期往返校验')
  A.equal(M('My.Journal/{{date:YYYY-MM-DD}}', 'day', 'MyXJournal/2026-08-21.md'), null, '正则元字符必须转义')
  A.equal(M('Journal/周/{{date:YYYY}}-W{{week}}', 'week', 'Journal/周/2026-W01.md'), '2025-12-29')
  A.equal(M('Journal/周/{{date:YYYY}}-W{{week}}', 'week', 'Journal/周/2026-W54.md'), null, '周号往返校验')
  A.equal(M('Journal/季/{{date:YYYY}}-Q{{quarter}}', 'quarter', 'Journal/季/2026-Q3.md'), '2026-07-01')
  A.equal(P('Journal/日记', 'day'), null, '常量路径不可反解')
  A.equal(P('Journal/{{date:YYYY-MM-DD-HHmm}}', 'day'), null, 'FMT 含时间不可反解')
  A.equal(P('Journal/{{title}}', 'day'), null, '{{title}} 不属于路径格式')
  A.equal(P('Journal/{{unknown}}/{{date:YYYY-MM-DD}}', 'day'), null, '未知 {{…}} 不可反解')
  A.equal(P('Journal/{{date:YYYY-MM}}', 'day'), null, 'day 缺 d 不可反解')
  A.equal(M('J/{{date:YY-MM-DD}}', 'day', 'J/26-08-21.md'), '2026-08-21', 'YY 一律当 20xx')
  A.equal(M('Journal/月/{{date:YYYY-MM}}', 'month', 'Journal/月/2026-13.md'), null, '月份范围校验')
  A.equal(M('Journal/年/{{date:YYYY}}', 'year', 'Journal/年/2026.md'), '2026-01-01')
  A.equal(T.patternDiag('Journal/日记', 'day'), 'const')
  A.equal(T.patternDiag('Journal/{{title}}', 'day'), 'bad')
  A.equal(T.patternDiag('Journal/{{date:YYYY-MM-DD}}', 'day'), 'ok')

  // ── currentPeriodOf(默认五条 pattern) ──
  const DP = T.DEFAULT_PATH
  A.deepEqual(T.currentPeriodOf('Journal/2026-08-21.md', DP), { period: 'day', anchor: '2026-08-21' })
  A.deepEqual(T.currentPeriodOf('Journal/周/2026-W34.md', DP), { period: 'week', anchor: '2026-08-17' })
  A.deepEqual(T.currentPeriodOf('Journal/月/2026-08.md', DP), { period: 'month', anchor: '2026-08-01' })
  A.deepEqual(T.currentPeriodOf('Journal/季/2026-Q3.md', DP), { period: 'quarter', anchor: '2026-07-01' })
  A.deepEqual(T.currentPeriodOf('Journal/年/2026.md', DP), { period: 'year', anchor: '2026-01-01' })
  A.equal(T.currentPeriodOf('Notes/随手.md', DP), null)
  A.equal(T.currentPeriodOf('', DP), null)
  A.equal(T.currentPeriodOf(null, DP), null)

  // ── markedDays ──
  {
    const pd = P(DP.day, 'day')
    const s = T.markedDays(['Journal/2026-08-20.md', 'Journal/2026-08-21.md', 'Journal/周/2026-W34.md', 'Notes/a.md'], pd)
    A.deepEqual([...s].sort(), ['2026-08-20', '2026-08-21'])
    A.equal(T.markedDays([], pd).size, 0)
    A.equal(T.markedDays(['Journal/2026-08-20.md'], null), null, 'parsed 为 null → 标记不可用,不是空集')
  }

  // ── monthGrid ──
  {
    const g = T.monthGrid('2026-08')
    A.equal(g.length, 42)
    A.equal(g[0], '2026-07-27')
    A.equal(g[41], '2026-09-06')
    const g2 = T.monthGrid('2026-11')
    A.equal(g2[0], '2026-10-26')
    A.equal(g2[41], '2026-12-06')
    const g3 = T.monthGrid('2026-01')
    A.equal(g3[0], '2025-12-29')
    A.equal(g3[41], '2026-02-08')
  }

  // ── buildBodyText ──
  A.equal(T.buildBodyText(null, { period: 'day', anchor: '2026-08-21', title: '2026-08-21' }), '# 2026-08-21\n')
  A.equal(T.buildBodyText('', { period: 'day', anchor: '2026-08-21', title: '2026-08-21' }), '# 2026-08-21\n')
  A.equal(T.buildBodyText('# {{date:YYYY-MM-DD}}\n\n## 今天\n', { period: 'day', anchor: '2026-08-21', title: 'x' }),
    '# 2026-08-21\n\n## 今天\n')
  A.equal(T.buildBodyText('W{{week}} of {{date:YYYY}}', { period: 'week', anchor: '2025-12-29', title: 'x' }), 'W01 of 2026')

  // ── ⑤ 数据契约往返:resolvePath → parsePatternToRegex + matchAnchor 必须回到同一个 anchor ──
  {
    const dates = ['2026-08-21', '2026-01-01', '2025-12-29', '2026-12-28', '2027-01-03', '2026-02-28', '2026-07-01', '2026-11-30']
    let n = 0
    for (const period of T.PERIODS) {
      const parsed = P(DP[period], period)
      A.ok(parsed, `默认 ${period} pattern 必须可反解`)
      for (const d of dates) {
        const anchor = T.anchorOf(period, d)
        const path = T.resolvePath(DP[period], period, anchor)
        A.equal(T.isSafeVaultPath(path), true, `${path} 应是合法 vault 路径`)
        A.equal(T.matchAnchor(parsed, path, period), anchor, `往返失败:${period} ${anchor} → ${path}`)
        n++
      }
    }
    A.equal(n, 40, '往返向量应跑满 5 周期 × 8 日期')
  }
  // 反解与 currentPeriodOf 一致:每条默认路径都能被 currentPeriodOf 认回自己的周期
  for (const period of T.PERIODS) {
    const anchor = T.anchorOf(period, '2026-08-21')
    const path = T.resolvePath(DP[period], period, anchor)
    A.deepEqual(T.currentPeriodOf(path, DP), { period, anchor }, `currentPeriodOf 应认回 ${period}`)
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 子进程模式:只跑纯函数向量,把结果打出去给父进程比对
// ══════════════════════════════════════════════════════════════════════════
if (CHILD) {
  reset()
  const H = makeHarness({})
  const { dispose, T } = loadPlugin(H.ctx)
  runPureVectors(T)
  // 顺带把几条关键结果打印出来:父进程逐字比对四轮输出
  const DP = T.DEFAULT_PATH
  const fingerprint = [
    T.todayKey(),
    T.resolvePath(DP.week, 'week', '2025-12-29'),
    T.resolvePath(DP.quarter, 'quarter', T.anchorOf('quarter', '2026-08-21')),
    T.shiftDays('2026-03-08', 1),
    T.shiftDays('2026-11-01', -1),
    T.monthGrid('2026-01').join('|'),
    JSON.stringify(T.isoWeekOf('2027-01-03')),
    JSON.stringify(T.currentPeriodOf('Journal/周/2026-W01.md', DP)),
  ].join('\n')
  dispose()
  process.stdout.write(fingerprint)
  process.exit(0)
}

// ══════════════════════════════════════════════════════════════════════════
// 以下是父进程(单一时区 Asia/Shanghai)的完整套件
// ══════════════════════════════════════════════════════════════════════════
console.log('journal-desk 自检 —— 起')

// ── ③ 四时区扫描 ──────────────────────────────────────────────────────────
{
  const ZONES = ['UTC', 'Asia/Shanghai', 'Europe/London', 'America/New_York']
  const prints = []
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, ['check.mjs'], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, TZ: tz, JD_TZ: tz, JD_TZ_CHILD: '1' },
    })
    A.equal(r.status, 0, `时区 ${tz} 下纯函数向量未通过:\n${r.stdout}\n${r.stderr}`)
    prints.push(r.stdout)
  }
  for (let i = 1; i < prints.length; i++) {
    A.equal(prints[i], prints[0], `时区 ${ZONES[i]} 的结果与 ${ZONES[0]} 不一致`)
  }
  console.log(`  ✅ ③ 核心纯函数向量:${ZONES.length} 个时区逐条一致(${ZONES.join(' / ')})`)
}

// 本进程也跑一遍(冻钟 + 上海),让后面的有状态用例共用同一份 T
reset()
const H0 = makeHarness({})
const boot = loadPlugin(H0.ctx)
const PURE = boot.T
runPureVectors(PURE)
console.log('  ✅ ③ 本进程(Asia/Shanghai)复跑向量通过')

// ── ① 贡献点齐全 ─────────────────────────────────────────────────────────
{
  const v = H0.reg.views.find((x) => x.id === 'calendar')
  A.ok(v, '应注册 calendar 视图')
  A.equal(typeof v.mount, 'function')
  A.equal(v.title, MSGZH('viewTitle'), '视图标题注册时取中文')
  for (const id of ['journal-desk-open', 'journal-desk-today', 'journal-desk-prev', 'journal-desk-next', 'journal-desk-week', 'journal-desk-month']) {
    const c = H0.reg.commands.find((x) => x.id === id)
    A.ok(c && typeof c.run === 'function', `应注册命令 ${id}`)
    A.ok(String(c.title).length > 0, `${id} 应有标题`)
  }
  A.equal(H0.reg.commands.length, 6, '命令恰好 6 条')
  const wantSettings = [
    ['dayPath', 'Journal/{{date:YYYY-MM-DD}}'],
    ['dayTemplate', ''],
    ['weekPath', 'Journal/周/{{date:YYYY}}-W{{week}}'],
    ['weekTemplate', ''],
    ['monthPath', 'Journal/月/{{date:YYYY-MM}}'],
    ['monthTemplate', ''],
    ['quarterPath', 'Journal/季/{{date:YYYY}}-Q{{quarter}}'],
    ['quarterTemplate', ''],
    ['yearPath', 'Journal/年/{{date:YYYY}}'],
    ['yearTemplate', ''],
  ]
  A.equal(H0.reg.settings.length, 10, '设置恰好 10 条')
  wantSettings.forEach((row, i) => {
    const s = H0.reg.settings[i]
    A.equal(s.key, row[0], `第 ${i + 1} 条设置的 key`)
    A.equal(s.type, 'text')
    A.equal(s.default, row[1], `${row[0]} 的 default 必须是钉死的中文常量(绝不取 t())`)
    A.ok(String(s.label).length > 0)
    A.ok(String(s.description).length > 0)
  })
  A.equal(H0.reg.status.length, 1, '状态栏项恰好注册一次')
  A.equal(H0.reg.status[0].id, 'today')
  A.equal(H0.reg.status[0].side, 'right')
  A.equal(typeof H0.reg.status[0].onClick, 'function')
  console.log('  ✅ ① 贡献点齐全(1 视图 / 6 命令 / 10 设置 default 为中文常量 / 1 状态栏)')
}
function MSGZH(k) { return PURE.MSG.zh[k] }

// ── ⑦ 双语词表两侧键集合相等 ──────────────────────────────────────────────
{
  const zh = Object.keys(PURE.MSG.zh).sort()
  const en = Object.keys(PURE.MSG.en).sort()
  A.deepEqual(en, zh, '词表两侧键集合必须完全相等')
  for (const k of zh) {
    A.equal(typeof PURE.MSG.zh[k], 'string', `zh.${k} 应为字符串`)
    A.equal(typeof PURE.MSG.en[k], 'string', `en.${k} 应为字符串`)
    A.ok(PURE.MSG.en[k].trim().length > 0, `en.${k} 不许空`)
  }
  // 英文侧不许残留中文(设置描述里的路径示例除外 —— 本插件英文侧一个中文字都不该有)
  const cjk = /[一-鿿]/
  for (const k of en) A.equal(cjk.test(PURE.MSG.en[k]), false, `en.${k} 残留中文:${PURE.MSG.en[k]}`)
  // t() 单趟正则:未知键原样留着,已替进去的值不许被二次扫描
  A.equal(PURE.t('countThisMonth', { n: '{n}' }), MSGZH('countThisMonth').replace('{n}', '{n}'), 't() 单趟:值里带 {n} 也不许被二次替换')
  A.ok(PURE.t('todayPath', { path: 'a/{n}/b.md' }).includes('a/{n}/b.md'), 't() 单趟:用户路径里的 {n} 原样保留')
  A.ok(PURE.t('msgBadPath', {}).includes('{path}'), 't() 未知键原样留着')
  console.log(`  ✅ ⑦ 词表两侧键集合相等(${zh.length} 键),英文侧零中文,t() 单趟`)
}

// ── ⑱ 午夜定时器 + 零 setInterval ────────────────────────────────────────
{
  A.equal(timers.length, 1, 'setup 后应恰好排 1 个 setTimeout(跨午夜刷新)')
  const d = timers[0].ms
  A.ok(d > 0 && d <= 26 * 3600 * 1000, `午夜定时器延时应在 (0, 26h] 内,实际 ${d}`)
  // 冻钟 10:00 → 下一个 00:00:05 应在 14 小时零 5 秒后
  A.equal(d, 14 * 3600 * 1000 + 5000, '冻钟 10:00 → 距明天 00:00:05 恰好 14h5s')
  const before = H0.reg.statusUpdates.length
  const fire = timers.shift()
  fire.fn()
  A.ok(H0.reg.statusUpdates.length > before, '午夜到点必须刷新状态栏')
  A.equal(timers.length, 1, '午夜刷新后必须重排下一次')
  console.log('  ✅ ⑱ 午夜定时器:排 1 个 / 延时合法 / 到点刷新并重排 / 全程零 setInterval')
}

// ── ② disposer ───────────────────────────────────────────────────────────
{
  const el = mkEl('div')
  const un = H0.reg.views[0].mount(el)
  A.equal(typeof un, 'function', 'mount 应返回 disposer')
  await flush()
  const timersBefore = timers.length
  A.equal(typeof boot.dispose, 'function', 'setup 应返回 disposer')
  boot.dispose()
  A.equal(H0.subs.localeOff, 1, 'disposer 必须退掉 locale 订阅')
  A.equal(H0.subs.pageOff, 1, 'disposer 必须退掉 subscribePage 订阅')
  A.ok(cleared.length >= 1, 'disposer 必须 clearTimeout 午夜定时器')
  A.equal(timers.length, timersBefore - 1, 'disposer 后不该留下在飞的定时器')
  A.equal(H0.reg.statusDisposed, 1, 'disposer 应收掉状态栏句柄')
  boot.dispose() // 二次调用不许抛
  un() // 视图 disposer 在 setup disposer 之后再调也不许抛
  console.log('  ✅ ② disposer:订阅/定时器/视图/状态栏全部收干净,重复调用不抛')
}

// ── ⑥ 旧宿主 ctx(07-18 之后的 API 全删,且没有 getLocale/subscribeLocale) ──
{
  reset()
  const H = makeHarness({})
  delete H.ctx.registerView
  delete H.ctx.registerStatusItem
  delete H.ctx.openView
  delete H.ctx.notify
  delete H.ctx.getLocale
  delete H.ctx.subscribeLocale
  delete H.ctx.activity
  delete H.ctx.achievements
  delete H.ctx.app.listPages
  delete H.ctx.app.subscribePage
  delete H.ctx.app.workFolder
  delete H.ctx.app.openFile
  let dispose = null
  A.doesNotThrow(() => { dispose = loadPlugin(H.ctx).dispose }, '旧宿主 ctx 下 setup 不许抛')
  A.equal(H.reg.commands.length, 6, '旧宿主下命令仍注册齐')
  A.equal(H.reg.views.length, 0, '旧宿主没有 registerView → 不注册视图')
  H.cmd('journal-desk-open')
  await flush()
  A.ok(H.reg.appNotes.some((m) => String(m).includes(MSGZH('msgNoView'))), '-open 应回落 ctx.app.notify 提示不支持视图')
  A.doesNotThrow(() => dispose(), '旧宿主下 disposer 不许抛')
  console.log('  ✅ ⑥ 旧宿主 ctx:setup 不抛、命令齐、-open 优雅降级')
}

// ── ⑨ v4 路由自检 + 每一次 writeFile 前该路径都 readFile 过 null ──────────
{
  reset()
  const H = makeHarness({ activePage: 'Notes/正在写.md' })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const viewOff = H.reg.views[0].mount(el)
  await flush()
  for (const id of ['journal-desk-open', 'journal-desk-today', 'journal-desk-prev', 'journal-desk-next', 'journal-desk-week', 'journal-desk-month']) {
    H.cmd(id)
    await flush()
  }
  // 翻月 + 点格
  const navBtns = byClass(el, 'jd-btn')
  clickEl(navBtns[0]) // ◀
  clickEl(navBtns[2]) // ▶
  await flush()
  const cells = byClass(el, 'jd-cell')
  A.equal(cells.length, 42, '日历恒 42 格')
  clickEl(cells.find((c) => !c.className.includes('out')))
  await flush()
  H.firePage('Journal/2026-08-21.md')
  await flush()

  A.equal(H.fieldHits.text, 0, 'v4 页的 text getter 访问计数必须为 0')
  A.equal(H.fieldHits.blocks, 0, 'v4 页的 blocks getter 访问计数必须为 0')
  A.equal(H.fieldHits.order, 0, 'v4 页的 order getter 访问计数必须为 0')
  A.equal(H.fieldHits.fmExtra, 0, 'v4 页的 fmExtra getter 访问计数必须为 0')
  A.equal(H.fieldHits.activePageText, 0, 'getActivePageText 也一次都不该调')
  for (const k of Object.keys(H.blockCalls)) {
    A.equal(H.blockCalls[k], 0, `${k} 调用计数必须为 0(本插件与块模型零接触,insertMarkdown 也在内)`)
  }
  A.ok(H.reg.writes.length > 0, '这一轮应当真的建了几篇')
  // 每一次 writeFile 之前,该路径的 readFile 必须刚返回过 null(= 已确认不存在)
  for (let i = 0; i < H.reg.io.length; i++) {
    const ev = H.reg.io[i]
    if (ev.op !== 'write') continue
    let ok = false
    for (let j = i - 1; j >= 0; j--) {
      const e2 = H.reg.io[j]
      if (e2.op === 'read' && e2.path === ev.path) { ok = e2.result === null; break }
    }
    A.equal(ok, true, `writeFile(${ev.path}) 之前该路径的 readFile 必须返回过 null`)
  }
  viewOff()
  dispose()
  console.log(`  ✅ ⑨ v4 路由:块字段零访问、块 API + insertMarkdown 零调用、${H.reg.writes.length} 次写入全部前置确认不存在`)
}

// ── ⑩ 活动页写保护三档 ───────────────────────────────────────────────────
{
  // ⑩a 目标就是活动页 → 短路:writeFile 0、readFile 0、打开 1
  reset()
  const todayPath = 'Journal/2026-08-21.md'
  const H = makeHarness({ activePage: todayPath })
  const { dispose, T } = loadPlugin(H.ctx)
  H.reg.reads.length = 0
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'opened')
  A.equal(H.reg.writes.length, 0, '⑩a writeFile 必须 0 次')
  A.equal(H.reg.reads.length, 0, '⑩a 活动页短路 → readFile 也 0 次')
  A.equal(H.reg.loads.length + H.reg.openFiles.length, 1, '⑩a 打开动作恰好 1 次')
  A.deepEqual(H.reg.loads, [todayPath], '⑩a 普通 .md 一律走 loadPage,绝不 openFile(裸 .md 会被系统默认程序抢走)')
  A.equal(H.reg.openFiles.length, 0)
  dispose()
}
{
  // ⑩b 活动页是别的,但文件已存在 → 不写、打开 1
  reset()
  const todayPath = 'Journal/2026-08-21.md'
  const H = makeHarness({ activePage: 'Notes/别的.md', vault: [[todayPath, '# 我今天已经写了一整天\n']] })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'opened')
  A.equal(H.reg.writes.length, 0, '⑩b 已存在 → writeFile 必须 0 次')
  A.equal(H.V.get(todayPath), '# 我今天已经写了一整天\n', '⑩b 用户内容必须逐字不动')
  A.equal(H.reg.loads.length, 1, '⑩b 打开恰好 1 次')
  dispose()
}
{
  // ⑩c readFile 抛错 → 中止:writeFile 0、打开 0、有 error 通知、返回 'readfail'
  reset()
  const H = makeHarness({
    activePage: 'Notes/别的.md',
    readHook: (p) => { if (p === 'Journal/2026-08-21.md') throw new Error('EBUSY (mock)') },
  })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'readfail', '⑩c 读失败必须返回 readfail')
  A.equal(H.reg.writes.length, 0, '⑩c 读失败绝不写 —— 折叠成「还没有数据」就是当场抹掉用户已有的日记')
  A.equal(H.reg.loads.length + H.reg.openFiles.length, 0, '⑩c 读失败不许打开')
  const err = H.reg.notes.find((n) => n.o && n.o.level === 'error')
  A.ok(err, '⑩c 必须有一条 level:error 的通知')
  A.equal(err.o.sticky, true, '⑩c 该通知应 sticky(用户必须看见)')
  A.ok(String(err.m).includes('Journal/2026-08-21.md'))
  dispose()
  console.log('  ✅ ⑩ 活动页写保护三档全过(短路零 IPC / 已存在不写 / 读失败中止且 sticky 报错)')
}

// ── ⑪ 串行写队列:同一 tick 连发 3 次 today → writeFile 恰好 1 次 ─────────
{
  reset()
  const H = makeHarness({ activePage: null })
  const { dispose, T } = loadPlugin(H.ctx)
  H.cmd('journal-desk-today')
  H.cmd('journal-desk-today')
  H.cmd('journal-desk-today')
  await flush()
  A.equal(H.reg.writes.length, 1, '并发三连点只许落一次盘')
  A.equal(H.reg.writes[0].p, 'Journal/2026-08-21.md')
  A.equal(H.reg.loads.length, 3, '三次都要把用户送到那篇笔记')
  A.equal(H.reg.activity.filter((a) => a.e === 'create').length, 1, 'create 埋点也只该一条')
  A.equal(H.reg.activity.filter((a) => a.e === 'open').length, 2)
  dispose()
  console.log('  ✅ ⑪ 串行写队列:同 tick 三连点 writeFile 恰好 1 次')
}

// ── ⑫ 读回自校验:硬失败 / 软警告 ────────────────────────────────────────
{
  // back == null → verifyfail + error 通知
  reset()
  const H = makeHarness({
    activePage: null,
    readHook: (p, n) => (p === 'Journal/2026-08-21.md' && n >= 2 ? null : undefined),
  })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'verifyfail', '读回拿不到文件 = 硬失败')
  A.ok(H.reg.notes.some((n) => n.o && n.o.level === 'error'), '硬失败必须报 error')
  A.equal(H.reg.loads.length, 0, '硬失败不许再打开')
  dispose()
}
{
  // back !== body(宿主规范化)→ 仍算 created,但要一条 warning
  reset()
  const H = makeHarness({
    activePage: null,
    writeHook: (p, txt) => { /* 模拟宿主原子写时补一个末尾换行 */ },
    readHook: (p, n) => (p === 'Journal/2026-08-21.md' && n >= 2 ? '# 2026-08-21\n\n' : undefined),
  })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'created', '逐字节不等是可预期的(换行规范化),不该判红')
  A.ok(H.reg.notes.some((n) => n.o && n.o.level === 'warning' && String(n.m).includes('2026-08-21')), '软差异要有 warning')
  A.equal(H.reg.loads.length, 1)
  dispose()
  console.log('  ✅ ⑫ 读回自校验:文件没落成=硬失败;逐字节不等=软警告仍算成功')
}

// ── ⑬ 模板三态 ──────────────────────────────────────────────────────────
{
  // 空模板 → 兜底且无通知
  reset()
  const H = makeHarness({ activePage: null })
  const { dispose, T } = loadPlugin(H.ctx)
  await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(H.reg.writes[0].txt, '# 2026-08-21\n', '空模板 → 一行标题兜底')
  A.equal(H.reg.notes.filter((n) => n.o && n.o.level === 'warning').length, 0, '空设置不许提示')
  dispose()
}
{
  // 模板存在 → 变量替换 + {{title}} = basename
  reset()
  _ls.set('plugin.journal-desk.dayTemplate', 'Templates/daily.md')
  const H = makeHarness({
    activePage: null,
    vault: [['Templates/daily.md', '# {{title}}\n\n> {{date:YYYY年MM月DD日}} · 第 {{week}} 周\n\n## 今天\n']],
  })
  const { dispose, T } = loadPlugin(H.ctx)
  await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(H.reg.writes.length, 1)
  A.equal(H.reg.writes[0].txt, '# 2026-08-21\n\n> 2026年08月21日 · 第 34 周\n\n## 今天\n', '模板变量应就地替换')
  A.equal(H.reg.notes.filter((n) => n.o && n.o.level === 'warning').length, 0)
  dispose()
}
{
  // 模板读失败 → 兜底 + 一条 warning,且文件照建不误(与目标读失败方向相反)
  reset()
  _ls.set('plugin.journal-desk.dayTemplate', 'Templates/daily.md')
  const H = makeHarness({
    activePage: null,
    readHook: (p) => { if (p === 'Templates/daily.md') throw new Error('EIO (mock)') },
  })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'created', '模板读不到不该把用户卡在「今天写不了日记」')
  A.equal(H.reg.writes[0].txt, '# 2026-08-21\n')
  A.ok(H.reg.notes.some((n) => n.o && n.o.level === 'warning' && String(n.m).includes('Templates/daily.md')), '必须提示,不许静默兜底')
  dispose()
  console.log('  ✅ ⑬ 模板三态:空=静默兜底 / 命中=变量替换 / 读失败=兜底+warning 且照建')
}

// ── ⑭ prev/next 跟随活动页 ──────────────────────────────────────────────
{
  const cases = [
    ['Journal/周/2026-W34.md', 'Journal/周/2026-W33.md', 'Journal/周/2026-W35.md'],
    ['Notes/随手.md', 'Journal/2026-08-20.md', 'Journal/2026-08-22.md'],
    [null, 'Journal/2026-08-20.md', 'Journal/2026-08-22.md'],
    ['Journal/季/2026-Q3.md', 'Journal/季/2026-Q2.md', 'Journal/季/2026-Q4.md'],
    ['Journal/年/2026.md', 'Journal/年/2025.md', 'Journal/年/2027.md'],
    ['Journal/月/2026-01.md', 'Journal/月/2025-12.md', 'Journal/月/2026-02.md'],
  ]
  for (const [active, wantPrev, wantNext] of cases) {
    reset()
    const H = makeHarness({ activePage: active })
    const { dispose, T } = loadPlugin(H.ctx)
    H.cmd('journal-desk-prev')
    await flush()
    A.equal(H.reg.writes.length, 1, `prev(${active}) 应建立目标`)
    A.equal(H.reg.writes[0].p, wantPrev, `prev(${active}) 目标路径`)
    dispose()

    reset()
    const H2 = makeHarness({ activePage: active })
    const d2 = loadPlugin(H2.ctx).dispose
    H2.cmd('journal-desk-next')
    await flush()
    A.equal(H2.reg.writes[0].p, wantNext, `next(${active}) 目标路径`)
    d2()
  }
  // -week / -month 恒相对今天,不跟随活动页
  reset()
  const H3 = makeHarness({ activePage: 'Journal/年/2020.md' })
  const d3 = loadPlugin(H3.ctx).dispose
  H3.cmd('journal-desk-week')
  await flush()
  A.equal(H3.reg.writes[0].p, 'Journal/周/2026-W34.md', '-week 恒相对今天')
  H3.cmd('journal-desk-month')
  await flush()
  A.equal(H3.reg.writes[1].p, 'Journal/月/2026-08.md', '-month 恒相对今天')
  d3()
  console.log('  ✅ ⑭ prev/next 跟随当前这篇的周期;-week/-month 恒相对今天')
}

// ── ⑮ 非法路径零 IPC ────────────────────────────────────────────────────
{
  // ⚠️ 「以 / 开头」不在这里测:resolvePath 按 SPEC §5.6 的向量把首尾 `/` 归一掉了
  //    (`'/Journal//{{date:YYYY}}/'` → `'Journal/2026.md'`),它到不了 isSafeVaultPath 那一关;
  //    绝对路径本身的拒绝由纯函数向量 isSafeVaultPath('/abs/x.md') === false 钉住。
  for (const [pat, label] of [['../外面/{{date:YYYY-MM-DD}}', '越界'], ['Journal/{{date:HH:mm}}', '文件名带冒号'], ['Journal\\日记/{{date:YYYY-MM-DD}}', '反斜杠']]) {
    reset()
    _ls.set('plugin.journal-desk.dayPath', pat)
    const H = makeHarness({ activePage: null })
    const { dispose, T } = loadPlugin(H.ctx)
    H.reg.reads.length = 0
    const r = await T.ensureAndOpen('day', '2026-08-21')
    await flush()
    A.equal(r, 'badpath', `${label} 应判 badpath`)
    A.equal(H.reg.reads.length, 0, `${label}:readFile 必须 0 次(在发出任何 IPC 之前就拒掉)`)
    A.equal(H.reg.writes.length, 0, `${label}:writeFile 必须 0 次`)
    A.ok(H.reg.notes.some((n) => n.o && n.o.level === 'error'), `${label} 要有 error 通知`)
    dispose()
  }
  console.log('  ✅ ⑮ 非法路径(越界 / 冒号 / 反斜杠)零 IPC + error 通知')
}

// ── ④ XSS + ⑯ listPages 缺席/空的降级 ───────────────────────────────────
{
  reset()
  const EVIL = '<img src=x onerror=alert(1)>'
  const EVIL2 = '"><script>a</script>'
  _ls.set('plugin.journal-desk.dayPath', `${EVIL}/{{date:YYYY-MM-DD}}`)
  const H = makeHarness({ activePage: null, pages: [`${EVIL2}/2026-08-20.md`, 'Journal/2026-08-21.md'] })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.equal(byTag(el, 'img').length, 0, '恶意串不许变成 <img> 节点')
  A.equal(byTag(el, 'script').length, 0, '恶意串不许变成 <script> 节点')
  A.equal(anyAttr(el, 'onerror'), false, '不许注入 onerror 属性')
  A.equal(anyAttr(el, 'src'), false, '不许注入 src 属性')
  A.ok(el.textContent.includes(EVIL), '恶意串应原样出现在 textContent 里(说明走的是 textContent 而不是 innerHTML)')
  off()
  dispose()
}
{
  // listPages 缺席 → 42 格仍在、底部 noVaultEnum、点空格仍能建
  reset()
  const H = makeHarness({ activePage: null, listPagesOff: true })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.equal(byClass(el, 'jd-cell').length, 42, 'listPages 缺席时日历仍是 42 格')
  A.ok(el.textContent.includes(MSGZH('noVaultEnum')), '底部应显示 noVaultEnum')
  A.equal(byClass(el, 'jd-dot').length, 0, '枚举不到 → 一个点都不画')
  const cells = byClass(el, 'jd-cell')
  const inMonth = cells.find((c) => !c.className.includes('out') && c.attrs.title === '2026-08-05')
  A.ok(inMonth, '应能找到 2026-08-05 那一格')
  clickEl(inMonth)
  await flush()
  A.equal(H.reg.writes.length, 1, '枚举不可用也照样能建')
  A.equal(H.reg.writes[0].p, 'Journal/2026-08-05.md')
  off()
  dispose()
}
{
  // listPages 返回空数组 → 同样降级
  reset()
  const H = makeHarness({ activePage: null, pages: [] })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.ok(el.textContent.includes(MSGZH('noVaultEnum')), '空枚举也走 noVaultEnum')
  off()
  dispose()
  console.log('  ✅ ④⑯ XSS 零注入;listPages 缺席/空:42 格仍在、noVaultEnum、点格照建')
}

// ── 日历正常态:点标记 / 统计 / 点有日记的格子零写 / 非本月格只切月 ────────
{
  reset()
  // 2026-08 的 42 格窗口 = 2026-07-27 … 2026-09-06:07-28 落在前导补格里(有点但不计入本月统计),
  // 07-15 在窗口外(既无点也不计数)—— 两者一起钉住「点画在窗口上、统计只算本月」这条分界。
  const pages = ['Journal/2026-08-03.md', 'Journal/2026-08-20.md', 'Journal/2026-08-21.md', 'Journal/2026-07-28.md', 'Journal/2026-07-15.md', 'Notes/别的.md']
  const H = makeHarness({ activePage: null, pages, vault: pages.map((p) => [p, '# x\n']) })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.ok(el.textContent.includes(MSGZH('countThisMonth').replace('{n}', '3')), '本月 3 天有日记')
  A.equal(byClass(el, 'jd-dot').length, 4, '窗口内有点的是 8-03 / 8-20 / 8-21 / 7-28 共 4 天(7-15 在窗口外)')
  A.equal(byClass(el, 'jd-cell').filter((c) => c.className.includes('today')).length, 1, '今天格恰好一个')
  // 点有日记的格子 → 零写
  const marked = byClass(el, 'jd-cell').find((c) => c.attrs.title === '2026-08-20')
  clickEl(marked)
  await flush()
  A.equal(H.reg.writes.length, 0, '点已有日记的格子必须零写')
  A.deepEqual(H.reg.loads, ['Journal/2026-08-20.md'])
  // 点非本月补格 → 只切月,不建任何文件
  const out = byClass(el, 'jd-cell').find((c) => c.className.includes('out'))
  const beforeIo = H.reg.io.length
  clickEl(out)
  await flush()
  A.equal(H.reg.writes.length, 0, '非本月补格绝不建文件')
  A.equal(H.reg.io.length, beforeIo, '非本月补格连 readFile 都不该发')
  A.ok(el.textContent.includes('2026 年 7 月'), '点上月的补格应切到 7 月')
  off()
  dispose()
  console.log('  ✅ 日历正常态:点标记 / 本月统计 / 已有日记零写 / 非本月补格只切月')
}

// ── ⑰ 常量路径降级 ──────────────────────────────────────────────────────
{
  reset()
  _ls.set('plugin.journal-desk.dayPath', 'Journal/日记')
  const H = makeHarness({ activePage: null, pages: ['Journal/日记.md'], vault: [['Journal/日记.md', '# 日记\n']] })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.equal(byClass(el, 'jd-dot').length, 0, '常量路径 → 一个点都不画')
  A.ok(el.textContent.includes(MSGZH('noMarks')), '底部应显示 noMarks')
  A.ok(el.textContent.includes(MSGZH('msgConstPattern').replace('{period}', MSGZH('pDay'))), '底部应说明是常量路径')
  H.cmd('journal-desk-today')
  await flush()
  A.equal(H.reg.writes.length, 0, '那一个文件已经存在 → 零写')
  A.deepEqual(H.reg.loads, ['Journal/日记.md'], '常量路径下 today 仍能打开那一个文件')
  off()
  dispose()
}
{
  // 不可反解(FMT 含时间)→ noMarks + msgUnparseable,但 today 仍能建
  reset()
  _ls.set('plugin.journal-desk.dayPath', 'Journal/{{date:YYYY-MM-DD HHmm}}')
  const H = makeHarness({ activePage: null, pages: [] })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  A.ok(el.textContent.includes(MSGZH('noMarks')))
  A.ok(el.textContent.includes(MSGZH('msgUnparseable').replace('{period}', MSGZH('pDay'))))
  H.cmd('journal-desk-today')
  await flush()
  A.equal(H.reg.writes.length, 1, '不可反解只关掉标记,建/开照常')
  A.ok(/^Journal\/2026-08-21 \d{4}\.md$/.test(H.reg.writes[0].p), `路径应含时间:${H.reg.writes[0].p}`)
  off()
  dispose()
  console.log('  ✅ ⑰ 常量路径 / 含时间路径:关标记但建·开照常,并给出各自的原因')
}

// ── ⑧ 双语切换:不重挂也要变 + ⑧a zh→en→zh 逐字往返 + ⑧b 不丢月份游标 ────
{
  reset()
  const pages = ['Journal/2026-05-04.md', 'Journal/2026-08-21.md']
  const H = makeHarness({ activePage: null, pages, vault: pages.map((p) => [p, '# x\n']) })
  const { dispose, T } = loadPlugin(H.ctx)
  let mounts = 0
  const view = H.reg.views[0]
  const origMount = view.mount
  const el = mkEl('div')
  mounts++
  const off = origMount(el)
  await flush()

  const zh1 = el.textContent
  A.ok(zh1.includes('本周') && zh1.includes('2026 年 8 月'), '中文界面应有「本周」与月份标签')
  A.equal(byClass(el, 'jd-wd').map((x) => x.textContent).join(''), '一二三四五六日', '列头周一起始')

  // ⑧b 先把月份游标翻到 2026-05
  const navBtns = byClass(el, 'jd-btn')
  for (let i = 0; i < 3; i++) clickEl(navBtns[0]) // ◀ ×3 → 2026-05
  await flush()
  A.ok(el.textContent.includes('2026 年 5 月'), '游标应到 2026 年 5 月')
  const zhMay = el.textContent

  // 切英文:视图不重挂也要变
  H.setLocale('en')
  await flush()
  A.equal(mounts, 1, '切语言不许重挂视图')
  const en = el.textContent
  A.ok(en.includes('This Week') && en.includes('This Quarter'), '英文界面应出现 This Week / This Quarter')
  A.equal(byClass(el, 'jd-wd').map((x) => x.textContent).join(''), 'MTWTFSS', '英文列头 M T W T F S S')
  A.ok(en.includes('May 2026'), '⑧b 切语言后月份游标必须还在 2026-05')
  A.equal(/[一-鿿]/.test(en.replace(/Journal\/[^\s]*/g, '')), false, '英文界面(除用户自定路径外)不许残留中文')

  // ⑧a 切回中文:整棵视图文本必须与切之前逐字相同
  H.setLocale('zh')
  await flush()
  A.equal(el.textContent, zhMay, '⑧a zh → en → zh 往返后 textContent 必须逐字相同')
  off()
  dispose()
  console.log('  ✅ ⑧ 切 en 不重挂即变 / ⑧a zh→en→zh 逐字往返 / ⑧b 月份游标不丢')
}

// ── 状态栏:判定顺序、点击重走探测、语言切换跟随 ──────────────────────────
{
  reset()
  const H = makeHarness({ activePage: 'Journal/2026-08-21.md' })
  const { dispose, T } = loadPlugin(H.ctx)
  A.equal(H.reg.status[0].text, MSGZH('stDone'), '活动页就是今天的日记 → 状态栏显示已写(零 IPC)')
  dispose()
}
{
  reset()
  const H = makeHarness({ activePage: null, pages: ['Journal/2026-08-21.md'], vault: [['Journal/2026-08-21.md', '# 2026-08-21\n']] })
  const { dispose, T } = loadPlugin(H.ctx)
  A.equal(H.reg.status[0].text, MSGZH('stTodo'), '首帧还没枚举完 → 先显示没写')
  await flush()
  A.ok(H.reg.statusUpdates.some((u) => u.text === MSGZH('stDone')), '枚举到今天的笔记后应更新成已写')
  // 点状态栏:重走完整探测(文件已存在 → 零写)
  const before = H.reg.writes.length
  H.reg.status[0].onClick()
  await flush()
  A.equal(H.reg.writes.length, before, '点状态栏时文件已存在 → 零写')
  A.equal(H.reg.loads.length, 1)
  // 切英文后状态栏文案跟随
  H.setLocale('en')
  await flush()
  A.ok(H.reg.statusUpdates.some((u) => u.text === PURE.MSG.en.stDone || u.text === PURE.MSG.en.stTodo), '切语言后状态栏文案要跟上')
  dispose()
  console.log('  ✅ 状态栏:判定顺序(活动页 → 标记)、点击重走探测、语言跟随')
}

// ── 建立成功后的收尾:通知 / activity / 乐观点标记 ────────────────────────
{
  reset()
  const H = makeHarness({ activePage: null, pages: [] })
  const { dispose, T } = loadPlugin(H.ctx)
  const el = mkEl('div')
  const off = H.reg.views[0].mount(el)
  await flush()
  H.cmd('journal-desk-today')
  await flush()
  A.equal(H.reg.writes.length, 1)
  A.ok(H.reg.notes.some((n) => n.o && n.o.level === 'success'), '建立成功要有 success 通知')
  const act = H.reg.activity.find((a) => a.e === 'create')
  A.ok(act, '建立要记 activity create')
  A.equal(act.d.period, 'day')
  A.equal(act.d.path, 'Journal/2026-08-21.md')
  A.equal(byClass(el, 'jd-dot').length, 1, '刚建立的那天应当场出现一个点(枚举缓存追不上时的乐观补点)')
  off()
  dispose()
  console.log('  ✅ 建立收尾:success 通知 / activity(create,{period,path})/ 乐观点标记')
}

// ══════════════════════════════════════════════════════════════════════════
// [回归] 2026-08-21 对抗评审(REVIEW-journal.md Finding 1 / 2)
// ══════════════════════════════════════════════════════════════════════════
{
  // R1 —— P0:宿主 readFile 的**读失败形态是 return null,不是 throw**
  //   (真源 electron/amadeus/ipc.ts:981-988 `catch { return null }` 吞掉一切 fs 错误)。
  //   ⑩c 保的是 throw 那一档 —— 生产宿主上永远走不到。这一条保的是真正会发生的那一档。
  reset()
  const USER = '# 2026-08-21\n\n早上跑了 5 公里,晚上把书看完了。\n'
  const H = makeHarness({
    activePage: 'Notes/别的.md',
    pages: ['Journal/2026-08-21.md'], // 枚举面看得见它 = 它确实在库里
    readHook: (p) => (p === 'Journal/2026-08-21.md' ? null : undefined),
    seed: { 'Journal/2026-08-21.md': USER },
  })
  const { dispose, T } = loadPlugin(H.ctx)
  const r = await T.ensureAndOpen('day', '2026-08-21')
  await flush()
  A.equal(r, 'readfail', 'R1 null 形态的读失败同样必须判 readfail,不是 absent')
  A.equal(H.reg.writes.length, 0, 'R1 一个字节都不许写(写了就是把用户一整天的日记盖成空模板)')
  A.equal(H.reg.loads.length + H.reg.openFiles.length, 0, 'R1 读失败不许打开')
  A.ok(H.reg.notes.find((n) => n.o && n.o.level === 'error'), 'R1 必须有 error 通知,不许弹绿色的「已建立」')
  dispose()

  // R1b —— 反向:枚举面看不见它(真的没有这一篇)→ 照常建立,别拒过头
  reset()
  const H2 = makeHarness({ activePage: 'Notes/别的.md', pages: [] })
  const L2 = loadPlugin(H2.ctx)
  A.equal(await L2.T.ensureAndOpen('day', '2026-08-21'), 'created', 'R1b 真的不存在时照常建立')
  await flush()
  L2.dispose()

  // R1c —— 旧宿主没有 listPages:判不了,退回 absent(维持 1.0.0 行为,别把老宿主打死)
  reset()
  const H3 = makeHarness({ activePage: 'Notes/别的.md', listPagesOff: true })
  const L3 = loadPlugin(H3.ctx)
  A.equal(await L3.T.ensureAndOpen('day', '2026-08-21'), 'created', 'R1c 枚举面缺席时降级成 absent')
  await flush()
  L3.dispose()
  console.log('  ✅ R1 读失败的 null 形态:中止 + 零写入 + error 通知;真空位与旧宿主两档不误伤')
}
{
  // R2 —— P1:周/月/季/年 anchor 绝不许污染「哪天写了日记」
  //   周 anchor = ISO 周一、月/季 anchor = 月首、年 anchor = 1 月 1 日 —— 那些日子里
  //   anchor === todayKey(),塞进 lastMarks 会让状态栏当场谎报「✓ 今天」(每年约 60 天)。
  //   check.mjs 的冻钟钉在**周五**,所以这条以前一次都没被采样到。
  reset()
  const H = makeHarness({ activePage: 'Notes/别的.md', pages: [] })
  const { dispose, T } = loadPlugin(H.ctx)
  // 冻钟 2026-08-21 是周五;直接按「今天就是周一」的形态验:让周 anchor 恰好等于今天
  const today = T.dayKeyOf(NOW)
  A.equal(await T.ensureAndOpen('week', today), 'created', 'R2 前置:按今天这个 anchor 建一篇周记')
  await flush()
  A.equal(T.statusState().done, false, 'R2 建的是周记,不是今天的日记 —— 状态栏绝不许说「✓ 今天」')
  A.ok(!H.reg.writes.some((w) => w === `Journal/${today}.md`), 'R2 今天的日记根本没被写过')
  // 反向:真的建了今天的日记 → 状态栏必须翻成已写
  A.equal(await T.ensureAndOpen('day', today), 'created', 'R2 反向:建今天的日记')
  await flush()
  A.equal(T.statusState().done, true, 'R2 反向:这时候才允许说「✓ 今天」')
  dispose()
  console.log('  ✅ R2 周/月/季/年 anchor 不再污染「今天写了没」')
}

console.log('\n🟢 journal-desk check.mjs 全绿')
