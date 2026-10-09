import { NextResponse } from 'next/server';
import { EMBEDDING_DIMENSIONS, generateEmbedding, validateEmbeddingDimensions } from '../../../../lib/embeddings';
import { getSupabaseServerClient } from '../../../../lib/supabase';

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from('documents')
      .select('id, title, content')
      .limit(4);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        ok: true,
        updatedCount: 0,
        message: 'No documents found in the documents table.',
      }, { status: 200 });
    }

    const results: Array<{ id: number; title: string | null; dimensions: number }> = [];

    for (const doc of data) {
      const content = typeof doc.content === 'string' ? doc.content : '';
      const embedding = await generateEmbedding(content);
      const dimensions = validateEmbeddingDimensions(embedding, EMBEDDING_DIMENSIONS);

      const { error: updateError } = await supabase
        .from('documents')
        .update({ embedding })
        .eq('id', doc.id);

      if (updateError) {
        throw updateError;
      }

      results.push({
        id: Number(doc.id),
        title: doc.title ?? null,
        dimensions,
      });
    }

    return NextResponse.json({
      ok: true,
      updatedCount: results.length,
      expectedDimensions: EMBEDDING_DIMENSIONS,
      rows: results,
    }, { status: 200 });
  } catch (err: any) {
    const message = err?.message || 'Unknown error while seeding embeddings.';
    const isExternalServiceFailure = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);

    console.error('seed-documents error:', err);
    return NextResponse.json({
      ok: false,
      unavailable: isExternalServiceFailure,
      error: isExternalServiceFailure
        ? 'Supabase is currently unavailable. Configure a valid NEXT_PUBLIC_SUPABASE_URL and retry.'
        : message,
      details: isExternalServiceFailure ? message : undefined,
    }, { status: isExternalServiceFailure ? 503 : 500 });
  }
}
