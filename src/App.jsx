import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Menu, Pencil, Plus, Sparkles, Trash2, UserRound, Wallet, X } from 'lucide-react'
import deck from './data/dailyDeck.json'
import cet4 from './data/cet4.json'
import google20k from './data/google-20k.txt?raw'
import './App.css'

const nav = [
  ['profile', '个人主页', UserRound],
  ['words', '每日单词速记', BookOpen],
  ['tasks', '每日任务', Check],
  ['books', '记账', Wallet],
]

const fallbackTasks = {
  '2026-09-02': [
    { id: 1, text: '学习 AI 基础概念', done: false },
    { id: 2, text: '完成一组数据分析练习', done: false },
    { id: 3, text: '整理今天的学习笔记', done: false },
  ],
}

const dailyPhrases = deck.phrases || []
const bookCategories = ['餐饮', '衣物', '出行', '居住', '日用', '学习', '医疗', '娱乐', '人情', '其他']
const WORD_BATCH_SIZE = 20
const REVIEW_OPTION_COUNT = 3
const WORD_SESSION_KEY = 'xyw-word-session-v5'
const BASIC_WORDS = new Set('a an and are as at be by for from have i in is it of on or the to was we with you'.split(' '))
const GOOGLE_RANK = new Map(
  google20k
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .map((word, index) => [word, index])
)
const cet4Entries = Array.isArray(cet4) ? cet4 : Array.isArray(cet4?.default) ? cet4.default : []
const deckWordEntries = Array.isArray(deck.top20) ? deck.top20 : []

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeMeaning(item) {
  const meanings = (item.translations || [])
    .map((translation) => translation.translation)
    .filter(Boolean)
  return meanings.join('；') || '暂无释义'
}

function normalizePhrases(item) {
  return (item.phrases || []).slice(0, 3).map((phrase) => ({
    phrase: phrase.phrase,
    translation: phrase.translation,
  }))
}

function seedHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffleWithSeed(items, seed) {
  const values = [...items]
  let state = seedHash(seed) || 1
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0
    const swap = state % (index + 1)
    ;[values[index], values[swap]] = [values[swap], values[index]]
  }
  return values
}

const wordPool = (() => {
  const unique = new Map()
  for (const item of [...cet4Entries, ...deckWordEntries]) {
    if (!item?.word) continue
    const word = String(item.word).trim().toLowerCase()
    if (!word || unique.has(word)) continue
    unique.set(word, {
      id: word,
      word,
      phonetic: item.phonetic || '',
      meaning: normalizeMeaning(item),
      example: item.example || '暂无英文例句',
      exampleTranslation: item.exampleTranslation || '例句翻译待补充',
      phrases: normalizePhrases(item),
      rank: GOOGLE_RANK.get(word) ?? 999999,
    })
  }

  return [...unique.values()]
    .filter((item) => item.rank > 200 && !BASIC_WORDS.has(item.word))
    .sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word, 'en'))
})()

function safeCursor(value, poolLength = wordPool.length) {
  const parsed = Number(value)
  if (!poolLength || !Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed)) % poolLength
}

function pickWordBatch(pool, startIndex, size = WORD_BATCH_SIZE) {
  if (!pool.length) return { words: [], nextCursor: 0 }

  const batch = []
  let cursor = safeCursor(startIndex, pool.length)
  let safety = 0
  while (batch.length < size && safety < pool.length * 2) {
    const candidate = pool[cursor]
    if (candidate && !batch.some((item) => item.id === candidate.id)) {
      batch.push({ ...candidate, status: 'new' })
    }
    cursor = (cursor + 1) % pool.length
    safety += 1
  }

  return { words: batch, nextCursor: cursor }
}

function buildInitialWordSession(todayKey) {
  const stored = readJson(WORD_SESSION_KEY, null)
  const learnedIds = Array.isArray(stored?.learnedIds) ? stored.learnedIds : []
  const cursor = safeCursor(stored?.cursor)
  const currentDate = stored?.sessionDate || todayKey
  const sameDay = currentDate === todayKey && Array.isArray(stored?.words) && stored.words.length >= WORD_BATCH_SIZE

  if (sameDay) return stored

  const batch = pickWordBatch(wordPool, cursor)
  return {
    sessionDate: todayKey,
    cursor: batch.nextCursor,
    learnedIds,
    words: batch.words,
    reviewIndex: 0,
    reviewChoice: null,
    reviewState: 'idle',
    reviewFinished: false,
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [active, setActive] = useState('tasks')
  const [drawer, setDrawer] = useState(false)
  const [days, setDays] = useState(() => readJson('xyw-days', fallbackTasks))
  const [selectedDate, setSelectedDate] = useState(() => Object.keys(readJson('xyw-days', fallbackTasks)).sort()[0] || '2026-09-02')
  const [wordSession, setWordSession] = useState(() => buildInitialWordSession(localDateKey()))
  const [profile, setProfile] = useState(() => readJson('xyw-profile', { nickname: '小遥', birthday: '', direction: '数据分析 / AI 应用', intro: '正在学习 Excel、SQL、Python 与 AI，目标是进入数据分析方向。' }))
  const [books, setBooks] = useState(() => readJson('xyw-books', [
    { id: 1, type: 'expense', date: '2026-09-02', category: '餐饮', note: '午饭', amount: 18 },
  ]))
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [editing, setEditing] = useState(null)
  const [touchStart, setTouchStart] = useState(null)
  const [bookForm, setBookForm] = useState({ type: 'expense', date: '2026-09-02', category: '餐饮', note: '', amount: '' })
  const [bookMonth, setBookMonth] = useState('2026-09')
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState(() => readJson('xyw-monthly-budget-v2', {}))
  const [budgetDraft, setBudgetDraft] = useState('')
  const [editingBudget, setEditingBudget] = useState(false)

  const title = nav.find(([id]) => id === active)[1]
  const dateKeys = useMemo(() => Object.keys(days).sort(), [days])
  const currentTasks = days[selectedDate] || []

  useEffect(() => {
    localStorage.setItem('xyw-days', JSON.stringify(days))
  }, [days])

  useEffect(() => {
    localStorage.setItem('xyw-profile', JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    localStorage.setItem('xyw-books', JSON.stringify(books))
  }, [books])

  useEffect(() => {
    localStorage.setItem('xyw-monthly-budget-v2', JSON.stringify(monthlyBudget))
  }, [monthlyBudget])

  useEffect(() => {
    const todayKey = localDateKey()
    setWordSession((current) => {
      if (current.sessionDate === todayKey && Array.isArray(current.words) && current.words.length) return current
      return buildInitialWordSession(todayKey)
    })
  }, [])

  useEffect(() => {
    if (!wordPool.length) return
    if (wordSession.words && wordSession.words.length >= WORD_BATCH_SIZE) return
    const batch = pickWordBatch(wordPool, safeCursor(wordSession.cursor))
    setWordSession((current) => ({
      ...current,
      sessionDate: localDateKey(),
      cursor: batch.nextCursor,
      words: batch.words,
      reviewIndex: 0,
      reviewChoice: null,
      reviewState: 'idle',
      reviewFinished: false,
    }))
  }, [wordSession.words, wordSession.cursor, wordSession.learnedIds])

  useEffect(() => {
    localStorage.setItem(WORD_SESSION_KEY, JSON.stringify(wordSession))
  }, [wordSession])

  const saveDays = (next) => setDays(next)
  const saveProfile = (next) => setProfile(next)
  const saveBooks = (next) => setBooks(next)

  const moveDay = (step) => {
    const index = dateKeys.indexOf(selectedDate)
    const next = dateKeys[index + step]
    if (next) setSelectedDate(next)
  }

  const changeBookMonth = (step) => {
    const date = new Date(`${bookMonth}-01T12:00:00`)
    date.setMonth(date.getMonth() + step)
    const nextMonth = date.toISOString().slice(0, 7)
    const nextDaysInMonth = new Date(
      Number(nextMonth.slice(0, 4)),
      Number(nextMonth.slice(5, 7)),
      0
    ).getDate()
    const nextDay = Math.min(selectedDay, nextDaysInMonth)
    setBookMonth(nextMonth)
    setBookForm((current) => ({
      ...current,
      date: `${nextMonth}-${String(nextDay).padStart(2, '0')}`,
    }))
  }

  const toggleTask = (id) => {
    const nextTasks = currentTasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    const nextDays = { ...days, [selectedDate]: nextTasks }
    saveDays(nextDays)
    if (nextTasks.length && nextTasks.every((item) => item.done)) {
      const next = dateKeys[dateKeys.indexOf(selectedDate) + 1]
      if (next) setTimeout(() => setSelectedDate(next), 220)
    }
  }

  const currentWords = wordSession.words || []
  const currentWordCount = currentWords.filter((word) => word.status === 'known' || word.status === 'remembered').length
  const allWordsLearned = currentWords.length > 0 && currentWords.every((word) => word.status === 'known' || word.status === 'remembered')

  const updateWordSession = (updater) => {
    setWordSession((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater
      return next
    })
  }

  const updateWordStatus = (wordId, status) => {
    updateWordSession((current) => {
      const words = current.words.map((item) => (item.id === wordId ? { ...item, status } : item))
      const learnedIds = new Set(current.learnedIds || [])
      if (status === 'known' || status === 'remembered') learnedIds.add(wordId)
      return {
        ...current,
        words,
        learnedIds: [...learnedIds],
      }
    })
  }

  const refreshWordBatch = () => {
    updateWordSession((current) => {
      const nextBatch = pickWordBatch(wordPool, safeCursor(current.cursor))
      return {
        ...current,
        sessionDate: localDateKey(),
        cursor: nextBatch.nextCursor,
        words: nextBatch.words,
        reviewIndex: 0,
        reviewChoice: null,
        reviewState: 'idle',
        reviewFinished: false,
      }
    })
  }

  const openReview = () => {
    if (!allWordsLearned) return
    updateWordSession((current) => ({
      ...current,
      reviewIndex: 0,
      reviewChoice: null,
      reviewState: 'quiz',
      reviewFinished: false,
    }))
  }

  const closeReview = () => {
    updateWordSession((current) => ({
      ...current,
      reviewState: 'idle',
      reviewIndex: 0,
      reviewChoice: null,
      reviewFinished: false,
    }))
  }

  const finishReview = (mode) => {
    if (mode === 'refresh') {
      refreshWordBatch()
      return
    }
    closeReview()
  }

  const currentReviewIndex = wordSession.reviewIndex || 0
  const reviewOpen = wordSession.reviewState !== 'idle'
  const currentReviewWord = currentWords[currentReviewIndex]
  const reviewOptions = useMemo(() => {
    if (!currentReviewWord) return []
    const seed = `${wordSession.sessionDate}-${currentReviewWord.id}-${currentReviewIndex}`
    const distractors = []
    for (const candidate of wordPool) {
      if (candidate.id === currentReviewWord.id) continue
      if (candidate.meaning === currentReviewWord.meaning) continue
      if (distractors.includes(candidate.meaning)) continue
      distractors.push(candidate.meaning)
      if (distractors.length === REVIEW_OPTION_COUNT - 1) break
    }
    return shuffleWithSeed([currentReviewWord.meaning, ...distractors], seed)
  }, [currentReviewIndex, currentReviewWord, wordSession.sessionDate])

  const changeAvatar = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => saveProfile({ ...profile, avatar: reader.result })
    reader.readAsDataURL(file)
  }

  const parseImport = () => {
    const lines = importText.split(/\r?\n/).map((line) => line.trim())
    const datePattern = /^(?:\*{0,2})?(\d{1,2})月(\d{1,2})日(?:\s*-\s*(\d{1,2})月(\d{1,2})日)?(?:\*{0,2})?$/
    const nextDays = {}
    let current = null
    for (const line of lines) {
      const match = line.match(datePattern)
      if (match) {
        current = `2026-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`
        nextDays[current] ||= []
        continue
      }
      if (!current || !/^[-*•]\s+/.test(line)) continue
      const text = line.replace(/^[-*•]\s+/, '').replace(/\\+$/g, '').trim()
      if (!text || /^目标[:：]/.test(text)) continue
      nextDays[current].push({ id: `${current}-${nextDays[current].length}`, text, done: false })
    }

    const validDays = Object.fromEntries(Object.entries(nextDays).filter(([, items]) => items.length))
    if (Object.keys(validDays).length) {
      const overwrite = window.confirm('是否覆盖相同日期的旧任务？点击“取消”则追加。')
      const next = { ...days }
      for (const [date, items] of Object.entries(validDays)) {
        next[date] = overwrite ? items : [...(next[date] || []), ...items]
      }
      saveDays(next)
      setSelectedDate(Object.keys(validDays)[0])
    }
    setImportText('')
    setShowImport(false)
  }

  const totalExpense = books.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const totalIncome = books.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const monthBooks = books.filter((item) => item.date.startsWith(bookMonth))
  const monthExpense = monthBooks.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const monthIncome = monthBooks.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const monthBudget = Number(monthlyBudget[bookMonth] || 0)
  const availableMoney = (monthBudget || monthIncome) - monthExpense
  const daysInMonth = new Date(Number(bookMonth.slice(0, 4)), Number(bookMonth.slice(5, 7)), 0).getDate()
  const selectedDay = Number(bookForm.date.slice(-2)) || 1

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <b>小遥工作台</b>
          <button className="close" onClick={() => setDrawer(false)}><X size={18} /></button>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button className={active === id ? 'nav active' : 'nav'} onClick={() => { setActive(id); setDrawer(false) }} key={id}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="note">求职记录<br />每天向前一点点</div>
      </aside>

      {drawer && <button className="scrim" onClick={() => setDrawer(false)} />}

      <main className="content">
        <header>
          <button className="menu" onClick={() => setDrawer(true)}><Menu /></button>
          <div><small>{selectedDate}</small><h1>{title}</h1></div>
          <button className="avatar" onClick={() => setActive('profile')}>{profile.avatar ? <img src={profile.avatar} alt="" /> : profile.nickname[0]}</button>
        </header>

        {active === 'tasks' && (
          <section className="task-page" onTouchStart={(e) => setTouchStart(e.touches[0].clientX)} onTouchEnd={(e) => {
            if (touchStart == null) return
            const distance = e.changedTouches[0].clientX - touchStart
            if (Math.abs(distance) > 45) moveDay(distance > 0 ? 1 : -1)
            setTouchStart(null)
          }}>
            <div className="row">
              <div>
                <button className="date-arrow" disabled={!dateKeys[dateKeys.indexOf(selectedDate) - 1]} onClick={() => moveDay(-1)}>‹</button>
                <b>{selectedDate}</b>
                <button className="date-arrow" disabled={!dateKeys[dateKeys.indexOf(selectedDate) + 1]} onClick={() => moveDay(1)}>›</button>
                <p>完成当天全部任务后自动进入下一天。</p>
              </div>
              <button className="primary" onClick={() => setShowImport(true)}>一键导入</button>
            </div>
            <div className="list">
              {currentTasks.map((task) => (
                <div className={`task ${task.done ? 'done' : ''}`} key={task.id}>
                  <button className="check" onClick={() => toggleTask(task.id)}>{task.done && '✓'}</button>
                  {editing === task.id ? (
                    <input
                      autoFocus
                      value={task.text}
                      onChange={(e) => saveDays({ ...days, [selectedDate]: currentTasks.map((item) => item.id === task.id ? { ...item, text: e.target.value } : item) })}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                    />
                  ) : (
                    <span onDoubleClick={() => setEditing(task.id)}>{task.text}</span>
                  )}
                  <button className="plain" onClick={() => setEditing(task.id)}><Pencil size={16} /></button>
                  <button className="plain danger" onClick={() => saveDays({ ...days, [selectedDate]: currentTasks.filter((item) => item.id !== task.id) })}><Trash2 size={16} /></button>
                </div>
              ))}
              <button className="add" onClick={() => { const id = Date.now(); saveDays({ ...days, [selectedDate]: [...currentTasks, { id, text: '新任务', done: false }] }); setEditing(id) }}>
                <Plus size={17} />添加任务
              </button>
            </div>
          </section>
        )}

        {active === 'words' && (
          <section className="word-page">
            <div className="row">
              <div>
                <p>四级高频词汇 · 今日 20 个 · 已记住 {currentWordCount}/{currentWords.length}</p>
                <small className="swipe-hint">记完可以手动刷新下一轮，第二天会自动接着往后走。</small>
              </div>
              <div className="word-toolbar">
                <button className="plain" onClick={refreshWordBatch}>刷新下一轮</button>
                <button className="primary" disabled={!allWordsLearned} onClick={openReview}>开始复盘</button>
              </div>
            </div>
            {reviewOpen ? (
              <ReviewSession
                words={currentWords}
                reviewIndex={currentReviewIndex}
                reviewState={wordSession.reviewState}
                reviewChoice={wordSession.reviewChoice}
                reviewOptions={reviewOptions}
                onClose={closeReview}
                onAnswer={(choice) => {
                  updateWordSession((current) => {
                    const nextWords = [...(current.words || [])]
                    const currentWord = nextWords[current.reviewIndex]
                    if (!currentWord) return current
                    const nextChoice = choice
                    const isLast = current.reviewIndex >= nextWords.length - 1
                    if (nextChoice === currentWord.meaning) {
                      nextWords[current.reviewIndex] = { ...currentWord, status: 'remembered' }
                    }
                    return {
                      ...current,
                      words: nextWords,
                      reviewChoice: nextChoice,
                      reviewState: isLast ? 'done' : 'quiz',
                      reviewFinished: isLast,
                    }
                  })
                }}
                onNext={() => {
                  updateWordSession((current) => ({
                    ...current,
                    reviewIndex: Math.min((current.reviewIndex || 0) + 1, Math.max((current.words || []).length - 1, 0)),
                    reviewChoice: null,
                  }))
                }}
                onRefresh={() => finishReview('refresh')}
                onEnd={() => finishReview('done')}
              />
            ) : (
              <>
                <div className="list">
                  {currentWords.map((word) => (
                    <Word
                      key={word.id}
                      word={word}
                      onStatus={(status) => updateWordStatus(word.id, status)}
                    />
                  ))}
                </div>
                <h2 className="section-title">今日高频短语 · 5 个</h2>
                <div className="list">
                  {dailyPhrases.map((item) => (
                    <article className="phrase" key={item.phrase}>
                      <b>{item.phrase}</b>
                      <p>{item.meaning}</p>
                      <i>{item.example}</i>
                      <small>{item.translation}</small>
                    </article>
                  ))}
                </div>
                <button className="primary full review-button" disabled={!allWordsLearned} onClick={openReview}>
                  {allWordsLearned ? '全部记住，开始复盘' : '先记完当前 20 个'}
                </button>
              </>
            )}
          </section>
        )}

        {active === 'profile' && (
          <section>
            <div className="profile-title">
              <label className="avatar-picker">
                <span className="big-avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : profile.nickname[0]}</span>
                <input type="file" accept="image/*" onChange={changeAvatar} />
                <small>更换头像</small>
              </label>
              <div><h2>{profile.nickname}</h2><p>个人主页</p></div>
            </div>
            <div className="form">
              {[
                ['昵称', 'nickname'],
                ['出生日期', 'birthday'],
                ['求职方向', 'direction'],
              ].map(([label, key]) => (
                <label key={key}>
                  {label}
                  <input
                    type={key === 'birthday' ? 'date' : 'text'}
                    value={profile[key]}
                    onChange={(e) => saveProfile({ ...profile, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>自我介绍<textarea value={profile.intro} onChange={(e) => saveProfile({ ...profile, intro: e.target.value })} /></label>
            </div>
          </section>
        )}

        {active === 'books' && (
          <section className="books-page">
            <div className="row">
              <div>
                <p>记账 · 按月查看你的每一笔</p>
              </div>
            </div>
            <div className="month-bar">
              <button className="date-arrow" onClick={() => changeBookMonth(-1)}>‹</button>
              <input className="month-input" type="month" value={bookMonth} onChange={(e) => {
                const nextMonth = e.target.value
                const nextDaysInMonth = new Date(
                  Number(nextMonth.slice(0, 4)),
                  Number(nextMonth.slice(5, 7)),
                  0
                ).getDate()
                setBookMonth(nextMonth)
                setBookForm({
                  ...bookForm,
                  date: `${nextMonth}-${String(Math.min(selectedDay, nextDaysInMonth)).padStart(2, '0')}`,
                })
              }} />
              <button className="date-arrow" onClick={() => changeBookMonth(1)}>›</button>
            </div>
            <div className="money-summary">
              <button
                className={`money-summary-item ${monthlyBudget[bookMonth] && !editingBudget ? 'is-editable' : ''}`}
                onClick={() => {
                  if (monthlyBudget[bookMonth]) {
                    setBudgetDraft(String(monthBudget))
                    setEditingBudget(true)
                  }
                }}
              >
                <small>本月生活费 / 收入</small>
                <b className="income-text">+{(monthBudget || monthIncome).toFixed(2)}</b>
              </button>
              <div><small>本月支出</small><b className="expense-text">-{monthExpense.toFixed(2)}</b></div>
              <div><small>本月可用余额</small><b className={availableMoney < 0 ? 'expense-text' : 'income-text'}>{availableMoney.toFixed(2)}</b></div>
            </div>
            <div className="book-form">
              <select value={bookForm.type} onChange={(e) => setBookForm({ ...bookForm, type: e.target.value })}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
              <select
                className="day-select"
                value={selectedDay <= daysInMonth ? selectedDay : 1}
                onChange={(e) => setBookForm({ ...bookForm, date: `${bookMonth}-${String(Number(e.target.value)).padStart(2, '0')}` })}
              >
                {Array.from({ length: daysInMonth }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1} 日</option>)}
              </select>
              <div className="book-categories">
                {bookCategories.map((category) => (
                  <button
                    className={bookForm.category === category ? 'book-category active' : 'book-category'}
                    onClick={() => setBookForm({ ...bookForm, category })}
                    key={category}
                  >
                    {category}
                  </button>
                ))}
                <button className="book-category add-category" onClick={() => setCustomCategoryOpen(!customCategoryOpen)}>＋ 添加</button>
              </div>
              {customCategoryOpen && <input placeholder="输入自定义分类名称" value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} />}
              <input placeholder="金额" inputMode="decimal" value={bookForm.amount} onChange={(e) => setBookForm({ ...bookForm, amount: e.target.value })} />
              {!monthlyBudget[bookMonth] || editingBudget ? (
                <div className="budget-editor">
                  <input
                    placeholder="设置本月生活费 / 收入"
                    inputMode="decimal"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                  />
                  <button
                    className="budget-confirm"
                    onClick={() => {
                      if (Number(budgetDraft) > 0) {
                        setMonthlyBudget({ ...monthlyBudget, [bookMonth]: Number(budgetDraft) })
                        setBudgetDraft('')
                        setEditingBudget(false)
                      }
                    }}
                  >
                    确定
                  </button>
                  {editingBudget && (
                    <button
                      className="budget-cancel"
                      onClick={() => {
                        setBudgetDraft('')
                        setEditingBudget(false)
                      }}
                    >
                      取消
                    </button>
                  )}
                </div>
              ) : (
                <div className="budget-locked">
                  <span>本月生活费已固定</span>
                  <b>¥{monthBudget.toFixed(2)}</b>
                </div>
              )}
              <button className="primary" onClick={() => {
                if (!bookForm.amount) return
                const next = {
                  id: Date.now(),
                  type: bookForm.type,
                  date: bookForm.date,
                  category: bookForm.category.trim() || '未分类',
                  amount: Number(bookForm.amount),
                }
                saveBooks([next, ...books])
                setBookForm({ ...bookForm, amount: '' })
              }}>记一笔</button>
            </div>
            <div className="book-list">
              {monthBooks.map((item) => (
                <div className={`book-row ${item.type}`} key={item.id}>
                  <div>
                    <b>{item.category}</b>
                    <p>{item.type === 'income' ? '收入记录' : '支出记录'}</p>
                    <small>{item.date}</small>
                  </div>
                  <div className="book-amount">{item.type === 'expense' ? '-' : '+'}{Number(item.amount).toFixed(2)}</div>
                  <button className="plain danger" onClick={() => saveBooks(books.filter((row) => row.id !== item.id))}><Trash2 size={16} /></button>
                </div>
              ))}
              {!monthBooks.length && <div className="empty-book">这个月还没有记录。</div>}
            </div>
          </section>
        )}
      </main>

      {showImport && (
        <div className="backdrop">
          <div className="modal">
            <div className="modal-head">
              <h2>一键导入任务</h2>
              <button className="plain" onClick={() => setShowImport(false)}><X /></button>
            </div>
            <p>粘贴日期和任务，带短横线的内容会自动拆成独立任务。</p>
            <textarea
              autoFocus
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'2026-09-02\n- 数据整理\n- 数据分析\n- 做表格'}
            />
            <button className="primary full" onClick={parseImport}>识别并导入</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Word({ word, onStatus }) {
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState('')

  const update = (status) => {
    onStatus(status)
    setHint(
      status === 'remembered'
        ? '默写正确，已记住'
        : status === 'known'
          ? '已认识，已略过'
          : '已标记为不认识'
    )
  }

  return (
    <article className={`word ${word.status === 'remembered' || word.status === 'known' ? 'remembered' : ''}`}>
      <div>
        <h2>{word.word}</h2>
        <small>{word.phonetic}</small>
        <p>{word.meaning}</p>
        <div className="word-example">
          <i>{word.example}</i>
          <small className="example-translation">{word.exampleTranslation}</small>
        </div>
        <input placeholder="输入单词默写" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <div className="actions">
          <button onClick={() => update('unknown')}>不认识</button>
          <button onClick={() => update('known')}>认识</button>
          <button className="primary" onClick={() => update(answer.trim().toLowerCase() === word.word ? 'remembered' : 'known')}>已默写</button>
        </div>
        {(word.status === 'known' || word.status === 'remembered') && <div className="word-status">{word.status === 'remembered' ? '已默写，记住了' : '已认识，已略过'}</div>}
        {hint && <div className="feedback">{hint}</div>}
      </div>
    </article>
  )
}

function ReviewSession({ words, reviewIndex, reviewState, reviewChoice, reviewOptions, onClose, onAnswer, onNext, onRefresh, onEnd }) {
  const currentWord = words[reviewIndex]
  const isDone = reviewState === 'done'
  const isQuiz = reviewState === 'quiz' && currentWord
  const isCorrect = reviewChoice && reviewChoice === currentWord?.meaning

  return (
    <div className="review-session">
      <div className="review-head">
        <div>
          <p>复盘 {Math.min(reviewIndex + 1, words.length)}/{words.length}</p>
          <small>每题 3 个选项，做完再继续。</small>
        </div>
        <button className="plain" onClick={onClose}><X size={18} /></button>
      </div>

      {isQuiz && (
        <div className="review-card">
          <h2>{currentWord.word}</h2>
          <small>{currentWord.phonetic}</small>
          <div className="review-example">
            <i>{currentWord.example}</i>
            <small>{currentWord.exampleTranslation}</small>
          </div>
          <div className="quiz-options">
            {reviewOptions.map((option) => (
              <button
                key={option}
                className={`quiz-option ${reviewChoice === option ? (option === currentWord.meaning ? 'correct' : 'wrong') : ''}`}
                onClick={() => onAnswer(option)}
                disabled={Boolean(reviewChoice)}
              >
                {option}
              </button>
            ))}
          </div>
          {reviewChoice && (
            <div className={`review-result ${isCorrect ? 'correct' : 'wrong'}`}>
              {isCorrect ? '选对了' : '再看一眼，这个没对上'}
            </div>
          )}
          {reviewChoice && !isDone && (
            <button className="primary full review-next" onClick={onNext}>下一题</button>
          )}
        </div>
      )}

      {isDone && (
        <div className="review-done">
          <b>今日复盘完成</b>
          <p>你可以结束今天，也可以直接刷下一轮。</p>
          <div className="review-actions">
            <button className="plain" onClick={onEnd}>今日任务已结束</button>
            <button className="primary" onClick={onRefresh}>继续刷新下一轮</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
