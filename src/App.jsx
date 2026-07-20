import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { api, demoMode } from './lib/api.js'
import Login from './components/Login.jsx'
import TopNav from './components/TopNav.jsx'
import Gallery from './components/Gallery.jsx'
import Board from './components/Board.jsx'
import CardModal from './components/CardModal.jsx'
import TableView from './components/TableView.jsx'
import Dashboard from './components/Dashboard.jsx'
import Calendar from './components/Calendar.jsx'
import Roster from './components/Roster.jsx'
import Teams from './components/Teams.jsx'
import Customers from './components/Customers.jsx'
import Members from './components/Members.jsx'
import Exports from './components/Exports.jsx'
import Integration from './components/Integration.jsx'
import Audit from './components/Audit.jsx'
import Settings from './components/Settings.jsx'

const SECTIONS = { dashboard: Dashboard, calendar: Calendar, roster: Roster, teams: Teams, customers: Customers, members: Members, exports: Exports, integration: Integration, audit: Audit, settings: Settings }

export default function App() {
  const [entered, setEntered] = useState(false)
  const [session, setSession] = useState(null)
  const [membership, setMembership] = useState(null)
  const [view, setView] = useState('gallery')
  const [boardId, setBoardId] = useState(null)
  const [boards, setBoards] = useState([])
  const [openCardId, setOpenCardId] = useState(null)
  const [modalData, setModalData] = useState(null)
  const [cardVersion, setCardVersion] = useState(0)

  // real-mode auth
  useEffect(() => {
    if (demoMode) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (demoMode || !session) return
    supabase.rpc('provision_me').then(({ data }) => { setMembership(data); if (data) setEntered(true) })
  }, [session])

  // boards list (for gallery + day tabs)
  useEffect(() => { if (entered) api.getBoards().then(setBoards) }, [entered, view, cardVersion])

  // load card for the modal
  useEffect(() => {
    if (!openCardId || !boardId) { setModalData(null); return }
    api.getBoardDetail(boardId).then((d) => {
      const card = d.cards.find((c) => c.id === openCardId)
      const list = card && d.lists.find((l) => l.id === card.list_id)
      setModalData(card ? { card, listName: list?.name || '', lists: d.lists } : null)
    })
  }, [openCardId, boardId, cardVersion])

  function logout() {
    if (!demoMode) supabase.auth.signOut()
    setEntered(false); setSession(null); setMembership(null); setView('gallery')
  }
  async function createBoard(title) {
    const b = await api.addBoard({ title })
    setBoardId(b.id); setView('board')
  }

  if (!entered) {
    if (!demoMode && session && !membership) return <NotAuthorized email={session.user.email} onOut={logout} />
    return <Frame><Login onEnter={() => setEntered(true)} /></Frame>
  }

  const Section = SECTIONS[view]
  return (
    <Frame>
      {view === 'board' && (
        <Board
          boardId={boardId} boards={boards} cardVersion={cardVersion}
          membership={membership} demo={demoMode}
          onBack={() => setView('gallery')}
          onSelectDay={(id) => setBoardId(id)}
          onOpenCard={(id) => setOpenCardId(id)}
          onSwitchView={(v) => setView(v)}
        />
      )}
      {view === 'table' && (
        <TableView
          boardId={boardId} boards={boards} cardVersion={cardVersion}
          canEdit={demoMode || ['admin', 'editor'].includes(membership?.access)}
          onBack={() => setView('gallery')}
          onSelectDay={(id) => setBoardId(id)}
          onOpenCard={(id) => setOpenCardId(id)}
          onSwitchView={(v) => setView(v)}
        />
      )}
      {view === 'gallery' && (
        <>
          <TopNav view={view} demo={demoMode} onLogout={logout} onNavigate={(v) => { setView(v); if (v === 'gallery') setBoardId(null) }} />
          <Gallery onOpenBoard={(id) => { setBoardId(id); setView('board') }} onCreateBoard={createBoard} />
        </>
      )}
      {Section && (
        <Section
          onBack={() => setView('gallery')}
          onOpenBoard={(id) => { setBoardId(id); setView('board') }}
          canEdit={demoMode || ['admin', 'editor'].includes(membership?.access)}
          membership={membership}
        />
      )}

      {modalData && (
        <CardModal
          card={modalData.card} listName={modalData.listName} lists={modalData.lists}
          canEdit={demoMode || ['admin', 'editor'].includes(membership?.access)}
          onChanged={() => setCardVersion((v) => v + 1)}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </Frame>
  )
}

function Frame({ children }) {
  return (
    <div style={{ height: '100vh', width: '100vw', fontFamily: 'var(--sans)', background: 'var(--bg)', color: 'var(--ink)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

function NotAuthorized({ email, onOut }) {
  return (
    <Frame>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 32, maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--disp)', fontSize: 20, margin: '0 0 8px' }}>Not authorized</h1>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 16px' }}>{email} has no active membership. Ask an admin to invite you.</p>
          <button onClick={onOut} style={{ fontSize: 13, color: 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    </Frame>
  )
}
