import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";

let ratelimit: Ratelimit | undefined;

export async function POST(req: Request) {
  try {
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

    // Together config
    const options: ConstructorParameters<typeof Together>[0] = {};

    if (process.env.HELICONE_API_KEY) {
      options.baseURL = "https://together.helicone.ai/v1";
      options.defaultHeaders = {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
        "Helicone-Property-LOGOBYOK": data.userAPIKey ? "true" : "false",
      };
    }

    // Rate limiting
    if (process.env.UPSTASH_REDIS_REST_URL && !data.userAPIKey) {
      ratelimit = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.fixedWindow(3, "60 d"),
        analytics: true,
        prefix: "logocreator",
      });
    }

    const client = new Together(options);

    // BYOK support
    if (data.userAPIKey) {
      client.apiKey = data.userAPIKey;

      await (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: { remaining: "BYOK" },
      });
    }

    // Apply rate limit
    if (ratelimit) {
      const { success, remaining } = await ratelimit.limit(user.id);

      await (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: { remaining },
      });

      if (!success) {
        return new Response(
          "You've used all your credits. Add your API key.",
          {
            status: 429,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }
    }

    // Styles
    const styleLookup: Record<string, string> = {
      Flashy:
        "Flashy, bold, futuristic, vibrant neon colors, metallic glossy accents",
      Tech:
        "Minimalist, clean, sleek, neutral palette, sharp focus, cinematic",
      Modern:
        "Modern, geometric, clean lines, natural colors, strategic negative space",
      Playful:
        "Playful, bright bold colors, rounded shapes, lively",
      Abstract:
        "Abstract, artistic, unique shapes, patterns, textures",
      Minimal:
        "Minimal, simple, timeless, single color, negative space",
    };

    const prompt = dedent`A professional high-quality logo, clean vector style, minimal shapes.
Style: ${styleLookup[data.selectedStyle]}
Primary color: ${data.selectedPrimaryColor.toLowerCase()}
Background color: ${data.selectedBackgroundColor.toLowerCase()}
Company: ${data.companyName}
${data.additionalInfo ? `Additional: ${data.additionalInfo}` : ""}`;

    // Generate image
    const response = await client.images.create({
      prompt,
      model: "black-forest-labs/FLUX.1-schnell", // safer model
      width: 768,
      height: 768,
      // @ts-expect-error not in official types yet
      response_format: "base64",
    });

    return Response.json(response.data[0], { status: 200 });
  } catch (error: unknown) {
    console.error("ERROR:", error);

    let message = "Unknown error";

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "object") {
      message = JSON.stringify(error);
    }

    return new Response("ERROR: " + message, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// ✅ IMPORTANT (fixes Vercel issues)
export const runtime = "nodejs";