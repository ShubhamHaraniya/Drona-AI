'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type TeacherTab = 'subjects' | 'grades' | 'schedule' | 'analytics' | 'materials';

interface Subject { id: string; name: string; code: string; description: string; enrollments: Array<{ id: string; student: { id: string; name: string; email: string } }> }
interface GradeEntry { studentId: string; studentName: string; marks: number; totalMarks: number }
interface AnalyticsData {
    subjectName: string; enrolledCount: number;
    heatmap: Array<{ topic: string; avgMastery: number; studentCount: number; failingStudents: number; color: string }>;
    gradeAvgs: Array<{ component: string; average: number; totalMarks: number; percentage: number; studentCount: number }>;
    alerts: Array<{ severity: string; message: string }>;
    trendData: Array<{ month: string; avgScore: number; quizCount: number }>;
}
interface MaterialItem { id: string; fileName: string; docType: string; uploadDate: string; uploader?: { name: string } }

export default function TeacherPortal() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [tab, setTab] = useState<TeacherTab>('subjects');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [newSubject, setNewSubject] = useState({ name: '', code: '', description: '' });
    const [selectedSubject, setSelectedSubject] = useState<string>('');
    const [componentType, setComponentType] = useState('Minor_1');
    const [gradeEntries, setGradeEntries] = useState<GradeEntry[]>([]);
    const [scheduleForm, setScheduleForm] = useState({ title: '', type: 'exam', datetime: '' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [uploadDocType, setUploadDocType] = useState('lecture_notes');

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
        if (status === 'authenticated' && (session?.user as { role?: string })?.role !== 'TEACHER') {
            router.push('/');
        }
    }, [status, session, router]);

    const fetchSubjects = useCallback(async () => {
        try {
            const res = await fetch('/api/subjects');
            if (res.ok) {
                const data = await res.json();
                setSubjects(data.subjects || []);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => { if (session) fetchSubjects(); }, [session, fetchSubjects]);

    useEffect(() => {
        if (selectedSubject && tab === 'grades') {
            const subj = subjects.find(s => s.id === selectedSubject);
            if (subj) {
                setGradeEntries(subj.enrollments.map(e => ({
                    studentId: e.student.id,
                    studentName: e.student.name,
                    marks: 0,
                    totalMarks: 25,
                })));
            }
        }
    }, [selectedSubject, tab, subjects]);

    // Fetch analytics when subject selected on analytics tab
    useEffect(() => {
        if (selectedSubject && tab === 'analytics') {
            fetch(`/api/analytics?subjectId=${selectedSubject}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => d && setAnalyticsData(d))
                .catch(() => { });
        }
    }, [selectedSubject, tab]);

    // Fetch materials
    useEffect(() => {
        if (selectedSubject && tab === 'materials') {
            fetch(`/api/materials?subjectId=${selectedSubject}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => d && setMaterials(d.materials || []))
                .catch(() => { });
        }
    }, [selectedSubject, tab]);

    const createSubject = async () => {
        if (!newSubject.name) return;
        setSaving(true);
        try {
            const res = await fetch('/api/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSubject),
            });
            if (res.ok) {
                setMessage('✅ Subject created!');
                setNewSubject({ name: '', code: '', description: '' });
                fetchSubjects();
            }
        } catch { setMessage('❌ Failed to create subject'); }
        setSaving(false);
    };

    const saveGrades = async () => {
        if (!selectedSubject || !gradeEntries.length) return;
        setSaving(true);
        try {
            const res = await fetch('/api/grades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjectId: selectedSubject,
                    componentType,
                    grades: gradeEntries.map(g => ({ studentId: g.studentId, marks: g.marks, totalMarks: g.totalMarks })),
                }),
            });
            const data = await res.json();
            setMessage(res.ok ? `✅ ${data.message}` : `❌ ${data.error}`);
        } catch { setMessage('❌ Failed to save grades'); }
        setSaving(false);
    };

    const broadcastSchedule = async () => {
        if (!selectedSubject || !scheduleForm.title || !scheduleForm.datetime) return;
        setSaving(true);
        const subj = subjects.find(s => s.id === selectedSubject);
        try {
            for (const e of subj?.enrollments || []) {
                await fetch('/api/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: e.student.id,
                        type: scheduleForm.type,
                        subject: subj?.name || '',
                        title: scheduleForm.title,
                        datetime: scheduleForm.datetime,
                        createdBy: 'teacher',
                    }),
                });
            }
            setMessage(`✅ Broadcasted to ${subj?.enrollments.length || 0} students`);
            setScheduleForm({ title: '', type: 'exam', datetime: '' });
        } catch { setMessage('❌ Failed to broadcast'); }
        setSaving(false);
    };

    const uploadMaterial = async (file: File) => {
        if (!selectedSubject) return;
        setSaving(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('subjectId', selectedSubject);
        formData.append('docType', uploadDocType);
        try {
            const res = await fetch('/api/materials', { method: 'POST', body: formData });
            if (res.ok) {
                setMessage('✅ Material uploaded!');
                // Refresh materials list
                const mRes = await fetch(`/api/materials?subjectId=${selectedSubject}`);
                if (mRes.ok) { const d = await mRes.json(); setMaterials(d.materials || []); }
            } else { setMessage('❌ Upload failed'); }
        } catch { setMessage('❌ Upload error'); }
        setSaving(false);
    };

    if (status === 'loading') return <div className="app-layout"><div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div></div>;

    const tabs = [
        { id: 'subjects' as TeacherTab, emoji: '📚', label: 'Subjects' },
        { id: 'grades' as TeacherTab, emoji: '📊', label: 'Grades' },
        { id: 'schedule' as TeacherTab, emoji: '📅', label: 'Schedule' },
        { id: 'materials' as TeacherTab, emoji: '📁', label: 'Materials' },
        { id: 'analytics' as TeacherTab, emoji: '📈', label: 'Analytics' },
    ];

    return (
        <div className="app-layout">
            <nav className="sidebar">
                <div className="sidebar-logo" title="Drona AI Teacher">🏹</div>
                <div className="sidebar-nav">
                    {tabs.map(t => (
                        <button key={t.id} className={`sidebar-btn ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setMessage(''); }}>
                            {t.emoji}<span className="tooltip">{t.label}</span>
                        </button>
                    ))}
                </div>
                <div className="sidebar-bottom">
                    <button className="sidebar-btn" onClick={() => signOut()} title="Sign Out">🚪<span className="tooltip">Sign Out</span></button>
                </div>
            </nav>

            <main className="main-content">
                {/* Message Banner */}
                {message && (
                    <div style={{ padding: '10px 20px', background: message.startsWith('✅') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: message.startsWith('✅') ? 'var(--color-success)' : 'var(--color-error)', textAlign: 'center', fontSize: '0.85rem' }}>
                        {message}
                        <button onClick={() => setMessage('')} style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
                    </div>
                )}

                {/* ─── SUBJECTS TAB ─── */}
                {tab === 'subjects' && (
                    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="animate-fade">
                        <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
                            <div>
                                <h1 className="page-title">📚 Subject Management</h1>
                                <p className="page-subtitle">Welcome, Prof. {session?.user?.name}</p>
                            </div>
                        </header>
                        <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                            <h3 style={{ marginBottom: '12px' }}>➕ Create New Subject</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px', marginBottom: '10px' }}>
                                <input className="input" placeholder="Subject Name (e.g., Machine Learning)" value={newSubject.name} onChange={e => setNewSubject({ ...newSubject, name: e.target.value })} />
                                <input className="input" placeholder="Code" value={newSubject.code} onChange={e => setNewSubject({ ...newSubject, code: e.target.value })} />
                            </div>
                            <input className="input" placeholder="Description (optional)" value={newSubject.description} onChange={e => setNewSubject({ ...newSubject, description: e.target.value })} style={{ marginBottom: '10px' }} />
                            <button className="btn btn-primary" onClick={createSubject} disabled={saving || !newSubject.name}>
                                {saving ? 'Creating...' : '✅ Create Subject'}
                            </button>
                        </div>
                        <h3 style={{ marginBottom: '12px' }}>Your Subjects ({subjects.length})</h3>
                        {subjects.map(s => (
                            <div key={s.id} className="glass-card" style={{ padding: '16px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <strong style={{ fontSize: '1.05rem' }}>{s.name}</strong>
                                        {s.code && <span className="badge" style={{ marginLeft: '8px', background: 'rgba(139,92,246,0.15)', color: 'var(--accent-ml)' }}>{s.code}</span>}
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {s.enrollments.length} student{s.enrollments.length !== 1 ? 's' : ''} enrolled
                                        </div>
                                    </div>
                                </div>
                                {s.enrollments.length > 0 && (
                                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {s.enrollments.map(e => (
                                            <span key={e.id} className="badge" style={{ background: 'var(--bg-secondary)', padding: '4px 8px', fontSize: '0.75rem' }}>
                                                {e.student.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ─── GRADES TAB ─── */}
                {tab === 'grades' && (
                    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }} className="animate-fade">
                        <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
                            <h1 className="page-title">📊 Grade Entry</h1>
                        </header>
                        <div className="glass-card" style={{ padding: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label className="form-label">Subject</label>
                                    <select className="input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                                        <option value="">Select subject</option>
                                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Component</label>
                                    <select className="input" value={componentType} onChange={e => setComponentType(e.target.value)}>
                                        <option value="Minor_1">Minor 1</option>
                                        <option value="Minor_2">Minor 2</option>
                                        <option value="Major">Major</option>
                                        <option value="Assignment">Assignment</option>
                                        <option value="Project">Project</option>
                                        <option value="Lab">Lab</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        {selectedSubject && gradeEntries.length > 0 ? (
                            <div className="glass-card" style={{ padding: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '8px', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <span>Student</span><span>Marks</span><span>Total</span>
                                </div>
                                {gradeEntries.map((g, i) => (
                                    <div key={g.studentId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem' }}>{g.studentName}</span>
                                        <input className="input" type="number" min={0} value={g.marks} onChange={e => { const u = [...gradeEntries]; u[i].marks = parseFloat(e.target.value) || 0; setGradeEntries(u); }} />
                                        <input className="input" type="number" min={1} value={g.totalMarks} onChange={e => { const u = [...gradeEntries]; u[i].totalMarks = parseFloat(e.target.value) || 25; setGradeEntries(u); }} />
                                    </div>
                                ))}
                                <button className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }} onClick={saveGrades} disabled={saving}>
                                    {saving ? 'Saving...' : `💾 Save ${componentType} Grades`}
                                </button>
                            </div>
                        ) : selectedSubject ? (
                            <div className="empty-state"><div className="empty-state-emoji">📊</div><div className="empty-state-title">No Students Enrolled</div></div>
                        ) : null}
                    </div>
                )}

                {/* ─── SCHEDULE TAB ─── */}
                {tab === 'schedule' && (
                    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto', width: '100%' }} className="animate-fade">
                        <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
                            <h1 className="page-title">📅 Broadcast Schedule</h1>
                            <p className="page-subtitle">Events are pushed to all enrolled students</p>
                        </header>
                        <div className="glass-card" style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '12px' }}>
                                <label className="form-label">Subject</label>
                                <select className="input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                                    <option value="">Select subject</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.enrollments.length} students)</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                <div>
                                    <label className="form-label">Event Type</label>
                                    <select className="input" value={scheduleForm.type} onChange={e => setScheduleForm({ ...scheduleForm, type: e.target.value })}>
                                        <option value="exam">📝 Exam</option>
                                        <option value="quiz">🎯 Quiz</option>
                                        <option value="assignment">📋 Assignment</option>
                                        <option value="project">🛠️ Project</option>
                                        <option value="revision">📖 Revision</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Date & Time</label>
                                    <input className="input" type="datetime-local" value={scheduleForm.datetime} onChange={e => setScheduleForm({ ...scheduleForm, datetime: e.target.value })} />
                                </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label className="form-label">Event Title</label>
                                <input className="input" placeholder="e.g., Minor 1: Machine Learning" value={scheduleForm.title} onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} />
                            </div>
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={broadcastSchedule} disabled={saving || !selectedSubject || !scheduleForm.title || !scheduleForm.datetime}>
                                {saving ? 'Broadcasting...' : '📡 Broadcast to All Students'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── MATERIALS TAB ─── */}
                {tab === 'materials' && (
                    <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto', width: '100%' }} className="animate-fade">
                        <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
                            <h1 className="page-title">📁 Course Materials</h1>
                            <p className="page-subtitle">Upload PDFs, notes, and past exams</p>
                        </header>
                        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                            <div style={{ marginBottom: '12px' }}>
                                <label className="form-label">Subject</label>
                                <select className="input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                                    <option value="">Select subject</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            {selectedSubject && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                        <div>
                                            <label className="form-label">Document Type</label>
                                            <select className="input" value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}>
                                                <option value="lecture_notes">📖 Lecture Notes</option>
                                                <option value="assignment">📋 Assignment</option>
                                                <option value="past_exam">📝 Past Exam</option>
                                                <option value="reference">📚 Reference</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="form-label">Upload File</label>
                                            <input className="input" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={e => { if (e.target.files?.[0]) uploadMaterial(e.target.files[0]); }} style={{ padding: '8px' }} />
                                        </div>
                                    </div>
                                    {materials.length > 0 && (
                                        <>
                                            <h4 style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>Uploaded Materials</h4>
                                            {materials.map(m => (
                                                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '6px' }}>
                                                    <div>
                                                        <strong style={{ fontSize: '0.85rem' }}>{m.fileName}</strong>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.docType.replace('_', ' ')} · {new Date(m.uploadDate).toLocaleDateString()}</div>
                                                    </div>
                                                    <button className="btn btn-danger btn-sm" style={{ fontSize: '0.7rem' }} onClick={async () => {
                                                        await fetch('/api/materials', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id }) });
                                                        setMaterials(prev => prev.filter(x => x.id !== m.id));
                                                    }}>🗑️</button>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── ANALYTICS TAB ─── */}
                {tab === 'analytics' && (
                    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', width: '100%' }} className="animate-fade">
                        <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
                            <h1 className="page-title">📈 Class Analytics</h1>
                        </header>

                        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                            <select className="input" style={{ marginBottom: '16px' }} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                                <option value="">Select subject for analytics</option>
                                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>

                            {!selectedSubject && <p style={{ color: 'var(--text-muted)' }}>Select a subject to view class analytics.</p>}

                            {analyticsData && selectedSubject && (
                                <>
                                    {/* Summary Stats */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                        <div className="stat-card glass-card"><div className="stat-value">{analyticsData.enrolledCount}</div><div className="stat-label">Students</div></div>
                                        <div className="stat-card glass-card"><div className="stat-value">{analyticsData.heatmap.length}</div><div className="stat-label">Topics Tracked</div></div>
                                        <div className="stat-card glass-card"><div className="stat-value">{analyticsData.trendData.reduce((s, t) => s + t.quizCount, 0)}</div><div className="stat-label">Quizzes Taken</div></div>
                                    </div>

                                    {/* AI Alerts */}
                                    <h3 style={{ marginBottom: '10px' }}>🚨 AI Alerts</h3>
                                    <div style={{ marginBottom: '20px' }}>
                                        {analyticsData.alerts.map((a, i) => (
                                            <div key={i} style={{
                                                padding: '10px 14px', marginBottom: '6px', borderRadius: '8px', fontSize: '0.85rem',
                                                background: a.severity === 'critical' ? 'rgba(239,68,68,0.1)' : a.severity === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                                                borderLeft: `4px solid ${a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#22c55e'}`,
                                            }}>{a.message}</div>
                                        ))}
                                    </div>

                                    {/* Topic Mastery Heatmap */}
                                    <h3 style={{ marginBottom: '10px' }}>🔥 Topic Mastery Heatmap</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginBottom: '20px' }}>
                                        {analyticsData.heatmap.map(h => (
                                            <div key={h.topic} style={{ padding: '12px', borderRadius: '10px', background: `${h.color}15`, borderLeft: `4px solid ${h.color}` }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>{h.topic}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    <span>Avg: <strong style={{ color: h.color }}>{h.avgMastery}%</strong></span>
                                                    <span>{h.studentCount} students</span>
                                                </div>
                                                {h.failingStudents > 0 && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px' }}>⚠ {h.failingStudents} failing</div>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Grade Averages */}
                                    {analyticsData.gradeAvgs.length > 0 && (
                                        <>
                                            <h3 style={{ marginBottom: '10px' }}>📊 Grade Averages</h3>
                                            <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                                    <span>Component</span><span>Average</span><span>Total</span><span>%</span>
                                                </div>
                                                {analyticsData.gradeAvgs.map(g => (
                                                    <div key={g.component} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px', fontSize: '0.85rem', marginBottom: '4px', alignItems: 'center' }}>
                                                        <span>{g.component}</span>
                                                        <span>{g.average}</span>
                                                        <span style={{ color: 'var(--text-muted)' }}>/{g.totalMarks}</span>
                                                        <span className="badge" style={{
                                                            background: g.percentage >= 70 ? 'rgba(34,197,94,0.15)' : g.percentage >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                                            color: g.percentage >= 70 ? '#22c55e' : g.percentage >= 50 ? '#f59e0b' : '#ef4444',
                                                        }}>{g.percentage}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {/* Quiz Trends */}
                                    {analyticsData.trendData.length > 0 && (
                                        <>
                                            <h3 style={{ marginBottom: '10px' }}>📈 Quiz Performance Trends</h3>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '120px', marginBottom: '20px' }}>
                                                {analyticsData.trendData.map(t => (
                                                    <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, marginBottom: '4px' }}>{t.avgScore}%</span>
                                                        <div style={{ width: '100%', height: `${t.avgScore}%`, background: `linear-gradient(to top, var(--accent-ml), rgba(139,92,246,0.3))`, borderRadius: '4px 4px 0 0', minHeight: '8px' }} />
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>{t.month}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
