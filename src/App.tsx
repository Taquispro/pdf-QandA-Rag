import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import {
  ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp,
  Command, FileText, FileUp, FolderOpen, HardDrive, LoaderCircle, MessageSquareText, Moon, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, Sparkles, Sun, Trash2, X,
} from 'lucide-react'

type DocumentInfo = { id: string; name: string; pages: number; chunks: number }
type SourceRef = { rank: number; documentId: string; documentName: string; page: number; score: number; snippet: string }
type Answer = { answer: string; sources: SourceRef[] }
type Turn = { id: number; question: string; answer: Answer; time: string }
type Page = 'Overview' | 'Documents' | 'Ask'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'https://pdf-aq-backend.onrender.com').replace(/\/$/, '')
const initials = (name: string) => name.replace(/\.pdf$/i, '').split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'PDF'
const palette = ['#e9e5ff', '#e1f1e9', '#fce9da', '#e4efff', '#fae3ed']

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { const body = await response.json(); message = body.detail || body.message || message } catch { /* use status */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export default function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [topK, setTopK] = useState(5)
  const [query, setQuery] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('papertrail-theme') === 'dark')
  const [activeSource, setActiveSource] = useState<SourceRef | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLTextAreaElement>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const result = await request<DocumentInfo[]>('/api/documents')
      setDocuments(result)
      setSelected(old => old.filter(id => result.some(doc => doc.id === id)))
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect to the API.') }
  }, [])

  useEffect(() => { void loadDocuments() }, [loadDocuments])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('papertrail-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); queryRef.current?.focus() }
      if (event.key === 'Escape') setActiveSource(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filteredDocs = useMemo(() => documents.filter(doc => doc.name.toLowerCase().includes(search.toLowerCase())), [documents, search])
  const totalPages = documents.reduce((sum, doc) => sum + doc.pages, 0)

  const uploadFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files)
    if (!pdfs.length) return
    const invalid = pdfs.find(file => !file.name.toLowerCase().endsWith('.pdf') || file.size === 0)
    if (invalid) { setError('Choose a non-empty PDF file.'); return }
    setUploading(true); setError('')
    for (const file of pdfs) {
      const body = new FormData(); body.append('file', file)
      try {
        await request<DocumentInfo>('/api/documents', { method: 'POST', body })
      } catch (e) { setError(`${file.name}: ${e instanceof Error ? e.message : 'Upload failed.'}`) }
    }
    await loadDocuments(); setUploading(false)
  }

  const deleteDocument = async (doc: DocumentInfo) => {
    if (!window.confirm(`Remove “${doc.name}” from your library?`)) return
    try {
      await request<void>(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
      setDocuments(old => old.filter(item => item.id !== doc.id)); setSelected(old => old.filter(id => id !== doc.id)); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove document.') }
  }

  const ask = async (event?: FormEvent, prompt?: string) => {
    event?.preventDefault()
    const question = (prompt ?? query).trim()
    if (!question || busy) return
    setBusy(true); setError(''); setPage('Ask')
    try {
      const answer = await request<Answer>('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, documentIds: selected, topK }),
      })
      setTurns(old => [{ id: Date.now(), question, answer, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...old])
      setQuery('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not get an answer.') }
    finally { setBusy(false) }
  }

  const toggleSelected = (id: string) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id])
  const openScope = () => page === 'Ask'
    ? document.querySelector('.qa-context')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    : setPage('Documents')
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) void uploadFiles(event.target.files); event.target.value = '' }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files) }
  const nav = (next: Page) => { setPage(next); if (next === 'Ask') setTimeout(() => queryRef.current?.focus(), 50) }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={e => { e.preventDefault(); nav('Overview') }}><span className="brand-mark"><BookOpen size={18} strokeWidth={2.3} /></span><span>papertrail</span><span className="brand-dot">.</span></a>
      <div className="workspace-switch"><div className="workspace-avatar">S</div><div className="workspace-copy"><strong>Studio workspace</strong><span>Free plan</span></div><ChevronDown size={15} /></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={page === 'Overview' ? 'nav-item active' : 'nav-item'} onClick={() => nav('Overview')}><span className="nav-icon"><Command size={17} /></span>Overview</button>
        <button className={page === 'Documents' ? 'nav-item active' : 'nav-item'} onClick={() => nav('Documents')}><span className="nav-icon"><FolderOpen size={17} /></span>Documents<span className="nav-count">{documents.length}</span></button>
        <button className={page === 'Ask' ? 'nav-item active' : 'nav-item'} onClick={() => nav('Ask')}><span className="nav-icon"><MessageSquareText size={17} /></span>Ask a question</button>
      </nav>
      <div className="side-divider" />
      <div className="side-label recent-label">YOUR LIBRARY <button className="tiny-plus" aria-label="Add PDF" onClick={() => inputRef.current?.click()}><Plus size={15} /></button></div>
      <div className="sidebar-docs">
        {documents.slice(0, 5).map((doc, i) => <button className="sidebar-doc" key={doc.id} onClick={() => { setPage('Documents'); setSearch(doc.name) }}><span className="mini-file" style={{ background: palette[i % palette.length] }}><FileText size={13} /></span><span>{doc.name}</span></button>)}
        {!documents.length && <p className="empty-sidebar">Your PDFs will show up here.</p>}
      </div>
      <div className="sidebar-bottom">
        <div className="storage-card"><div className="storage-top"><HardDrive size={15} /><span>Library storage</span><span className="storage-value">{documents.length} files</span></div><div className="storage-track"><span style={{ width: `${Math.min(documents.length * 6, 100)}%` }} /></div><span className="storage-caption">Files are available for this session</span></div>
        <button className="nav-item bottom-link"><span className="nav-icon"><Settings2 size={17} /></span>Settings</button>
        <div className="profile-row"><div className="profile-avatar">A</div><div className="profile-copy"><strong>Alex Morgan</strong><span>Personal account</span></div><MoreHorizontal size={18} /></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{page}</strong></div><div className="topbar-actions"><button className="icon-button theme-button" onClick={() => setDark(v => !v)} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={17} /> : <Moon size={17} />}<span>{dark ? 'Light mode' : 'Dark mode'}</span></button><span className="top-divider" /><button className="icon-button help-button" title="Help"><CircleHelp size={17} /></button><button className="top-avatar" aria-label="Account">A</button></div></header>
      <nav className="mobile-nav" aria-label="Main navigation">{(['Overview', 'Documents', 'Ask'] as Page[]).map((item, i) => <button key={item} className={page === item ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => nav(item)}>{i === 0 ? <Command size={17} /> : i === 1 ? <FolderOpen size={17} /> : <MessageSquareText size={17} />}<span>{item === 'Ask' ? 'Ask' : item}</span></button>)}</nav>
      <div className="content-wrap">
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
        {page === 'Overview' && <>
          <div className="page-heading"><div><div className="eyebrow"><span className="status-dot" /> YOUR KNOWLEDGE, IN ONE PLACE</div><h1>Good morning, Alex <span className="wave">✳</span></h1><p className="subheading">Your documents are ready when you are.</p></div><button className="button button-outline" onClick={() => nav('Documents')}><FolderOpen size={16} /> Browse library <ArrowRight size={15} /></button></div>
          <div className="hero-card"><div className="hero-glow" /><div className="hero-content"><div className="hero-kicker"><span className="sparkle-box"><Sparkles size={14} /></span> YOUR AI RESEARCH ASSISTANT</div><h2>Every answer starts<br />with what you know.</h2><p>Ask anything across your PDFs. Get clear answers with sources you can trust.</p>
            <form className="ask-box" onSubmit={e => void ask(e)}><MessageSquareText size={18} className="ask-leading" /><textarea ref={queryRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }} placeholder="Ask a question about your documents..." rows={1} /><div className="ask-box-bottom"><button type="button" className="scope-button" onClick={openScope}><BookOpen size={14} />{selected.length ? `${selected.length} selected` : 'All documents'}<ChevronDown size={13} /></button><div className="ask-shortcut">⌘ <span>↵</span></div><button className="send-button" disabled={!query.trim() || busy} aria-label="Send question">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}</button></div></form>
            <div className="suggestions"><span>TRY ASKING</span><button onClick={() => void ask(undefined, 'Summarize the key takeaways')}>Summarize key takeaways <ArrowRight size={13} /></button><button onClick={() => void ask(undefined, 'What are the main themes across my documents?')}>Find common themes <ArrowRight size={13} /></button></div>
          </div><div className="hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sheet sheet-back"><i /><i /><i /></div><div className="art-sheet sheet-front"><div className="art-file-icon"><FileText size={20} /></div><b>KNOWLEDGE<br />IN CONTEXT</b><span className="art-rule" /><span className="art-line" /><span className="art-line short" /><span className="art-highlight">“the details matter”</span></div><div className="art-badge"><Sparkles size={15} /> answers with sources</div><div className="art-spark spark-a">✳</div><div className="art-spark spark-b">✧</div></div></div>
          <section className="stats-grid"><Stat icon={<FileText size={17} />} label="Documents" value={documents.length.toString()} note="in your library" tone="lavender" /><Stat icon={<BookOpen size={17} />} label="Pages indexed" value={totalPages.toLocaleString()} note="ready to search" tone="green" /><Stat icon={<MessageSquareText size={17} />} label="Questions asked" value={turns.length.toString()} note="this session" tone="peach" /><div className="privacy-stat"><span className="privacy-icon"><ShieldCheck size={17} /></span><div><strong>Your work stays yours</strong><span>Documents are only searchable<br />inside this workspace.</span></div><ChevronRight size={16} /></div></section>
          <section className="section-block"><div className="section-heading"><div><h3>Recently added</h3><p>Your latest documents, ready to explore</p></div><button className="text-link" onClick={() => nav('Documents')}>View all <ArrowRight size={14} /></button></div>
            {documents.length ? <div className="document-grid">{documents.slice(0, 3).map((doc, i) => <DocumentCard key={doc.id} doc={doc} index={i} onAsk={() => { setSelected([doc.id]); nav('Ask') }} onDelete={() => void deleteDocument(doc)} />)}</div> : <EmptyState onUpload={() => inputRef.current?.click()} />}
          </section>
          {turns.length > 0 && <section className="section-block"><div className="section-heading"><div><h3>Recent questions</h3><p>Pick up where you left off</p></div><button className="text-link" onClick={() => nav('Ask')}>Open Q&A <ArrowRight size={14} /></button></div><div className="recent-question-list">{turns.slice(0, 3).map(t => <button key={t.id} onClick={() => nav('Ask')}><span className="question-bullet"><MessageSquareText size={15} /></span><span>{t.question}</span><time>{t.time}</time><ArrowRight size={14} /></button>)}</div></section>}
        </>}

        {page === 'Documents' && <><div className="page-heading documents-heading"><div><div className="eyebrow"><span className="status-dot" /> YOUR PERSONAL LIBRARY</div><h1>Documents</h1><p className="subheading">A home for everything you want to understand.</p></div><button className="button button-primary" onClick={() => inputRef.current?.click()}><Plus size={17} /> Add documents</button></div>
          <div className="library-toolbar"><div className="library-count"><strong>{documents.length} documents</strong><span>·</span><span>{totalPages.toLocaleString()} pages indexed</span></div><label className="search-field"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents" /><kbd>⌘ K</kbd></label></div>
          <div className={`upload-strip ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}><div className="upload-icon"><FileUp size={20} /></div><div className="upload-copy"><strong>{uploading ? 'Adding your documents…' : dragging ? 'Drop your PDFs here' : 'Have something new to explore?'}</strong><span>PDF files up to 25 MB. Text-based documents work best.</span></div><button className="button button-outline" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Upload PDF</button></div>
          {filteredDocs.length ? <div className="document-grid library-grid">{filteredDocs.map((doc, i) => <DocumentCard key={doc.id} doc={doc} index={i} onAsk={() => { setSelected([doc.id]); nav('Ask') }} onDelete={() => void deleteDocument(doc)} />)}</div> : <EmptyState onUpload={() => inputRef.current?.click()} searching={!!search} />}
        </>}

        {page === 'Ask' && <div className="qa-page"><div className="qa-heading"><div><div className="eyebrow"><span className="status-dot" /> GROUNDED IN YOUR LIBRARY</div><h1>Ask your documents</h1><p className="subheading">Get thoughtful answers, with the pages to back them up.</p></div><button className="button button-outline" onClick={() => setTurns([])} disabled={!turns.length}><Plus size={16} /> New conversation</button></div>
          <div className="qa-layout"><div className="conversation-column"><div className="conversation-meta"><span className="conversation-badge"><Sparkles size={14} /> AI ASSISTANT</span><span className="meta-separator" /> <span>{selected.length ? `Searching ${selected.length} selected ${selected.length === 1 ? 'document' : 'documents'}` : `Searching all ${documents.length} documents`}</span></div>
            {!turns.length && !busy && <div className="conversation-empty"><div className="empty-spark"><Sparkles size={23} /></div><h3>Curiosity looks good on you.</h3><p>Ask a question and I’ll look across your library for the answer.</p><div className="starter-prompts"><button onClick={() => void ask(undefined, 'Give me a summary of my documents')}>Give me a summary <ArrowRight size={14} /></button><button onClick={() => void ask(undefined, 'What should I know first?')}>What should I know first? <ArrowRight size={14} /></button></div></div>}
            {turns.map(turn => <article className="turn" key={turn.id}><div className="user-question"><span className="user-question-icon"><MessageSquareText size={15} /></span><div><span className="speaker-label">YOU <time>{turn.time}</time></span><p>{turn.question}</p></div></div><div className="assistant-answer"><div className="assistant-avatar"><Sparkles size={15} /></div><div className="answer-main"><span className="speaker-label">PAPERTRAIL <span className="answer-model">GROUNDED ANSWER</span></span><p className="answer-text">{turn.answer.answer}</p>{turn.answer.sources?.length > 0 && <div className="source-section"><div className="source-heading"><span>REFERENCES</span><span>{turn.answer.sources.length} passages</span></div><div className="source-list">{turn.answer.sources.map(source => <button className="source-chip" key={`${turn.id}-${source.rank}`} onClick={() => setActiveSource(source)}><span className="source-number">{source.rank}</span><span className="source-name">{source.documentName}</span><span className="source-page">p. {source.page}</span><ChevronRight size={14} /></button>)}</div></div>}</div></div></article>)}
            {busy && <div className="thinking"><span className="assistant-avatar"><Sparkles size={15} /></span><span className="thinking-dots"><i /><i /><i /></span><span>Searching your library…</span></div>}
            <form className="ask-box conversation-composer" onSubmit={e => void ask(e)}><MessageSquareText size={18} className="ask-leading" /><textarea value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }} placeholder="Ask a follow-up question..." rows={1} /><div className="ask-box-bottom"><button type="button" className="scope-button" onClick={openScope}><BookOpen size={14} />{selected.length ? `${selected.length} selected` : 'All documents'}<ChevronDown size={13} /></button><div className="ask-shortcut">⌘ <span>↵</span></div><button className="send-button" disabled={!query.trim() || busy} aria-label="Send question">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={18} />}</button></div></form><p className="composer-note">Answers are generated from your documents and may need a quick fact-check.</p>
          </div>
          <aside className="qa-context"><div className="context-card"><div className="context-head"><div><span className="context-eyebrow">SEARCH SCOPE</span><h3>Your library</h3></div><span className="scope-live"><i /> LIVE</span></div><p>Choose which documents to include in your answers.</p><div className="scope-controls"><button className={selected.length === 0 ? 'scope-choice selected' : 'scope-choice'} onClick={() => setSelected([])}><span className="radio-mark" />All documents<span>{documents.length}</span></button>{documents.map((doc, i) => <button className={selected.includes(doc.id) ? 'scope-choice selected' : 'scope-choice'} key={doc.id} onClick={() => toggleSelected(doc.id)}><span className="radio-mark" /><span className="scope-doc-icon" style={{ background: palette[i % palette.length] }}><FileText size={12} /></span><span className="scope-doc-name">{doc.name}</span></button>)}</div>{!documents.length && <button className="context-upload" onClick={() => inputRef.current?.click()}><Plus size={15} /> Add a PDF to get started</button>}<div className="retrieval-setting"><label htmlFor="top-k">Passages to retrieve</label><select id="top-k" value={topK} onChange={e => setTopK(Number(e.target.value))}>{[3, 5, 8, 10, 15, 20].map(value => <option key={value} value={value}>{value} passages</option>)}</select></div><div className="context-foot"><ShieldCheck size={14} /> Only selected files are searched</div></div><div className="tips-card"><div className="tips-icon"><Sparkles size={16} /></div><div><strong>Ask with context</strong><p>Try asking for a comparison, a summary, or a specific detail from your files.</p></div></div></aside></div>
        </div>}
      </div>
    </main>
    <input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" multiple onChange={onFileChange} />
    {activeSource && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActiveSource(null) }}><div className="source-modal" role="dialog" aria-modal="true" aria-label="Source passage"><div className="modal-head"><div className="modal-title-icon"><FileText size={17} /></div><div><span className="modal-overline">SOURCE PASSAGE · PAGE {activeSource.page}</span><h3>{activeSource.documentName}</h3></div><button className="icon-button" onClick={() => setActiveSource(null)} aria-label="Close"><X size={17} /></button></div><div className="modal-body"><div className="passage-quote">“{activeSource.snippet}”</div><div className="relevance-row"><span>Relevance score</span><strong>{Math.round(activeSource.score * 100)}%</strong></div><div className="relevance-track"><span style={{ width: `${Math.min(Math.max(activeSource.score * 100, 0), 100)}%` }} /></div></div><div className="modal-footer"><span><ShieldCheck size={14} /> Retrieved from your document</span><button className="button button-outline" onClick={() => setActiveSource(null)}>Done <Check size={15} /></button></div></div></div>}
  </div>
}

function Stat({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>
}

function DocumentCard({ doc, index, onAsk, onDelete }: { doc: DocumentInfo; index: number; onAsk: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false)
  return <article className="document-card"><div className="document-card-top"><div className="doc-cover" style={{ '--cover': palette[index % palette.length] } as React.CSSProperties}><span>{initials(doc.name)}</span><i /><i /><i /></div><div className="doc-menu-wrap"><button className="doc-menu-button" aria-label="Document options" onClick={() => setMenu(v => !v)}><MoreHorizontal size={17} /></button>{menu && <><button className="menu-dismiss" onClick={() => setMenu(false)} aria-label="Close menu" /><div className="doc-menu"><button onClick={() => { setMenu(false); onAsk() }}><MessageSquareText size={14} /> Ask about this</button><button className="danger-item" onClick={() => { setMenu(false); onDelete() }}><Trash2 size={14} /> Remove</button></div></>}</div></div><h3 title={doc.name}>{doc.name}</h3><div className="document-meta"><span>{doc.pages} {doc.pages === 1 ? 'page' : 'pages'}</span><i /> <span>{doc.chunks} passages</span></div><div className="document-card-footer"><span className="indexed-label"><span /> Indexed</span><button className="card-ask-link" onClick={onAsk}>Ask PDF <ArrowRight size={13} /></button></div></article>
}

function EmptyState({ onUpload, searching = false }: { onUpload: () => void; searching?: boolean }) {
  return <div className="empty-state"><div className="empty-art"><div className="empty-page"><FileText size={24} /></div><div className="empty-sparkle">✳</div></div><h3>{searching ? 'No matches found' : 'A little space for big ideas.'}</h3><p>{searching ? 'Try a different search term.' : 'Add a PDF to start asking questions and uncovering the details that matter.'}</p>{!searching && <button className="button button-primary" onClick={onUpload}><Plus size={16} /> Upload your first PDF</button>}</div>
}
