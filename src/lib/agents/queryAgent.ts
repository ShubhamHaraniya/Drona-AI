/**
 * Query Agent — LLM-powered explanations with RAG context
 * 
 * Flow:
 * 1. Search vectorStore for relevant knowledge chunks (RAG)
 * 2. Send context + question to LLM for a detailed, natural explanation
 * 3. Return formatted response with sources
 */
import { ask } from '../llm';
import { searchKnowledge } from '../vectorStore';
import type { AgentResponse } from '../types';

const EXPLAIN_SYSTEM_PROMPT = `You are Drona AI, an expert AI tutor for college students studying Machine Learning, Data Structures & Algorithms, and Database Systems.

Your job: Explain concepts clearly, thoroughly, and in an engaging way.

Rules:
- Use **markdown formatting** — headers, bold, bullet points, code blocks
- Include **real examples** and analogies students can relate to
- Show **formulas/equations** when relevant (use inline code for math)
- Keep it structured: start with a brief overview, then dive deep
- Be encouraging and conversational — you're a tutor, not a textbook
- If context from knowledge base is provided, USE it as your primary source
- At the end, add 2-3 **follow-up suggestions** the student might want to explore next
- Keep explanations between 200-400 words — detailed but not overwhelming`;

export async function handleQuery(
    message: string,
    context?: { subject?: string; topic?: string }
): Promise<AgentResponse> {
    try {
        // Step 1: RAG — search knowledge base for relevant context
        const ragResults = searchKnowledge(message, {
            subject: context?.subject,
            topK: 3,
            minScore: 0.03,
        });

        // Step 2: Build context for LLM
        let ragContext = '';
        if (ragResults.length > 0) {
            ragContext = '\n\n--- KNOWLEDGE BASE CONTEXT (use this as primary source) ---\n';
            ragResults.forEach((r, i) => {
                ragContext += `\n[Source ${i + 1}: ${r.chunk.title} | ${r.chunk.subject} | ${r.chunk.pageRef}]\n${r.chunk.content}\n`;
            });
            ragContext += '\n--- END CONTEXT ---\n';
        }

        const userPrompt = ragContext
            ? `${message}\n${ragContext}\nUse the above knowledge base context to answer. Cite the source (e.g., "Source: ML.pdf p.45-55") at the end.`
            : message;

        // Step 3: Get LLM explanation
        const explanation = await ask(EXPLAIN_SYSTEM_PROMPT, userPrompt, {
            temperature: 0.7,
            maxTokens: 1500,
        });

        return {
            type: 'explanation',
            message: explanation,
            metadata: {
                ragSources: ragResults.map(r => ({
                    title: r.chunk.title,
                    subject: r.chunk.subject,
                    pageRef: r.chunk.pageRef,
                    score: r.score,
                })),
            },
            suggestedActions: [
                { label: '📝 Quiz me on this', action: `quiz me on ${context?.topic || context?.subject || 'this topic'}` },
                { label: '🔍 Go deeper', action: `explain more about ${context?.topic || 'this topic'}` },
                { label: '📊 My progress', action: 'show my progress' },
            ],
        };
    } catch (error) {
        console.error('Query Agent error:', error);
        return {
            type: 'explanation',
            message: '⚠️ Sorry, I had trouble generating an explanation right now. Please try again in a moment!',
            metadata: { error: true },
            suggestedActions: [
                { label: '🔄 Try again', action: message },
            ],
        };
    }
}
