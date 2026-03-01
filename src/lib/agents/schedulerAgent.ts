/**
 * Scheduler Agent — LLM parses natural language into schedule events
 * 
 * Flow:
 * 1. LLM extracts schedule details from user's message
 * 2. Returns structured event data (type, subject, title, datetime)
 * 3. Event is saved to DB by the chat route
 */
import { askJSON } from '../llm';
import type { ScheduleEvent, AgentResponse } from '../types';
import { formatDateTime, generateId } from '../utils';

const SCHEDULER_SYSTEM_PROMPT = `You are a schedule parser for an educational LMS called Drona AI.
The current date/time is: {{CURRENT_DATE}}

Parse the user's message and determine:
1. **action**: "add" (schedule something), "list" (view schedule), or "remove" (cancel event)
2. For "add" action, extract:
   - **type**: "exam", "quiz", "assignment", "revision", "deadline", or "study"
   - **subject**: "Machine Learning", "Data Structures & Algorithms", "Database Systems", or "General"
   - **title**: A descriptive title for the event (e.g., "Machine Learning Quiz")
   - **datetime**: ISO 8601 datetime string (e.g., "2026-03-24T16:00:00")

Respond with ONLY valid JSON:
{
  "action": "add|list|remove",
  "type": "exam|quiz|assignment|revision|deadline|study",
  "subject": "Machine Learning|Data Structures & Algorithms|Database Systems|General",
  "title": "descriptive title",
  "datetime": "2026-03-24T16:00:00"
}

Rules:
- For "list" or "remove" action, only include "action" field
- Convert relative dates like "tomorrow", "next week" to actual dates
- If no time specified, default to 10:00 AM
- Understand short forms: ML = Machine Learning, DSA = Data Structures, DBMS/DB = Database Systems`;

function formatScheduleList(schedules: ScheduleEvent[]): string {
    if (schedules.length === 0) {
        return '📅 No upcoming schedules.\n\n_Add one by saying: "Schedule ML exam on March 15" or "Assignment due in 3 days"_';
    }

    const sorted = [...schedules].sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );

    const typeEmojis: Record<string, string> = {
        exam: '📝', assignment: '📋', revision: '📖', deadline: '⏰', study: '📚', quiz: '🎯',
    };

    let response = `## 📅 Your Schedule\n\n`;

    sorted.forEach(event => {
        const emoji = typeEmojis[event.type] || '📌';
        const dateStr = formatDateTime(event.datetime);
        const isUpcoming = new Date(event.datetime) > new Date();

        response += `${emoji} **${event.title}**\n`;
        response += `   ${event.subject} • ${dateStr}${isUpcoming ? '' : ' *(past)*'}\n\n`;
    });

    return response;
}

export async function handleScheduleRequest(
    message: string,
    currentSchedules: ScheduleEvent[]
): Promise<AgentResponse> {
    try {
        // Inject current date into system prompt
        const systemPrompt = SCHEDULER_SYSTEM_PROMPT.replace(
            '{{CURRENT_DATE}}',
            new Date().toISOString()
        );

        const result = await askJSON<{
            action: 'add' | 'list' | 'remove';
            type?: string;
            subject?: string;
            title?: string;
            datetime?: string;
        }>(systemPrompt, message, { temperature: 0.1, maxTokens: 256 });

        if (result.action === 'list') {
            return {
                type: 'schedule',
                message: formatScheduleList(currentSchedules),
                metadata: { schedules: currentSchedules },
                suggestedActions: [
                    { label: '➕ Add Event', action: 'schedule ML exam tomorrow' },
                    { label: '📝 Take Quiz', action: 'quiz me' },
                ],
            };
        }

        if (result.action === 'add' && result.datetime) {
            const event: ScheduleEvent = {
                id: generateId(),
                type: (result.type || 'study') as ScheduleEvent['type'],
                subject: result.subject || 'General',
                title: result.title || `${result.subject || 'General'} ${result.type || 'Event'}`,
                datetime: new Date(result.datetime).toISOString(),
            };

            const dateStr = formatDateTime(event.datetime);

            return {
                type: 'schedule',
                message: `✅ **Event Scheduled!**\n\n📌 **${event.title}**\n📅 ${dateStr}\n📚 ${event.subject}\n🏷️ ${event.type}\n\n_I'll help you prepare as the date approaches!_`,
                metadata: {
                    newEvent: event,
                    action: 'add',
                },
                suggestedActions: [
                    { label: '📅 View All', action: 'show my schedule' },
                    { label: `📖 Study ${event.subject}`, action: `explain ${event.subject} concepts` },
                ],
            };
        }

        return {
            type: 'schedule',
            message: 'I can help you manage your schedule! Try:\n\n- _"Schedule ML exam on March 15"_\n- _"I have DSA quiz tomorrow at 2 pm"_\n- _"Show my schedule"_',
            metadata: {},
            suggestedActions: [
                { label: '📅 View Schedule', action: 'show my schedule' },
                { label: '➕ Add Exam', action: 'schedule exam next week' },
            ],
        };
    } catch (error) {
        console.error('Scheduler Agent error:', error);
        return {
            type: 'schedule',
            message: '⚠️ I had trouble parsing that schedule request. Try something like:\n\n- _"Schedule ML exam on March 20 at 2 PM"_\n- _"Show my schedule"_',
            metadata: {},
            suggestedActions: [
                { label: '🔄 Try again', action: message },
            ],
        };
    }
}
