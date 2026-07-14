import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions';
import { SYSTEM_PROMPT } from './prompts.js';
import { TOOLS } from './tools.js';
import { executeTool } from './executor.js';
import type { ToolResult } from '@ritual-swap/config';

export interface AgentResponse {
  content: string;
  toolResults: ToolResult[];
  pendingTransaction?: ToolResult['transaction'];
}

/**
 * SwapAgent — AI-powered intent agent for Ritual Swap.
 * Uses OpenRouter with Gemini 2.5 Flash for LLM reasoning.
 */
export class SwapAgent {
  private client: OpenAI;
  private messages: ChatCompletionMessageParam[];
  private userAddress: `0x${string}`;
  private model: string;

  constructor(config: {
    apiKey: string;
    userAddress: `0x${string}`;
    model?: string;
  }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    this.userAddress = config.userAddress;
    this.model = config.model ?? 'google/gemini-2.5-flash';
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  /**
   * Process a user message through the agent loop.
   * Handles multi-turn tool calling until a final text response is produced.
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    this.messages.push({ role: 'user', content: userMessage });

    const allToolResults: ToolResult[] = [];
    let pendingTx: ToolResult['transaction'] | undefined;
    const maxIterations = 10; // prevent infinite loops

    for (let i = 0; i < maxIterations; i++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: TOOLS,
        tool_choice: 'auto',
      });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const message = choice.message;

      // Add assistant message to history
      this.messages.push(message as ChatCompletionMessageParam);

      // If no tool calls, return the text response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return {
          content: message.content ?? 'I processed your request.',
          toolResults: allToolResults,
          pendingTransaction: pendingTx,
        };
      }

      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        const { name, arguments: argsStr } = toolCall.function;
        let params: Record<string, unknown>;

        try {
          params = JSON.parse(argsStr);
        } catch {
          params = {};
        }

        const result = await executeTool(name, params, this.userAddress);
        allToolResults.push(result);

        // Track pending transactions
        if (result.transaction) {
          pendingTx = result.transaction;
        }

        // Feed tool result back to the LLM
        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            success: result.success,
            message: result.message,
            data: result.data,
            hasTransaction: !!result.transaction,
          }),
        } as ChatCompletionMessageParam);
      }

      // If finish_reason is 'stop', we're done even with tool calls
      if (choice.finish_reason === 'stop') {
        return {
          content: message.content ?? 'Transaction prepared. Please confirm to proceed.',
          toolResults: allToolResults,
          pendingTransaction: pendingTx,
        };
      }
    }

    return {
      content: 'I completed the analysis. Let me know if you need anything else.',
      toolResults: allToolResults,
      pendingTransaction: pendingTx,
    };
  }

  /** Get conversation history */
  getHistory(): ChatCompletionMessageParam[] {
    return [...this.messages];
  }

  /** Clear conversation (keeps system prompt) */
  clearHistory(): void {
    this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  /** Get the user address this agent operates on */
  getUserAddress(): `0x${string}` {
    return this.userAddress;
  }

  /** Update user address (e.g. on wallet change) */
  setUserAddress(address: `0x${string}`): void {
    this.userAddress = address;
  }
}
