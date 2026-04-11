import React, { useState } from 'react'
import TelephonyAudio from '../utils/TelephonyAudio'
import styles from './LobbyScreen.module.css'
import Chat from './Chat'

export default function LobbyScreen({ currentUser, onlineClients, onCall, audioStatus, ws }) {
  const myId = currentUser.id
  const myName = currentUser.name || currentUser.id
  const [chatPeer, setChatPeer] = useState(null)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <p className={styles.subtitle} style={{ margin: 0 }}>
            Welcome, <strong>{myName}</strong>.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Audio Status Badge */}
            <div 
              className={audioStatus !== 'running' ? styles.badgePulse : ''}
              onClick={() => TelephonyAudio.init()}
              style={{ 
                padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                background: audioStatus === 'running' ? 'rgba(35, 209, 96, 0.1)' : 'rgba(255, 59, 48, 0.15)',
                color: audioStatus === 'running' ? '#23d160' : '#ff3b30',
                border: `1px solid ${audioStatus === 'running' ? 'rgba(35, 209, 96, 0.2)' : 'rgba(255, 59, 48, 0.3)'}`,
                display: 'flex', alignItems: 'center', gap: '4px',
                cursor: audioStatus !== 'running' ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                userSelect: 'none'
              }}
              title={audioStatus === 'running' ? 'Sound System Ready' : 'Sound Blocked by Browser. Click to Enable.'}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
              {audioStatus === 'running' ? 'SOUND: ON' : 'SOUND: OFF (CLICK)'}
            </div>
            
            {/* Notifications Status Badge */}
            <div 
              style={{ 
                padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                background: Notification.permission === 'granted' ? 'rgba(35, 209, 96, 0.1)' : 'rgba(108, 99, 255, 0.1)',
                color: Notification.permission === 'granted' ? '#23d160' : '#8b8bba',
                border: `1px solid ${Notification.permission === 'granted' ? 'rgba(35, 209, 96, 0.2)' : 'rgba(108, 99, 255, 0.2)'}`,
                userSelect: 'none'
              }}
              title={`Notification permission: ${Notification.permission}`}
            >
              NOTIFS: {Notification.permission.toUpperCase()}
            </div>
          </div>
        </div>

        <div className={styles.activeRoomsSection}>
          <div className={styles.roomsHeader}>
            <h3 className={styles.activeRoomsTitle}>Users</h3>
          </div>

          {onlineClients.length > 0 ? (
            <div className={styles.roomsGrid}>
              {onlineClients.map(client => (
                <div key={client.id} className={styles.clientItem} style={{ opacity: client.online ? 1 : 0.7 }}>
                  <div className={styles.clientInfo}>
                    <span 
                      className={styles.roomDot} 
                      style={{ background: client.online ? '#23d160' : '#8b8bba' }} 
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className={styles.clientIdText}>{client.name || client.id}</span>
                      <span style={{ fontSize: '0.7rem', color: '#8b8bba' }}>{client.online ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      className={styles.btnPrimarySmall}
                      style={{ background: '#2196F3' }}
                      onClick={() => setChatPeer({ id: client.id, name: client.name || client.id })}
                      title={`Chat with ${client.name || client.id}`}
                    >
                      💬 Chat
                    </button>
                    <button
                      className={styles.btnPrimarySmall}
                      onClick={() => onCall(client.id)}
                      disabled={!client.online}
                      style={{ 
                        opacity: client.online ? 1 : 0.5,
                        cursor: client.online ? 'pointer' : 'not-allowed',
                        filter: client.online ? 'none' : 'grayscale(1)'
                      }}
                      title={client.online ? `Call ${client.id}` : 'User is offline'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                      </svg>
                      Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.noRooms}>No other users found.</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className={styles.footer}>End-to-end encrypted · Peer-to-peer · Direct Calls</p>
      
      {chatPeer && (
        <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 100 }}>
           <Chat 
             myId={myId} 
             targetId={chatPeer.id} 
             targetName={chatPeer.name}
             ws={ws} 
             onClose={() => setChatPeer(null)}
           />
        </div>
      )}
    </div>
  )
}
