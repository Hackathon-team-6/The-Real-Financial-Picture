import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

/** Extracts text from an uploaded PDF statement. Transaction parsing happens client-side on the returned text. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "The PDF is empty" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "PDF is larger than 10 MB" }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    const joined = pages.join("\n");
    if (!joined.trim()) {
      return NextResponse.json({ error: "No text found — this looks like a scanned PDF. Please upload a CSV export instead." }, { status: 422 });
    }
    return NextResponse.json({ text: joined, pages: pages.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const locked = /password/i.test(msg);
    return NextResponse.json(
      { error: locked ? "This PDF is password-protected. Please remove the password or upload a CSV." : "Couldn't read this PDF. Please upload a CSV export instead." },
      { status: 422 },
    );
  }
}
