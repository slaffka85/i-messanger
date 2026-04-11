import React, { useState, useEffect, useRef } from 'react';
import styles from './Chat.module.css';

export default function Chat({ myId, targetId, targetName, ws, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!targetId) return;
    fetch(`/api/messages/${targetId}`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(console.error);
  }, [targetId]);

  useEffect(() => {
    if (!ws) return;
    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'chat-message') {
        if (msg.fromId === targetId || msg.fromId === myId) {
          setMessages(prev => [...prev, {
            id: msg.id || Date.now(),
            senderId: msg.fromId,
            recipientId: msg.targetId,
            text: msg.text,
            fileId: msg.fileId,
            fileName: msg.fileName,
            createdAt: msg.createdAt || new Date().toISOString(),
            status: msg.status || 'SENT'
          }]);
        }
      } else if (msg.type === 'message-sent') {
          // Update temp ID with real DB ID
          setMessages(prev => prev.map(m => 
            m.id === msg.tempId ? { ...m, id: msg.id, status: 'SENT' } : m
          ));
      } else if (msg.type === 'message-delivered') {
          // Update status to DELIVERED
          setMessages(prev => prev.map(m => 
            m.id === msg.id ? { ...m, status: 'DELIVERED' } : m
          ));
      }
    };
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, targetId, myId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !file) return;

    const tempId = 'temp-' + Date.now();
    let attachedFileId = null;
    let attachedFileName = null;

    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        attachedFileId = data.fileId;
        attachedFileName = data.fileName;
      } catch (err) {
        console.error('File upload failed', err);
        return;
      }
    }

    const newMsg = {
      type: 'chat-message',
      tempId,
      targetId,
      text: inputText,
      fileId: attachedFileId,
      fileName: attachedFileName
    };

    ws.send(JSON.stringify(newMsg));

    setMessages(prev => [...prev, {
      id: tempId,
      senderId: myId,
      recipientId: targetId,
      text: inputText,
      fileId: attachedFileId,
      fileName: attachedFileName,
      createdAt: new Date().toISOString(),
      status: 'SENT'
    }]);

    setInputText('');
    setFile(null);
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  };

  const renderStatus = (status) => {
    if (status === 'READ') return <span style={{ color: '#4fc3f7', marginLeft: '4px', fontSize: '10px' }}>✔✔</span>;
    if (status === 'DELIVERED') return <span style={{ color: 'rgba(255,255,255,0.6)', marginLeft: '4px', fontSize: '10px' }}>✔✔</span>;
    return <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '4px', fontSize: '10px' }}>✔</span>;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span className={styles.headerTitle}>{targetName || targetId}</span>
        </div>
        <button onClick={onClose} className={styles.closeBtn} title="Close Chat">&times;</button>
      </div>

      <div className={styles.messagesList}>
        {messages.map((m, i) => {
          const isMine = m.senderId === myId;
          return (
            <div key={m.id || i} className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
              {m.text && <div>{m.text}</div>}
              {m.fileId && (
                <a 
                  href={`/api/files/${m.fileId}?fileName=${encodeURIComponent(m.fileName)}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className={styles.fileLink}
                >
                  📎 {m.fileName}
                </a>
              )}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                alignItems: 'center', 
                fontSize: '0.7rem', 
                marginTop: '4px',
                opacity: 0.7 
              }}>
                <span>{formatTime(m.createdAt)}</span>
                {isMine && renderStatus(m.status)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className={styles.inputArea}>
        {file && (
          <div className={styles.attachmentInfo}>
            <span>📎 {file.name}</span>
            <button type="button" onClick={() => setFile(null)} className={styles.removeFile}>&times;</button>
          </div>
        )}
        <div className={styles.inputRow}>
          <label className={styles.fileLabel}>
            📎
            <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          </label>
          <input 
            type="text" 
            value={inputText} 
            onChange={e => setInputText(e.target.value)} 
            placeholder="Type a message..." 
            className={styles.textInput} 
          />
          <button type="submit" disabled={!inputText.trim() && !file} className={styles.sendBtn}>
            🚀
          </button>
        </div>
      </form>
    </div>
  );
}
