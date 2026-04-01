import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export class ClaudeError extends Error {
  transient: boolean;
  
  constructor(message: string, transient = false) {
    super(message);
    this.name = "ClaudeError";
    this.transient = transient;
  }
}

function isRateLimitError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("rate limit") ||
    errorMsg.toLowerCase().includes("quota")
  );
}

export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
  role: MessageRole;
  content: string;
}

export interface CachedSystemMessage {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export async function callClaudeJson<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const {
    model = "claude-sonnet-4-5",
    maxTokens = 8192,
    temperature = 0.7,
    retries = 3,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new ClaudeError("Unexpected response type");
      }

      const text = content.text;
      console.log(`[CLAUDE] Response length: ${text.length} chars`);
      
      let jsonStr = text;
      
      // Try extracting from markdown code blocks first
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
        console.log(`[CLAUDE] Extracted JSON from code block`);
      } else {
        // Try to find JSON object in raw text
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
          console.log(`[CLAUDE] Extracted JSON object from raw text`);
        }
      }

      try {
        const parsed = JSON.parse(jsonStr);
        return schema.parse(parsed);
      } catch (parseErr) {
        console.error(`[CLAUDE] JSON parse failed, first 500 chars:`, text.slice(0, 500));
        throw parseErr;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (isRateLimitError(error)) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[CLAUDE] Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (error instanceof z.ZodError) {
        console.error("[CLAUDE] Schema validation failed:", error.errors);
        throw new ClaudeError(`Schema validation failed: ${error.message}`, false);
      }
      
      if (error instanceof SyntaxError) {
        console.error("[CLAUDE] JSON parse failed");
        throw new ClaudeError("Failed to parse JSON response", false);
      }
      
      throw error;
    }
  }

  throw lastError || new ClaudeError("Max retries exceeded", true);
}

export async function callClaudeWithConversation<T>(
  systemMessage: CachedSystemMessage[],
  messages: ConversationMessage[],
  schema: z.ZodSchema<T>,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    retries?: number;
  } = {}
): Promise<{ result: T; response: string }> {
  const {
    model = "claude-sonnet-4-5",
    maxTokens = 8192,
    temperature = 0.7,
    retries = 3,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new ClaudeError("Unexpected response type");
      }

      const text = content.text;
      
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      const validated = schema.parse(parsed);
      
      const usage = (message as any).usage;
      if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
        console.log(`[CLAUDE] Cache stats - created: ${usage.cache_creation_input_tokens || 0}, read: ${usage.cache_read_input_tokens || 0}`);
      }
      
      return { result: validated, response: text };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (isRateLimitError(error)) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[CLAUDE] Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (error instanceof z.ZodError) {
        console.error("[CLAUDE] Schema validation failed:", error.errors);
        throw new ClaudeError(`Schema validation failed: ${error.message}`, false);
      }
      
      if (error instanceof SyntaxError) {
        console.error("[CLAUDE] JSON parse failed");
        throw new ClaudeError("Failed to parse JSON response", false);
      }
      
      throw error;
    }
  }

  throw lastError || new ClaudeError("Max retries exceeded", true);
}

export async function callClaude(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const {
    model = "claude-sonnet-4-5",
    maxTokens = 8192,
    temperature = 0.7,
  } = options;

  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new ClaudeError("Unexpected response type");
  }

  return content.text;
}
