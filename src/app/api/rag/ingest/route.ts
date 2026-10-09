import { NextRequest, NextResponse } from 'next/server';
import { runIngestionPipeline } from '../../../../lib/vectorStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await runIngestionPipeline({
      bucketName: body.bucketName || 'Knowledge Documents',
      fileName: body.fileName || 'L1_SRE_500000_Word_Runbook.docx',
      maxScenariosPerSection: body.maxScenariosPerSection,
      batchSize: body.batchSize || 10,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: any) {
    console.error('Ingestion API error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error executing ingestion pipeline.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await runIngestionPipeline({
      bucketName: 'Knowledge Documents',
      fileName: 'L1_SRE_500000_Word_Runbook.docx',
      batchSize: 10,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Error' }, { status: 500 });
  }
}
