export function GET() {
  return Response.json(
    {
      status: "ok",
      app: "Hanira AI",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      mode:
        process.env.HANIRA_DEMO_MODE === "true" ? "demo" : "production",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
