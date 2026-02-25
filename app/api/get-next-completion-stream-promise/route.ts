import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// function optimizeMessagesForTokens(
//   messages: { role: "system" | "user" | "assistant"; content: string }[],
// ): { role: "system" | "user" | "assistant"; content: string }[] {
//   // Strip code blocks from assistant messages except the last 2 to save tokens
//   const assistantIndices: number[] = [];
//   for (
//     let i = messages.length - 1;
//     i >= 0 && assistantIndices.length < 2;
//     i--
//   ) {
//     if (messages[i].role === "assistant") {
//       assistantIndices.push(i);
//     }
//   }
//   return messages.map((msg, index) => {
//     if (msg.role === "assistant" && !assistantIndices.includes(index)) {
//       return {
//         ...msg,
//         content: msg.content.replace(/```[\s\S]*?```/g, "").trim(),
//       };
//     }
//     return msg;
//   });
// }

export async function POST(req: Request) {
  try {
    const { messages: rawMessages, model, apiKey: userApiKey } = await req.json();

    let messages = z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }),
      )
      .parse(rawMessages);

    // Skip token optimization as Gemini has a large context window and needs code blocks for context
    // messages = optimizeMessagesForTokens(messages);

    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const otherMessages = messages.filter((m) => m.role !== "system");

    // Merge consecutive messages with the same role and convert to Gemini format
    const history = otherMessages.reduce((acc, curr) => {
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
      systemInstruction: systemMessage,
    });

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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const runtime = "edge";
export const maxDuration = 300;
