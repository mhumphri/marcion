import { useState, useRef, useCallback, useEffect } from "react"
import type { ReactNode, MouseEvent } from "react"
import rawConllu from "../data/zahn_galatians.conllu?raw"

// ── types ─────────────────────────────────────────────────────────────────────

interface Word {
  id:     number
  form:   string
  lemma:  string
  upos:   string
  xpos:   string
  feats:  string
  head:   number
  deprel: string
  deps:   string
  misc:   Record<string, string>
}

interface Sentence {
  id:     number
  lang:   string
  verse:  string
  source: string
  text:   string
  words:  Word[]
}

interface LangMeta {
  label:  string
  short:  string
  script: string
  sigil:  string
}

interface ConlluData {
  model:      string
  dimensions: number
  meta:       { description: string; work: string }
  langLabels: Partial<Record<string, LangMeta>>
  sentences:  Sentence[]
}

type LangKey = "grc" | "lat" | "eng"

// active word carries its lang alongside the word fields
type ActiveWord = Word & { lang: string }

// ── CoNLL-U parser ────────────────────────────────────────────────────────────
//
// FORMAT A — explicit lang per sentence:
//   # lang  = grc | lat | eng
//   # verse = Luke 2:1
//   # text  = …
//
// FORMAT B — Zahn/embedded-translation style:
//   # work     = Galatians
//   # text     = (Greek)
//   # text_en  = (English gloss)
//   # text_la  = (Latin gloss)
//   MISC field: Gloss.en=…|Gloss.la=…|Gloss.de=…|LN=…

function parseMisc(raw: string | undefined): Record<string, string> {
  if (!raw || raw === "_") return {}
  const out: Record<string, string> = {}
  raw.split("|").forEach(pair => {
    const eq = pair.indexOf("=")
    if (eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1)
  })
  return out
}

function glossWords(text: string): Word[] {
  return text.split(/\s+/).filter(Boolean).map((form, i) => ({
    id: i + 1, form, lemma: form,
    upos: "_gloss_", xpos: "_", feats: "_",
    head: 0, deprel: "_", deps: "_", misc: {},
  }))
}

function parseConllu(raw: string): ConlluData {
  const globalMeta: Record<string, string | number> = {
    model: "conllu", dimensions: 0, description: "", work: "",
  }
  const sentences: Sentence[] = []
  const blocks = raw.split(/\n\n+/).map(b => b.trim()).filter(Boolean)

  for (const block of blocks) {
    const comments: Record<string, string> = {}
    const words: Word[] = []

    for (const line of block.split("\n")) {
      if (line.startsWith("#")) {
        const m = line.match(/^#\s*([^=]+?)\s*=\s*(.+)$/)
        if (!m) continue
        const k = m[1].trim()
        const v = m[2].trim()
        if (k.startsWith("global.")) {
          const gk = k.slice(7)
          globalMeta[gk] = gk === "dimensions" ? Number(v) : v
        } else {
          comments[k] = v
          if (k === "work" && !globalMeta.work) globalMeta.work = v
        }
      } else if (line && !line.startsWith("#")) {
        const cols = line.split("\t")
        if (cols.length < 8) continue
        if (cols[0].includes("-") || cols[0].includes(".")) continue
        words.push({
          id:     Number(cols[0]),
          form:   cols[1],
          lemma:  cols[2],
          upos:   cols[3],
          xpos:   cols[4],
          feats:  cols[5] === "_" ? "_" : cols[5],
          head:   Number(cols[6]),
          deprel: cols[7],
          deps:   cols[8] ?? "_",
          misc:   parseMisc(cols[9]),
        })
      }
    }

    if (words.length === 0) continue

    // FORMAT A — explicit lang
    if ("lang" in comments) {
      sentences.push({
        id:     sentences.length,
        lang:   comments.lang ?? "und",
        verse:  comments.verse ?? comments.sent_id ?? `sentence-${sentences.length}`,
        source: comments.sent_id ?? "",
        text:   comments.text ?? words.map(w => w.form).join(" "),
        words,
      })
      continue
    }

    // FORMAT B — Zahn embedded
    const unitNum = (comments.unit_id ?? comments.sent_id ?? "")
      .replace(/.*\D(\d+)$/, "$1")
    const work  = comments.work || String(globalMeta.work) || ""
    const verse = work && unitNum
      ? `${work} §${parseInt(unitNum, 10)}`
      : (comments.sent_id ?? `s${sentences.length}`)

    sentences.push({
      id: sentences.length, lang: "grc", verse,
      source: comments.sent_id ?? "",
      text:   comments.text ?? words.map(w => w.form).join(" "),
      words,
    })
    if (comments.text_en) {
      sentences.push({
        id: sentences.length, lang: "eng", verse,
        source: comments.sent_id ?? "", text: comments.text_en,
        words: glossWords(comments.text_en),
      })
    }
    if (comments.text_la) {
      sentences.push({
        id: sentences.length, lang: "lat", verse,
        source: comments.sent_id ?? "", text: comments.text_la,
        words: glossWords(comments.text_la),
      })
    }
  }

  const langLabels: Partial<Record<string, LangMeta>> = {}
  const hasGloss = sentences.some(s => s.lang !== "grc" && s.words[0]?.upos === "_gloss_")
  if (hasGloss) {
    const workStr = String(globalMeta.work) || "Ancient Greek"
    langLabels.grc = { label: workStr,          short: "Greek",   script: "Ἑλληνική", sigil: "Α" }
    langLabels.eng = { label: "English Gloss",  short: "English", script: "Gloss",    sigil: "E" }
    langLabels.lat = { label: "Latin Gloss",    short: "Latin",   script: "Gloss",    sigil: "L" }
  }

  const modelStr = String(globalMeta.model)
  return {
    model:      modelStr !== "conllu" ? modelStr : (String(globalMeta.work) || "conllu"),
    dimensions: Number(globalMeta.dimensions),
    meta:       { description: String(globalMeta.description || globalMeta.work || ""), work: String(globalMeta.work) },
    langLabels,
    sentences,
  }
}

const data: ConlluData = parseConllu(rawConllu)

// ── constants ─────────────────────────────────────────────────────────────────

const LANG_ORDER: LangKey[] = ["grc", "lat", "eng"]

const BASE_LANG_META: Record<LangKey, LangMeta> = {
  grc: { label: "Ancient Greek", short: "Greek",   script: "Ἑλληνική", sigil: "Α" },
  lat: { label: "Latin Vulgate", short: "Latin",   script: "Latina",   sigil: "L" },
  eng: { label: "King James",    short: "English",  script: "English",  sigil: "E" },
}
const LANG_META: Record<string, LangMeta> = { ...BASE_LANG_META, ...data.langLabels }

const FONT_SIZES:  readonly string[] = ["Small", "Medium", "Large"]
const THEMES:      readonly string[] = ["Dark", "Sepia", "High Contrast"]
const ANNO_LEVELS: readonly string[] = ["None", "POS only", "Full morphology"]

// ── helpers ───────────────────────────────────────────────────────────────────

function groupByVerse(sentences: Sentence[]): [string, Record<string, Sentence>][] {
  const map: Record<string, Record<string, Sentence>> = {}
  sentences.forEach(s => {
    if (!map[s.verse]) map[s.verse] = {}
    map[s.verse][s.lang] = s
  })
  return Object.entries(map)
}

function parseFeat(raw: string): Record<string, string> {
  if (!raw || raw === "_") return {}
  const out: Record<string, string> = {}
  raw.split("|").forEach(pair => {
    const [k, v] = pair.split("=")
    if (k && v) out[k] = v
  })
  return out
}

// ── icons ─────────────────────────────────────────────────────────────────────

function GearIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33
               1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33
               l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4
               h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06
               A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51
               a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9
               a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── settings modal ────────────────────────────────────────────────────────────

interface ToggleProps {
  checked:  boolean
  onChange: (v: boolean) => void
}
function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent",
        "transition-colors duration-200 focus:outline-none",
        checked ? "bg-amber-400" : "bg-stone-300",
      ].join(" ")}
    >
      <span className={[
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
        "transform transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0",
      ].join(" ")} />
    </button>
  )
}

interface SegmentedControlProps {
  options:  readonly string[]
  value:    string
  onChange: (v: string) => void
}
function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-stone-200 bg-stone-100">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={[
            "flex-1 text-xs py-1.5 px-2 transition-colors duration-150 font-mono",
            value === opt
              ? "bg-stone-800 text-white"
              : "text-stone-500 hover:text-stone-700 hover:bg-stone-200",
          ].join(" ")}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

interface SettingsRowProps {
  label:    string
  hint?:    string
  children: ReactNode
}
function SettingsRow({ label, hint, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-stone-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-stone-800 font-medium leading-none">{label}</p>
        {hint && <p className="text-xs text-stone-400 mt-1 leading-snug">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

interface SettingsSectionProps {
  title:    string
  children: ReactNode
}
function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="mb-6">
      <h3 className="text-[10px] font-semibold tracking-widest uppercase text-stone-400 mb-1 px-1">
        {title}
      </h3>
      <div className="bg-stone-50 rounded-xl px-4 border border-stone-100">
        {children}
      </div>
    </section>
  )
}

interface SettingsModalProps {
  open:    boolean
  onClose: () => void
}
function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [fontSize,     setFontSize]     = useState("Medium")
  const [theme,        setTheme]        = useState("Dark")
  const [annoLevel,    setAnnoLevel]    = useState("Full morphology")
  const [syncScroll,   setSyncScroll]   = useState(true)
  const [showVerseNos, setShowVerseNos] = useState(true)
  const [showLemmas,   setShowLemmas]   = useState(true)
  const [autoScroll,   setAutoScroll]   = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div
        className={[
          "relative z-10 flex flex-col",
          "bg-white/90 backdrop-blur-xl border-stone-200",
          "w-full max-h-[92dvh] rounded-t-2xl border-t border-x",
          "sm:w-[480px] sm:max-h-[80vh] sm:rounded-2xl sm:border",
        ].join(" ")}
        style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <GearIcon className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-semibold text-stone-800 tracking-wide">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200
                       flex items-center justify-center text-stone-400
                       hover:text-stone-600 hover:bg-stone-200 transition-colors"
            aria-label="Close settings"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5"
             style={{ scrollbarWidth: "thin", scrollbarColor: "#d6d3d1 transparent" }}>

          <SettingsSection title="Display">
            <SettingsRow label="Font size" hint="Size of the scripture text in each pane">
              <SegmentedControl options={FONT_SIZES} value={fontSize} onChange={setFontSize} />
            </SettingsRow>
            <SettingsRow label="Theme" hint="Colour scheme for the viewer">
              <SegmentedControl options={THEMES} value={theme} onChange={setTheme} />
            </SettingsRow>
            <SettingsRow label="Show verse numbers" hint="Display reference above each passage">
              <Toggle checked={showVerseNos} onChange={setShowVerseNos} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Annotation">
            <SettingsRow label="Annotation level" hint="How much morphological detail to show on tap">
              <SegmentedControl options={ANNO_LEVELS} value={annoLevel} onChange={setAnnoLevel} />
            </SettingsRow>
            <SettingsRow label="Show lemmas" hint="Display dictionary form alongside word form">
              <Toggle checked={showLemmas} onChange={setShowLemmas} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Scrolling">
            <SettingsRow label="Sync scroll" hint="Keep all three panes aligned as you scroll">
              <Toggle checked={syncScroll} onChange={setSyncScroll} />
            </SettingsRow>
            <SettingsRow label="Auto-scroll" hint="Slowly advance through the text automatically">
              <Toggle checked={autoScroll} onChange={setAutoScroll} />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="About">
            <SettingsRow label="Model" hint={data.meta?.description ?? "—"}>
              <span className="text-xs font-mono text-stone-400 text-right max-w-[140px] leading-snug">
                {data.model}
              </span>
            </SettingsRow>
            <SettingsRow label="Sentences">
              <span className="text-xs font-mono text-stone-500">{data.sentences.length}</span>
            </SettingsRow>
            <SettingsRow label="Dimensions">
              <span className="text-xs font-mono text-stone-500">{data.dimensions}</span>
            </SettingsRow>
          </SettingsSection>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-stone-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-amber-400 text-stone-950
                       text-sm font-semibold tracking-wide
                       hover:bg-amber-300 active:bg-amber-500 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── word chip ─────────────────────────────────────────────────────────────────

interface WordChipProps {
  word:     Word
  lang:     string
  isActive: boolean
  onEnter:  (word: Word, lang: string) => void
  onLeave:  () => void
  onTap:    (word: Word, lang: string) => void
}
function WordChip({ word, lang, isActive, onEnter, onLeave, onTap }: WordChipProps) {
  const isPunct = word.upos === "u" || word.upos === "PUNCT"
    || word.form === "," || word.form === "." || word.form === "·" || word.form === ";"
  const isGloss = word.upos === "_gloss_"

  if (isPunct) return <span className="text-stone-600 mx-0.5">{word.form}</span>
  if (isGloss) return <span className="text-stone-400 inline-block leading-relaxed px-0.5">{word.form}</span>

  return (
    <span
      onMouseEnter={() => onEnter(word, lang)}
      onMouseLeave={onLeave}
      onClick={() => onTap(word, lang)}
      className={[
        "inline-block leading-relaxed transition-all duration-150",
        "cursor-pointer select-none px-0.5 rounded-sm",
        isActive
          ? "bg-amber-400/20 text-amber-200 underline decoration-amber-400/50 underline-offset-2"
          : "text-stone-200 hover:text-amber-100 hover:bg-white/5 active:bg-white/10",
      ].join(" ")}
    >
      {word.form}
    </span>
  )
}

// ── word detail strip ─────────────────────────────────────────────────────────

interface TagProps {
  color:    "sky" | "violet"
  children: ReactNode
}
function Tag({ color, children }: TagProps) {
  const palette: Record<"sky" | "violet", string> = {
    sky:    "bg-sky-950 text-sky-300 border-sky-800",
    violet: "bg-violet-950 text-violet-300 border-violet-800",
  }
  return (
    <span className={`text-xs font-mono border rounded px-1.5 py-0.5 ${palette[color]}`}>
      {children}
    </span>
  )
}

function WordDetail({ word }: { word: ActiveWord | null }) {
  if (!word) return null
  const chips   = Object.entries(parseFeat(word.feats))
  const misc    = word.misc ?? {}
  const glossEn = misc["Gloss.en"]
  const glossLa = misc["Gloss.la"]
  const glossDe = misc["Gloss.de"]
  const altEn   = misc["Gloss.en.alt"]
  const ln      = misc["LN"]
  const hasGloss = glossEn || glossLa || glossDe

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-1.5 px-4 py-3 sm:px-6">

      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-base sm:text-lg font-semibold text-amber-200 tracking-wide">
          {word.form}
        </span>
        <span className="text-stone-400 text-sm shrink-0">→</span>
        <span className="text-stone-300 italic text-sm">{word.lemma}</span>
        {altEn && <span className="text-stone-500 text-xs italic">/ {altEn}</span>}
      </div>

      {hasGloss && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700 self-center" />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center">
            {glossEn && (
              <span className="text-xs text-stone-300">
                <span className="text-stone-600 mr-1">en</span>{glossEn}
              </span>
            )}
            {glossLa && (
              <span className="text-xs text-stone-400 hidden sm:inline">
                <span className="text-stone-600 mr-1">la</span>{glossLa}
              </span>
            )}
            {glossDe && (
              <span className="text-xs text-stone-500 hidden sm:inline">
                <span className="text-stone-600 mr-1">de</span>{glossDe}
              </span>
            )}
            {ln && (
              <span className="text-[10px] font-mono text-stone-600 hidden sm:inline">LN {ln}</span>
            )}
          </div>
        </>
      )}

      {word.upos && word.upos !== "_" && word.upos !== "_gloss_" && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700 self-center" />
          <div className="flex gap-2 items-center">
            <Tag color="sky">{word.upos}</Tag>
            {word.deprel && word.deprel !== "_" && (
              <Tag color="violet">{word.deprel}</Tag>
            )}
          </div>
        </>
      )}

      {chips.length > 0 && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700 self-center" />
          <div className="hidden sm:flex flex-wrap gap-1.5">
            {chips.map(([key, val]) => (
              <span key={key}
                className="text-xs bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 text-stone-300">
                <span className="text-stone-500">{key}=</span>{val}
              </span>
            ))}
          </div>
          <div className="flex sm:hidden flex-wrap gap-1">
            {chips.map(([key, val]) => (
              <span key={key}
                className="text-[10px] bg-stone-800 border border-stone-700 rounded px-1 py-0.5 text-stone-400">
                {val}
              </span>
            ))}
          </div>
        </>
      )}

      {!hasGloss && word.head !== undefined && word.head !== 0 && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700 self-center" />
          <span className="hidden sm:inline text-xs text-stone-500">
            head <span className="text-stone-300">{word.head}</span>
          </span>
        </>
      )}
    </div>
  )
}

// ── pane header ───────────────────────────────────────────────────────────────

function PaneHeader({ lang }: { lang: string }) {
  const m = LANG_META[lang]
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-3
                    bg-stone-950/95 backdrop-blur border-b border-stone-800">
      <span className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700
                       flex items-center justify-center text-xs font-mono text-stone-400">
        {m.sigil}
      </span>
      <div>
        <p className="text-xs font-semibold text-stone-200 leading-none">{m.label}</p>
        <p className="text-[10px] text-stone-500 mt-0.5">{m.script}</p>
      </div>
    </div>
  )
}

// ── sentence card ─────────────────────────────────────────────────────────────

interface SentenceCardProps {
  sentence?:    Sentence
  activeWord:   ActiveWord | null
  onWordEnter:  (word: Word, lang: string) => void
  onWordLeave:  () => void
  onWordTap:    (word: Word, lang: string) => void
}
function SentenceCard({ sentence, activeWord, onWordEnter, onWordLeave, onWordTap }: SentenceCardProps) {
  if (!sentence) {
    return (
      <div className="px-4 sm:px-5 py-6 text-stone-700 text-sm italic">— not available —</div>
    )
  }
  return (
    <div className="px-4 sm:px-5 py-5 sm:py-6 border-b border-stone-800/60">
      <p className="text-[10px] font-mono text-stone-600 mb-3 tracking-widest uppercase">
        {sentence.verse}
      </p>
      <p className="text-[15px] leading-8 tracking-wide">
        {sentence.words.map(word => (
          <WordChip
            key={word.id}
            word={word}
            lang={sentence.lang}
            isActive={activeWord?.id === word.id && activeWord?.lang === sentence.lang}
            onEnter={onWordEnter}
            onLeave={onWordLeave}
            onTap={onWordTap}
          />
        ))}
      </p>
    </div>
  )
}

// ── mobile tab bar ────────────────────────────────────────────────────────────

interface MobileTabBarProps {
  activeLang: string
  onChange:   (lang: string) => void
}
function MobileTabBar({ activeLang, onChange }: MobileTabBarProps) {
  return (
    <nav className="shrink-0 sm:hidden flex border-t border-stone-800 bg-stone-950">
      {LANG_ORDER.map(lang => {
        const m      = LANG_META[lang]
        const active = lang === activeLang
        return (
          <button
            key={lang}
            onClick={() => onChange(lang)}
            className={[
              "flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors duration-150",
              "border-t-2 -mt-px",
              active ? "border-amber-400 text-amber-300" : "border-transparent text-stone-500 active:text-stone-300",
            ].join(" ")}
          >
            <span className={[
              "w-7 h-7 rounded-full flex items-center justify-center",
              "text-xs font-mono transition-colors duration-150",
              active
                ? "bg-amber-400/15 border border-amber-500/40 text-amber-300"
                : "bg-stone-800 border border-stone-700 text-stone-400",
            ].join(" ")}>
              {m.sigil}
            </span>
            <span className="text-[10px] font-semibold tracking-wide leading-none">{m.short}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function PolyglotViewer() {
  const [hoveredWord,  setHoveredWord]  = useState<ActiveWord | null>(null)
  const [pinnedWord,   setPinnedWord]   = useState<ActiveWord | null>(null)
  const [activeLang,   setActiveLang]   = useState<string>("grc")
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)

  const paneRefs   = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const scrollLock = useRef<boolean>(false)

  const verses = groupByVerse(data.sentences)

  useEffect(() => {
    const id = "polyglot-font"
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id    = id
    link.rel   = "stylesheet"
    link.href  = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
    document.head.appendChild(link)
  }, [])

  const handleScroll = useCallback((srcIdx: number) => {
    if (scrollLock.current) return
    scrollLock.current = true
    const src = paneRefs.current[srcIdx]
    if (!src) { scrollLock.current = false; return }
    const ratio = src.scrollTop / (src.scrollHeight - src.clientHeight || 1)
    paneRefs.current.forEach((pane, i) => {
      if (i === srcIdx || !pane) return
      pane.scrollTop = ratio * (pane.scrollHeight - pane.clientHeight)
    })
    requestAnimationFrame(() => { scrollLock.current = false })
  }, [])

  const handleWordEnter = useCallback((w: Word, l: string) => {
    setHoveredWord({ ...w, lang: l })
  }, [])
  const handleWordLeave = useCallback(() => setHoveredWord(null), [])

  const handleWordTap = useCallback((w: Word, l: string) => {
    setPinnedWord(prev =>
      prev?.id === w.id && prev?.lang === l ? null : { ...w, lang: l }
    )
  }, [])

  const handleBgTap = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === "P" || tag === "DIV") setPinnedWord(null)
  }, [])

  const displayWord = hoveredWord ?? pinnedWord

  return (
    <div
      className="h-[100dvh] flex flex-col bg-stone-950 text-stone-200 overflow-hidden"
      style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* ── top bar ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-stone-800">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <h1 className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-stone-300">
            Polyglot Viewer
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {LANG_ORDER.map(lang => (
            <span key={lang}
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-stone-700 text-stone-500">
              {LANG_META[lang].label}
            </span>
          ))}
        </div>
        <p className="hidden sm:block text-[11px] text-stone-600 font-mono tabular-nums">
          {data.sentences.length} sentences
        </p>
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center
                     text-stone-400 hover:text-stone-200 hover:bg-stone-800
                     active:bg-stone-700 transition-colors"
          aria-label="Open settings"
        >
          <GearIcon className="w-4 h-4" />
        </button>
      </header>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── pane area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* DESKTOP — three synchronized columns */}
        <div className="hidden sm:flex h-full divide-x divide-stone-800">
          {LANG_ORDER.map((lang, idx) => (
            <div
              key={lang}
              ref={el => { paneRefs.current[idx] = el }}
              onScroll={() => handleScroll(idx)}
              className="flex-1 overflow-y-scroll overscroll-none"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#292524 transparent" }}
            >
              <PaneHeader lang={lang} />
              {verses.map(([verse, langMap]) => (
                <SentenceCard
                  key={verse}
                  sentence={langMap[lang]}
                  activeWord={hoveredWord}
                  onWordEnter={handleWordEnter}
                  onWordLeave={handleWordLeave}
                  onWordTap={() => {}}
                />
              ))}
              <div className="h-32" />
            </div>
          ))}
        </div>

        {/* MOBILE — single pane, toggled by tab bar */}
        <div className="flex sm:hidden h-full flex-col">
          {LANG_ORDER.map((lang, idx) => (
            <div
              key={lang}
              ref={el => { paneRefs.current[idx] = el }}
              onClick={handleBgTap}
              className={[
                "h-full overflow-y-scroll overscroll-none",
                lang === activeLang ? "block" : "hidden",
              ].join(" ")}
              style={{ scrollbarWidth: "none" }}
            >
              <PaneHeader lang={lang} />
              {verses.map(([verse, langMap]) => (
                <SentenceCard
                  key={verse}
                  sentence={langMap[lang]}
                  activeWord={pinnedWord}
                  onWordEnter={() => {}}
                  onWordLeave={() => {}}
                  onWordTap={handleWordTap}
                />
              ))}
              <div className="h-36" />
            </div>
          ))}
        </div>
      </div>

      {/* ── word detail strip ───────────────────────────────────────────────── */}
      <div
        className={[
          "relative shrink-0 border-t border-stone-800 bg-stone-900/90 backdrop-blur",
          "transition-all duration-200 overflow-hidden",
          displayWord ? "max-h-28 sm:max-h-16" : "max-h-0 border-transparent",
        ].join(" ")}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <button
          onClick={() => setPinnedWord(null)}
          className={[
            "sm:hidden absolute right-3 top-2.5 w-6 h-6 rounded-full",
            "flex items-center justify-center text-stone-400",
            "bg-stone-800 border border-stone-700 text-xs leading-none",
            "transition-opacity duration-150",
            pinnedWord ? "opacity-100" : "opacity-0 pointer-events-none",
          ].join(" ")}
          aria-label="Dismiss word detail"
        >
          ✕
        </button>
        <WordDetail word={displayWord} />
      </div>

      {/* ── mobile tab bar ──────────────────────────────────────────────────── */}
      <MobileTabBar
        activeLang={activeLang}
        onChange={lang => { setActiveLang(lang); setPinnedWord(null) }}
      />
    </div>
  )
}