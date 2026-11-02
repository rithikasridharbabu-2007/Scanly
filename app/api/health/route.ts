// does nothing for now, MVP 
import { NextResponse } from 'next/server';

export async function GET() {
  return new Response("Hello from the health API", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}