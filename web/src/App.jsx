import { useState, useCallback } from 'react'
import LobbyScreen from './components/LobbyScreen.jsx'
import CallScreen from './components/CallScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'call'
  const [roomId, setRoomId] = useState('')

  const handleJoin = useCallback((id) => {
    setRoomId(id)
    setScreen('call')
  }, [])

  const handleLeave = useCallback(() => {
    setScreen('lobby')
    setRoomId('')
  }, [])

  return screen === 'lobby'
    ? <LobbyScreen onJoin={handleJoin} />
    : <CallScreen roomId={roomId} onLeave={handleLeave} />
}
