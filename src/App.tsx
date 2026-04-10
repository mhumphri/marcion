import { useState, useRef, useCallback, useEffect } from "react"
import data from "../data/text.json"

// ── constants ────────────────────────────────────────────────────────────────

const LANG_ORDER = ["grc", "lat", "eng"]

const LANG_META = {
  grc: { label: "Ancient Greek", short: "Greek",   script: "Ἑλληνική", sigil: "Α" },
  lat: { label: "Latin Vulgate", short: "Latin",   script: "Latina",   sigil: "L" },
  eng: { label: "King James",    short: "English",  script: "English",  sigil: "E" },
}

// ── helpers ──────────────────────────────────────────────────────────────────

function groupByVerse(sentences) {
  const map = {}
  sentences.forEach(s => {
    if (!map[s.verse]) map[s.verse] = {}
    map[s.verse][s.lang] = s
  })
  return Object.entries(map)
}

function parseFeat(raw) {
  if (!raw || raw === "_") return {}
  const out = {}
  raw.split("|").forEach(pair => {
    const [k, v] = pair.split("=")
    if (k && v) out[k] = v
  })
  return out
}

// ── sub-components ───────────────────────────────────────────────────────────

function WordChip({ word, lang, isActive, onEnter, onLeave, onTap }) {
  const isPunct = word.upos === "u" || word.upos === "PUNCT"
  if (isPunct) return <span className="text-stone-600 mx-0.5">{word.form}</span>

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

function WordDetail({ word }) {
  if (!word) return null
  const chips = Object.entries(parseFeat(word.feats))

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-3 sm:px-6">

      {/* form → lemma */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-base sm:text-lg font-semibold text-amber-200 tracking-wide">
          {word.form}
        </span>
        <span className="text-stone-400 text-sm shrink-0">→</span>
        <span className="text-stone-300 italic text-sm">{word.lemma}</span>
      </div>

      <div className="hidden sm:block h-4 w-px bg-stone-700" />

      {/* pos + deprel tags */}
      <div className="flex gap-2 items-center">
        <Tag color="sky">{word.upos}</Tag>
        {word.deprel && word.deprel !== "_" && (
          <Tag color="violet">{word.deprel}</Tag>
        )}
      </div>

      {/* morphological features — full on desktop, compact on mobile */}
      {chips.length > 0 && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700" />
          <div className="hidden sm:flex flex-wrap gap-1.5">
            {chips.map(([key, val]) => (
              <span key={key}
                className="text-xs bg-stone-800 border border-stone-700
                           rounded px-1.5 py-0.5 text-stone-300">
                <span className="text-stone-500">{key}=</span>{val}
              </span>
            ))}
          </div>
          <div className="flex sm:hidden flex-wrap gap-1">
            {chips.map(([key, val]) => (
              <span key={key}
                className="text-[10px] bg-stone-800 border border-stone-700
                           rounded px-1 py-0.5 text-stone-400">
                {val}
              </span>
            ))}
          </div>
        </>
      )}

      {word.head !== undefined && (
        <>
          <div className="hidden sm:block h-4 w-px bg-stone-700" />
          <span className="hidden sm:inline text-xs text-stone-500">
            head <span className="text-stone-300">{word.head}</span>
          </span>
        </>
      )}
    </div>
  )
}

function Tag({ color, children }) {
  const palette = {
    sky:    "bg-sky-950 text-sky-300 border-sky-800",
    violet: "bg-violet-950 text-violet-300 border-violet-800",
  }
  return (
    <span className={`text-xs font-mono border rounded px-1.5 py-0.5 ${palette[color]}`}>
      {children}
    </span>
  )
}

function PaneHeader({ lang }) {
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

function SentenceCard({ sentence, activeWord, onWordEnter, onWordLeave, onWordTap }) {
  if (!sentence) {
    return (
      <div className="px-4 sm:px-5 py-6 text-stone-700 text-sm italic">
        — not available —
      </div>
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

function MobileTabBar({ activeLang, onChange }) {
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
              active
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-stone-500 active:text-stone-300",
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
            <span className="text-[10px] font-semibold tracking-wide leading-none">
              {m.short}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function PolyglotViewer() {
  // desktop: hovered word; mobile: tapped/pinned word
  const [hoveredWord, setHoveredWord] = useState(null)
  const [pinnedWord,  setPinnedWord]  = useState(null)
  const [activeLang,  setActiveLang]  = useState("grc") // mobile active pane

  const paneRefs   = useRef([null, null, null])
  const scrollLock = useRef(false)

  const verses = groupByVerse(data.sentences)

  // inject Google Font once
  useEffect(() => {
    const id = "polyglot-font"
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id    = id
    link.rel   = "stylesheet"
    link.href  = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
    document.head.appendChild(link)
  }, [])

  // proportional sync scroll across all three desktop panes
  const handleScroll = useCallback((srcIdx) => {
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

  // desktop: hover to preview
  const handleWordEnter  = useCallback((w, l) => setHoveredWord({ ...w, lang: l }), [])
  const handleWordLeave  = useCallback(() => setHoveredWord(null), [])

  // mobile: tap to pin, tap again to unpin
  const handleWordTap = useCallback((w, l) => {
    setPinnedWord(prev =>
      prev?.id === w.id && prev?.lang === l ? null : { ...w, lang: l }
    )
  }, [])

  // tap empty area to dismiss pinned word
  const handleBgTap = useCallback(e => {
    if (e.target.tagName === "P" || e.target.tagName === "DIV") setPinnedWord(null)
  }, [])

  // what to show: hover takes priority on desktop, pin on mobile
  const displayWord = hoveredWord ?? pinnedWord

  return (
    <div
      className="h-[100dvh] flex flex-col bg-stone-950 text-stone-200 overflow-hidden"
      style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
    >

      {/* ── top bar ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between
                          px-4 sm:px-6 py-3 border-b border-stone-800">

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <h1 className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-stone-300">
            Polyglot Viewer
          </h1>
        </div>

        {/* desktop: language pills */}
        <div className="hidden sm:flex items-center gap-2">
          {LANG_ORDER.map(lang => (
            <span key={lang}
              className="text-[10px] font-mono px-2 py-0.5 rounded border
                         border-stone-700 text-stone-500">
              {LANG_META[lang].label}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-stone-600 font-mono tabular-nums">
          {data.sentences.length} sentences
        </p>

      </header>

      {/* ── pane area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* DESKTOP ≥640px — three columns, synchronized scroll */}
        <div className="hidden sm:flex h-full divide-x divide-stone-800">
          {LANG_ORDER.map((lang, idx) => (
            <div
              key={lang}
              ref={el => (paneRefs.current[idx] = el)}
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

        {/* MOBILE <640px — one pane at a time, toggled by tab bar */}
        <div className="flex sm:hidden h-full flex-col">
          {LANG_ORDER.map((lang, idx) => (
            <div
              key={lang}
              ref={el => (paneRefs.current[idx] = el)}
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

      {/* ── word detail strip ─────────────────────────────────────────────── */}
      <div
        className={[
          "relative shrink-0 border-t border-stone-800 bg-stone-900/90 backdrop-blur",
          "transition-all duration-200 overflow-hidden",
          displayWord ? "max-h-24 sm:max-h-16" : "max-h-0 border-transparent",
        ].join(" ")}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {/* mobile dismiss button */}
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

      {/* ── mobile tab bar ────────────────────────────────────────────────── */}
      <MobileTabBar activeLang={activeLang} onChange={lang => {
        setActiveLang(lang)
        setPinnedWord(null)
      }} />

    </div>
  )
}