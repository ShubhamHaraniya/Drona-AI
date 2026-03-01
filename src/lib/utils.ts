// Utility functions for the Drona AI platform

// --- Date/Time ---
export function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function formatDateTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(date);
}

export function isToday(date: Date | string): boolean {
    const d = new Date(date);
    const today = new Date();
    return d.toDateString() === today.toDateString();
}

// --- Math ---
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1);
}

export function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

export function percentageOf(value: number, total: number): number {
    if (total === 0) return 0;
    return roundTo((value / total) * 100, 1);
}

// --- String ---
export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

export function slugify(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// --- Array ---
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
        const groupKey = String(item[key]);
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(item);
        return groups;
    }, {} as Record<string, T[]>);
}

export function sortByKey<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
    return [...array].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// --- Performance Helpers ---
export function getPerformanceLabel(percentage: number): string {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 75) return 'Good';
    if (percentage >= 60) return 'Average';
    if (percentage >= 40) return 'Below Average';
    return 'Needs Improvement';
}

export function getPerformanceColor(percentage: number): string {
    if (percentage >= 90) return 'var(--color-success)';
    if (percentage >= 75) return 'var(--accent-ml)';
    if (percentage >= 60) return 'var(--accent-db)';
    if (percentage >= 40) return 'var(--color-warning)';
    return 'var(--color-error)';
}

export function getDifficultyLabel(level: string): string {
    const labels: Record<string, string> = {
        Easy: '🟢 Easy',
        Medium: '🟡 Medium',
        Hard: '🔴 Hard',
    };
    return labels[level] || level;
}

export function getSubjectEmoji(code: string): string {
    const emojis: Record<string, string> = {
        ML: '🤖',
        DSA: '🧮',
        DB: '🗄️',
    };
    return emojis[code] || '📚';
}

// --- Streak Calculation ---
export function calculateStreak(dates: string[]): number {
    if (!dates.length) return 0;

    const sorted = [...new Set(dates)]
        .map(d => new Date(d).toDateString())
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
        const diff = new Date(sorted[i - 1]).getTime() - new Date(sorted[i]).getTime();
        if (diff === 86400000) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

// --- Confidence Calibration ---
export function calculateCalibration(
    confidenceLevel: number,
    actualPerformance: number
): { calibrationError: number; label: string } {
    const error = Math.abs(confidenceLevel - actualPerformance);
    let label = 'Well Calibrated';
    if (error > 30) label = 'Severely Miscalibrated';
    else if (error > 20) label = 'Overconfident';
    else if (error > 10) label = 'Slightly Off';
    return { calibrationError: roundTo(error, 1), label };
}

// --- Learning Path ---
export function getPriorityLevel(mastery: number): 'Critical' | 'High' | 'Medium' | 'Low' {
    if (mastery < 30) return 'Critical';
    if (mastery < 50) return 'High';
    if (mastery < 70) return 'Medium';
    return 'Low';
}

// --- Unique ID ---
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --- Debounce ---
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// --- Safe JSON parse ---
export function safeJsonParse<T>(str: string, fallback: T): T {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}
