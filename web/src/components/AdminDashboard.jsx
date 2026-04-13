import React, { useState, useEffect } from 'react';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard({ onBack }) {
    const [metrics, setMetrics] = useState({
        cpu: 0,
        memory: 0,
        sockets: 0,
        status: 'UP'
    });
    const [history, setHistory] = useState({ cpu: [], memory: [], sockets: [] });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [cpuRes, memRes, wsRes, healthRes] = await Promise.all([
                    fetch('/actuator/metrics/system.cpu.usage').then(r => r.json()),
                    fetch('/actuator/metrics/jvm.memory.used').then(r => r.json()),
                    fetch('/actuator/metrics/imessanger.ws.online_users').then(r => r.json()),
                    fetch('/actuator/health').then(r => r.json())
                ]);

                const cpuVal = (cpuRes.measurements[0].value * 100).toFixed(2);
                const memVal = (memRes.measurements[0].value / 1024 / 1024).toFixed(2);
                const wsVal = wsRes.measurements[0].value;
                const statusVal = healthRes.status;

                setMetrics({
                    cpu: cpuVal,
                    memory: memVal,
                    sockets: wsVal,
                    status: statusVal
                });

                setHistory(prev => ({
                    cpu: [...prev.cpu.slice(-20), cpuVal],
                    memory: [...prev.memory.slice(-20), memVal],
                    sockets: [...prev.sockets.slice(-20), wsVal]
                }));
            } catch (err) {
                console.error('Failed to fetch metrics', err);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, []);

    const maxMem = Math.max(...history.memory, 1);
    const maxWs = Math.max(...history.sockets, 1);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Admin Dashboard</h1>
                <button onClick={onBack} className={styles.backBtn}>Back to Lobby</button>
            </div>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <h3>CPU Usage</h3>
                    <div className={styles.value}>{metrics.cpu}%</div>
                    <div className={styles.chart}>
                        {history.cpu.map((v, i) => (
                            <div key={i} className={styles.bar} style={{ height: `${v}%`, background: '#6c63ff' }}></div>
                        ))}
                    </div>
                </div>

                <div className={styles.card}>
                    <h3>Memory Used</h3>
                    <div className={styles.value}>{metrics.memory} MB</div>
                    <div className={styles.chart}>
                        {history.memory.map((v, i) => (
                            <div key={i} className={styles.bar} style={{ height: `${(v / maxMem) * 100}%`, background: '#a78bfa' }}></div>
                        ))}
                    </div>
                </div>

                <div className={styles.card}>
                    <h3>WS Connections</h3>
                    <div className={styles.value}>{metrics.sockets}</div>
                    <div className={styles.chart}>
                        {history.sockets.map((v, i) => (
                            <div key={i} className={styles.bar} style={{ height: `${(v / maxWs) * 100}%`, background: '#10b981' }}></div>
                        ))}
                    </div>
                </div>

                <div className={styles.card}>
                    <h3>System Health</h3>
                    <div className={`${styles.status} ${metrics.status === 'UP' ? styles.statusUp : styles.statusDown}`}>
                        {metrics.status}
                    </div>
                    <p style={{ marginTop: '10px', fontSize: '0.9rem', opacity: 0.7 }}>
                        All systems operational
                    </p>
                </div>
            </div>

            <div className={styles.details}>
                <h3>Real-time Metrics (Actuator)</h3>
                <p>The dashboard is powered by Spring Boot Actuator and Micrometer.</p>
                <div className={styles.endpoints}>
                   <code>GET /actuator/metrics/imessanger.ws.online_users</code>
                   <code>GET /actuator/health</code>
                </div>
            </div>
        </div>
    );
}
