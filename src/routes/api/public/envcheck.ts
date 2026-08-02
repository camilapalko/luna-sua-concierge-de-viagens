import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/envcheck")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          hasAiKey: Boolean(process.env["LOVABLE_API_KEY"]),
          hasSupabaseUrl: Boolean(process.env["SUPABASE_URL"]),
        }),
    },
  },
});
