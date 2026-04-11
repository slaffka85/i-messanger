import React from 'react';

export default function LoginScreen() {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
            <h1>Welcome to iMessanger</h1>
            <p>Please log in to continue</p>
            <a href="/oauth2/authorization/google" style={{
                padding: '10px 20px',
                backgroundColor: '#4285F4',
                color: 'white',
                textDecoration: 'none',
                borderRadius: '5px',
                fontWeight: 'bold'
            }}>
                Sign in with Google
            </a>
        </div>
    );
}
