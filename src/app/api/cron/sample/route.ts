import { NextResponse } from "next/server";
import { runSample } from "@/lib/hn/sampler";

export async function GET() {
  try {
    const result = await runSample();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
