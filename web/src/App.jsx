import { useState, useCallback, useEffect, useRef } from 'react'
import LobbyScreen from './components/LobbyScreen.jsx'
import CallScreen from './components/CallScreen.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import TelephonyAudio from './utils/TelephonyAudio.js'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [screen, setScreen] = useState(window.location.pathname === '/dashboard' ? 'admin' : 'lobby') // 'lobby' | 'call' | 'admin'
  const [targetId, setTargetId] = useState('')
  const [onlineClients, setOnlineClients] = useState([])
  const [incomingCall, setIncomingCall] = useState(null) // { fromId }
  const [isInitiator, setIsInitiator] = useState(false)
  const [isWaiting, setIsWaiting] = useState(false)
  const [audioStatus, setAudioStatus] = useState('uninitialized')
  const wsRef = useRef(null)

  useEffect(() => {
    fetch('/api/users/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then(user => {
        setCurrentUser(user);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/users')
      .then(res => res.json())
      .then(users => {
        setOnlineClients(prev => {
          const filtered = users.filter(u => u.id !== currentUser.id);
          return filtered.map(u => {
            const existing = prev.find(p => p.id === u.id);
            return { ...u, online: existing ? existing.online : false };
          });
        });
      })
      .catch(err => console.error('Failed to fetch users:', err));
  }, [currentUser]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('<<< [SIGNAL SEND]', msg)
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return;

    if ("Notification" in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') TelephonyAudio.init();
      });
    }

    TelephonyAudio.onStateChange = (state) => setAudioStatus(state);
    setAudioStatus(TelephonyAudio.getState());

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/signal?userId=${encodeURIComponent(currentUser.id)}`
    console.log('>>> [WS CONNECTING TO]', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('>>> [WS CONNECTED SUCCESS] as', currentUser.id)
      // 'identify' is no longer needed since backend uses session
    }

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data)
      console.log('>>> [SIGNAL RECV]', msg)

      switch (msg.type) {
        case 'client-list':
          console.log('>>> [CLIENT-LIST RECEIVED]', msg.clients)
          setOnlineClients(msg.clients)
          break

        case 'incoming-call':
          setIncomingCall({ fromId: msg.fromId })
          break

        case 'offer':
          // Auto-transition to call screen if receiving an offer
          setTargetId(msg.fromId)
          setIsInitiator(false)
          setIsWaiting(false)
          setScreen('call')
          break

        case 'call-accepted':
          console.log('>>> [CALL] Accepted by', msg.fromId)
          TelephonyAudio.playClick()
          setIsWaiting(false)
          break

        case 'call-declined':
          console.log('>>> [CALL] Declined by', msg.fromId)
          TelephonyAudio.playClick()
          alert('Call declined by ' + msg.fromId)
          setScreen('lobby')
          setTargetId('')
          setIsWaiting(false)
          break

        case 'leave':
          console.log('>>> [CALL] Peer left:', msg.fromId)
          TelephonyAudio.playClick()
          setScreen('lobby')
          setTargetId('')
          setIsWaiting(false)
          break

        default:
          break
      }
    }

    ws.addEventListener('message', handleMessage)

    return () => {
      ws.removeEventListener('message', handleMessage)
      ws.close()
    }
  }, [currentUser, sendMessage])

  useEffect(() => {
    if (incomingCall && screen === 'lobby') {
      TelephonyAudio.startRingtone()
    } else {
      TelephonyAudio.stopRingtone()
    }
  }, [incomingCall, screen])

  useEffect(() => {
    if (isWaiting && screen === 'call') {
      TelephonyAudio.startRingback()
    } else {
      TelephonyAudio.stopRingback()
    }
  }, [isWaiting, screen])

  const handleCall = useCallback((id) => {
    TelephonyAudio.playClick()
    setTargetId(id)
    setIsInitiator(true)
    setIsWaiting(true)
    setScreen('call')
    sendMessage({ type: 'call', targetId: id })
  }, [sendMessage])

  const handleAcceptCall = useCallback(() => {
    if (incomingCall) {
      TelephonyAudio.playClick()
      const fromId = incomingCall.fromId
      setTargetId(fromId)
      setIsInitiator(false)
      setIsWaiting(false)
      setScreen('call')
      setIncomingCall(null)
      sendMessage({ type: 'call-accepted', targetId: fromId })
    }
  }, [incomingCall, sendMessage])

  const handleDeclineCall = useCallback(() => {
    if (incomingCall) {
        TelephonyAudio.playClick()
        sendMessage({ type: 'call-declined', targetId: incomingCall.fromId })
        setIncomingCall(null)
    }
  }, [incomingCall, sendMessage])

  const handleLeave = useCallback(() => {
    TelephonyAudio.playClick()
    TelephonyAudio.stopAll()
    sendMessage({ type: 'leave', targetId })
    setScreen('lobby')
    setTargetId('')
    setIsWaiting(false)
  }, [targetId, sendMessage])

  if (!authChecked) return null;
  if (!currentUser) return <LoginScreen />;

  return (
    <div onClick={() => TelephonyAudio.init()}>
      {incomingCall && screen === 'lobby' && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: 20, 
          background: '#fff', border: '1px solid #ccc', borderRadius: 8, 
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 10
        }}>
          <strong>Incoming call from {incomingCall.fromId}</strong>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleAcceptCall} style={{ background: '#4CAF50', color: 'white', padding: '5px 15px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Accept</button>
            <button onClick={handleDeclineCall} style={{ background: '#f44336', color: 'white', padding: '5px 15px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      )}

      {screen === 'lobby' ? (
        <LobbyScreen 
          currentUser={currentUser} 
          onlineClients={onlineClients} 
          onCall={handleCall}
          audioStatus={audioStatus}
          ws={wsRef.current}
        />
      ) : screen === 'call' ? (
        <CallScreen 
          myId={currentUser.id} 
          targetId={targetId} 
          isInitiator={isInitiator}
          isWaiting={isWaiting}
          onLeave={handleLeave} 
          ws={wsRef.current} 
        />
      ) : (
        <AdminDashboard onBack={() => {
            window.history.pushState({}, '', '/');
            setScreen('lobby');
        }} />
      )}
    </div>
  )
}
