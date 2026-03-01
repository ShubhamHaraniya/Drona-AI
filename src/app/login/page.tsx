'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });

        setLoading(false);

        if (result?.error) {
            setError('Invalid email or password');
        } else {
            router.push('/');
            router.refresh();
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card glass-card">
                <div className="auth-brand">
                    <span className="auth-brand-emoji">🏹</span>
                    <div className="auth-brand-name">Drona AI</div>
                    <div className="auth-brand-hindi">Drona AI — The Intelligent Charioteer</div>
                </div>

                <h1 className="auth-title">Welcome Back</h1>
                <p className="auth-subtitle">Sign in to continue your learning journey</p>

                {error && <div className="auth-error">{error}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        className="btn btn-primary btn-lg"
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {loading ? 'Signing in...' : '🚀 Sign In'}
                    </button>

                    {/* Dummy Quick Logins */}
                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>Test Accounts (1-Click Login)</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEmail('spharaniya18@gmail.com'); setPassword('pass123'); }}>
                                👨‍🎓 Student (Shubham)
                            </button>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setEmail('rajesh.kumar@drona.edu'); setPassword('pass123'); }}>
                                    👨‍🏫 Teacher (Rajesh)
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setEmail('priya.sharma@drona.edu'); setPassword('pass123'); }}>
                                    👩‍🏫 Teacher (Priya)
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                <p className="auth-link" style={{ marginTop: '24px' }}>
                    Don&apos;t have an account? <a href="/signup">Create one</a>
                </p>
            </div>
        </div>
    );
}
