import fs from 'fs'

const cet4 = JSON.parse(fs.readFileSync('src/data/cet4.json', 'utf8'))
const freq = fs
  .readFileSync('src/data/google-20k.txt', 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const freqIndex = new Map(freq.map((word, index) => [word, index]))
const minimumRank = 2000
const excluded = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','him','his','i','if','in','is','it','its','me','more','my','new','no','not','of','on','or','our','she','so','than','that','the','their','them','there','these','they','this','to','us','was','we','were','what','when','where','which','who','will','with','you','your',
  'all','also','any','can','do','does','did','had','here','into','just','like','may','might','one','other','out','over','some','such','up','very','would','therefore','because','too','then','only','own','same','most','much','many','both','either','neither','each','few','least','less','still','even','yet',
  'home','about','page','free','information','site','news','contact','business','now','help','get','view','first','how','click','friend','come','again','play','never','complete','topic','comment','financial','against','tax','person','below','mobile','party','payment','equipment','let','legal','above','recent','park','act','problem','red',
  'nature','africa','summary','mean','growth','agency','king','monday','european','activity','copy','although','drug','income','force','cash','employment','overall','bay','commission','ad','package','engine','port','album','administration','bar','institute','double','dog','build','screen','exchange','electronic','continue','across','apply','anything','condition','effective','believe','organization','effect','mind','selection','tour','menu','volume','cross','anyone'
])
const byWord = new Map()
for (const item of cet4) {
  const word = item.word.toLowerCase()
  if (!freqIndex.has(word) || excluded.has(word) || freqIndex.get(word) < minimumRank || byWord.has(word)) continue
  byWord.set(word, item)
}

const ranked = [...byWord.values()].sort((a, b) => freqIndex.get(a.word.toLowerCase()) - freqIndex.get(b.word.toLowerCase()))

const top20 = ranked.slice(0, 20).map((item) => ({
  word: item.word,
  phonetic: item.phonetic || '',
  meaning: item.translations?.map((x) => x.translation).join('；') || '暂无释义',
  example: (item.example || '暂无英文例句').split('¦')[0],
  exampleTranslation: (item.exampleTranslation || '例句翻译待补充').split('¦')[0],
}))

const phrases = []
const seenPhrases = new Set()
for (const item of ranked) {
  for (const phrase of item.phrases || []) {
    if (phrases.length >= 5) break
    if (seenPhrases.has(phrase.phrase.toLowerCase())) continue
    seenPhrases.add(phrase.phrase.toLowerCase())
    phrases.push({
      phrase: phrase.phrase,
      meaning: phrase.translation,
      example: (item.example || '暂无英文例句').split('¦')[0],
      translation: (item.exampleTranslation || '例句翻译待补充').split('¦')[0],
    })
  }
  if (phrases.length >= 5) break
}

fs.writeFileSync('src/data/dailyDeck.json', JSON.stringify({ top20, phrases }, null, 2))
console.log(`wrote ${top20.length} words and ${phrases.length} phrases`)
