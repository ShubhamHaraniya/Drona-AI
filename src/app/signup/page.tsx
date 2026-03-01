'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Signup failed');
                setLoading(false);
                return;
            }

            router.push('/login');
        } catch {
            setError('Something went wrong. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card glass-card">
                <div className="auth-brand">
                    <span className="auth-brand-emoji">🏹</span>
                    <div className="auth-brand-name">Drona AI</div>
                    <div className="auth-brand-hindi">Drona AI — Start Your Journey</div>
                </div>

                <h1 className="auth-title">Create Account</h1>
                <p className="auth-subtitle">Join Drona AI and start mastering your subjects</p>

                {error && <div className="auth-error">{error}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                            className="input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Arjun Sharma"
                            required
                        />
                    </div>

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
                            placeholder="Min 6 characters"
                            minLength={6}
                            required
                        />
                    </div>

                    <button
                        className="btn btn-primary btn-lg"
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {loading ? 'Creating Account...' : '🎯 Create Account'}
                    </button>
                </form>

                <p className="auth-link">
                    Already have an account? <a href="/login">Sign in</a>
                </p>
            </div>
        </div>
    );
}
