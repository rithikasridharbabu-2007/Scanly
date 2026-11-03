// does nothing for now, MVP 

export async function GET() {
  return new Response("Hello from the health API", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
