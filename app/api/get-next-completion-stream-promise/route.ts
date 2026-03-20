import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

function optimizeMessagesForTokens(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): { role: "system" | "user" | "assistant"; content: string }[] {
  // Strip code blocks from assistant messages except the last 2 to save tokens
  const assistantIndices: number[] = [];
  for (
    let i = messages.length - 1;
    i >= 0 && assistantIndices.length < 2;
    i--
  ) {
    if (messages[i].role === "assistant") {
      assistantIndices.push(i);
    }
  }
  return messages.map((msg, index) => {
    if (msg.role === "assistant" && !assistantIndices.includes(index)) {
      return {
        ...msg,
        content: msg.content.replace(/```[\s\S]*?```/g, "").trim(),
      };
    }
    return msg;
  });
}

export async function POST(req: Request) {
  try {
    const { messages: rawMessages, model } = await req.json();

    let messages = z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }),
      )
      .parse(rawMessages);

    messages = optimizeMessagesForTokens(messages);

    // Convert messages to OpenAI format
    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const conversationMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Use gpt-4-turbo for code generation with streaming
    const result = await streamText({
      model: openai("gpt-4-turbo"),
      system: systemMessage,
      messages: conversationMessages,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error in get-next-completion-stream-promise:", error);

    const errorMessage = (error as Error).message || "Unknown error";

    // Handle specific errors
    if (
      errorMessage.includes("429") ||
      errorMessage.includes("rate_limit") ||
      errorMessage.includes("quota")
    ) {
      return new Response(
        JSON.stringify({
          error: "API rate limit exceeded. Please wait a moment and try again.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (errorMessage.includes("401") || errorMessage.includes("auth")) {
      return new Response(
        JSON.stringify({
          error: "Authentication failed. Please check your API configuration.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: errorMessage || "Failed to generate response",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
