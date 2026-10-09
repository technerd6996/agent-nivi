/**
 * DOCX Extraction Pipeline for SRE Runbook Knowledge Base.
 *
 * Downloads the SRE runbook from Supabase Storage (with fallback to local storage
 * if Supabase is offline/paused) and extracts real text sections from word/document.xml.
 */

import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { getSupabaseServerClient } from './supabase';

export interface ExtractedSection {
  title: string;
  content: string;
  startChar: number;
  endChar: number;
}

export interface DocxExtractionResult {
  title: string;
  source: string;
  fullText: string;
  sections: ExtractedSection[];
  stats: {
    totalParagraphs: number;
    totalCharacters: number;
    totalSections: number;
    fileSizeBytes: number;
  };
}

const LOCAL_DOCX_PATHS = [
  path.resolve(process.cwd(), 'src/data/docs/L1_SRE_500000_Word_Runbook.docx'),
  path.resolve(process.env.USERPROFILE || 'C:\\Users\\ELCOT', 'Downloads\\L1_SRE_500000_Word_Runbook.docx'),
];

/**
 * Downloads the DOCX file from Supabase Storage bucket, falling back to
 * local copy if Supabase is unavailable or paused.
 */
export async function fetchDocxBuffer(
  bucketName: string = 'Knowledge Documents',
  fileName: string = 'L1_SRE_500000_Word_Runbook.docx'
): Promise<{ buffer: Buffer; source: string }> {
  // 1. Try Supabase Storage first
  try {
    const supabase = getSupabaseServerClient();
    console.log(`[Storage] Attempting download from Supabase Storage bucket: "${bucketName}", file: "${fileName}"...`);
    
    // Check both standard casing and kebab-cased bucket names
    const bucketCandidates = [bucketName, bucketName.toLowerCase().replace(/\s+/g, '-'), 'knowledge-documents'];
    for (const b of bucketCandidates) {
      const { data, error } = await supabase.storage.from(b).download(fileName);
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        console.log(`[Storage] Successfully downloaded ${buffer.length} bytes from Supabase Storage bucket "${b}".`);
        return {
          buffer,
          source: `supabase://storage/${b}/${fileName}`,
        };
      }
    }
  } catch (err: any) {
    console.warn(`[Storage] Supabase Storage download notice: ${err?.message || err}. Falling back to local file copy.`);
  }

  // 2. Fall back to local verified copy
  for (const localPath of LOCAL_DOCX_PATHS) {
    if (fs.existsSync(localPath)) {
      console.log(`[Storage] Loaded verified DOCX from local filesystem: ${localPath}`);
      const buffer = fs.readFileSync(localPath);
      return {
        buffer,
        source: `local://${localPath.replace(/\\/g, '/')}`,
      };
    }
  }

  throw new Error(`Could not find DOCX file "${fileName}" in Supabase Storage bucket "${bucketName}" or local filesystem.`);
}

/**
 * Extracts structured text and sections from a DOCX buffer using AdmZip.
 */
export function extractDocxText(buffer: Buffer, sourceName: string): DocxExtractionResult {
  const zip = new AdmZip(buffer);
  const docXml = zip.readAsText('word/document.xml');

  if (!docXml) {
    throw new Error('Invalid DOCX file: word/document.xml not found inside archive.');
  }

  const pBlocks = docXml.split('</w:p>');
  const sections: ExtractedSection[] = [];
  const fullParagraphs: string[] = [];

  let currentSectionTitle = 'Overview and Introduction';
  let currentSectionParagraphs: string[] = [];
  let charCounter = 0;
  let sectionStartChar = 0;

  for (const p of pBlocks) {
    const isHeading = p.includes('Heading') || p.includes('Title');
    const textRuns: string[] = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(p)) !== null) {
      textRuns.push(match[1]);
    }

    const text = textRuns.join('').trim();
    if (!text) continue;

    if (isHeading) {
      if (currentSectionParagraphs.length > 0) {
        const content = currentSectionParagraphs.join('\n\n');
        sections.push({
          title: currentSectionTitle,
          content,
          startChar: sectionStartChar,
          endChar: charCounter,
        });
        currentSectionParagraphs = [];
      }
      currentSectionTitle = text;
      sectionStartChar = charCounter;
    } else {
      currentSectionParagraphs.push(text);
      fullParagraphs.push(text);
      charCounter += text.length + 2;
    }
  }

  if (currentSectionParagraphs.length > 0) {
    sections.push({
      title: currentSectionTitle,
      content: currentSectionParagraphs.join('\n\n'),
      startChar: sectionStartChar,
      endChar: charCounter,
    });
  }

  const fullText = fullParagraphs.join('\n\n');

  return {
    title: 'L1 SRE Comprehensive Runbook and Triage Knowledge Base',
    source: sourceName,
    fullText,
    sections,
    stats: {
      totalParagraphs: fullParagraphs.length,
      totalCharacters: fullText.length,
      totalSections: sections.length,
      fileSizeBytes: buffer.length,
    },
  };
}
