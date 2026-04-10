import { useState, useRef, useCallback, useEffect } from "react"
import data from "../data/text.json"

// ── constants ────────────────────────────────────────────────────────────────

const LANG_ORDER = ["grc", "lat", "eng"]

const LANG_META = {
  grc: { label: "Ancient Greek",   script: "Ἑλληνική",  sigil: "Α" },
  lat: { label: "Latin Vulgate",   script: "Latina",    sigil: "L" },
  eng: { label: "King James",      script: "English",   sigil: "E" },
}

const FEAT_LABELS = {
  Case: { n: "Nom", g: "Gen", d: "Dat", a: "Acc", b: "Abl", v: "Voc",
          Nom: "Nom", Gen: "Gen", Dat: "Dat", Acc: "Acc", Abl: "Abl" },
  Number: { s: "Sing", p: "Plur", Sing: "Sing", Plur: "Plur" },
  Gender: { m: "Masc", f: "Fem",  n: "Neut", Masc: "Masc", Fem: "Fem", Neut: "Neut" },
  Tense:  { p: "Pres", i: "Imp",  a: "Aor",  f: "Fut",
            Pres: "Pres", Past: "Past", Imp: "Imp" },
  Mood:   { i: "Ind",  s: "Subj", m: "Imp",
            Ind: "Ind", Sub: "Sub" },
  Voice:  { a: "Act",  p: "Pass", e: "Mid",  m: "Mid",
            Act: "Act", Pass: "Pass", Mid: "Mid" },
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

function WordChip({ word, lang, isActive, onEnter, onLeave }) {
  const isPunct = word.upos === "u" || word.upos === "PUNCT"
  return (
    <span
      onMouseEnter={() => !isPunct && onEnter(word, lang)}
      onMouseLeave={onLeave}
      className={[
        "inline-block leading-relaxed transition-all duration-150 cursor-default select-none",
        isPunct
          ? "text-stone-600 mx-0.5"
          : [
              "px-0.5 rounded-sm",
              isActive
                ? "bg-amber-400/20 text-amber-200 underline decoration-amber-400/50 underline-offset-2"
                : "text-stone-200 hover:text-amber-100 hover:bg-white/5",
            ].join(" "),
      ].join(" ")}
    >
      {word.form}
    </span>
  )
}

function WordDetail({ word, lang }) {
  if (!word) return null

  const feats = parseFeat(word.feats)
  const chips = Object.entries(feats).map(([k, v]) => ({ key: k, val: v }))

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3">

      {/* form + lemma */}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-amber-200 tracking-wide">
          {word.form}
        </span>
        <span className="text-stone-400 text-sm">→</span>
        <span className="text-stone-300 italic text-sm">{word.lemma}</span>
      </div>

      {/* divider */}
      <div className="h-4 w-px bg-stone-700" />

      {/* pos tags */}
      <div className="flex gap-2 items-center">
        <Tag color="sky">{word.upos}</Tag>
        {word.deprel && word.deprel !== "_" && (
          <Tag color="violet">{word.deprel}</Tag>
        )}
      </div>

      {/* morphological features */}
      {chips.length > 0 && (
        <>
          <div className="h-4 w-px bg-stone-700" />
          <div className="flex flex-wrap gap-1.5">
            {chips.map(({ key, val }) => (
              <span key={key} className="text-xs bg-stone-800 border border-stone-700
                                         rounded px-1.5 py-0.5 text-stone-300">
                <span className="text-stone-500">{key}=</span>{val}
              </span>
            ))}
          </div>
        </>
      )}

      {/* head */}
      {word.head !== undefined && (
        <>
          <div className="h-4 w-px bg-stone-700" />
          <span className="text-xs text-stone-500">
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
    <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3
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

function SentenceCard({ sentence, activeWord, onWordEnter, onWordLeave }) {
  if (!sentence) {
    return (
      <div className="px-5 py-6 text-stone-700 text-sm italic">
        — not available —
      </div>
    )
  }

  return (
    <div className="px-5 py-6 border-b border-stone-800/60">
      {/* verse badge */}
      <p className="text-[10px] font-mono text-stone-600 mb-3 tracking-widest uppercase">
        {sentence.verse}
      </p>

      {/* words */}
      <p className="text-[15px] leading-8 tracking-wide">
        {sentence.words.map(word => (
          <WordChip
            key={word.id}
            word={word}
            lang={sentence.lang}
            isActive={activeWord?.id === word.id && activeWord?.lang === sentence.lang}
            onEnter={(w, l) => onWordEnter(w, l)}
            onLeave={onWordLeave}
          />
        ))}
      </p>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function PolyglotViewer() {
  const [activeWord, setActiveWord]   = useState(null)
  const [activeWordLang, setActiveWordLang] = useState(null)
  const paneRefs   = useRef([null, null, null])
  const scrollLock = useRef(false)

  const verses = groupByVerse(data.sentences)

  // inject Google Font once
  useEffect(() => {
    const id = "polyglot-font"
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id   = id
    link.rel  = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
    document.head.appendChild(link)
  }, [])

  // synchronized scrolling
  const handleScroll = useCallback((srcIdx) => {
    if (scrollLock.current) return
    scrollLock.current = true
    const src = paneRefs.current[srcIdx]
    if (!src) { scrollLock.current = false; return }

    const { scrollTop, scrollHeight, clientHeight } = src
    const ratio = scrollTop / (scrollHeight - clientHeight || 1)

    paneRefs.current.forEach((pane, i) => {
      if (i === srcIdx || !pane) return
      const max = pane.scrollHeight - pane.clientHeight
      pane.scrollTop = ratio * max
    })

    requestAnimationFrame(() => { scrollLock.current = false })
  }, [])

  const handleWordEnter = useCallback((word, lang) => {
    setActiveWord({ ...word, lang })
    setActiveWordLang(lang)
  }, [])

  const handleWordLeave = useCallback(() => {
    setActiveWord(null)
    setActiveWordLang(null)
  }, [])

  return (
    <div
      className="h-screen flex flex-col bg-stone-950 text-stone-200 overflow-hidden"
      style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
    >

      {/* ── top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3
                          border-b border-stone-800 bg-stone-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <h1 className="text-sm font-semibold tracking-widest uppercase text-stone-300">
            Polyglot Viewer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {LANG_ORDER.map(lang => (
            <span key={lang}
              className="text-[10px] font-mono px-2 py-0.5 rounded border
                         border-stone-700 text-stone-500">
              {LANG_META[lang].label}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-stone-600 font-mono">
          {data.sentences.length} sentences · {data.meta?.sources?.grc?.split("(")[0]}
        </p>
      </header>

      {/* ── three panes ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden divide-x divide-stone-800">
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
                activeWord={activeWord}
                onWordEnter={handleWordEnter}
                onWordLeave={handleWordLeave}
              />
            ))}

            {/* bottom padding so last sentence doesn't hug the footer */}
            <div className="h-32" />
          </div>
        ))}
      </div>

      {/* ── word detail strip ────────────────────────────────────────────── */}
      <div
        className={[
          "shrink-0 border-t border-stone-800 bg-stone-900/80 backdrop-blur",
          "transition-all duration-200 overflow-hidden",
          activeWord ? "max-h-20" : "max-h-0 border-transparent",
        ].join(" ")}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <WordDetail word={activeWord} lang={activeWordLang} />
      </div>

    </div>
  )
}
