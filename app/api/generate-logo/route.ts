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

    // Helicone (optional)
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

    // Together client
    const client = new Together({
      ...options,
      apiKey: data.userAPIKey || process.env.TOGETHER_API_KEY,
    });

    if (data.userAPIKey) {
      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining: "BYOK",
        },
      });
    }

    if (ratelimit) {
      const identifier = user.id;
      const { success, remaining } = await ratelimit.limit(identifier);

      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining,
        },
      });

      if (!success) {
        return new Response(
          "You've used up all your credits. Enter your own Together API Key to generate more logos.",
          { status: 429 }
        );
      }
    }

    const styles: Record<string, string> = {
      Flashy:
        "Flashy, bold, futuristic, vibrant neon colors with metallic accents.",
      Tech:
        "clean, sleek, minimalist, sharp focus, photorealistic.",
      Modern:
        "modern, geometric shapes, clean lines, flat design.",
      Playful:
        "playful, bright colors, rounded shapes, lively.",
      Abstract:
        "abstract, creative, unique patterns and textures.",
      Minimal:
        "minimal, simple, single color, negative space.",
    };

    const prompt = dedent`
      A professional logo design.
      ${styles[data.selectedStyle]}

      Primary color: ${data.selectedPrimaryColor.toLowerCase()}
      Background color: ${data.selectedBackgroundColor.toLowerCase()}
      Company name: ${data.companyName}

      ${data.additionalInfo ? `Additional info: ${data.additionalInfo}` : ""}
    `;

    const response = await client.images.create({
      prompt,
      model: "black-forest-labs/FLUX.1.1-pro",
      width: 768,
      height: 768,
      // @ts-expect-error - not yet typed in Together SDK
      response_format: "base64",
    });

    return Response.json(response.data[0], { status: 200 });

  } catch (error: unknown) {
    console.error("API ERROR:", error);

    // Safe type narrowing
    if (
      typeof error === "object" &&
      error !== null &&
      "error" in error
    ) {
      const err = error as {
        error?: {
          error?: {
            code?: string;
            type?: string;
          };
        };
      };

      if (err.error?.error?.code === "invalid_api_key") {
        return new Response("Your API key is invalid.", { status: 401 });
      }

      if (err.error?.error?.type === "request_blocked") {
        return new Response(
          "Your Together AI account needs billing enabled ($50 credit pack).",
          { status: 403 }
        );
      }
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}