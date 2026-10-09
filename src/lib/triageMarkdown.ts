/**
 * Renders a TriageResult as conversational markdown.
 *
 * The model still returns structured JSON (that is what enforces the grounding
 * rules — Confirmed/Probable labelling, placeholder commands, warnings on
 * state-changing steps). This turns that structure into flowing prose so the
 * reply reads like a chat answer rather than a runbook dashboard.
 */

import { RemediationStep, TriageResult } from '../types';

/** Strips any checklist syntax the model may have emitted despite instructions. */
function deCheckbox(text: string): string {
  return (text || '').replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, '').trim();
}

/** Renders remediation steps as numbered prose with fenced commands. */
export function stepsToMarkdown(steps: Partial<RemediationStep>[]): string {
  return steps.map((s, i) => {
    const n = s.stepNumber || i + 1;
    const block: string[] = [`**${n}. ${deCheckbox(s.title || `Step ${n}`)}**`];

    if (s.action) block.push(deCheckbox(s.action));

    // "N/A - manual action" is the prompt's marker for a step with no command.
    if (s.command && !/^n\/a\b/i.test(s.command.trim())) {
      block.push('```bash\n' + s.command.trim() + '\n```');
    }

    if (s.expectedOutput) {
      block.push(`_Expected:_ ${deCheckbox(s.expectedOutput)}`);
    }

    // "None" marks a safe read-only step — don't render an empty warning.
    if (s.warningNote && !/^none\.?$/i.test(s.warningNote.trim())) {
      block.push(`⚠️ ${deCheckbox(s.warningNote)}`);
    }

    return block.join('\n\n');
  }).join('\n\n');
}

/**
 * Renders a follow-up answer: the direct reply, plus any extra steps the model
 * added. No severity banner or escalation block — this is a continuation of an
 * already-triaged incident, not a new one.
 */
export function followUpToMarkdown(parsed: any): string {
  const out: string[] = [];
  if (parsed.message) out.push(deCheckbox(parsed.message));
  if (parsed.rootCause) out.push(deCheckbox(parsed.rootCause));
  if (Array.isArray(parsed.steps) && parsed.steps.length) {
    out.push(`**Next steps**`);
    out.push(stepsToMarkdown(parsed.steps));
  }
  if (Array.isArray(parsed.clarifyingQuestions) && parsed.clarifyingQuestions.length) {
    out.push(parsed.clarifyingQuestions.map((q: string) => `• ${q}`).join('\n'));
  }
  return out.join('\n\n') || 'No response generated.';
}

export function triageToMarkdown(triage: TriageResult): string {
  const a = triage.matchedArticle;
  const out: string[] = [];

  // Lead with the direct answer, the way a chat reply opens.
  if (triage.agentMessage) {
    out.push(deCheckbox(triage.agentMessage));
  } else if (a.summary) {
    out.push(deCheckbox(a.summary));
  }

  // Severity as an inline sentence rather than a badge grid.
  const sevWord = triage.severity.replace(/^P\d\s*-\s*/, '').toLowerCase();
  const sevLine = `**Severity: ${triage.severity}**` +
    (triage.severityReason ? ` — ${deCheckbox(triage.severityReason)}` : ` (${sevWord}).`);
  out.push(sevLine);

  if (a.rootCause) {
    out.push(`**What's going on**\n\n${deCheckbox(a.rootCause)}`);
  }

  if (a.steps?.length) {
    out.push(`**How to work through it**`);
    out.push(stepsToMarkdown(a.steps));
  }

  // Trailing context, as prose lines rather than a metadata grid.
  const tail: string[] = [];
  if (a.escalationPath) tail.push(`**Escalation:** ${a.escalationPath}`);
  if (a.estimatedResolutionMinutes) {
    tail.push(`**Estimated time to resolve:** ~${a.estimatedResolutionMinutes} minutes`);
  }
  if (a.affectedServices?.length) {
    tail.push(`**Affected services:** ${a.affectedServices.join(', ')}`);
  }
  if (typeof triage.confidenceScore === 'number') {
    tail.push(
      `**Confidence:** ${triage.confidenceScore}%` +
      (triage.confidenceBasis ? ` — ${triage.confidenceBasis}` : '')
    );
  }
  if (triage.kbMatched === false) {
    tail.push(`_No knowledge base article matched these symptoms, so the above is reasoned from your input alone._`);
  }
  // Blank-line separated so each lands as its own paragraph rather than
  // collapsing into one run-on line.
  if (tail.length) out.push(tail.join('\n\n'));

  return out.join('\n\n');
}
