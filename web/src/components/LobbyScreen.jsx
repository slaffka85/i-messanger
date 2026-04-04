import { useState, useEffect } from 'react'
import styles from './LobbyScreen.module.css'

export default function LobbyScreen({ onJoin, availableRooms, onRefresh }) {
  const [roomId, setRoomId] = useState('')
  const [error, setError]   = useState('')

  // Trigger initial refresh on mount
  useEffect(() => {
    onRefresh()
  }, [onRefresh])

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

        <div className={styles.activeRoomsSection}>
          <div className={styles.roomsHeader}>
            <h3 className={styles.activeRoomsTitle}>Available Rooms</h3>
            <button 
              type="button" 
              className={styles.refreshBtn} 
              onClick={onRefresh}
              title="Refresh room list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          {availableRooms.length > 0 ? (
            <div className={styles.roomsGrid}>
              {availableRooms.map(room => (
                <button
                  key={room}
                  className={styles.roomChip}
                  onClick={() => onJoin(room)}
                  title={`Join room ${room}`}
                >
                  <span className={styles.roomDot} />
                  {room}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.noRooms}>No active rooms found.</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className={styles.footer}>End-to-end encrypted · Peer-to-peer · No account needed</p>
    </div>
  )
}
