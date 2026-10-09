import { NextRequest, NextResponse } from 'next/server';
import { searchSimilarChunks, DEFAULT_TOP_K } from '../../../../lib/vectorStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body?.query;
    const topK = typeof body?.topK === 'number' ? body.topK : DEFAULT_TOP_K;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'Query string is required.' }, { status: 400 });
    }

    const retrievalResult = await searchSimilarChunks(query.trim(), { topK });

    return NextResponse.json({
      ok: true,
      ...retrievalResult,
    });
  } catch (err: any) {
    console.error('Retrieval API error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error executing vector retrieval.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || 'CrashLoopBackOff container';
  const topKParam = searchParams.get('topK');
  const topK = topKParam ? parseInt(topKParam, 10) : DEFAULT_TOP_K;

  try {
    const retrievalResult = await searchSimilarChunks(query, { topK });
    return NextResponse.json({
      ok: true,
      ...retrievalResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error executing vector retrieval.' },
      { status: 500 }
    );
  }
}
