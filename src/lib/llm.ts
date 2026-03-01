/**
 * LLM Client — Provider-agnostic wrapper using OpenAI-compatible API
 * 
 * Swap provider by changing 3 env vars in .env:
 *   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
 * 
 * Works with: Groq, OpenAI, Together AI, Ollama, Fireworks, etc.
 */

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;  // Force JSON output
}

interface LLMResponse {
    content: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

/**
 * Send a chat completion request to the LLM
 */
export async function chatCompletion(
    messages: ChatMessage[],
    options: LLMOptions = {}
): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 2048, jsonMode = false } = options;

    const body: Record<string, unknown> = {
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
    };

    if (jsonMode) {
        body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const error = await res.text();
        console.error(`LLM Error [${res.status}]:`, error);
        throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
    };
}

/**
 * Quick helper — send a single prompt with system context
 */
export async function ask(
    systemPrompt: string,
    userMessage: string,
    options: LLMOptions = {}
): Promise<string> {
    const response = await chatCompletion(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        options
    );
    return response.content;
}

/**
 * Ask for JSON — parses response into typed object
 */
export async function askJSON<T>(
    systemPrompt: string,
    userMessage: string,
    options: LLMOptions = {}
): Promise<T> {
    const content = await ask(systemPrompt, userMessage, {
        ...options,
        jsonMode: true,
        temperature: options.temperature ?? 0.3, // Lower temp for structured output
    });

    try {
        return JSON.parse(content) as T;
    } catch {
        // Try extracting JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1].trim()) as T;
        }
        console.error('Failed to parse LLM JSON:', content.substring(0, 500));
        throw new Error('LLM returned invalid JSON');
    }
}
