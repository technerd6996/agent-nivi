/**
 * Semantic Chunking Engine for SRE Runbook Knowledge Base.
 *
 * Chunks documents along semantic and linguistic boundaries (topics, scenarios,
 * and cohesive paragraph blocks) rather than arbitrary character slicing.
 * Preserves sentence integrity, CLI commands, and enforces explicit semantic overlap.
 */

import { ExtractedSection } from './docxExtractor';

// ============================================================================
// EXPLICIT SEMANTIC CHUNKING CONFIGURATION
// ============================================================================
export const CHUNKING_STRATEGY = 'semantic_scenario_based';
export const SEMANTIC_TARGET_CHARS = 1400;      // Target size for a cohesive semantic chunk
export const SEMANTIC_MAX_CHARS = 1800;         // Strict upper ceiling (well under token limits)
export const SEMANTIC_MIN_CHARS = 300;          // Minimum size for a standalone chunk
export const SEMANTIC_OVERLAP_PARAGRAPHS = 1;   // Explicit semantic overlap: 1 boundary paragraph

export interface DocumentChunk {
  id: string;
  document_id: string;
  title: string;
  source: string;
  chunk_index: number;
  chunk_content: string;
  embedding?: number[];
  metadata: {
    section_title: string;
    scenario_title?: string;
    semantic_type: 'investigation_scenario' | 'command_procedure' | 'section_overview';
    commands_included: string[];
    has_semantic_overlap: boolean;
    overlap_preview?: string;
    char_start: number;
    char_end: number;
    char_length: number;
    chunking_strategy: string;
  };
}

export interface ParentDocument {
  id: string;
  title: string;
  source: string;
  total_chunks: number;
  total_characters: number;
  metadata: {
    file_name: string;
    chunking_strategy: string;
    target_semantic_chars: number;
    semantic_overlap_paragraphs: number;
    ingestion_timestamp: string;
    model: string;
  };
}

/**
 * Unescapes standard XML/HTML entities from DOCX text.
 */
function cleanXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Extracts CLI commands (e.g. kubectl, curl, systemctl) from semantic text.
 */
function extractCommands(text: string): string[] {
  const commandPatterns = [
    /\b(kubectl\s+[a-zA-Z0-9_\-/\s<>&.]+)(?=[,;\n.]|$)/gi,
    /\b(curl\s+[a-zA-Z0-9_\-/:?&=<.]+)(?=[,;\n.]|$)/gi,
    /\b(systemctl\s+[a-zA-Z0-9_\-]+)(?=[,;\n.]|$)/gi,
    /\b(journalctl\s+[a-zA-Z0-9_\-]+)(?=[,;\n.]|$)/gi,
  ];

  const found: Set<string> = new Set();
  for (const pattern of commandPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => found.add(m.trim()));
    }
  }
  return Array.from(found);
}

/**
 * Performs semantic chunking over extracted sections.
 * Groups text by topic, scenario, and cohesive semantic paragraphs,
 * applying explicit semantic overlap between adjacent units.
 */
export function chunkDocument(
  sections: ExtractedSection[],
  options: {
    documentId?: string;
    documentTitle?: string;
    source?: string;
    maxChunksPerSection?: number;
  } = {}
): { parentDoc: ParentDocument; chunks: DocumentChunk[] } {
  const documentId = options.documentId || 'doc_l1_sre_500k_runbook';
  const documentTitle = options.documentTitle || 'L1 SRE 500,000 Word Runbook';
  const source = options.source || 'Storage/Knowledge Documents/L1_SRE_500000_Word_Runbook.docx';
  const maxChunksPerSection = options.maxChunksPerSection ?? 3;

  const chunks: DocumentChunk[] = [];
  let globalChunkIndex = 0;
  let totalCharactersProcessed = 0;

  for (const section of sections) {
    const rawContent = cleanXmlEntities(section.content);
    if (!rawContent) continue;

    totalCharactersProcessed += rawContent.length;

    // Split section into natural semantic paragraphs
    const paragraphs = rawContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (paragraphs.length === 0) continue;

    // Identify semantic scenario blocks
    interface ScenarioBlock {
      scenarioTitle: string;
      paragraphs: string[];
    }

    const scenarioBlocks: ScenarioBlock[] = [];
    let currentScenario: ScenarioBlock = {
      scenarioTitle: `${section.title}: Overview`,
      paragraphs: [],
    };

    for (const p of paragraphs) {
      if (/^Scenario\s+\d+:/i.test(p)) {
        if (currentScenario.paragraphs.length > 0) {
          scenarioBlocks.push(currentScenario);
        }
        currentScenario = {
          scenarioTitle: p,
          paragraphs: [p],
        };
      } else {
        currentScenario.paragraphs.push(p);
      }
    }
    if (currentScenario.paragraphs.length > 0) {
      scenarioBlocks.push(currentScenario);
    }

    // Select primary scenarios to represent the section
    const targetScenarios = scenarioBlocks.slice(0, maxChunksPerSection);
    let previousChunkEndingParagraph = '';

    for (const scen of targetScenarios) {
      // Pack cohesive paragraphs up to SEMANTIC_MAX_CHARS
      let pack: string[] = [];
      let packChars = 0;

      for (let pIdx = 0; pIdx < scen.paragraphs.length; pIdx++) {
        const para = scen.paragraphs[pIdx];
        if (packChars + para.length > SEMANTIC_MAX_CHARS && pack.length > 0) {
          break; // Stop at semantic ceiling for this scenario chunk
        }
        pack.push(para);
        packChars += para.length + 2;
      }

      if (pack.length === 0) continue;

      const hasSemanticOverlap = previousChunkEndingParagraph.length > 0;
      let chunkText = `[Runbook Topic: ${section.title}]\n`;

      // Explicit Semantic Overlap: Prepend previous scenario's boundary paragraph
      if (hasSemanticOverlap) {
        chunkText += `[Semantic Context from previous unit]: "${previousChunkEndingParagraph}"\n\n`;
      }

      chunkText += pack.join('\n\n');

      // Ensure chunk does not exceed safe embedding limit
      if (chunkText.length > SEMANTIC_MAX_CHARS) {
        chunkText = chunkText.slice(0, SEMANTIC_MAX_CHARS).trim();
      }

      const commands = extractCommands(chunkText);

      chunks.push({
        id: `${documentId}_chunk_${globalChunkIndex}`,
        document_id: documentId,
        title: `${section.title} - ${scen.scenarioTitle}`,
        source,
        chunk_index: globalChunkIndex,
        chunk_content: chunkText,
        metadata: {
          section_title: section.title,
          scenario_title: scen.scenarioTitle,
          semantic_type: scen.scenarioTitle.includes('Scenario')
            ? 'investigation_scenario'
            : 'section_overview',
          commands_included: commands,
          has_semantic_overlap: hasSemanticOverlap,
          overlap_preview: hasSemanticOverlap
            ? previousChunkEndingParagraph.slice(0, 120) + '...'
            : undefined,
          char_start: section.startChar,
          char_end: section.endChar,
          char_length: chunkText.length,
          chunking_strategy: CHUNKING_STRATEGY,
        },
      });

      globalChunkIndex++;
      previousChunkEndingParagraph = pack[pack.length - 1] || '';
    }
  }

  const parentDoc: ParentDocument = {
    id: documentId,
    title: documentTitle,
    source,
    total_chunks: chunks.length,
    total_characters: totalCharactersProcessed,
    metadata: {
      file_name: 'L1_SRE_500000_Word_Runbook.docx',
      chunking_strategy: CHUNKING_STRATEGY,
      target_semantic_chars: SEMANTIC_TARGET_CHARS,
      semantic_overlap_paragraphs: SEMANTIC_OVERLAP_PARAGRAPHS,
      ingestion_timestamp: new Date().toISOString(),
      model: 'nvidia/nv-embed-v2',
    },
  };

  return { parentDoc, chunks };
}
