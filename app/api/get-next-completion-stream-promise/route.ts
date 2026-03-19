import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// Strict rate limiter for Gemini free tier
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 4000; // 4 seconds between requests (free tier is ~15 req/min)

function getTimeSinceLastRequest(): number {
  return Date.now() - lastRequestTime;
}

function updateLastRequestTime(): void {
  lastRequestTime = Date.now();
}

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
    const { messages: rawMessages, model, apiKey: userApiKey } = await req.json();

    // Enforce rate limit for free tier
    const timeSinceLastRequest = getTimeSinceLastRequest();
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTimeSeconds = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000);
      return new Response(
        JSON.stringify({
          error: `Rate limit: Please wait ${waitTimeSeconds}s before next request. Free tier allows ~4s between requests.`,
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(waitTimeSeconds) },
        },
      );
    }

    let messages = z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }),
      )
      .parse(rawMessages);

    messages = optimizeMessagesForTokens(messages);

    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const otherMessages = messages.filter((m) => m.role !== "system");

    // Merge consecutive messages with the same role and convert to Gemini format
    let history = otherMessages.reduce((acc, curr) => {
      const role = curr.role === "assistant" ? "model" : "user";
      if (acc.length > 0 && acc[acc.length - 1].role === role) {
        acc[acc.length - 1].parts[0].text += "\n\n" + curr.content;
      } else {
        acc.push({
          role,
          parts: [{ text: curr.content }],
        });
      }
      return acc;
    }, [] as any[]);

    // If there's a system message and no history, prepend it as the first user message
    if (systemMessage && history.length === 0) {
      history.push({
        role: "user",
        parts: [{ text: systemMessage }],
      });
    } else if (systemMessage && history.length > 0 && history[0].role === "user") {
      // Prepend system message to first user message
      history[0].parts[0].text = systemMessage + "\n\n" + history[0].parts[0].text;
    }

    // Truncate history if too long, ensuring we don't break alternating roles
    // Since we merged consecutive roles, any slice will still alternate.
    let truncatedHistory = history;
    if (truncatedHistory.length > 10) {
      truncatedHistory = truncatedHistory.slice(-10);
      // Ensure history starts with 'user' role for better compatibility
      if (truncatedHistory[0].role === "model") {
        truncatedHistory = truncatedHistory.slice(1);
      }
    }

    const lastMessage = truncatedHistory.pop();

    const apiKey = (userApiKey || process.env.GEMINI_API_KEY)?.trim();

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "Missing Gemini API Key. Please add GEMINI_API_KEY to your .env file.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Validate model or default to flash
    const geminiModelName = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"].includes(model)
      ? model
      : "gemini-1.5-flash";

    const geminiModel = genAI.getGenerativeModel({
      model: geminiModelName,
    });

    const chat = geminiModel.startChat({
      history: truncatedHistory,
    });

    // Update last request time right before making the API call
    updateLastRequestTime();

    const result = await chat.sendMessageStream(lastMessage?.parts[0].text || "");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result.stream) {
            try {
              const chunkText = chunk.text();
              if (chunkText) {
                const payload = {
                  choices: [
                    {
                      delta: {
                        content: chunkText,
                      },
                    },
                  ],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              }
            } catch (chunkError) {
              console.error("Error processing chunk:", chunkError);
              // Continue to next chunk if one fails (e.g. blocked)
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Stream error:", e);
          controller.error(e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in get-next-completion-stream-promise:", error);
    
    const errorMessage = (error as Error).message || "Unknown error";
    
    // Handle quota exceeded errors
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("Quota exceeded")) {
      return new Response(
        JSON.stringify({
          error: "Gemini API free tier quota exceeded. Please wait a few hours or upgrade to a paid plan at https://aistudio.google.com",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const runtime = "edge";
export const maxDuration = 300;
