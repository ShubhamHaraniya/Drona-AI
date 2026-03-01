'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Tab = 'dashboard' | 'chat' | 'quiz' | 'results' | 'progress' | 'schedule' | 'learning' | 'settings' | 'analytics';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestedActions?: Array<{ label: string; action: string }>;
  metadata?: Record<string, unknown>;
}

interface QuizQuestion {
  id: string;
  type: 'MCQ' | 'Numerical' | 'MSQ';
  difficulty: string;
  question: string;
  topic: string;
  module: string;
  options?: string[];
  estimatedTimeSeconds: number;
}

interface AnswerKeyItem {
  questionId: string;
  correctAnswer: string;
  explanation: string;
  topic: string;
}

interface QuizState {
  active: boolean;
  questions: QuizQuestion[];
  currentIndex: number;
  answers: Record<string, string | number | string[]>;
  confidence: number;
  subject: string;
  answerKey: AnswerKeyItem[];  // Store LLM-generated answer key
}

interface QuestionReviewItem {
  questionId: string;
  question: string;
  userAnswer: string | number | string[];
  correctAnswer: string | number | string[];
  isCorrect: boolean;
  explanation: string;
  topic: string;
}

interface ProgressData {
  progress: {
    subjectStats: Record<string, { totalQuizzes: number; averageScore: number; bestScore: number; currentDifficulty: string }>;
    topicMastery: Record<string, number>;
    streak: number;
    lastActiveDate: string;
  } | null;
  quizHistory: Array<{ id: string; subject: string; score: number; maxScore: number; percentage: number; createdAt: string }>;
  schedules: Array<{ id: string; type: string; subject: string; title: string; datetime: string; createdBy?: string }>;
  grades?: Array<{ id: string; subjectName: string; subjectCode: string; componentType: string; marksObtained: number; totalMarks: number; percentage: number; timestamp: string }>;
  enrolledSubjects?: Array<{ id: string; name: string; teacherName: string }>;
  topicProgress?: Array<{ subjectName: string; topicName: string; masteryScore: number; failCount: number; quizCount: number }>;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [todoItems, setTodoItems] = useState<Array<{ id: string; subjectName: string; description: string; source: string; status: string; priority: number; dueDate?: string }>>([]);
  const [scheduleFilter, setScheduleFilter] = useState<string>('all');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [quiz, setQuiz] = useState<QuizState>({ active: false, questions: [], currentIndex: 0, answers: {}, confidence: 50, subject: '', answerKey: [] });
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [quizResult, setQuizResult] = useState<{
    result: Record<string, unknown>;
    evaluation: { message: string };
    questionReview?: QuestionReviewItem[];
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'quiz' | 'schedule'; originalMessage: string; preview: string } | null>(null);
  const [subjectReports, setSubjectReports] = useState<Record<string, string>>({});
  const [loadingReports, setLoadingReports] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && (session?.user as { role?: string })?.role === 'TEACHER') {
      router.push('/teacher');
    }
  }, [status, session, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (session?.user && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `## 🏹 नमस्ते ${session.user.name || 'Student'}!\n\nI'm **Drona AI** — your AI learning companion powered by LLM. I can:\n\n- 📖 **Explain concepts** — _"Explain backpropagation"_\n- 📝 **Generate quizzes** — _"Quiz me on 5 easy DSA questions"_\n- 📊 **Track progress** — _"Show my performance"_\n- 📅 **Manage schedule** — _"I have ML exam on 24 March at 4 PM"_\n\n_What would you like to learn today?_ ✨`,
        suggestedActions: [
          { label: '🤖 Learn ML', action: 'explain machine learning' },
          { label: '📝 DSA Quiz', action: 'quiz me on data structures' },
          { label: '📊 My Progress', action: 'show my progress' },
        ],
      }]);
    }
  }, [session, messages.length]);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/progress');
      if (res.ok) setProgressData(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (session && (tab === 'dashboard' || tab === 'progress' || tab === 'schedule' || tab === 'learning')) fetchProgress();
  }, [tab, session, fetchProgress]);

  // Fetch to-do items
  const fetchTodos = useCallback(async () => {
    try { const res = await fetch('/api/todos'); if (res.ok) { const d = await res.json(); setTodoItems(d.todos || []); } } catch { /* */ }
  }, []);
  useEffect(() => { if (session && (tab === 'dashboard' || tab === 'learning')) fetchTodos(); }, [tab, session, fetchTodos]);

  // Quiz timer countdown
  useEffect(() => {
    if (!timerActive || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) { setTimerActive(false); submitQuiz(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive]);

  // Fetch AI Subject Analytics Report
  useEffect(() => {
    if (selectedSubject && !subjectReports[selectedSubject] && !loadingReports[selectedSubject] && progressData?.progress) {
      const fetchReport = async () => {
        setLoadingReports(prev => ({ ...prev, [selectedSubject]: true }));
        try {
          const stats = progressData?.progress?.subjectStats[selectedSubject];
          const tp = (progressData?.topicProgress || []).filter(t => t.subjectName === selectedSubject);
          const weak = tp.filter(t => t.masteryScore < 60).map(t => `${t.topicName} (${Math.round(t.masteryScore)}%)`).join(', ');
          const strong = tp.filter(t => t.masteryScore >= 80).map(t => `${t.topicName} (${Math.round(t.masteryScore)}%)`).join(', ');

          const prompt = `As an expert AI tutor, generate a highly detailed 3-4 paragraph Full Analytics Report and Future Study Plan for the student in the subject "${selectedSubject}".
          
Student's Current Stats in ${selectedSubject}:
- Average Quiz Score: ${stats ? Math.round(stats.averageScore) : 0}%
- Total Quizzes Taken: ${stats ? stats.totalQuizzes : 0}
- Mastery Level: ${stats ? stats.currentDifficulty : 'Beginner'}
- Weak Topics (Needs Focus): ${weak || 'None'}
- Mastered Topics: ${strong || 'None'}

Your response must be formatted in Markdown. It should include:
1. A brief encouraging summary of their performance.
2. An analysis of their weak points and strong points.
3. A concrete, actionable Future Study Plan.
Do NOT include generic chatbot greetings like "Hello". Jump straight into the report. Format nicely with headings and lists.`;

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: prompt, history: [], isAnalyticsRequest: true }),
          });
          const data = await res.json();
          if (res.ok && data.message) {
            setSubjectReports(prev => ({ ...prev, [selectedSubject]: data.message }));
          }
        } catch (e) {
          console.error('Failed to fetch AI report:', e);
        } finally {
          setLoadingReports(prev => ({ ...prev, [selectedSubject]: false }));
        }
      };

      fetchReport();
    }
  }, [selectedSubject, progressData, subjectReports, loadingReports]);

  const toggleTodo = async (id: string, status: string) => {
    await fetch('/api/todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: status === 'done' ? 'pending' : 'done' }) });
    fetchTodos();
  };

  const executeChatRequest = async (text: string) => {
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      // Check if this is a quiz response with questions
      if (data.type === 'quiz' && data.metadata?.questions) {
        setQuiz({
          active: true,
          questions: data.metadata.questions,
          currentIndex: 0,
          answers: {},
          confidence: 50,
          subject: data.metadata.quizConfig?.subject || '',
          answerKey: data.metadata.answerKey || [],
        });
        // Start quiz timer (default 20 min)
        const timerMin = parseInt(data.metadata.quizConfig?.timer) || 20;
        setTimerSeconds(timerMin * 60);
        setTimerActive(true);
        setTab('quiz');
      }

      const assistantMsg: ChatMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || data.error || 'Something went wrong.',
        suggestedActions: data.suggestedActions,
        metadata: data.metadata,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '⚠️ Connection error. Please try again.',
      }]);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Detect quiz or schedule intent for confirmation using LLM setup
    setSending(true);
    try {
      const intentRes = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (intentRes.ok) {
        const { intent } = await intentRes.json();

        if (intent === 'QuizRequest') {
          setPendingAction({ type: 'quiz', originalMessage: text, preview: `📝 Generate a quiz based on: "${text}"` });
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📝 I'll generate a quiz based on your request:\n\n> _${text}_\n\n**Would you like to proceed?**`,
          }]);
          setSending(false);
          return;
        }
        if (intent === 'Scheduling') {
          setPendingAction({ type: 'schedule', originalMessage: text, preview: `📅 Schedule event: "${text}"` });
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📅 I'll add this to your schedule:\n\n> _${text}_\n\n**Would you like to proceed?**`,
          }]);
          setSending(false);
          return;
        }
      }
    } catch (e) {
      console.error('Intent fetch failed', e);
    }

    setSending(false);
    await executeChatRequest(text);
  };

  const confirmAction = async (confirmed: boolean) => {
    if (!pendingAction) return;
    if (confirmed) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: '✅ Yes, proceed' }]);
      await executeChatRequest(pendingAction.originalMessage);
    } else {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'user', content: '❌ No, let me rephrase'
      }, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: pendingAction.type === 'quiz'
          ? 'No problem! Please type your quiz request again more carefully. For example:\n- _"Quiz me on 5 easy ML questions about CNN"_\n- _"Give me 3 hard DSA questions on Dynamic Programming"_'
          : 'No problem! Please type your schedule request again carefully. For example:\n- _"I have ML exam on 24 March at 4 PM"_\n- _"DBMS assignment deadline 5 March"_',
      }]);
    }
    setPendingAction(null);
  };

  const handleQuizAnswer = (questionId: string, answer: string | number | string[]) => {
    setQuiz(prev => ({
      ...prev,
      answers: { ...prev.answers, [questionId]: answer },
    }));
  };

  const handleMSQToggle = (questionId: string, option: string) => {
    setQuiz(prev => {
      const current = (prev.answers[questionId] as string[]) || [];
      const updated = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, answers: { ...prev.answers, [questionId]: updated } };
    });
  };

  const submitQuiz = async () => {
    setSending(true);
    try {
      const answersArray = quiz.questions.map(q => ({
        questionId: q.id,
        answer: quiz.answers[q.id] ?? '',
        confidenceLevel: quiz.confidence,
      }));

      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answersArray,
          subject: quiz.subject,
          confidenceLevel: quiz.confidence,
          answerKey: quiz.answerKey,       // Pass LLM answer key for grading
          questions: quiz.questions.map(q => ({ id: q.id, question: q.question, topic: q.topic })),
        }),
      });

      const data = await res.json();
      setQuizResult({
        ...data,
        questionReview: data.result?.questionReview || [],
      });
      setQuiz(prev => ({ ...prev, active: false }));
      setTab('results');
    } catch {
      alert('Error submitting quiz');
    } finally {
      setSending(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="auth-container">
        <div className="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const tabs: Array<{ id: Tab; emoji: string; label: string }> = [
    { id: 'dashboard', emoji: '🏠', label: 'Dashboard' },
    { id: 'chat', emoji: '💬', label: 'AI Tutor' },
    { id: 'quiz', emoji: '📝', label: 'Quiz' },
    { id: 'results', emoji: '📊', label: 'Results' },
    { id: 'progress', emoji: '📈', label: 'Progress' },
    { id: 'schedule', emoji: '📅', label: 'Schedule' },
    { id: 'learning', emoji: '🗺️', label: 'Path' },
    { id: 'settings', emoji: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo" title="Drona AI">🏹</div>
        <div className="sidebar-nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`sidebar-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.emoji}
              <span className="tooltip">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-btn" onClick={() => signOut()} title="Sign Out">
            🚪
            <span className="tooltip">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* ─── DASHBOARD TAB ─── */}
        {tab === 'dashboard' && (
          <div style={{ padding: '32px 48px', maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '32px' }} className="animate-fade">

            {/* 1. Global Stats Banner */}
            <header className="page-header glass-card" style={{ position: 'relative', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'linear-gradient(135deg, rgba(26,26,46,0.8), rgba(9,9,11,0.9))' }}>
              <div>
                <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '8px' }}>Welcome back, {session.user?.name?.split(' ')[0] || 'Student'}! 🏹</h1>
                <p className="page-subtitle" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                  {progressData?.progress ? `You're on a ${progressData.progress.streak} day streak. Keep pushing forward!` : 'Ready to begin your learning journey?'}
                </p>
              </div>
              {progressData?.progress && (
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{progressData.progress.streak}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Day Streak 🔥</div>
                  </div>
                  <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{progressData.quizHistory.length}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Quizzes Administered</div>
                  </div>
                </div>
              )}
            </header>

            {/* 2. AI Quick Actions Bar */}
            <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-tertiary)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>⚡ Quick Commands:</span>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setTab('chat')}>💬 Open AI Tutor</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { sendMessage('make me a study plan for today'); setTab('chat'); }}>🗺️ Generate Study Plan</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { sendMessage('what assignments are due'); setTab('chat'); }}>📋 Check Assignments</button>
              </div>
            </div>

            {/* 3. Subject Zones */}
            {progressData?.progress && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>📚 Your Subjects</h2>

                {Object.entries(progressData.progress.subjectStats).map(([subject, stats]) => {
                  const subjectKey = subject.includes('Machine') ? 'ml' : subject.includes('Data') ? 'dsa' : 'db';
                  const emoji = subjectKey === 'ml' ? '🤖' : subjectKey === 'dsa' ? '🧮' : '🗄️';
                  const pct = Math.round(stats.averageScore);
                  const color = `var(--color-${pct >= 70 ? 'success' : pct >= 50 ? 'warning' : 'error'})`;

                  // Get specific data for this subject
                  const subjectGrades = (progressData.grades || []).filter(g => g.subjectName === subject);
                  const weakTopics = (progressData.topicProgress || [])
                    .filter(tp => tp.subjectName === subject && tp.masteryScore < 60)
                    .sort((a, b) => a.masteryScore - b.masteryScore)
                    .slice(0, 2);
                  const nextEvent = (progressData.schedules || [])
                    .filter(s => s.subject === subject && new Date(s.datetime) > new Date())
                    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())[0];

                  return (
                    <div key={subject} className={`glass-card subject-card-${subjectKey}`} style={{ display: 'flex', overflow: 'hidden' }}>

                      {/* Left: Mastery Ring */}
                      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '220px', borderRight: '1px solid var(--border-color)', background: 'linear-gradient(90deg, rgba(0,0,0,0.2), transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                          <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                          <span style={{ fontSize: '1rem', fontWeight: 700 }}>{subject.split(' ')[0]}</span>
                        </div>
                        <div style={{ position: 'relative', width: '100px', height: '100px', marginBottom: '12px' }}>
                          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                            <circle cx="18" cy="18" r="15.91" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.91" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                          </svg>
                          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontWeight: 800, fontSize: '1.2rem', color }}>{pct}%</span>
                        </div>
                        <span className="badge" style={{ background: `var(--accent-${subjectKey}-glow)`, color: `var(--accent-${subjectKey})` }}>
                          {stats.currentDifficulty} Level
                        </span>
                      </div>

                      {/* Middle: Details & Focus Areas */}
                      <div style={{ padding: '24px 32px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                          <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{subject}</h3>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stats.totalQuizzes} AI Quizzes Taken</span>
                        </div>

                        <div style={{ display: 'flex', gap: '32px', flex: 1 }}>
                          {/* Weak Topics */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>⚠️ Needs Focus</div>
                            {weakTopics.length > 0 ? weakTopics.map(tp => (
                              <div key={tp.topicName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.85rem' }}>
                                <span>{tp.topicName}</span>
                                <span style={{ color: tp.masteryScore < 40 ? 'var(--color-error)' : 'var(--color-warning)' }}>{Math.round(tp.masteryScore)}%</span>
                              </div>
                            )) : (
                              <div style={{ fontSize: '0.85rem', color: 'var(--color-success)' }}>All topics mastered! 🌟</div>
                            )}
                          </div>

                          {/* Next Event / Grades */}
                          <div style={{ flex: 1, borderLeft: '1px solid var(--border-color)', paddingLeft: '32px' }}>
                            {nextEvent ? (
                              <>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>📅 Up Next</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>{nextEvent.title}</div>
                                <div style={{ fontSize: '0.8rem', color: `var(--accent-${subjectKey})` }}>{new Date(nextEvent.datetime).toLocaleDateString()}</div>
                              </>
                            ) : subjectGrades.length > 0 ? (
                              <>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>📝 Recent Grade</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '4px' }}>{subjectGrades[0].componentType.replace('_', ' ')}</div>
                                <div style={{ fontSize: '0.8rem', color: subjectGrades[0].percentage >= 70 ? 'var(--color-success)' : 'var(--color-warning)' }}>{subjectGrades[0].percentage}% ({subjectGrades[0].marksObtained}/{subjectGrades[0].totalMarks})</div>
                              </>
                            ) : (
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No upcoming events or recent grades.</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center', borderLeft: '1px solid var(--border-color)', minWidth: '180px', background: 'var(--bg-secondary)' }}>
                        <button className={`btn btn-subject-${subjectKey}`} onClick={() => { sendMessage(`quiz me on ${subject}`); setTab('chat'); }}>
                          📝 Practice Quiz
                        </button>
                        {weakTopics.length > 0 && (
                          <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { sendMessage(`explain ${weakTopics[0].topicName} in ${subject}`); setTab('chat'); }}>
                            📖 Study Weakest
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedSubject(subject); setTab('analytics'); }}>
                          📊 Full Analytics
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. Global Upcoming Events (Non-Subject Focus) */}
            <div style={{ marginTop: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>📅 Upcoming & Deadlines</h2>
              <div className="glass-card" style={{ padding: '24px' }}>
                {(!progressData?.schedules || progressData.schedules.length === 0) ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No events scheduled across all subjects.</p>
                ) : (
                  progressData.schedules.filter(s => new Date(s.datetime) > new Date()).slice(0, 5).map(s => {
                    const daysLeft = Math.ceil((new Date(s.datetime).getTime() - Date.now()) / 86400000);
                    const subjectKey = s.subject.includes('Machine') ? 'ml' : s.subject.includes('Data') ? 'dsa' : 'db';
                    const typeEmojis: Record<string, string> = { exam: '📝', quiz: '🎯', assignment: '📋', revision: '📖', deadline: '⏰', project: '🛠️' };
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '1.25rem' }}>{typeEmojis[s.type] || '📌'}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                            <div style={{ color: `var(--accent-${subjectKey})`, fontSize: '0.75rem' }}>{s.subject}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 600, color: daysLeft <= 3 ? 'var(--color-error)' : daysLeft <= 7 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                            {daysLeft <= 0 ? 'TODAY' : `${daysLeft} days left`}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(s.datetime).toLocaleDateString()}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Secondary Widget: To-Do List */}
              <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>✅ To-Do List</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => { sendMessage('add a task to to-do list'); setTab('chat'); }}>+ Add Task</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {(!progressData?.schedules || progressData.schedules.length === 0) ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your task list is clear!</p>
                  ) : (
                    progressData.schedules.filter(s => s.type === 'revision' || s.type === 'quiz').slice(0, 5).map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: '2px solid var(--border-hover)', cursor: 'pointer' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{s.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.subject}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CHAT TAB ─── */}
        {tab === 'chat' && (
          <>
            <header className="page-header">
              <div>
                <h1 className="page-title">💬 AI Tutor</h1>
                <p className="page-subtitle">Ask anything about ML, DSA, or Databases — powered by LLM</p>
              </div>
            </header>
            <div className="chat-container">
              <div className="chat-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-bubble ${msg.role} animate-slide`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    {msg.suggestedActions && (
                      <div className="suggested-actions" style={{ marginTop: '12px' }}>
                        {msg.suggestedActions.map((action, i) => (
                          <button
                            key={i}
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              if (action.action === 'START_QUIZ') {
                                if (quiz.questions.length > 0) setTab('quiz');
                              } else if (action.action === 'VIEW_PROGRESS') {
                                setTab('progress');
                              } else {
                                sendMessage(action.action);
                              }
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {/* Confirmation Buttons */}
                {pendingAction && !sending && (
                  <div className="chat-bubble assistant animate-slide">
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-success btn-sm" onClick={() => confirmAction(true)}>✅ Yes, proceed</button>
                      <button className="btn btn-danger btn-sm" onClick={() => confirmAction(false)}>❌ No, let me rephrase</button>
                    </div>
                  </div>
                )}
                {sending && (
                  <div className="chat-bubble assistant">
                    <div className="loading-dots"><span></span><span></span><span></span></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-area">
                <input
                  className="input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                  placeholder="Ask anything... e.g., 'Explain B+ trees' or 'Quiz me on ML'"
                  disabled={sending}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => sendMessage(input)}
                  disabled={sending || !input.trim()}
                >
                  🚀
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── QUIZ TAB ─── */}
        {tab === 'quiz' && (
          <div className="quiz-container animate-fade">
            {!quiz.active || quiz.questions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-emoji">📝</div>
                <div className="empty-state-title">No Active Quiz</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Go to the AI Tutor and ask: <em>&quot;Quiz me on 5 ML questions&quot;</em>
                </p>
                <button className="btn btn-primary" onClick={() => setTab('chat')}>
                  💬 Go to AI Tutor
                </button>
              </div>
            ) : (
              <>
                <div className="quiz-header">
                  <h2>📝 {quiz.subject} Quiz</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Question {quiz.currentIndex + 1} of {quiz.questions.length}
                    </p>
                    {timerActive && (
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '0.85rem', fontFamily: 'monospace',
                        background: timerSeconds < 60 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)',
                        color: timerSeconds < 60 ? 'var(--color-error)' : 'var(--accent-ml)',
                        animation: timerSeconds < 60 ? 'pulse 1s infinite' : 'none',
                      }}>
                        ⏱ {String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:{String(timerSeconds % 60).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <div className="quiz-progress-bar">
                    <div
                      className="quiz-progress-fill"
                      style={{ width: `${((quiz.currentIndex + 1) / quiz.questions.length) * 100}%` }}
                    />
                  </div>
                </div>

                {(() => {
                  const q = quiz.questions[quiz.currentIndex];
                  return (
                    <div className="question-card glass-card" key={q.id}>
                      <div className="question-meta">
                        <span className={`badge badge-${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
                        <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-ml)' }}>
                          {q.type}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {q.topic}
                        </span>
                      </div>
                      <p className="question-text">{q.question}</p>

                      {q.type === 'MCQ' && q.options && (
                        <div className="options-list">
                          {q.options.map((opt, i) => (
                            <button
                              key={i}
                              className={`option-btn ${quiz.answers[q.id] === opt ? 'selected' : ''}`}
                              onClick={() => handleQuizAnswer(q.id, opt)}
                            >
                              <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {q.type === 'Numerical' && (
                        <input
                          className="input numerical-input"
                          type="number"
                          placeholder="Enter your answer"
                          value={quiz.answers[q.id] ?? ''}
                          onChange={e => handleQuizAnswer(q.id, parseFloat(e.target.value))}
                        />
                      )}

                      {q.type === 'MSQ' && q.options && (
                        <div className="options-list">
                          {q.options.map((opt, i) => {
                            const selected = ((quiz.answers[q.id] as string[]) || []).includes(opt);
                            return (
                              <button
                                key={i}
                                className={`option-btn ${selected ? 'selected' : ''}`}
                                onClick={() => handleMSQToggle(q.id, opt)}
                              >
                                <span className="option-letter">{selected ? '✓' : String.fromCharCode(65 + i)}</span>
                                {opt}
                              </button>
                            );
                          })}
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Select all correct answers
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Navigation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <button
                    className="btn btn-secondary"
                    disabled={quiz.currentIndex === 0}
                    onClick={() => setQuiz(prev => ({ ...prev, currentIndex: prev.currentIndex - 1 }))}
                  >
                    ← Previous
                  </button>

                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Confidence: {quiz.confidence}%
                    </p>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={quiz.confidence}
                      onChange={e => setQuiz(prev => ({ ...prev, confidence: parseInt(e.target.value) }))}
                      className="confidence-slider"
                      style={{ width: '150px' }}
                    />
                  </div>

                  {quiz.currentIndex < quiz.questions.length - 1 ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => setQuiz(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))}
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      className="btn btn-success"
                      onClick={submitQuiz}
                      disabled={sending}
                    >
                      {sending ? 'Submitting...' : '✅ Submit Quiz'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── RESULTS TAB ─── */}
        {tab === 'results' && (
          <div className="results-container animate-fade">
            {!quizResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>📚 Past Quiz Results</h2>
                {(!progressData?.quizHistory || progressData.quizHistory.length === 0) ? (
                  <div className="empty-state">
                    <div className="empty-state-emoji">📊</div>
                    <div className="empty-state-title">No Recent Results</div>
                    <p style={{ color: 'var(--text-muted)' }}>Complete a quiz to see your results here</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {/* Group quiz history by subject */}
                    {Object.entries(
                      progressData.quizHistory.reduce((acc, q) => {
                        if (!acc[q.subject]) acc[q.subject] = [];
                        acc[q.subject].push(q);
                        return acc;
                      }, {} as Record<string, typeof progressData.quizHistory>)
                    ).map(([subject, quizzes]) => {
                      const subjectKey = subject.includes('Machine') ? 'ml' : subject.includes('Data') ? 'dsa' : 'db';
                      return (
                        <div key={subject} className={`glass-card subject-card-${subjectKey}`} style={{ padding: '20px' }}>
                          <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                            {subject}
                          </h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {quizzes.slice(0, 5).map(q => (
                              <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(q.createdAt).toLocaleDateString()}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <span style={{ fontWeight: 700, color: q.percentage >= 70 ? 'var(--color-success)' : q.percentage >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                                    {Math.round(q.percentage)}%
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {q.score}/{q.maxScore}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: '24px' }}>📊 Quiz Results</h2>

                {/* Score Ring */}
                <div className="score-ring">
                  <svg viewBox="0 0 180 180" width="180" height="180">
                    <circle cx="90" cy="90" r="75" fill="none" stroke="var(--bg-tertiary)" strokeWidth="12" />
                    <circle
                      cx="90" cy="90" r="75" fill="none"
                      stroke="url(#scoreGradient)" strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(2 * Math.PI * 75 * ((quizResult.result.percentage as number) || 0)) / 100} ${2 * Math.PI * 75}`}
                    />
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="score-ring-value">
                    <div className="score-ring-percentage">{Math.round(quizResult.result.percentage as number)}%</div>
                    <div className="score-ring-label">{quizResult.result.score as number}/{quizResult.result.maxScore as number}</div>
                  </div>
                </div>

                {/* AI Analysis */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px' }}>🤖 AI Analysis</h3>
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{quizResult.evaluation.message}</ReactMarkdown>
                  </div>
                </div>

                {/* Per-Question Review */}
                {quizResult.questionReview && quizResult.questionReview.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '12px' }}>📋 Question-by-Question Review</h3>
                    {quizResult.questionReview.map((review, i) => (
                      <div
                        key={review.questionId}
                        className="glass-card"
                        style={{
                          padding: '16px 20px',
                          marginBottom: '10px',
                          borderLeft: `4px solid ${review.isCorrect ? 'var(--color-success)' : 'var(--color-error)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '0.9rem' }}>
                            {review.isCorrect ? '✅' : '❌'} Q{i + 1}: {review.question}
                          </strong>
                          <span
                            className="badge"
                            style={{
                              background: review.isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: review.isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                              flexShrink: 0,
                              marginLeft: '12px',
                            }}
                          >
                            {review.isCorrect ? 'Correct' : 'Wrong'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <strong>Your answer:</strong> {String(review.userAnswer) || '(not answered)'}
                        </div>

                        {!review.isCorrect && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginBottom: '4px' }}>
                            <strong>Correct answer:</strong> {String(review.correctAnswer)}
                          </div>
                        )}

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                          💡 {review.explanation}
                        </div>

                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Topic: {review.topic}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={() => { setQuizResult(null); setTab('chat'); }}>
                    📝 New Quiz
                  </button>
                  <button className="btn btn-secondary" onClick={() => setTab('progress')}>
                    📈 View Progress
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── PROGRESS TAB ─── */}
        {tab === 'progress' && (
          <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', width: '100%' }} className="animate-fade">
            <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
              <h1 className="page-title">📈 Learning Progress</h1>
              <button className="btn btn-secondary btn-sm" onClick={fetchProgress}>Refresh</button>
            </header>

            {!progressData?.progress ? (
              <div className="empty-state">
                <div className="empty-state-emoji">📈</div>
                <div className="empty-state-title">No Progress Yet</div>
                <p style={{ color: 'var(--text-muted)' }}>Take your first quiz to start tracking!</p>
                <button className="btn btn-primary" onClick={() => setTab('chat')} style={{ marginTop: '12px' }}>
                  Start Learning
                </button>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="stats-grid" style={{ marginBottom: '24px' }}>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{progressData.progress.streak}🔥</div>
                    <div className="stat-label">Day Streak</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{progressData.quizHistory.length}</div>
                    <div className="stat-label">Quizzes Taken</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">
                      {progressData.quizHistory.length > 0
                        ? Math.round(progressData.quizHistory.reduce((s, q) => s + q.percentage, 0) / progressData.quizHistory.length)
                        : 0}%
                    </div>
                    <div className="stat-label">Average Score</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{Object.keys(progressData.progress.subjectStats).length}</div>
                    <div className="stat-label">Subjects Active</div>
                  </div>
                </div>

                {/* Global Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {Object.entries(progressData.progress.subjectStats).map(([subject, stats]) => {
                    const emoji = subject.includes('Machine') ? '🤖' : subject.includes('Data') ? '🧮' : '🗄️';
                    const colorClass = subject.includes('Machine') ? 'ml' : subject.includes('Data') ? 'dsa' : 'db';
                    return (
                      <div key={subject} className="glass-card" style={{ padding: '20px', cursor: 'pointer' }} onClick={() => { setSelectedSubject(subject); setTab('analytics'); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <h3>{emoji} {subject}</h3>
                          <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-ml)' }}>
                            {stats.currentDifficulty}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ marginBottom: '8px' }}>
                          <div className={`progress-fill ${colorClass}`} style={{ width: `${Math.min(stats.averageScore, 100)}%` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>{stats.totalQuizzes} quizzes</span>
                          <span>Avg: {Math.round(stats.averageScore)}%</span>
                          <span>Best: {Math.round(stats.bestScore)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* College Grades — Per-Subject Cards */}
                {progressData.grades && progressData.grades.length > 0 && (() => {
                  // Group grades globally
                  const bySubject = progressData.grades.reduce((acc, g) => {
                    if (!acc[g.subjectName]) acc[g.subjectName] = [];
                    acc[g.subjectName].push(g);
                    return acc;
                  }, {} as Record<string, typeof progressData.grades>);

                  return (
                    <>
                      <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>🎓 College Grades</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {Object.entries(bySubject).map(([subject, items]) => {
                          const totalMarks = items.reduce((s, g) => s + g.marksObtained, 0);
                          const totalPossible = items.reduce((s, g) => s + g.totalMarks, 0);
                          const pct = totalPossible > 0 ? Math.round(totalMarks / totalPossible * 100) : 0;
                          const emoji = subject.includes('Machine') ? '🤖' : subject.includes('Data') ? '🧮' : '🗄️';
                          const colorVar = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-error)';

                          return (
                            <div key={subject} className="glass-card" style={{ padding: '20px', borderTop: `3px solid ${colorVar}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem' }}>{emoji} {subject}</h4>
                                <span className="badge" style={{
                                  background: pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                  color: colorVar, fontWeight: 700, fontSize: '0.9rem',
                                }}>{pct}%</span>
                              </div>
                              {items.map(g => (
                                <div key={g.id} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                  <span style={{ fontSize: '0.85rem' }}>{g.componentType.replace('_', ' ')}</span>
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600 }}>{g.marksObtained}/{g.totalMarks}</span>
                                    <span className="badge" style={{
                                      fontSize: '0.7rem',
                                      background: g.percentage >= 70 ? 'rgba(34,197,94,0.15)' : g.percentage >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                      color: g.percentage >= 70 ? 'var(--color-success)' : g.percentage >= 50 ? 'var(--color-warning)' : 'var(--color-error)',
                                    }}>{g.percentage}%</span>
                                  </div>
                                </div>
                              ))}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', marginTop: '4px', fontWeight: 700 }}>
                                <span>Total</span>
                                <span style={{ color: colorVar }}>{totalMarks}/{totalPossible}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}

                {/* Quiz History */}
                <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>📜 Recent Quizzes</h3>
                {progressData.quizHistory.map(q => (
                  <div key={q.id} className="glass-card" style={{ padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{q.subject}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(q.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: q.percentage >= 70 ? 'var(--color-success)' : q.percentage >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                          {Math.round(q.percentage)}%
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{q.score}/{q.maxScore}</div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                        onClick={() => { sendMessage(`quiz me on ${q.subject}`); setTab('chat'); }}
                      >🔄 Retry</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ─── ANALYTICS TAB ─── */}
        {tab === 'analytics' && selectedSubject && progressData?.progress && (
          <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', width: '100%' }} className="animate-fade">
            <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className="btn btn-ghost" onClick={() => { setSelectedSubject(null); setTab('dashboard'); }} style={{ padding: '8px', fontSize: '1.2rem' }}>
                  ←
                </button>
                <h1 className="page-title" style={{ margin: 0 }}>
                  {selectedSubject.includes('Machine') ? '🤖' : selectedSubject.includes('Data') ? '🧮' : '🗄️'} {selectedSubject} Analytics
                </h1>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={fetchProgress}>Refresh</button>
            </header>

            {(() => {
              const stats = progressData.progress.subjectStats[selectedSubject];
              if (!stats) return <p>No data available for this subject yet.</p>;

              const tp = (progressData.topicProgress || []).filter(t => t.subjectName === selectedSubject).sort((a, b) => b.masteryScore - a.masteryScore);

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div className="stat-card glass-card">
                      <div className="stat-value">{stats.totalQuizzes}</div>
                      <div className="stat-label">Subject Quizzes</div>
                    </div>
                    <div className="stat-card glass-card">
                      <div className="stat-value" style={{ color: stats.averageScore >= 70 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        {Math.round(stats.averageScore)}%
                      </div>
                      <div className="stat-label">Average Score</div>
                    </div>
                    <div className="stat-card glass-card">
                      <div className="stat-value">{tp.filter(t => t.masteryScore >= 80).length}</div>
                      <div className="stat-label">Topics Mastered</div>
                    </div>
                  </div>

                  <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', marginTop: '32px' }}>🧠 AI Study Plan & Analytics</h3>
                  {loadingReports[selectedSubject] ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '12px', animation: 'pulse 1.5s infinite' }}>⏳</div>
                      <p style={{ fontWeight: 500 }}>Generating personalized AI analytics report...</p>
                    </div>
                  ) : subjectReports[selectedSubject] ? (
                    <div className="markdown-body" style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{subjectReports[selectedSubject]}</ReactMarkdown>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>Could not generate report.</p>
                  )}

                  <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', marginTop: '32px' }}>📌 Topic Mastery</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                    {tp.map(t => (
                      <div key={t.topicName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <span style={{ fontWeight: 500 }}>{t.topicName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '150px' }}>
                          <div className="progress-bar" style={{ flex: 1, margin: 0 }}>
                            <div className={`progress-fill ${t.masteryScore >= 80 ? 'success' : t.masteryScore >= 50 ? 'warning' : 'error'}`} style={{ width: `${t.masteryScore}%` }} />
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: t.masteryScore >= 80 ? 'var(--color-success)' : t.masteryScore >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                            {Math.round(t.masteryScore)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {progressData.grades && progressData.grades.length > 0 && (() => {
                    const subjectGrades = progressData.grades.filter(g => g.subjectName === selectedSubject);
                    if (subjectGrades.length === 0) return null;

                    const totalMarks = subjectGrades.reduce((s, g) => s + g.marksObtained, 0);
                    const totalPossible = subjectGrades.reduce((s, g) => s + g.totalMarks, 0);
                    const pct = totalPossible > 0 ? Math.round(totalMarks / totalPossible * 100) : 0;
                    const colorVar = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-error)';

                    return (
                      <>
                        <h3 style={{ marginTop: '32px', marginBottom: '12px' }}>🎓 College Grades</h3>
                        <div className="glass-card" style={{ padding: '20px', borderTop: `3px solid ${colorVar}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h4 style={{ margin: 0, fontSize: '1rem' }}>Grades Overview</h4>
                            <span className="badge" style={{
                              background: pct >= 80 ? 'rgba(34,197,94,0.15)' : pct >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                              color: colorVar, fontWeight: 700, fontSize: '0.9rem',
                            }}>{pct}%</span>
                          </div>
                          {subjectGrades.map(g => (
                            <div key={g.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}>
                              <span style={{ fontSize: '0.85rem' }}>{g.componentType.replace('_', ' ')}</span>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600 }}>{g.marksObtained}/{g.totalMarks}</span>
                                <span className="badge" style={{
                                  fontSize: '0.7rem',
                                  background: g.percentage >= 70 ? 'rgba(34,197,94,0.15)' : g.percentage >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                                  color: g.percentage >= 70 ? 'var(--color-success)' : g.percentage >= 50 ? 'var(--color-warning)' : 'var(--color-error)',
                                }}>{g.percentage}%</span>
                              </div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', marginTop: '4px', fontWeight: 700 }}>
                            <span>Total</span>
                            <span style={{ color: colorVar }}>{totalMarks}/{totalPossible}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <h3 style={{ marginTop: '32px', marginBottom: '12px' }}>📜 Recent Quizzes</h3>
                  {progressData.quizHistory.filter(q => q.subject === selectedSubject).length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No quizzes taken for this subject yet.</p>
                  ) : (
                    progressData.quizHistory.filter(q => q.subject === selectedSubject).map(q => (
                      <div key={q.id} className="glass-card" style={{ padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{q.subject}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(q.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: q.percentage >= 70 ? 'var(--color-success)' : q.percentage >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                              {Math.round(q.percentage)}%
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{q.score}/{q.maxScore}</div>
                          </div>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                            onClick={() => { sendMessage(`quiz me on ${q.subject}`); setTab('chat'); }}
                          >🔄 Retry</button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              );
            })()}
          </div>
        )}


        {/* ─── SCHEDULE TAB ─── */}
        {tab === 'schedule' && (
          <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto', width: '100%' }} className="animate-fade">
            <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
              <h1 className="page-title">📅 Schedule</h1>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select className="input" style={{ width: 'auto', fontSize: '0.8rem', padding: '6px 10px' }} value={scheduleFilter} onChange={e => setScheduleFilter(e.target.value)}>
                  <option value="all">All Subjects</option>
                  {progressData?.schedules && [...new Set(progressData.schedules.map(s => s.subject))].map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" onClick={fetchProgress}>Refresh</button>
              </div>
            </header>

            {(!progressData?.schedules || progressData.schedules.length === 0) ? (
              <div className="empty-state">
                <div className="empty-state-emoji">📅</div>
                <div className="empty-state-title">No Events Scheduled</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Ask the AI Tutor: <em>&quot;I have ML exam on 24 March at 4 PM&quot;</em>
                </p>
                <button className="btn btn-primary" onClick={() => setTab('chat')}>
                  💬 Go to AI Tutor
                </button>
              </div>
            ) : (() => {
              const typeEmojis: Record<string, string> = { exam: '📝', assignment: '📋', revision: '📖', deadline: '⏰', study: '📚', quiz: '🎯', project: '🛠️' };
              const allSubjects = [...new Set(progressData.schedules.map(s => s.subject))];
              const filtered = scheduleFilter === 'all' ? progressData.schedules : progressData.schedules.filter(s => s.subject === scheduleFilter);
              const quizExam = filtered.filter(s => ['quiz', 'exam'].includes(s.type));
              const assignProject = filtered.filter(s => ['assignment', 'project', 'deadline'].includes(s.type));
              const revisionOther = filtered.filter(s => !['quiz', 'exam', 'assignment', 'project', 'deadline'].includes(s.type));

              const removeEvent = async (id: string) => {
                if (!confirm('Remove this event?')) return;
                try {
                  const res = await fetch('/api/schedule', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                  });
                  if (res.ok) fetchProgress();
                } catch { /* silent */ }
              };

              const renderEvent = (s: typeof progressData.schedules[0]) => {
                const isPast = new Date(s.datetime) < new Date();
                const daysLeft = Math.ceil((new Date(s.datetime).getTime() - Date.now()) / 86400000);
                const urgencyColor = isPast ? 'var(--text-muted)' : daysLeft <= 3 ? 'var(--color-error)' : daysLeft <= 7 ? 'var(--color-warning)' : 'var(--color-success)';
                return (
                  <div key={s.id} className="schedule-item glass-card" style={{ opacity: isPast ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="schedule-emoji">{typeEmojis[s.type] || '📌'}</div>
                    <div className="schedule-info" style={{ flex: 1 }}>
                      <div className="schedule-title">{s.title}</div>
                      <div className="schedule-date">{s.subject} • {new Date(s.datetime).toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: urgencyColor, whiteSpace: 'nowrap' }}>
                        {isPast ? 'Past' : daysLeft === 0 ? 'TODAY' : `${daysLeft}d left`}
                      </span>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: '0.65rem', padding: '3px 6px', minWidth: 'auto' }}
                        onClick={() => removeEvent(s.id)}
                        title="Remove event"
                      >🗑️</button>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* Quiz / Exam Section */}
                  {quizExam.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-ml)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem' }}>📝 Quiz / Exam</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({quizExam.length})</span>
                      </h3>
                      {quizExam.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).map(renderEvent)}
                    </div>
                  )}

                  {/* Assignment / Project Section */}
                  {assignProject.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem' }}>📋 Assignment / Project</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({assignProject.length})</span>
                      </h3>
                      {assignProject.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).map(renderEvent)}
                    </div>
                  )}

                  {/* Revision / Other Section */}
                  {revisionOther.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--color-warning)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem' }}>📖 Revision / Study</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({revisionOther.length})</span>
                      </h3>
                      {revisionOther.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()).map(renderEvent)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ─── LEARNING PATH TAB ─── */}
        {tab === 'learning' && (
          <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto', width: '100%' }} className="animate-fade">
            <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
              <h1 className="page-title">🗺️ Learning Path</h1>
              <button className="btn btn-secondary btn-sm" onClick={fetchProgress}>Refresh</button>
            </header>

            {!progressData?.progress ? (
              <div className="empty-state">
                <div className="empty-state-emoji">🗺️</div>
                <div className="empty-state-title">Your Path Will Appear Here</div>
                <p style={{ color: 'var(--text-muted)' }}>Take quizzes to generate a personalized learning path.</p>
                <button className="btn btn-primary" onClick={() => setTab('chat')} style={{ marginTop: '12px' }}>Start Learning</button>
              </div>
            ) : (
              <>
                {/* Upcoming Schedule-Aware Prep */}
                {progressData?.schedules && progressData.schedules.length > 0 && (
                  <div className="glass-card" style={{ padding: '24px', marginBottom: '16px', borderLeft: '4px solid var(--accent-ml)' }}>
                    <h3 style={{ marginBottom: '12px' }}>📅 Upcoming Exam Prep</h3>
                    {progressData.schedules
                      .filter(s => new Date(s.datetime) > new Date())
                      .slice(0, 3)
                      .map(s => {
                        const daysLeft = Math.ceil((new Date(s.datetime).getTime() - Date.now()) / 86400000);
                        const subjectStats = progressData.progress?.subjectStats[s.subject];
                        // Get weak topics ONLY for this subject
                        const weakTopicsForSubject = (progressData.topicProgress || [])
                          .filter(tp => tp.subjectName === s.subject && tp.masteryScore < 60)
                          .sort((a, b) => a.masteryScore - b.masteryScore)
                          .map(tp => tp.topicName);
                        const urgencyColor = daysLeft <= 3 ? 'var(--color-error)' : daysLeft <= 7 ? 'var(--color-warning)' : 'var(--color-success)';
                        const typeEmojis: Record<string, string> = { exam: '📝', quiz: '🎯', assignment: '📋', revision: '📖', deadline: '⏰' };
                        return (
                          <div key={s.id} style={{ marginBottom: '14px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <strong>{typeEmojis[s.type] || '📌'} {s.title}</strong>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: urgencyColor }}>
                                {daysLeft <= 0 ? 'TODAY!' : `${daysLeft} day${daysLeft > 1 ? 's' : ''} left`}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0' }}>
                              {new Date(s.datetime).toLocaleString()} • {s.subject}
                            </p>
                            {subjectStats && (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0' }}>
                                Current avg: <strong>{Math.round(subjectStats.averageScore)}%</strong> ({subjectStats.totalQuizzes} quizzes taken)
                              </p>
                            )}
                            {weakTopicsForSubject.length > 0 && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--color-warning)', margin: '4px 0' }}>
                                ⚠️ Weak in {s.subject}: {weakTopicsForSubject.slice(0, 3).join(', ')}
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                              <button className="btn btn-primary btn-sm" style={{ fontSize: '0.7rem' }}
                                onClick={() => { sendMessage(`quiz me on ${s.subject}`); setTab('chat'); }}>📝 Practice Quiz</button>
                              {weakTopicsForSubject.length > 0 && (
                                <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem' }}
                                  onClick={() => { sendMessage(`explain ${weakTopicsForSubject[0]} in ${s.subject}`); setTab('chat'); }}>📖 Study {weakTopicsForSubject[0]}</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Focus Areas — Grouped by Subject */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px' }}>🎯 Focus Areas — Weak Topics</h3>
                  {(() => {
                    const tp = progressData.topicProgress || [];
                    const weakBySubject: Record<string, Array<{ topicName: string; masteryScore: number }>> = {};
                    tp.filter(t => t.masteryScore < 60).forEach(t => {
                      if (!weakBySubject[t.subjectName]) weakBySubject[t.subjectName] = [];
                      weakBySubject[t.subjectName].push({ topicName: t.topicName, masteryScore: t.masteryScore });
                    });
                    // Sort within each subject
                    Object.values(weakBySubject).forEach(arr => arr.sort((a, b) => a.masteryScore - b.masteryScore));

                    if (Object.keys(weakBySubject).length === 0) return <p style={{ color: 'var(--text-muted)' }}>No weak areas detected. Keep it up! 🌟</p>;

                    const subjectEmojis: Record<string, string> = { 'Machine Learning': '🤖', 'Data Structures & Algorithms': '🧮', 'Database Systems': '🗄️' };
                    const subjectColors: Record<string, string> = { 'Machine Learning': 'var(--accent-ml)', 'Data Structures & Algorithms': 'var(--accent-dsa)', 'Database Systems': 'var(--accent-db)' };

                    return Object.entries(weakBySubject).map(([subject, topics]) => (
                      <div key={subject} style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: subjectColors[subject] || 'var(--text-primary)', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                          {subjectEmojis[subject] || '📚'} {subject}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {topics.map(({ topicName, masteryScore }) => (
                            <span key={topicName} className="badge" style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', color: masteryScore < 40 ? 'var(--color-error)' : 'var(--color-warning)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }} onClick={() => { sendMessage(`explain ${topicName} in ${subject}`); setTab('chat'); }}>
                              {topicName} ({Math.round(masteryScore)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Subject-wise Recommendations */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
                  <h3 style={{ marginBottom: '12px' }}>💡 Subject Analysis & Recommendations</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(progressData.progress.subjectStats).map(([subject, stats]) => {
                      const emoji = subject.includes('Machine') ? '🤖' : subject.includes('Data') ? '🧮' : '🗄️';
                      // Get weak topics ONLY for this specific subject
                      const weakTopicsInSubject = (progressData.topicProgress || [])
                        .filter(tp => tp.subjectName === subject && tp.masteryScore < 60)
                        .sort((a, b) => a.masteryScore - b.masteryScore)
                        .map(tp => tp.topicName)
                        .slice(0, 3);
                      const suggestion = stats.averageScore < 50
                        ? 'Focus on fundamentals — use AI Tutor for explanations, then try easy quizzes'
                        : stats.averageScore < 75
                          ? 'Good progress — tackle medium-difficulty quizzes to strengthen weak topics'
                          : 'Excellent mastery! Challenge yourself with hard questions and teach others';
                      return (
                        <div key={subject} className="glass-card" style={{ padding: '14px 16px', background: 'var(--bg-secondary)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <strong>{emoji} {subject}</strong>
                            <span className="badge" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-ml)' }}>
                              {stats.currentDifficulty} • Avg {Math.round(stats.averageScore)}%
                            </span>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0' }}>{suggestion}</p>
                          {weakTopicsInSubject.length > 0 && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0' }}>
                              📌 Focus on: {weakTopicsInSubject.join(', ')}
                            </p>
                          )}
                          <button className="btn btn-primary btn-sm" style={{ marginTop: '8px', fontSize: '0.7rem' }}
                            onClick={() => { sendMessage(`quiz me on ${subject}`); setTab('chat'); }}>📝 Take Quiz</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mastered Topics — Also Grouped By Subject */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={{ marginBottom: '12px' }}>🌟 Mastered Topics</h3>
                  {(() => {
                    const tp = progressData.topicProgress || [];
                    const masteredBySubject: Record<string, Array<{ topicName: string; masteryScore: number }>> = {};
                    tp.filter(t => t.masteryScore >= 80).forEach(t => {
                      if (!masteredBySubject[t.subjectName]) masteredBySubject[t.subjectName] = [];
                      masteredBySubject[t.subjectName].push({ topicName: t.topicName, masteryScore: t.masteryScore });
                    });
                    const subjectEmojis: Record<string, string> = { 'Machine Learning': '🤖', 'Data Structures & Algorithms': '🧮', 'Database Systems': '🗄️' };
                    if (Object.keys(masteredBySubject).length === 0) return <p style={{ color: 'var(--text-muted)' }}>Take more quizzes to see mastered topics here!</p>;
                    return Object.entries(masteredBySubject).map(([subject, topics]) => (
                      <div key={subject} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                          {subjectEmojis[subject] || '📚'} {subject}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {topics.sort((a, b) => b.masteryScore - a.masteryScore).map(({ topicName, masteryScore }) => (
                            <span key={topicName} className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', padding: '6px 10px' }}>
                              {topicName} ({Math.round(masteryScore)}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── SETTINGS TAB ─── */}
        {tab === 'settings' && (
          <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto', width: '100%' }} className="animate-fade">
            <header className="page-header" style={{ position: 'static', background: 'transparent', padding: '0 0 24px' }}>
              <h1 className="page-title">⚙️ Settings</h1>
            </header>

            <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
              <h3 style={{ marginBottom: '16px' }}>👤 Profile</h3>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Name</label>
                <input className="input" value={session.user?.name || ''} disabled />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Email</label>
                <input className="input" value={session.user?.email || ''} disabled />
              </div>
              <div>
                <label className="form-label">Role</label>
                <input className="input" value={(session.user as { role?: string })?.role || 'STUDENT'} disabled />
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
              <h3 style={{ marginBottom: '12px' }}>ℹ️ About Drona AI</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>Drona AI</strong> is an AI-powered adaptive learning management system
                powered by <strong>Groq LLM</strong> (Llama 3.3 70B). It uses a multi-agent architecture where
                every response is generated by AI — explanations, quiz questions, evaluations, and scheduling
                are all handled by specialized LLM agents with RAG-powered knowledge retrieval.
              </p>
            </div>

            <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => signOut()}>
              🚪 Sign Out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
