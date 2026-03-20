import { NextRequest, NextResponse } from "next/server";
import {
  getMainCodingPrompt,
  screenshotToCodePrompt,
  softwareArchitectPrompt,
} from "@/lib/prompts";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: NextRequest) {
  try {
    const { prompt, model, quality, screenshotUrl, apiKey: userApiKey } = await request.json();

    async function fetchTitle() {
      try {
        const { text: responseText } = await generateText({
          model: openai("gpt-4-turbo"),
          prompt: `You are a chatbot helping the user create a simple app or script, and your current job is to create a succinct title, maximum 3-5 words, for the chat given their initial prompt: "${prompt}". Please return only the title.`,
        });
        return responseText || prompt;
      } catch (e: any) {
        console.error("Error fetching title:", e);
        return prompt;
      }
    }

    async function fetchTopExample() {
      try {
        const { text: responseText } = await generateText({
          model: openai("gpt-4-turbo"),
          prompt: `You are a helpful bot. Given a request for building an app, you match it to the most similar example provided. If the request is NOT similar to any of the provided examples, return "none". Here is the list of examples, ONLY reply with one of them OR "none":

              - landing page
              - blog app
              - quiz app
              - pomodoro timer

              Request: ${prompt}`,
        });

        const mostSimilarExample = responseText || "none";
        return mostSimilarExample.trim().toLowerCase();
      } catch (e: any) {
        console.error("Error fetching top example:", e);
        return "none";
      }
    }

    const [title, mostSimilarExample] = await Promise.all([
      fetchTitle(),
      fetchTopExample(),
    ]);

    let fullScreenshotDescription;
    if (screenshotUrl) {
      let base64Data = "";
      let mimeType = "image/png";
      if (screenshotUrl.startsWith("data:")) {
        const match = screenshotUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      }

      if (base64Data) {
        const { text: screenshotText } = await generateText({
          model: openai("gpt-4-turbo"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: base64Data,
                },
                {
                  type: "text",
                  text: screenshotToCodePrompt,
                },
              ],
            },
          ],
        });
        fullScreenshotDescription = screenshotText;
      }
    }

    let userMessage: string;
    if (quality === "high") {
      try {
        const { text: architectText } = await generateText({
          model: openai("gpt-4-turbo"),
          messages: [
            {
              role: "user",
              content: softwareArchitectPrompt + "\n\n" + (fullScreenshotDescription
                ? fullScreenshotDescription + prompt
                : prompt),
            },
          ],
        });
        userMessage = architectText ?? prompt;
      } catch (e: any) {
        console.error("Error fetching architect plan:", e);
        userMessage = prompt;
      }
    } else if (fullScreenshotDescription) {
      userMessage =
        prompt +
        "RECREATE THIS APP AS CLOSELY AS POSSIBLE: " +
        fullScreenshotDescription;
    } else {
      userMessage = prompt;
    }

    const chatId = crypto.randomUUID();

    const messages = [
      {
        id: crypto.randomUUID(),
        role: "system",
        content: getMainCodingPrompt(mostSimilarExample),
        position: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage,
        position: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    return NextResponse.json({
      chatId,
      messages,
      title,
    });
  } catch (error: any) {
    console.error("Error creating chat:", error);
    return NextResponse.json(
      {
        error: "Failed to create chat",
      },
      { status: 500 },
    );
  }
}
