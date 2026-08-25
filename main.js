/**
 * journal-desk — 周期笔记台(Journal Desk)v1.0.0
 *
 * 把「日记」从孤零零的今天,扩成一条可前后走的时间轴:日 / 周 / 月 / 季 / 年五种周期笔记
 * 各有自己的路径格式与模板,前后一格随手跳,外加一张「哪天写了」的月历。
 *
 * 形态:裸 setup(ctx) 体(宿主 new Function('ctx', code) 求值),顶层无 import/export,返回 disposer。
 *
 * 三条不可协商的纪律(SPEC §3):
 *   ① 读失败 ≠ 文件不存在。probe() 三态 exists / absent / error 绝不合并;error 一律中止,绝不 writeFile。
 *   ② 同名绝不覆写。「同名」在这里就是「这篇周期笔记已经存在」,直接打开,一个字节都不写。
 *   ③ 活动页保护。目标路径 === getActivePage() → 最外层短路判定为已存在,连 readFile 都不发。
 *
 * v4/unified 载体:本插件与块模型零接触 —— 不读 getPage().text/blocks/order/fmExtra,
 * 不调任何块寻址 API,也不调 insertMarkdown(它从不修改已存在笔记的内容)。
 * 唯一的写口是「对已确认不存在的路径」的一次 ctx.app.writeFile。
 */

// ══════════════════════════════════════════════════════════════════════════
// 0. 双语词表 —— MSG.zh 与 MSG.en 的键集合必须完全相等(check.mjs 断言)
// ══════════════════════════════════════════════════════════════════════════
const MSG = {
  zh: {
    // 视图 / 导航
    viewTitle: '周期笔记台',
    today: '今天',
    prevMonth: '上个月',
    nextMonth: '下个月',
    monthLabel: '{y} 年 {m} 月',
    thisWeek: '本周',
    thisMonth: '本月',
    thisQuarter: '本季',
    thisYear: '本年',
    wd1: '一', wd2: '二', wd3: '三', wd4: '四', wd5: '五', wd6: '六', wd7: '日',
    todayPath: '今天:{path}',
    countThisMonth: '本月 {n} 天有日记',
    noMarks: '日历标记不可用',
    noVaultEnum: '当前环境枚举不到笔记,日历不显示标记(格子照常可点、可建、可开)',
    // 周期名
    pDay: '日', pWeek: '周', pMonth: '月', pQuarter: '季', pYear: '年',
    // 命令标题(注册时取值)
    cmdOpen: '周期笔记台:打开',
    cmdToday: '周期笔记台:今天',
    cmdPrev: '周期笔记台:上一篇',
    cmdNext: '周期笔记台:下一篇',
    cmdWeek: '周期笔记台:本周',
    cmdMonth: '周期笔记台:本月',
    // 状态栏
    stDone: '✓ 今天',
    stTodo: '✎ 今天没写',
    stDoneTitle: '今天的日记:{path}',
    stTodoTitle: '点一下按模板建立今天的日记:{path}',
    // 设置
    setDayPath: '日记路径格式',
    setDayTpl: '日记模板',
    setWeekPath: '周记路径格式',
    setWeekTpl: '周记模板',
    setMonthPath: '月记路径格式',
    setMonthTpl: '月记模板',
    setQuarterPath: '季记路径格式',
    setQuarterTpl: '季记模板',
    setYearPath: '年记路径格式',
    setYearTpl: '年记模板',
    setPathDesc: '可用变量:{{date:FMT}}(FMT 认 YYYY YY MM M DD D HH mm ss)、{{week}}(ISO 周号,两位)、{{quarter}}(1-4)。不用写 .md,插件自动补。',
    setTplDesc: '笔记库里的一条 .md 路径(如 Templates/daily.md)。留空则新建的笔记只有一行标题。模板正文里同样可用上面的变量,外加 {{title}}(文件名)。',
    // 消息
    errReadListed: '这一篇在库里,但这一刻读不回来 —— 已中止,没有改动任何文件',
    msgCreated: '已建立 {path}',
    msgOpened: '{path} 已经打开着',
    msgReadFail: '读不到 {path},已中止(绝不覆盖可能已存在的笔记)。{msg}',
    msgWriteFail: '写入 {path} 失败。{msg}',
    msgBadPath: '路径格式解析出的路径不合法,已中止:{path}',
    msgIllegalChar: '路径里有不能做文件名的字符「{ch}」,已中止:{path}',
    msgTplMissing: '读不到模板 {tpl},这一篇改用一行标题兜底',
    msgVerifyWarn: '{path} 已建立,但读回的内容与写入的不完全一致(宿主可能做了换行规范化)',
    msgNoView: '当前宿主不支持插件视图',
    msgConstPattern: '「{period}」的路径格式里没有日期变量,所有笔记都会指向同一个文件',
    msgUnparseable: '「{period}」的路径格式无法反解(含时间或未知变量),日历标记与「上一篇/下一篇」对它关闭',
  },
  en: {
    viewTitle: 'Journal Desk',
    today: 'Today',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    monthLabel: '{m} {y}',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    thisQuarter: 'This Quarter',
    thisYear: 'This Year',
    wd1: 'M', wd2: 'T', wd3: 'W', wd4: 'T', wd5: 'F', wd6: 'S', wd7: 'S',
    todayPath: 'Today: {path}',
    countThisMonth: '{n} day(s) with a journal this month',
    noMarks: 'Calendar marks unavailable',
    noVaultEnum: 'This host cannot enumerate notes, so no marks are shown (cells still open and create)',
    pDay: 'daily', pWeek: 'weekly', pMonth: 'monthly', pQuarter: 'quarterly', pYear: 'yearly',
    cmdOpen: 'Journal Desk: Open',
    cmdToday: 'Journal Desk: Today',
    cmdPrev: 'Journal Desk: Previous',
    cmdNext: 'Journal Desk: Next',
    cmdWeek: 'Journal Desk: This Week',
    cmdMonth: 'Journal Desk: This Month',
    stDone: '✓ Today',
    stTodo: '✎ No journal yet',
    stDoneTitle: "Today's journal: {path}",
    stTodoTitle: "Click to create today's journal from the template: {path}",
    setDayPath: 'Daily note path',
    setDayTpl: 'Daily note template',
    setWeekPath: 'Weekly note path',
    setWeekTpl: 'Weekly note template',
    setMonthPath: 'Monthly note path',
    setMonthTpl: 'Monthly note template',
    setQuarterPath: 'Quarterly note path',
    setQuarterTpl: 'Quarterly note template',
    setYearPath: 'Yearly note path',
    setYearTpl: 'Yearly note template',
    setPathDesc: 'Tokens: {{date:FMT}} (FMT knows YYYY YY MM M DD D HH mm ss), {{week}} (ISO week number, two digits) and {{quarter}} (1-4). No need to write .md — the plugin appends it.',
    setTplDesc: 'A .md path inside your vault (e.g. Templates/daily.md). Leave it empty and a new note gets just a title line. The same tokens work in the template body, plus {{title}} (the file name).',
    errReadListed: 'This note is in the vault but cannot be read right now — aborted, nothing was changed',
    msgCreated: 'Created {path}',
    msgOpened: '{path} is already open',
    msgReadFail: 'Could not read {path}; aborted so nothing already there gets overwritten. {msg}',
    msgWriteFail: 'Could not write {path}. {msg}',
    msgBadPath: 'The resolved path is not a legal vault path; aborted: {path}',
    msgIllegalChar: 'The path contains "{ch}", which cannot be used in a file name; aborted: {path}',
    msgTplMissing: 'Template {tpl} could not be read — this note falls back to a single title line',
    msgVerifyWarn: '{path} was created, but the text read back is not byte-identical (the host may have normalised it)',
    msgNoView: 'This host does not support plugin views',
    msgConstPattern: 'The {period} path format has no date token — every note would point at the same file',
    msgUnparseable: 'The {period} path format cannot be reversed (it holds a time or an unknown token); calendar marks and prev/next are off for it',
  },
}

const L = () => {
  try { return (ctx.getLocale ? ctx.getLocale() : 'zh') || 'zh' } catch { return 'zh' }
}
/** ⚠️ 单趟正则:逐个 split/join 会让先替进去的值被后面的轮次再吃一遍。未知键原样留着。 */
function t(k, vars) {
  const d = MSG[L()] || MSG.zh
  const s = d[k] != null ? d[k] : (MSG.zh[k] != null ? MSG.zh[k] : k)
  return vars ? s.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)) : s
}

// ══════════════════════════════════════════════════════════════════════════
// 1. 常量
// ══════════════════════════════════════════════════════════════════════════
const PID = 'journal-desk'
const VIEW_ID = 'calendar'
const PERIODS = ['day', 'week', 'month', 'quarter', 'year']
const PATH_KEY = { day: 'dayPath', week: 'weekPath', month: 'monthPath', quarter: 'quarterPath', year: 'yearPath' }
const TPL_KEY = { day: 'dayTemplate', week: 'weekTemplate', month: 'monthTemplate', quarter: 'quarterTemplate', year: 'yearTemplate' }
/** ⚠️ 会落盘 → 一律钉死中文常量,**绝不取 t()**:英文界面下建出来的路径必须与中文界面逐字相同。 */
const DEFAULT_PATH = {
  day: 'Journal/{{date:YYYY-MM-DD}}',
  week: 'Journal/周/{{date:YYYY}}-W{{week}}',
  month: 'Journal/月/{{date:YYYY-MM}}',
  quarter: 'Journal/季/{{date:YYYY}}-Q{{quarter}}',
  year: 'Journal/年/{{date:YYYY}}',
}
const DAY_MS = 86400000
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ══════════════════════════════════════════════════════════════════════════
// 2. 核心纯函数(check.mjs 逐个断言,四时区扫描)
//    时间纪律:「现在」只有 Date.now() 一个来源;日期回溯正午锚定;日序走 UTC 纯日历。
// ══════════════════════════════════════════════════════════════════════════
const pad2 = (n) => (n < 10 && n >= 0 ? '0' + n : String(n))
const pad4 = (n) => String(n).padStart(4, '0')

/** 本地日期 → 'YYYY-MM-DD' */
function dayKeyOf(ms) {
  const d = new Date(ms)
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function partsOf(k) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k == null ? '' : k))
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}
/** 两位数年份(如 0026)不许被 Date 构造器映射成 1926 —— 一律走 setUTCFullYear。 */
function utcMs(y, m, d) {
  const dt = new Date(0)
  dt.setUTCFullYear(y, m - 1, d)
  dt.setUTCHours(0, 0, 0, 0)
  return dt.getTime()
}
/** 纯日历日序(与时区、DST 无关) */
function daySerial(k) {
  const p = partsOf(k)
  if (!p) return NaN
  return Math.floor(utcMs(p.y, p.m, p.d) / DAY_MS)
}
function serialToKey(s) {
  if (!isFinite(s)) return ''
  const d = new Date(Math.round(s) * DAY_MS)
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
/** DST 三定式:本地正午锚定 —— 从午夜起算的裸 +86400000 在春令日会原地踏步。 */
function shiftDays(k, n) {
  const p = partsOf(k)
  if (!p) return ''
  const noon = new Date(2000, 0, 1, 12, 0, 0, 0)
  noon.setFullYear(p.y, p.m - 1, p.d)
  return dayKeyOf(noon.getTime() + n * DAY_MS)
}
/** 1=周一 … 7=周日(1970-01-01 是周四) */
function dowOfSerial(s) {
  return (((s % 7) + 7 + 3) % 7) + 1
}
/** ISO-8601:周一起始,含 1 月 4 日的那周为第 1 周 */
function isoWeekOf(k) {
  const s = daySerial(k)
  if (!isFinite(s)) return null
  const thu = s - dowOfSerial(s) + 4
  const isoYear = Number(serialToKey(thu).slice(0, 4))
  const jan1 = Math.floor(utcMs(isoYear, 1, 1) / DAY_MS)
  return { isoYear, week: Math.floor((thu - jan1) / 7) + 1 }
}
function isoWeekStartOf(k) {
  const s = daySerial(k)
  if (!isFinite(s)) return ''
  return serialToKey(s - dowOfSerial(s) + 1)
}
function isoWeekStartFrom(isoYear, week) {
  const jan4 = Math.floor(utcMs(isoYear, 1, 4) / DAY_MS)
  const mon1 = jan4 - dowOfSerial(jan4) + 1
  return serialToKey(mon1 + (Number(week) - 1) * 7)
}
function quarterOf(k) {
  const p = partsOf(k)
  return p ? Math.floor((p.m - 1) / 3) + 1 : 0
}
/** 每种周期归一化到的那一天。月/季/年恒为月首 → 邻居计算永远遇不到月末钳位。 */
function anchorOf(period, k) {
  const p = partsOf(k)
  if (!p) return ''
  if (period === 'day') return k
  if (period === 'week') return isoWeekStartOf(k)
  if (period === 'month') return `${pad4(p.y)}-${pad2(p.m)}-01`
  if (period === 'quarter') return `${pad4(p.y)}-${pad2((Math.floor((p.m - 1) / 3)) * 3 + 1)}-01`
  if (period === 'year') return `${pad4(p.y)}-01-01`
  return ''
}
function monthShift(y, m, delta) {
  const mi = y * 12 + (m - 1) + delta
  return `${pad4(Math.floor(mi / 12))}-${pad2((((mi % 12) + 12) % 12) + 1)}-01`
}
function neighborAnchor(period, anchor, dir) {
  const p = partsOf(anchor)
  if (!p) return ''
  const step = Number(dir) >= 0 ? 1 : -1
  if (period === 'day') return shiftDays(anchor, step)
  if (period === 'week') return shiftDays(anchor, step * 7)
  if (period === 'month') return monthShift(p.y, p.m, step)
  if (period === 'quarter') return monthShift(p.y, p.m, step * 3)
  if (period === 'year') return `${pad4(p.y + step)}-01-01`
  return ''
}

const FMT_RE = /YYYY|YY|MM|DD|HH|mm|ss|M|D/g
/** ⚠️ 单趟正则,长 token 在前;mm(分)与 MM(月)靠大小写区分 —— 绝不加 i 标志。
 *  isoYear 非空时 YYYY/YY 取它(周记跨年周的判据,见 SPEC §5.5)。未列出的字符原样保留。 */
function formatDate(fmt, k, isoYear) {
  const p = partsOf(k)
  const src = String(fmt == null ? '' : fmt)
  if (!p) return src
  const now = new Date(Date.now())
  const yy = isoYear == null ? p.y : Number(isoYear)
  return src.replace(FMT_RE, (tok) => {
    if (tok === 'YYYY') return pad4(yy)
    if (tok === 'YY') return pad2(((yy % 100) + 100) % 100)
    if (tok === 'MM') return pad2(p.m)
    if (tok === 'M') return String(p.m)
    if (tok === 'DD') return pad2(p.d)
    if (tok === 'D') return String(p.d)
    if (tok === 'HH') return pad2(now.getHours())
    if (tok === 'mm') return pad2(now.getMinutes())
    if (tok === 'ss') return pad2(now.getSeconds())
    return tok
  })
}

const TOKEN_SRC = '\\{\\{date:([^}]*)\\}\\}|\\{\\{(week|quarter|title)\\}\\}'
/** ⚠️ 单趟正则:替进去的值绝不许被后面的轮次再扫一遍(用户的标题恰好叫 `{{week}}` 时会被吃掉)。 */
function formatPattern(pattern, o) {
  const src = String(pattern == null ? '' : pattern)
  const opt = o || {}
  const iso = opt.period === 'week' ? isoWeekOf(opt.anchor) : null
  return src.replace(new RegExp(TOKEN_SRC, 'g'), (whole, fmt, name) => {
    if (fmt !== undefined) return formatDate(fmt, opt.anchor, iso ? iso.isoYear : undefined)
    if (name === 'week') { const w = isoWeekOf(opt.anchor); return w ? pad2(w.week) : whole }
    if (name === 'quarter') { const q = quarterOf(opt.anchor); return q ? String(q) : whole }
    if (name === 'title') return opt.title != null ? String(opt.title) : whole
    return whole
  })
}

/** 路径格式 → vault 相对路径。首尾 `/` 与重复 `/` 归一,不以 .md 结尾则补上。 */
function resolvePath(pattern, period, anchor) {
  let p = formatPattern(pattern, { period, anchor })
  p = p.replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!/\.md$/i.test(p)) p += '.md'
  return p
}

const ILLEGAL_CHARS = ['\\', ':', '*', '?', '"', '<', '>', '|']
/** 返回第一个非法字符(没有则 null)—— 专治 {{date:HH:mm}} 被写进文件名。 */
function illegalCharOf(p) {
  const s = String(p == null ? '' : p)
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i)
    if (ILLEGAL_CHARS.indexOf(c) >= 0) return c
    if (s.charCodeAt(i) < 32) return '\\x' + pad2(s.charCodeAt(i))
  }
  return null
}
/** readFile 对「缺失」与「越界」都返 null —— 这个二义性必须在发出任何 IPC 之前、在插件这层消掉。 */
function isSafeVaultPath(p) {
  const s = String(p == null ? '' : p)
  if (!s.trim()) return false
  if (s.charAt(0) === '/') return false
  if (illegalCharOf(s)) return false
  if (!/\.md$/i.test(s)) return false
  const segs = s.split('/')
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (!seg || !seg.trim() || seg === '.' || seg === '..') return false
  }
  return true
}

const ESC_RE = /[.*+?^${}()|[\]\\]/g
const esc = (s) => String(s).replace(ESC_RE, '\\$&')

/** FMT 片段 → 正则源;HH/mm/ss 出现即判「不可反解」(时间进文件名 = 一天多篇)。 */
function fmtToRegex(fmt, groups) {
  const s = String(fmt == null ? '' : fmt)
  const re = /YYYY|YY|MM|DD|HH|mm|ss|M|D/g
  let out = ''
  let last = 0
  let tokens = 0
  let ok = true
  let m = re.exec(s)
  while (m !== null) {
    out += esc(s.slice(last, m.index))
    last = m.index + m[0].length
    const tk = m[0]
    if (tk === 'YYYY') { out += '(\\d{4})'; groups.push('y'); tokens++ }
    else if (tk === 'YY') { out += '(\\d{2})'; groups.push('yy'); tokens++ }
    else if (tk === 'MM') { out += '(\\d{2})'; groups.push('m'); tokens++ }
    else if (tk === 'M') { out += '(\\d{1,2})'; groups.push('m'); tokens++ }
    else if (tk === 'DD') { out += '(\\d{2})'; groups.push('d'); tokens++ }
    else if (tk === 'D') { out += '(\\d{1,2})'; groups.push('d'); tokens++ }
    else ok = false
    m = re.exec(s)
  }
  out += esc(s.slice(last))
  return { src: out, tokens, ok }
}

const NEED = { day: ['y', 'm', 'd'], week: ['y', 'week'], month: ['y', 'm'], quarter: ['y', 'q'], year: ['y'] }
/** 路径格式 → 反解正则。返回 null = 该周期不可反解(日历标记与 currentPeriodOf 对它关闭)。 */
function parsePatternToRegex(pattern, period) {
  const src = String(pattern == null ? '' : pattern)
  const need = NEED[period]
  if (!need) return null
  const re = new RegExp(TOKEN_SRC, 'g')
  const groups = []
  let out = ''
  let last = 0
  let tokens = 0
  let bad = false
  const lit = (txt) => {
    if (txt.indexOf('{{') >= 0) bad = true
    out += esc(txt)
  }
  let m = re.exec(src)
  while (m !== null) {
    lit(src.slice(last, m.index))
    last = m.index + m[0].length
    if (m[1] !== undefined) {
      const r = fmtToRegex(m[1], groups)
      if (!r.ok) bad = true
      out += r.src
      tokens += r.tokens
    } else if (m[2] === 'week') { out += '(\\d{2})'; groups.push('week'); tokens++ }
    else if (m[2] === 'quarter') { out += '([1-4])'; groups.push('q'); tokens++ }
    else bad = true // {{title}} 只属于模板正文
    m = re.exec(src)
  }
  lit(src.slice(last))
  if (bad || tokens === 0) return null
  if (!/\.md$/i.test(src)) out += '\\.md'
  const has = (g) => groups.indexOf(g) >= 0 || (g === 'y' && groups.indexOf('yy') >= 0)
  for (let i = 0; i < need.length; i++) if (!has(need[i])) return null
  let rx = null
  try { rx = new RegExp('^' + out + '$') } catch { return null }
  return { re: rx, groups, tokens }
}

/** 为 UI 区分「常量路径」与「其它不可反解」——两者的提示语不同。 */
function patternDiag(pattern, period) {
  if (parsePatternToRegex(pattern, period)) return 'ok'
  return String(pattern == null ? '' : pattern).indexOf('{{') >= 0 ? 'bad' : 'const'
}

/** 一条 vault 路径 → 该周期的 anchor(不匹配 / 校验不过 → null)。同语义 token 多次出现取第一个。 */
function matchAnchor(parsed, path, period) {
  if (!parsed || !parsed.re) return null
  const m = parsed.re.exec(String(path == null ? '' : path))
  if (!m) return null
  const pick = (g) => {
    const i = parsed.groups.indexOf(g)
    return i < 0 ? null : m[i + 1]
  }
  let yn = null
  const y4 = pick('y')
  if (y4 != null) yn = Number(y4)
  else {
    const y2 = pick('yy')
    if (y2 != null) yn = 2000 + Number(y2) // YY 一律当 20xx
  }
  if (yn == null || !isFinite(yn)) return null
  if (period === 'year') return `${pad4(yn)}-01-01`
  if (period === 'week') {
    const w = Number(pick('week'))
    if (!isFinite(w) || w < 1 || w > 53) return null
    const mon = isoWeekStartFrom(yn, w)
    const back = isoWeekOf(mon)
    if (!back || back.isoYear !== yn || back.week !== w) return null
    return mon
  }
  if (period === 'quarter') {
    const q = Number(pick('q'))
    if (!isFinite(q) || q < 1 || q > 4) return null
    return `${pad4(yn)}-${pad2((q - 1) * 3 + 1)}-01`
  }
  const mo = Number(pick('m'))
  if (!isFinite(mo) || mo < 1 || mo > 12) return null
  if (period === 'month') return `${pad4(yn)}-${pad2(mo)}-01`
  const dd = Number(pick('d'))
  if (!isFinite(dd) || dd < 1 || dd > 31) return null
  const key = `${pad4(yn)}-${pad2(mo)}-${pad2(dd)}`
  if (serialToKey(daySerial(key)) !== key) return null // 挡 2026-02-31
  return key
}

/** 当前打开的这篇是哪种周期笔记(day → week → month → quarter → year,第一个命中的赢) */
function currentPeriodOf(path, patterns) {
  const p = String(path == null ? '' : path)
  if (!p) return null
  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i]
    const pat = (patterns && patterns[period]) || DEFAULT_PATH[period]
    const parsed = parsePatternToRegex(pat, period)
    if (!parsed) continue
    const a = matchAnchor(parsed, p, period)
    if (a) return { period, anchor: a }
  }
  return null
}

/** 「哪天写了」——从笔记路径现算,不落任何缓存文件。parsedDay 为 null → 返回 null(标记不可用,不是空集)。 */
function markedDays(pages, parsedDay) {
  if (!parsedDay) return null
  const out = new Set()
  const list = pages || []
  for (let i = 0; i < list.length; i++) {
    const a = matchAnchor(parsedDay, list[i], 'day')
    if (a) out.add(a)
  }
  return out
}

/** 恒 42 格(6 行,高度不跳),起点 = 该月 1 日所在 ISO 周的周一 */
function monthGrid(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym == null ? '' : ym))
  if (!m) return []
  const start = daySerial(isoWeekStartOf(`${m[1]}-${m[2]}-01`))
  if (!isFinite(start)) return []
  const out = []
  for (let i = 0; i < 42; i++) out.push(serialToKey(start + i))
  return out
}

/** 模板非空 → 变量替换;否则一行标题兜底(标题不取 t(),它会落盘) */
function buildBodyText(tpl, o) {
  const s = tpl == null ? '' : String(tpl)
  const opt = o || {}
  if (!s.trim()) return '# ' + String(opt.title == null ? '' : opt.title) + '\n'
  return formatPattern(s, opt)
}

const todayKey = () => dayKeyOf(Date.now())
const basenameOf = (p) => String(p == null ? '' : p).split('/').pop().replace(/\.md$/i, '')

// ══════════════════════════════════════════════════════════════════════════
// 3. 设置读取(用时现读;registerSetting 没有变更通知,这是宿主口径)
// ══════════════════════════════════════════════════════════════════════════
function lsGet(key) {
  try { return localStorage.getItem('plugin.' + PID + '.' + key) } catch { return null }
}
function patternOf(period) {
  const v = String(lsGet(PATH_KEY[period]) || '').trim()
  return v || DEFAULT_PATH[period]
}
function templateOf(period) {
  return String(lsGet(TPL_KEY[period]) || '').trim()
}
function allPatterns() {
  const o = {}
  for (let i = 0; i < PERIODS.length; i++) o[PERIODS[i]] = patternOf(PERIODS[i])
  return o
}

// ══════════════════════════════════════════════════════════════════════════
// 4. 通知 / 打开 / 活动日志
// ══════════════════════════════════════════════════════════════════════════
function say(msg, opts) {
  try {
    if (ctx.notify) { ctx.notify(String(msg).trim(), opts); return }
    if (ctx.app && ctx.app.notify) ctx.app.notify(String(msg).trim())
  } catch { /* 通知失败绝不影响主流程 */ }
}
function logActivity(event, detail) {
  try { if (ctx.activity && ctx.activity.log) ctx.activity.log(event, detail) } catch { /* ignore */ }
}
/**
 * 打开一篇**普通 .md 笔记**。
 * ⚠️ 一律走 ctx.app.loadPage,**不用 openFile** —— 宿主的 openFile 对「没有插件文件类型认领的」
 *    裸 .md 会回落到 amadeus.openVaultFile(= 交给系统默认程序),日记会在 TextEdit 里打开。
 *    (真源:desktop/frontend/src/amadeusNav.ts 的 openFile:`if (!matchFileType(path)) openVaultFile(path)`。)
 *    loadPage 对不存在的路径会凭空造出空白页,所以只允许在「已确认存在」或「写盘成功之后」调用。
 */
function openPath(path) {
  try {
    if (ctx.app && typeof ctx.app.loadPage === 'function') { ctx.app.loadPage(path); return 'loadPage' }
    if (ctx.app && typeof ctx.app.openFile === 'function') { ctx.app.openFile(path); return 'openFile' }
  } catch { /* ignore */ }
  return null
}
const errText = (e) => String((e && e.message) || e || '')

// ══════════════════════════════════════════════════════════════════════════
// 5. 三态探测 + 串行写队列 + 唯一写路径
// ══════════════════════════════════════════════════════════════════════════
/** exists / absent / error —— 三态绝不合并任何两态。 */
async function probe(path) {
  let active = null
  try { active = ctx.app && ctx.app.getActivePage ? ctx.app.getActivePage() : null } catch { active = null }
  // 活动页保护:最外层、最强的一道闸 —— 连 readFile 都不发。
  if (active && active === path) return { st: 'exists', active: true }
  let txt = null
  try { txt = await ctx.app.readFile(path) } catch (e) { return { st: 'error', msg: errText(e) } }
  if (txt != null) return { st: 'exists', active: false }
  // ⚠️ 宿主 readFile 的**读失败形态是 return null,不是 throw**(真源 electron/amadeus/ipc.ts:981-988:
  //    `catch { return null }` 吞掉一切 fs 错误)。所以上面那条 catch 在生产宿主上根本走不到 ——
  //    把 null 直接判成 absent,等于「今天读不出来 = 今天还没写」,下一步就写一份空模板
  //    **把用户写了一整天的日记整篇盖掉**,还弹绿色的「已建立」。
  //    只读枚举面不经文件内容,读不了的文件照样枚举得到 —— 拿它当第二信源把三态分开。
  //    枚举面缺席 / 抛错 / 给空数组 = 判不了,退回 absent(旧宿主维持 1.0.0 行为)。
  if (!ctx.app || typeof ctx.app.listPages !== 'function') return { st: 'absent' }
  let pages = null
  try { pages = await ctx.app.listPages() } catch { pages = null }
  if (Array.isArray(pages) && pages.length && pages.indexOf(path) >= 0) return { st: 'error', msg: t('errReadListed') }
  return { st: 'absent' }
}

let writeChain = Promise.resolve()
/** 用户狂点状态栏 / 日历格子时,两个 ensureAndOpen 并发会双双探测到 absent 然后写两次。 */
function enqueueWrite(job) {
  const p = writeChain.then(job)
  writeChain = p.then(() => {}, () => {})
  return p
}

async function buildBody(period, anchor, path) {
  const title = basenameOf(path)
  const tplPath = templateOf(period)
  if (!tplPath) return buildBodyText(null, { period, anchor, title }) // 空设置 → 直接兜底,不提示
  if (!isSafeVaultPath(tplPath)) {
    say(t('msgTplMissing', { tpl: tplPath }), { level: 'warning' })
    return buildBodyText(null, { period, anchor, title })
  }
  let tpl = null
  try { tpl = await ctx.app.readFile(tplPath) } catch { tpl = null }
  if (tpl == null) {
    // 模板读失败与目标读失败方向相反:此刻目标已被确认「明确不存在」,写入方向上没有任何用户数据。
    // 中止反而是把用户卡在「今天写不了日记」。但必须提示,不许静默兜底。
    say(t('msgTplMissing', { tpl: tplPath }), { level: 'warning' })
    return buildBodyText(null, { period, anchor, title })
  }
  return buildBodyText(tpl, { period, anchor, title })
}

/** 唯一的写路径。返回 'opened' | 'created' | 'badpath' | 'readfail' | 'writefail' | 'verifyfail' */
function ensureAndOpen(period, anchor) {
  return enqueueWrite(() => ensureAndOpenInner(period, anchor))
}
async function ensureAndOpenInner(period, anchor) {
  const path = resolvePath(patternOf(period), period, anchor)
  const bad = illegalCharOf(path)
  if (bad) { say(t('msgIllegalChar', { ch: bad, path }), { level: 'error' }); return 'badpath' }
  if (!isSafeVaultPath(path)) { say(t('msgBadPath', { path }), { level: 'error' }); return 'badpath' }

  const st = await probe(path)
  if (st.st === 'error') {
    // ⚠️ P0:读失败绝不折叠成「还没有数据」。折叠的下一步就是写一份只有标题的新日记,
    //    盖掉用户已经写了一整天的那篇。
    try { console.warn('[journal-desk] readFile failed, aborting', path, st.msg) } catch { /* ignore */ }
    say(t('msgReadFail', { path, msg: st.msg }), { level: 'error', sticky: true })
    return 'readfail'
  }
  if (st.st === 'exists') {
    openPath(path)
    logActivity('open', { period, path })
    if (st.active) say(t('msgOpened', { path }), { level: 'info' })
    refreshStatus()
    return 'opened'
  }

  const body = await buildBody(period, anchor, path)
  try { await ctx.app.writeFile(path, body) } catch (e) {
    say(t('msgWriteFail', { path, msg: errText(e) }), { level: 'error' })
    return 'writefail'
  }
  // 写后读回自校验:硬判据只有「文件在不在」;逐字节不等是可预期的(宿主可能规范化换行),
  // 判红会变成天天假红 —— 但必须让用户知道。
  let back = null
  try { back = await ctx.app.readFile(path) } catch { back = null }
  if (back == null) {
    try { console.warn('[journal-desk] write verification failed: read-back returned null', path) } catch { /* ignore */ }
    say(t('msgWriteFail', { path, msg: '' }), { level: 'error' })
    return 'verifyfail'
  }
  if (back !== body) say(t('msgVerifyWarn', { path }), { level: 'warning' })

  openPath(path)
  logActivity('create', { period, path })
  say(t('msgCreated', { path }), { level: 'success' })
  // 刚落盘的这天:宿主 listPages 有 1.5s 短缓存,枚举一时看不见它。记一笔「待枚举」,
  // 让日历当场就点上 —— 纯派生态、不落盘,且枚举一旦真的看见它就把这笔勾销(见 loadMarks)。
  // ⚠️ 两行同一道闸:`lastMarks` 是「哪天写了**日记**」这个用户可见判据的数据源。周 anchor = ISO 周一、
  //    月/季 anchor = 月首、年 anchor = 1 月 1 日 —— 在那些日子里 anchor === todayKey(),
  //    把它们塞进去会让状态栏当场谎报「✓ 今天」而当天的日记根本不存在(每年约 60 天)。
  if (period === 'day') {
    pendingMarks.add(anchor)
    if (lastMarks) lastMarks.add(anchor)
  }
  refreshStatus()
  refreshViews()
  return 'created'
}

// ══════════════════════════════════════════════════════════════════════════
// 6. 「哪天写了」——每次从笔记路径现算,不落任何 sidecar
// ══════════════════════════════════════════════════════════════════════════
let lastMarks = null
/** 本次会话里刚建好、但宿主枚举还没追上的日子(读回自校验通过才进来)。枚举看见即勾销。 */
const pendingMarks = new Set()
async function loadMarks() {
  const pat = patternOf('day')
  const diag = patternDiag(pat, 'day')
  const parsed = diag === 'ok' ? parsePatternToRegex(pat, 'day') : null
  if (!parsed) { lastMarks = null; return { marks: null, enumOk: false, diag } }
  if (!ctx.app || typeof ctx.app.listPages !== 'function') { lastMarks = null; return { marks: null, enumOk: false, diag: 'ok' } }
  let pages = []
  try { pages = (await ctx.app.listPages()) || [] } catch { pages = [] }
  const marks = markedDays(pages, parsed)
  pendingMarks.forEach((k) => {
    if (marks.has(k)) pendingMarks.delete(k) // 枚举追上了 → 勾销这笔,之后一切以枚举为准
    else marks.add(k)
  })
  lastMarks = marks
  return { marks, enumOk: pages.length > 0 || pendingMarks.size > 0, diag: 'ok' }
}

// ══════════════════════════════════════════════════════════════════════════
// 7. 主题:先吃宿主 token,再回退派生。强调色上的字绝不写死 #fff。
// ══════════════════════════════════════════════════════════════════════════
function parseColor(s) {
  const v = String(s == null ? '' : s).trim()
  if (!v) return null
  let m = /^#([0-9a-f]{3})$/i.exec(v)
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1]
  m = /^#([0-9a-f]{6})$/i.exec(v)
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1]
  m = /^rgba?\(([^)]+)\)$/i.exec(v)
  if (m) {
    const q = m[1].split(',').map((x) => parseFloat(x))
    if (q.length >= 3 && q.every((x) => isFinite(x))) return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]
  }
  return null
}
function relL(c) {
  const g = (x) => { const u = x / 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4) }
  return 0.2126 * g(c[0]) + 0.7152 * g(c[1]) + 0.0722 * g(c[2])
}
function contrastOf(a, b) {
  const x = relL(a)
  const y = relL(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** 半透明色压到不透明底上 —— 对比度探针要沿 DOM 找不透明祖先,自己先算好省得它猜白底。 */
function over(fg, bg) {
  const a = fg[3] == null ? 1 : fg[3]
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)]
}
const rgbStr = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
/** 把 fg 朝 text 方向挪,直到与 bg 的对比度达标(min 默认 3,门禁红线是 2.5)。 */
function readableOn(fg, bg, text, min) {
  const want = min == null ? 3 : min
  let c = [fg[0], fg[1], fg[2]]
  for (let i = 0; i < 14 && contrastOf(c, bg) < want; i++) c = c.map((v, k) => v + (text[k] - v) * 0.18)
  return c
}
function syncTheme(rootEl) {
  if (typeof getComputedStyle === 'undefined') return
  let cs = null
  try { cs = getComputedStyle(rootEl) } catch { return }
  if (!cs) return
  const tok = (n) => ((cs.getPropertyValue && cs.getPropertyValue(n)) || '').trim()
  const textc = parseColor(tok('--text')) || parseColor(cs.color) || [28, 28, 28, 1]
  const dark = relL(textc) > 0.5
  const bgc = parseColor(tok('--bg')) || (dark ? [42, 41, 43, 1] : [248, 247, 246, 1])
  const surfc = over(parseColor(tok('--bg-card')) || (dark ? [53, 53, 56, 1] : [253, 253, 252, 1]), bgc)
  const accent = parseColor(tok('--accent')) || (dark ? [248, 247, 246, 1] : [28, 28, 28, 1])
  const soft = over(parseColor(tok('--accent-light')) || [accent[0], accent[1], accent[2], dark ? 0.16 : 0.08], surfc)
  const mutedRaw = parseColor(tok('--text-muted')) || [textc[0], textc[1], textc[2], 0.62]
  const set = (k, v) => { try { rootEl.style.setProperty('--jd-' + k, v) } catch { /* ignore */ } }
  set('bg', rgbStr(bgc))
  set('surf', rgbStr(surfc))
  set('text', rgbStr(over(textc, bgc)))
  set('muted', rgbStr(readableOn(over(mutedRaw, bgc), bgc, over(textc, bgc), 3)))
  set('border', tok('--border') || rgbStr(over([textc[0], textc[1], textc[2], 0.16], bgc)))
  set('accent', rgbStr(readableOn(accent, bgc, over(textc, bgc), 3)))
  set('accent-soft', rgbStr(soft))
  set('accent-ink', rgbStr(readableOn(accent, soft, over(textc, bgc), 3.5)))
  try { rootEl.style.colorScheme = dark ? 'dark' : 'light' } catch { /* ignore */ }
}
function themeObserver(rootEl) {
  syncTheme(rootEl)
  let stop = () => {}
  try {
    if (typeof MutationObserver !== 'undefined') {
      const ob = new MutationObserver(() => syncTheme(rootEl))
      for (let n = rootEl.parentElement; n; n = n.parentElement) {
        ob.observe(n, { attributes: true, attributeFilter: ['class', 'data-mode', 'data-theme', 'data-skin', 'style'] })
      }
      stop = () => ob.disconnect()
    }
  } catch { /* ignore */ }
  return stop
}

const STYLE = `
.jd-root{height:100%;min-height:0;overflow:auto;color:var(--jd-text,var(--text,#1c1c1c));background:var(--jd-bg,var(--bg,#f8f7f6));font-size:13px;line-height:1.5}
.jd-root *{box-sizing:border-box}
.jd-wrap{max-width:660px;margin:0 auto;padding:18px 20px 40px;display:flex;flex-direction:column;gap:12px}
.jd-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.jd-nav{display:flex;align-items:center;gap:6px}
.jd-per{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.jd-month{min-width:126px;text-align:center;font-size:14px;font-weight:600;color:var(--jd-text,var(--text,#1c1c1c))}
.jd-btn{padding:4px 11px;font:inherit;font-size:12px;color:var(--jd-text,var(--text,#1c1c1c));border:1px solid var(--jd-border,var(--border,#eae9e7));border-radius:9px;background:var(--jd-surf,var(--bg-card,#fdfdfc));cursor:pointer;white-space:nowrap}
.jd-btn:hover{border-color:var(--jd-accent,var(--accent,#1c1c1c))}
.jd-btn.on{background:var(--jd-accent-soft,var(--accent-light,#eee));border-color:transparent;color:var(--jd-accent-ink,var(--accent,#1c1c1c))}
.jd-path{font-size:11.5px;color:var(--jd-muted,var(--text-muted,#5f5f5d));word-break:break-all}
.jd-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.jd-wd{text-align:center;font-size:11px;color:var(--jd-muted,var(--text-muted,#5f5f5d));padding:2px 0}
.jd-cell{position:relative;height:46px;border:1px solid transparent;border-radius:10px;background:var(--jd-surf,var(--bg-card,#fdfdfc));color:var(--jd-text,var(--text,#1c1c1c));font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0}
.jd-cell:hover{border-color:var(--jd-accent,var(--accent,#1c1c1c))}
.jd-cell.out{background:var(--jd-bg,var(--bg,#f8f7f6));color:var(--jd-muted,var(--text-muted,#5f5f5d));opacity:.82}
.jd-cell.today{background:var(--jd-accent-soft,var(--accent-light,#eee));color:var(--jd-accent-ink,var(--accent,#1c1c1c));font-weight:600}
.jd-num{font-size:13px;line-height:1.1}
.jd-dot{width:6px;height:6px;border-radius:50%;background:var(--jd-accent,var(--accent,#1c1c1c));display:block}
.jd-spacer{width:6px;height:6px;display:block}
.jd-foot{font-size:11.5px;color:var(--jd-muted,var(--text-muted,#5f5f5d))}
`

// ══════════════════════════════════════════════════════════════════════════
// 8. 视图:一张「哪天写了」的月历
// ══════════════════════════════════════════════════════════════════════════
function mk(tag, cls, text) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = String(text)
  return n
}
function monthLabelOf(ym) {
  const y = Number(ym.slice(0, 4))
  const mo = Number(ym.slice(5, 7))
  const name = L() === 'zh' ? String(mo) : (EN_MONTHS[mo - 1] || String(mo))
  return t('monthLabel', { y: pad4(y), m: name })
}
function shiftMonth(ym, delta) {
  return monthShift(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), delta).slice(0, 7)
}

const views = new Set()
function refreshViews() {
  views.forEach((v) => { try { v.refresh() } catch { /* ignore */ } })
}
function rerenderViews() {
  views.forEach((v) => { try { v.rerender() } catch { /* ignore */ } })
}

function createCalendar(host) {
  let cursor = todayKey().slice(0, 7) // 纯 UI 游标,闭包变量:切语言重建整树时必须活下来
  let alive = true
  let marks = { marks: null, enumOk: false, diag: 'ok' }

  const root = mk('div', 'jd-root')
  const styleEl = mk('style', null, STYLE)
  root.appendChild(styleEl)
  const wrap = mk('div', 'jd-wrap')
  root.appendChild(wrap)
  host.appendChild(root)

  function button(label, title, cls, onClick) {
    const b = mk('button', 'jd-btn' + (cls ? ' ' + cls : ''), label)
    b.setAttribute('type', 'button')
    if (title) b.setAttribute('title', title)
    b.addEventListener('click', onClick)
    return b
  }
  function footText(n) {
    if (marks.diag === 'const') return t('noMarks') + ' — ' + t('msgConstPattern', { period: t('pDay') })
    if (marks.diag === 'bad') return t('noMarks') + ' — ' + t('msgUnparseable', { period: t('pDay') })
    if (!marks.enumOk) return t('noVaultEnum')
    return t('countThisMonth', { n: String(n) })
  }
  function render() {
    wrap.textContent = ''
    const top = mk('div', 'jd-top')
    const nav = mk('div', 'jd-nav')
    nav.appendChild(button('◀', t('prevMonth'), null, () => { cursor = shiftMonth(cursor, -1); render() }))
    nav.appendChild(mk('div', 'jd-month', monthLabelOf(cursor)))
    nav.appendChild(button('▶', t('nextMonth'), null, () => { cursor = shiftMonth(cursor, 1); render() }))
    nav.appendChild(button(t('today'), t('today'), 'on', () => {
      cursor = todayKey().slice(0, 7)
      render()
      void ensureAndOpen('day', todayKey())
    }))
    top.appendChild(nav)
    const per = mk('div', 'jd-per')
    const quick = [['week', 'thisWeek'], ['month', 'thisMonth'], ['quarter', 'thisQuarter'], ['year', 'thisYear']]
    for (let i = 0; i < quick.length; i++) {
      const period = quick[i][0]
      const key = quick[i][1]
      // 顶部四个周期按钮恒相对「今天」,与命令面板的 -week / -month 完全同义。
      per.appendChild(button(t(key), t(key), null, () => { void ensureAndOpen(period, anchorOf(period, todayKey())) }))
    }
    top.appendChild(per)
    wrap.appendChild(top)

    // 路径预览只显示 day 那一条(周/月/季/年的默认路径含中文目录名,一并显示会顶破英文界面的中文比例)
    wrap.appendChild(mk('div', 'jd-path', t('todayPath', { path: resolvePath(patternOf('day'), 'day', todayKey()) })))

    const head = mk('div', 'jd-grid')
    for (let i = 1; i <= 7; i++) head.appendChild(mk('div', 'jd-wd', t('wd' + i)))
    wrap.appendChild(head)

    const grid = mk('div', 'jd-grid')
    const cells = monthGrid(cursor)
    const tk = todayKey()
    let n = 0
    for (let i = 0; i < cells.length; i++) {
      const k = cells[i]
      const inMonth = k.slice(0, 7) === cursor
      const marked = !!(marks.marks && marks.marks.has(k))
      if (inMonth && marked) n++
      let cls = 'jd-cell'
      if (!inMonth) cls += ' out'
      if (k === tk) cls += ' today'
      const cell = mk('button', cls)
      cell.setAttribute('type', 'button')
      cell.setAttribute('title', k)
      cell.appendChild(mk('span', 'jd-num', String(Number(k.slice(8, 10)))))
      cell.appendChild(mk('span', marked ? 'jd-dot' : 'jd-spacer'))
      cell.addEventListener('click', () => {
        // 非本月补格:只切月,不建任何文件(防误建)
        if (!inMonth) { cursor = k.slice(0, 7); render(); return }
        void ensureAndOpen('day', k)
      })
      grid.appendChild(cell)
    }
    wrap.appendChild(grid)
    wrap.appendChild(mk('div', 'jd-foot', footText(n)))
  }
  function refreshMarks() {
    loadMarks().then((s) => {
      if (!alive) return
      marks = s
      render()
      refreshStatus() // 日历刚重算过「哪天写了日记」,状态栏必须同源(否则要再切一次笔记才纠得回来)
    }, () => { /* loadMarks 自己吞了异常,这里只是兜底 */ })
  }

  render()
  refreshMarks()
  const stopTheme = themeObserver(root)

  return {
    rerender() { if (alive) render() },
    refresh() { if (alive) refreshMarks() },
    dispose() {
      alive = false
      try { stopTheme() } catch { /* ignore */ }
      try { if (root.remove) root.remove() } catch { /* ignore */ }
    },
  }
}

// ⚠️ 两条源码级硬要求,违反了插件本身完全正常、但批次门禁的 Space 解析会当场判红,极难自查:
//    ① `id` 必须是 registerView({…}) 对象字面量的**第一个键** —— 门禁用
//       /registerView\(\s*\{[^}]*?id\s*:\s*['"]([\w-]+)['"]/ 从源码里扫视图名,
//       `[^}]*?` 意味着 registerView({ 与 id: 之间不许出现任何 `}`(把 mount(el){…} 写在前面就完了)。
//    ② `id` 的值必须是**字面量字符串**,不能写成 `id: VIEW_ID` —— 那个正则只认引号里的名字。
if (ctx.registerView) {
  ctx.registerView({
    id: 'calendar',
    title: t('viewTitle'),
    mount(el) {
      const inst = createCalendar(el)
      views.add(inst)
      return () => {
        views.delete(inst)
        inst.dispose()
      }
    },
  })
}

// ══════════════════════════════════════════════════════════════════════════
// 9. 状态栏(事件驱动,零轮询)
// ══════════════════════════════════════════════════════════════════════════
let statusHandle = null
function todayPathNow() {
  return resolvePath(patternOf('day'), 'day', todayKey())
}
/** 判定顺序(便宜 → 贵):活动页 → 已枚举的标记 → 没写。**绝不为状态栏单独发 readFile。** */
function statusState() {
  const path = todayPathNow()
  let done = false
  try { if (ctx.app && ctx.app.getActivePage && ctx.app.getActivePage() === path) done = true } catch { /* ignore */ }
  if (!done && lastMarks && lastMarks.has(todayKey())) done = true
  return { done, path }
}
function refreshStatus() {
  if (!statusHandle || !statusHandle.update) return
  const s = statusState()
  try {
    statusHandle.update({
      text: s.done ? t('stDone') : t('stTodo'),
      title: t(s.done ? 'stDoneTitle' : 'stTodoTitle', { path: s.path }),
    })
  } catch { /* ignore */ }
}
{
  const s0 = statusState()
  const item = {
    id: 'today',
    side: 'right',
    text: s0.done ? t('stDone') : t('stTodo'),
    title: t(s0.done ? 'stDoneTitle' : 'stTodoTitle', { path: s0.path }),
    // 点击那一刻重新走完整三态探测,绝不信显示态。
    onClick() { void ensureAndOpen('day', todayKey()) },
  }
  statusHandle = ctx.registerStatusItem ? ctx.registerStatusItem(item) : null
}

// ══════════════════════════════════════════════════════════════════════════
// 10. 命令
// ══════════════════════════════════════════════════════════════════════════
/** prev / next 的粒度跟随**当前打开的这篇**;认不出来才回落到「今天的日/前后一天」。 */
async function step(dir) {
  let active = null
  try { active = ctx.app && ctx.app.getActivePage ? ctx.app.getActivePage() : null } catch { active = null }
  const cur = currentPeriodOf(active || '', allPatterns())
  if (cur) return ensureAndOpen(cur.period, neighborAnchor(cur.period, cur.anchor, dir))
  return ensureAndOpen('day', neighborAnchor('day', todayKey(), dir))
}

const COMMANDS = [
  ['journal-desk-open', 'cmdOpen', () => {
    if (ctx.registerView && ctx.openView) ctx.openView(VIEW_ID)
    else say(t('msgNoView'), { level: 'warning' })
  }],
  ['journal-desk-today', 'cmdToday', () => { void ensureAndOpen('day', todayKey()) }],
  ['journal-desk-prev', 'cmdPrev', () => { void step(-1) }],
  ['journal-desk-next', 'cmdNext', () => { void step(1) }],
  ['journal-desk-week', 'cmdWeek', () => { void ensureAndOpen('week', anchorOf('week', todayKey())) }],
  ['journal-desk-month', 'cmdMonth', () => { void ensureAndOpen('month', anchorOf('month', todayKey())) }],
]
for (let i = 0; i < COMMANDS.length; i++) {
  const row = COMMANDS[i]
  if (ctx.registerCommand) ctx.registerCommand({ id: row[0], title: t(row[1]), run: row[2] })
}

// ══════════════════════════════════════════════════════════════════════════
// 11. 设置(10 条,顺序即详情页顺序;default 一律钉死中文常量)
// ══════════════════════════════════════════════════════════════════════════
const SETTINGS = [
  ['dayPath', 'setDayPath', 'setPathDesc', DEFAULT_PATH.day],
  ['dayTemplate', 'setDayTpl', 'setTplDesc', ''],
  ['weekPath', 'setWeekPath', 'setPathDesc', DEFAULT_PATH.week],
  ['weekTemplate', 'setWeekTpl', 'setTplDesc', ''],
  ['monthPath', 'setMonthPath', 'setPathDesc', DEFAULT_PATH.month],
  ['monthTemplate', 'setMonthTpl', 'setTplDesc', ''],
  ['quarterPath', 'setQuarterPath', 'setPathDesc', DEFAULT_PATH.quarter],
  ['quarterTemplate', 'setQuarterTpl', 'setTplDesc', ''],
  ['yearPath', 'setYearPath', 'setPathDesc', DEFAULT_PATH.year],
  ['yearTemplate', 'setYearTpl', 'setTplDesc', ''],
]
for (let i = 0; i < SETTINGS.length; i++) {
  const s = SETTINGS[i]
  if (ctx.registerSetting) {
    ctx.registerSetting({ key: s[0], label: t(s[1]), type: 'text', default: s[3], description: t(s[2]) })
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 12. 订阅 + 跨午夜定时器(禁 setInterval)
// ══════════════════════════════════════════════════════════════════════════
const offLocale = ctx.subscribeLocale ? ctx.subscribeLocale(() => { rerenderViews(); refreshStatus() }) : null

let lastSeenPath = null
let offPage = null
if (ctx.app && typeof ctx.app.subscribePage === 'function') {
  // ⚠️ 回调里**只读 page.path** —— 本插件与块模型零接触。
  try {
    offPage = ctx.app.subscribePage((page) => {
      const p = page ? page.path : null
      if (p === lastSeenPath) return
      lastSeenPath = p
      refreshStatus()
    })
  } catch { offPage = null }
}

let midnightTimer = null
function scheduleMidnight() {
  const d = new Date(Date.now())
  const next = new Date(2000, 0, 1, 0, 0, 5, 0)
  next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  let delay = next.getTime() - Date.now()
  if (!isFinite(delay) || delay < 1000) delay = 1000
  if (delay > 26 * 3600 * 1000) delay = 26 * 3600 * 1000
  midnightTimer = setTimeout(() => {
    midnightTimer = null
    refreshStatus()
    rerenderViews()
    refreshViews()
    scheduleMidnight()
  }, delay)
}
scheduleMidnight()

// setup 后刷一次(listPages 有宿主自带的 single-flight + 1.5s 缓存,不再自造一层)
loadMarks().then(() => { refreshStatus() }, () => { /* ignore */ })
refreshStatus()

// ══════════════════════════════════════════════════════════════════════════
// 13. 测试钩子(仅当宿主外的自检预先建好这个对象时才填充,生产不留全局)
// ══════════════════════════════════════════════════════════════════════════
try {
  const hook = typeof globalThis !== 'undefined' ? globalThis.__JOURNAL_TEST__ : null
  if (hook) {
    Object.assign(hook, {
      MSG,
      PERIODS,
      DEFAULT_PATH,
      dayKeyOf, daySerial, serialToKey, shiftDays, dowOfSerial,
      isoWeekOf, isoWeekStartOf, isoWeekStartFrom, quarterOf,
      anchorOf, neighborAnchor, monthShift,
      formatDate, formatPattern, resolvePath,
      isSafeVaultPath, illegalCharOf,
      parsePatternToRegex, patternDiag, matchAnchor,
      currentPeriodOf, markedDays, monthGrid, buildBodyText,
      todayKey, basenameOf, patternOf, templateOf, allPatterns,
      probe, ensureAndOpen, step, loadMarks, statusState, refreshStatus, todayPathNow,
      t, L,
    })
  }
} catch { /* ignore */ }

// ══════════════════════════════════════════════════════════════════════════
// 14. disposer —— 定时器 / 订阅 / 视图 / 状态栏全部收干净(没人代管)
// ══════════════════════════════════════════════════════════════════════════
return () => {
  if (offLocale) { try { offLocale() } catch { /* ignore */ } }
  if (offPage) { try { offPage() } catch { /* ignore */ } }
  if (midnightTimer != null) {
    try { clearTimeout(midnightTimer) } catch { /* ignore */ }
    midnightTimer = null
  }
  const list = Array.from(views)
  views.clear()
  for (let i = 0; i < list.length; i++) {
    try { list[i].dispose() } catch { /* ignore */ }
  }
  if (statusHandle && statusHandle.dispose) { try { statusHandle.dispose() } catch { /* ignore */ } }
  statusHandle = null
}
