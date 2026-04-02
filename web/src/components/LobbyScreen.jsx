import { useState } from 'react'
import styles from './LobbyScreen.module.css'

export default function LobbyScreen({ onJoin }) {
  const [roomId, setRoomId] = useState('')
  const [error, setError]   = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = roomId.trim()
    if (!trimmed) {
      setError('Please enter a room code.')
      return
    }
    onJoin(trimmed)
  }

  const randomRoom = () => {
    const id = Math.random().toString(36).slice(2, 8).toUpperCase()
    setRoomId(id)
    setError('')
  }

  return (
    <div className={styles.wrapper}>
      {/* Logo / branding */}
      <div className={styles.logo}>
        <span className={styles.logoIcon}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="url(#lg)" />
            <path d="M9 12h14M9 16h10M9 20h7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6c63ff"/>
                <stop offset="1" stopColor="#a78bfa"/>
              </linearGradient>
            </defs>
          </svg>
        </span>
        <h1 className={styles.logoText}>iMessanger</h1>
      </div>

      {/* Card */}
      <div className={styles.card}>
        <p className={styles.subtitle}>
          Enter a room code to start or join a video call
        </p>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <label htmlFor="roomId" className={styles.label}>Room Code</label>
          <div className={styles.inputRow}>
            <input
              id="roomId"
              type="text"
              className={styles.input}
              placeholder="e.g. ABC123"
              value={roomId}
              onChange={(e) => { setRoomId(e.target.value.toUpperCase()); setError('') }}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              id="btn-random-room"
              className={styles.btnSecondary}
              onClick={randomRoom}
              title="Generate random room"
            >
              🎲
            </button>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button id="btn-join-call" type="submit" className={styles.btnPrimary}>
            <span className={styles.btnIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </span>
            Join Call
          </button>
        </form>

        <p className={styles.hint}>
          Share the same room code with the other person to connect.
        </p>
      </div>

      {/* Footer */}
      <p className={styles.footer}>End-to-end encrypted · Peer-to-peer · No account needed</p>
    </div>
  )
}
