import { clerkClient, currentUser } from "@clerk/nextjs/server";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";

export async function POST(req: Request) {
  const user = await currentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await req.json();

  const data = z
    .object({
      userAPIKey: z.string().optional(),
      companyName: z.string(),
      selectedStyle: z.string(),
      selectedPrimaryColor: z.string(),
      selectedBackgroundColor: z.string(),
      additionalInfo: z.string().optional(),
    })
    .parse(json);

  // Optional Helicone support
  const options: ConstructorParameters<typeof Together>[0] = {};
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-LOGOBYOK": data.userAPIKey ? "true" : "false",
    };
  }

  const client = new Together(options);

  // Use user's API key if provided
  if (data.userAPIKey) {
    client.apiKey = data.userAPIKey;

    await clerkClient().then((client) =>
      client.users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining: "BYOK",
        },
      }),
    );
  }

  const styleLookup: Record<string, string> = {
    Flashy:
      "Flashy, attention grabbing, bold, futuristic, and eye-catching. Use vibrant neon colors with metallic, shiny, and glossy accents.",
    Tech:
      "highly detailed, sharp focus, cinematic, photorealistic, Minimalist, clean, sleek, neutral color palette with subtle accents.",
    Modern:
      "modern, forward-thinking, flat design, geometric shapes, clean lines, natural colors with subtle accents.",
    Playful:
      "playful, lighthearted, bright bold colors, rounded shapes, lively.",
    Abstract:
      "abstract, artistic, creative, unique shapes, patterns, and textures.",
    Minimal:
      "minimal, simple, timeless, versatile, single color logo, use negative space.",
  };

  const prompt = dedent`
    A single logo, high-quality, award-winning professional design, made for both digital and print media, only contains a few vector shapes,
    ${styleLookup[data.selectedStyle]}

    Primary color is ${data.selectedPrimaryColor.toLowerCase()} and background color is ${data.selectedBackgroundColor.toLowerCase()}.
    The company name is ${data.companyName}, make sure to include the company name in the logo.
    ${data.additionalInfo ? `Additional info: ${data.additionalInfo}` : ""}
  `;

  try {
    const response = await client.images.create({
      prompt,
      model: "black-forest-labs/FLUX.1.1-pro",
      width: 768,
      height: 768,
      // @ts-expect-error - not typed in SDK
      response_format: "base64",
    });

    return Response.json(response.data[0], { status: 200 });
  } catch (error: unknown) {
    const invalidApiKey = z
      .object({
        error: z.object({
          error: z.object({ code: z.literal("invalid_api_key") }),
        }),
      })
      .safeParse(error);

    if (invalidApiKey.success) {
      return new Response("Your API key is invalid.", { status: 401 });
    }

    const modelBlocked = z
      .object({
        error: z.object({
          error: z.object({ type: z.literal("request_blocked") }),
        }),
      })
      .safeParse(error);

    if (modelBlocked.success) {
      return new Response(
        "Your Together AI account needs paid credits to use this model.",
        { status: 403 },
      );
    }

    console.error("ERROR:", error);

    return new Response("Internal Server Error", { status: 500 });
  }
}

export const runtime = "edge";