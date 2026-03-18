/**
 * lib/civilRecordGeneralRenderer.ts
 * -----------------------------------------------------------------------------
 * Deterministic premium renderer for general civil records with parity-aware
 * one-page compaction.
 *
 * Goals:
 * - Preserve full content integrity (no unique content loss)
 * - Avoid duplicate cross-field rendering bloat
 * - Keep premium structure and readability
 * - Support exact source-page parity enforcement downstream
 * -----------------------------------------------------------------------------
 */

import type {
  CivilRecordGeneral,
  CivilRecordKeyValue,
  CivilRecordPersonEntry,
  VisualElement,
} from '@/types/civilRecordGeneral';

export interface CivilRecordGeneralRenderOptions {
  pageCount?: number;
  orientation?: 'portrait' | 'landscape' | 'unknown';
}

export interface CivilRecordRenderDensity {
  metadataRows: number;
  eventPersonRows: number;
  partiesRows: number;
  relatedPartiesRows: number;
  annotationRows: number;
  documentaryRows: number;
  visualRows: number;
  eventSummaryChars: number;
  judgmentOperativeChars: number;
  certificationTextChars: number;
  footerNotesChars: number;
  annotationChars: number;
  documentaryChars: number;
  totalRows: number;
  totalNarrativeChars: number;
}

export interface CivilRecordRenderPreparation {
  data: CivilRecordGeneral;
  compactOnePage: boolean;
  densityBefore: CivilRecordRenderDensity;
  densityAfter: CivilRecordRenderDensity;
  duplicateEntryRowsRemoved: number;
  duplicateNarrativeBlocksRemoved: number;
  compactionRecommended: boolean;
}

export interface CivilRecordPreparationOptions {
  targetPageCount?: number;
}

function escapeHtml(value: string | undefined | null): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeWhitespace(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function nonEmpty(value: string | undefined | null): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalize(value: string | undefined | null): string {
  const v = nonEmpty(value);
  return v ? escapeHtml(v) : '&mdash;';
}

function countChars(lines: string[]): number {
  return lines.reduce((total, line) => total + normalizeWhitespace(line).length, 0);
}

function dedupeNormalizedStrings(values: string[]): { values: string[]; removed: number } {
  const out: string[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const raw of values) {
    const normalized = normalizeWhitespace(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }

  return { values: out, removed };
}

function dedupeKeyValueRows(rows: CivilRecordKeyValue[] | undefined): {
  rows: CivilRecordKeyValue[];
  removed: number;
} {
  const out: CivilRecordKeyValue[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const row of rows ?? []) {
    const label = normalizeWhitespace(row?.label);
    const value = normalizeWhitespace(row?.value);
    if (!label || !value) continue;

    const key = `${label.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(key)) {
      removed += 1;
      continue;
    }

    seen.add(key);
    out.push({ label, value });
  }

  return { rows: out, removed };
}

function dedupePeopleRows(rows: CivilRecordPersonEntry[] | undefined): {
  rows: CivilRecordPersonEntry[];
  removed: number;
} {
  const out: CivilRecordPersonEntry[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const person of rows ?? []) {
    const normalized: CivilRecordPersonEntry = {
      role: normalizeWhitespace(person?.role),
      full_name: normalizeWhitespace(person?.full_name),
      id_reference: normalizeWhitespace(person?.id_reference),
      date_of_birth: normalizeWhitespace(person?.date_of_birth),
      nationality: normalizeWhitespace(person?.nationality),
      notes: normalizeWhitespace(person?.notes),
    };

    const hasAnyValue =
      normalized.role ||
      normalized.full_name ||
      normalized.id_reference ||
      normalized.date_of_birth ||
      normalized.nationality ||
      normalized.notes;

    if (!hasAnyValue) continue;

    const key = [
      normalized.role,
      normalized.full_name,
      normalized.id_reference,
      normalized.date_of_birth,
      normalized.nationality,
      normalized.notes,
    ].join('||').toLowerCase();

    if (seen.has(key)) {
      removed += 1;
      continue;
    }

    seen.add(key);
    out.push(normalized);
  }

  return { rows: out, removed };
}

function dedupeVisualElements(elements: VisualElement[] | undefined): {
  rows: VisualElement[];
  removed: number;
} {
  const out: VisualElement[] = [];
  const seen = new Set<string>();
  let removed = 0;

  for (const element of elements ?? []) {
    const normalized: VisualElement = {
      type: normalizeWhitespace(element?.type) || 'other_official_mark',
      description: normalizeWhitespace(element?.description),
      text: normalizeWhitespace(element?.text),
      page: normalizeWhitespace(element?.page),
    };

    const hasAnyValue =
      normalized.type || normalized.description || normalized.text || normalized.page;

    if (!hasAnyValue) continue;

    const key = [
      normalized.type,
      normalized.description,
      normalized.text,
      normalized.page,
    ].join('||').toLowerCase();

    if (seen.has(key)) {
      removed += 1;
      continue;
    }

    seen.add(key);
    out.push(normalized);
  }

  return { rows: out, removed };
}

function buildDensitySnapshot(data: CivilRecordGeneral): CivilRecordRenderDensity {
  const metadataRows = (data.document_metadata ?? []).filter(
    (row) => nonEmpty(row.label) && nonEmpty(row.value),
  ).length;
  const eventPersonRows = (data.event_person_data ?? []).filter(
    (row) => nonEmpty(row.label) && nonEmpty(row.value),
  ).length;
  const partiesRows = (data.parties ?? []).filter(
    (row) =>
      nonEmpty(row.role) ||
      nonEmpty(row.full_name) ||
      nonEmpty(row.id_reference) ||
      nonEmpty(row.date_of_birth) ||
      nonEmpty(row.nationality) ||
      nonEmpty(row.notes),
  ).length;
  const relatedPartiesRows = (data.parent_spouse_witness_data ?? []).filter(
    (row) =>
      nonEmpty(row.role) ||
      nonEmpty(row.full_name) ||
      nonEmpty(row.id_reference) ||
      nonEmpty(row.date_of_birth) ||
      nonEmpty(row.nationality) ||
      nonEmpty(row.notes),
  ).length;

  const annotations = (data.annotations_marginal_notes ?? []).map((line) => normalizeWhitespace(line)).filter(Boolean);
  const documentaryNotes = (data.documentary_notes ?? []).map((line) => normalizeWhitespace(line)).filter(Boolean);

  const eventSummaryChars = normalizeWhitespace(data.event_summary).length;
  const judgmentOperativeChars = normalizeWhitespace(data.judgment_or_order?.operative_text).length;
  const certificationTextChars = normalizeWhitespace(data.certification_footer?.certification_text).length;
  const footerNotesChars = normalizeWhitespace(data.certification_footer?.footer_notes).length;
  const annotationChars = countChars(annotations);
  const documentaryChars = countChars(documentaryNotes);

  const visualRows = (data.visual_elements ?? []).filter(
    (el) =>
      nonEmpty(el.type) ||
      nonEmpty(el.description) ||
      nonEmpty(el.text) ||
      nonEmpty(el.page),
  ).length;

  const totalRows =
    metadataRows +
    eventPersonRows +
    partiesRows +
    relatedPartiesRows +
    annotations.length +
    documentaryNotes.length +
    visualRows;

  const totalNarrativeChars =
    eventSummaryChars +
    judgmentOperativeChars +
    certificationTextChars +
    footerNotesChars +
    annotationChars +
    documentaryChars;

  return {
    metadataRows,
    eventPersonRows,
    partiesRows,
    relatedPartiesRows,
    annotationRows: annotations.length,
    documentaryRows: documentaryNotes.length,
    visualRows,
    eventSummaryChars,
    judgmentOperativeChars,
    certificationTextChars,
    footerNotesChars,
    annotationChars,
    documentaryChars,
    totalRows,
    totalNarrativeChars,
  };
}

export function prepareCivilRecordGeneralForRender(
  data: CivilRecordGeneral,
  options: CivilRecordPreparationOptions = {},
): CivilRecordRenderPreparation {
  const compactOnePage = typeof options.targetPageCount === 'number' && options.targetPageCount === 1;
  const densityBefore = buildDensitySnapshot(data);

  let duplicateEntryRowsRemoved = 0;
  let duplicateNarrativeBlocksRemoved = 0;

  const dedupedMetadata = dedupeKeyValueRows(data.document_metadata);
  const dedupedEventData = dedupeKeyValueRows(data.event_person_data);
  const dedupedParties = dedupePeopleRows(data.parties);
  const dedupedRelatedParties = dedupePeopleRows(data.parent_spouse_witness_data);
  const dedupedVisualElements = dedupeVisualElements(data.visual_elements);
  const dedupedAnnotations = dedupeNormalizedStrings(data.annotations_marginal_notes ?? []);
  const dedupedDocumentaryNotes = dedupeNormalizedStrings(data.documentary_notes ?? []);

  duplicateEntryRowsRemoved +=
    dedupedMetadata.removed +
    dedupedEventData.removed +
    dedupedParties.removed +
    dedupedRelatedParties.removed +
    dedupedVisualElements.removed +
    dedupedAnnotations.removed +
    dedupedDocumentaryNotes.removed;

  const seenNarrativeBlocks = new Set<string>();
  const keepUniqueNarrative = (value: string | undefined | null): string => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return '';
    const key = normalized.toLowerCase();
    if (seenNarrativeBlocks.has(key)) {
      duplicateNarrativeBlocksRemoved += 1;
      return '';
    }
    seenNarrativeBlocks.add(key);
    return normalized;
  };

  const judgmentBlock = data.judgment_or_order
    ? {
        court_name: normalizeWhitespace(data.judgment_or_order.court_name),
        judge_name: normalizeWhitespace(data.judgment_or_order.judge_name),
        case_number: normalizeWhitespace(data.judgment_or_order.case_number),
        decision_date: normalizeWhitespace(data.judgment_or_order.decision_date),
        effective_date: normalizeWhitespace(data.judgment_or_order.effective_date),
        operative_text: keepUniqueNarrative(data.judgment_or_order.operative_text),
      }
    : null;

  const hasJudgmentBlockValue = judgmentBlock
    ? Boolean(
        judgmentBlock.court_name ||
          judgmentBlock.judge_name ||
          judgmentBlock.case_number ||
          judgmentBlock.decision_date ||
          judgmentBlock.effective_date ||
          judgmentBlock.operative_text,
      )
    : false;

  const normalized: CivilRecordGeneral = {
    document_type: 'civil_record_general',
    document_subtype: data.document_subtype,
    document_style: data.document_style,

    document_title: normalizeWhitespace(data.document_title),
    issuing_authority: normalizeWhitespace(data.issuing_authority),
    registry_office: normalizeWhitespace(data.registry_office),
    jurisdiction: normalizeWhitespace(data.jurisdiction),

    registration_number: normalizeWhitespace(data.registration_number),
    protocol_number: normalizeWhitespace(data.protocol_number),
    book_reference: normalizeWhitespace(data.book_reference),
    page_reference: normalizeWhitespace(data.page_reference),
    term_reference: normalizeWhitespace(data.term_reference),

    event_type: normalizeWhitespace(data.event_type),
    event_date: normalizeWhitespace(data.event_date),
    event_location: normalizeWhitespace(data.event_location),
    event_summary: keepUniqueNarrative(data.event_summary),

    document_metadata: dedupedMetadata.rows,
    event_person_data: dedupedEventData.rows,
    parties: dedupedParties.rows,
    parent_spouse_witness_data: dedupedRelatedParties.rows,

    annotations_marginal_notes: dedupedAnnotations.values
      .map((line) => keepUniqueNarrative(line))
      .filter(Boolean),
    documentary_notes: dedupedDocumentaryNotes.values
      .map((line) => keepUniqueNarrative(line))
      .filter(Boolean),

    judgment_or_order: hasJudgmentBlockValue ? judgmentBlock : null,
    certification_footer: {
      certification_text: keepUniqueNarrative(data.certification_footer?.certification_text),
      issuer_name: normalizeWhitespace(data.certification_footer?.issuer_name),
      issuer_role: normalizeWhitespace(data.certification_footer?.issuer_role),
      issue_date: normalizeWhitespace(data.certification_footer?.issue_date),
      issue_location: normalizeWhitespace(data.certification_footer?.issue_location),
      seal_reference: normalizeWhitespace(data.certification_footer?.seal_reference),
      signature_line: normalizeWhitespace(data.certification_footer?.signature_line),
      validation_code: normalizeWhitespace(data.certification_footer?.validation_code),
      validation_url: normalizeWhitespace(data.certification_footer?.validation_url),
      footer_notes: keepUniqueNarrative(data.certification_footer?.footer_notes),
    },

    visual_elements: dedupedVisualElements.rows,

    orientation: data.orientation,
    page_count: data.page_count,
  };

  const densityAfter = buildDensitySnapshot(normalized);

  const compactionRecommended =
    compactOnePage ||
    densityAfter.totalRows >= 20 ||
    densityAfter.totalNarrativeChars >= 1600;

  return {
    data: normalized,
    compactOnePage,
    densityBefore,
    densityAfter,
    duplicateEntryRowsRemoved,
    duplicateNarrativeBlocksRemoved,
    compactionRecommended,
  };
}

function inferStyle(
  data: CivilRecordGeneral,
): 'certificate_style' | 'registry_extract_style' | 'judgment_order_style' {
  if (data.document_style === 'certificate_style') return 'certificate_style';
  if (data.document_style === 'registry_extract_style') return 'registry_extract_style';
  if (data.document_style === 'judgment_order_style') return 'judgment_order_style';

  if (data.document_subtype === 'civil_registry_extract') return 'registry_extract_style';
  if (data.document_subtype === 'divorce_judgment_or_decree') return 'judgment_order_style';
  return 'certificate_style';
}

function renderHeader(
  data: CivilRecordGeneral,
  style: 'certificate_style' | 'registry_extract_style' | 'judgment_order_style',
): string {
  const authority = nonEmpty(data.issuing_authority);
  const registryOffice = nonEmpty(data.registry_office);
  const jurisdiction = nonEmpty(data.jurisdiction);
  const title = nonEmpty(data.document_title) ?? 'CIVIL RECORD';
  const subtype = nonEmpty(data.document_subtype)?.replace(/_/g, ' ');
  const eventType = nonEmpty(data.event_type);

  return `
<header class="doc-header ${style}">
  ${authority ? `<div class="authority">${escapeHtml(authority)}</div>` : ''}
  ${registryOffice ? `<div class="registry">${escapeHtml(registryOffice)}</div>` : ''}
  ${jurisdiction ? `<div class="jurisdiction">${escapeHtml(jurisdiction)}</div>` : ''}
  <div class="title-row">
    <div class="title">${escapeHtml(title)}</div>
    ${subtype ? `<div class="subtype">${escapeHtml(subtype.toUpperCase())}</div>` : ''}
  </div>
  ${eventType ? `<div class="event-type"><strong>Event:</strong> ${escapeHtml(eventType)}</div>` : ''}
  <div class="rule"></div>
</header>`;
}

function toValidEntries(rows: Array<[string, string | undefined | null]>): Array<[string, string]> {
  return rows
    .map(([label, value]) => [normalizeWhitespace(label), normalizeWhitespace(value)] as [string, string])
    .filter(([label, value]) => Boolean(label) && Boolean(value));
}

function renderKvSection(
  title: string,
  rows: Array<[string, string | undefined | null]>,
  cssClass: string,
  compactOnePage: boolean,
): string {
  const entries = toValidEntries(rows);
  if (entries.length === 0) return '';

  const content = compactOnePage
    ? `<div class="compact-kv-grid">${entries
        .map(
          ([label, value]) =>
            `<div class="compact-kv-item"><span class="kv-label">${escapeHtml(label)}</span><span class="kv-value">${escapeHtml(value)}</span></div>`,
        )
        .join('')}</div>`
    : `<table class="kv-table"><tbody>${entries
        .map(
          ([label, value]) =>
            `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</tbody></table>`;

  return `
<section class="section ${cssClass}${compactOnePage ? ' compact-section' : ''}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  ${content}
</section>`;
}

function renderMetadataSection(data: CivilRecordGeneral, compactOnePage: boolean): string {
  const baseRows: Array<[string, string | undefined | null]> = [
    ['Registration Number', data.registration_number],
    ['Protocol Number', data.protocol_number],
    ['Book Reference', data.book_reference],
    ['Page Reference', data.page_reference],
    ['Term Reference', data.term_reference],
    ['Event Date', data.event_date],
    ['Event Location', data.event_location],
  ];

  const extraRows = (data.document_metadata ?? []).map((item: CivilRecordKeyValue) => [
    item.label,
    item.value,
  ] as [string, string]);

  return renderKvSection(
    'Registry and Event Metadata',
    [...baseRows, ...extraRows],
    'metadata-section',
    compactOnePage,
  );
}

function renderEventSummary(data: CivilRecordGeneral, compactOnePage: boolean): string {
  const eventSummary = nonEmpty(data.event_summary);
  if (!eventSummary) return '';

  return `
<section class="section summary-section${compactOnePage ? ' compact-section' : ''}">
  <h2 class="section-title">Event Summary</h2>
  <div class="summary-box">${escapeHtml(eventSummary)}</div>
</section>`;
}

function renderEventPersonData(data: CivilRecordGeneral, compactOnePage: boolean): string {
  const rows = (data.event_person_data ?? [])
    .map((entry) => [entry.label, entry.value] as [string, string]);

  return renderKvSection('Event and Person Data', rows, 'event-person-section', compactOnePage);
}

function renderPeopleTable(
  title: string,
  people: CivilRecordPersonEntry[] | undefined,
  cssClass: string,
  compactOnePage: boolean,
): string {
  const rows = (people ?? []).filter((person) =>
    nonEmpty(person.role) ||
    nonEmpty(person.full_name) ||
    nonEmpty(person.id_reference) ||
    nonEmpty(person.date_of_birth) ||
    nonEmpty(person.nationality) ||
    nonEmpty(person.notes),
  );

  if (rows.length === 0) return '';

  if (compactOnePage) {
    const compactRows = rows.map((person) => {
      const chips: string[] = [];
      if (nonEmpty(person.id_reference)) chips.push(`ID: ${escapeHtml(person.id_reference)}`);
      if (nonEmpty(person.date_of_birth)) chips.push(`DOB: ${escapeHtml(person.date_of_birth)}`);
      if (nonEmpty(person.nationality)) chips.push(`Nationality: ${escapeHtml(person.nationality)}`);

      return `<div class="person-row">
  <div class="person-head">
    <span class="person-role">${normalize(person.role)}</span>
    <span class="person-name">${normalize(person.full_name)}</span>
  </div>
  ${chips.length > 0 ? `<div class="person-meta">${chips.join(' <span class="sep">|</span> ')}</div>` : ''}
  ${nonEmpty(person.notes) ? `<div class="person-notes">${escapeHtml(person.notes)}</div>` : ''}
</div>`;
    }).join('');

    return `
<section class="section ${cssClass} compact-section people-compact-section">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <div class="people-compact-list">${compactRows}</div>
</section>`;
  }

  const tableRows = rows
    .map((person) => `<tr>
  <td>${normalize(person.role)}</td>
  <td>${normalize(person.full_name)}</td>
  <td>${normalize(person.id_reference)}</td>
  <td>${normalize(person.date_of_birth)}</td>
  <td>${normalize(person.nationality)}</td>
  <td>${normalize(person.notes)}</td>
</tr>`)
    .join('');

  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <table class="grid-table">
    <thead>
      <tr>
        <th>Role</th>
        <th>Name</th>
        <th>ID Reference</th>
        <th>Date of Birth</th>
        <th>Nationality</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</section>`;
}

function renderLineList(title: string, lines: string[], cssClass: string): string {
  const valid = (lines ?? []).map((line) => normalizeWhitespace(line)).filter(Boolean);
  if (valid.length === 0) return '';

  const listItems = valid.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `
<section class="section ${cssClass}">
  <h2 class="section-title">${escapeHtml(title)}</h2>
  <ul class="line-list">${listItems}</ul>
</section>`;
}

function renderCompactNotesSection(data: CivilRecordGeneral): string {
  const annotationLines = (data.annotations_marginal_notes ?? [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .map((line) => `Annotation: ${line}`);
  const noteLines = (data.documentary_notes ?? [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .map((line) => `Documentary note: ${line}`);

  const lines = [...annotationLines, ...noteLines];
  if (lines.length === 0) return '';

  return renderLineList('Annotations and Documentary Notes', lines, 'notes-combined compact-section');
}

function renderJudgmentSection(data: CivilRecordGeneral, compactOnePage: boolean): string {
  if (!data.judgment_or_order) return '';

  const block = data.judgment_or_order;
  const hasAnyValue =
    nonEmpty(block.court_name) ||
    nonEmpty(block.judge_name) ||
    nonEmpty(block.case_number) ||
    nonEmpty(block.decision_date) ||
    nonEmpty(block.effective_date) ||
    nonEmpty(block.operative_text);

  if (!hasAnyValue) return '';

  const metadataRows: Array<[string, string | undefined | null]> = [
    ['Court', block.court_name],
    ['Judge', block.judge_name],
    ['Case Number', block.case_number],
    ['Decision Date', block.decision_date],
    ['Effective Date', block.effective_date],
  ];

  const metadataSection = renderKvSection(
    'Judgment / Order Metadata',
    metadataRows,
    'judgment-metadata',
    compactOnePage,
  );

  const operative = nonEmpty(block.operative_text)
    ? `<div class="judgment-operative">${escapeHtml(block.operative_text)}</div>`
    : '';

  return `
<section class="section judgment-section${compactOnePage ? ' compact-section' : ''}">
  <h2 class="section-title">Judgment / Order Section</h2>
  ${metadataSection}
  ${operative}
</section>`;
}

function renderCertificationFooter(data: CivilRecordGeneral, compactOnePage: boolean): string {
  const footer = data.certification_footer;
  return renderKvSection(
    compactOnePage ? 'Certification and Footer (Compact)' : 'Certification and Footer',
    [
      ['Certification Text', footer.certification_text],
      ['Issuer Name', footer.issuer_name],
      ['Issuer Role', footer.issuer_role],
      ['Issue Date', footer.issue_date],
      ['Issue Location', footer.issue_location],
      ['Seal Reference', footer.seal_reference],
      ['Signature Line', footer.signature_line],
      ['Validation Code', footer.validation_code],
      ['Validation URL', footer.validation_url],
      ['Footer Notes', footer.footer_notes],
    ],
    'certification-footer',
    compactOnePage,
  );
}

function renderVisualElements(elements: VisualElement[] | undefined, compactOnePage: boolean): string {
  if (!elements || elements.length === 0) return '';

  if (compactOnePage) {
    const items = elements.map((el) => {
      const type = normalizeWhitespace(el.type) || 'other_official_mark';
      const description = normalizeWhitespace(el.description);
      const text = nonEmpty(el.text);
      const page = nonEmpty(el.page);

      const segments = [
        `<span class="mark-type">${escapeHtml(type)}</span>`,
        description ? `<span class="mark-desc">${escapeHtml(description)}</span>` : '',
        text ? `<span class="mark-text">${escapeHtml(text)}</span>` : '',
        page ? `<span class="mark-page">p.${escapeHtml(page)}</span>` : '',
      ].filter(Boolean);

      return `<li>${segments.join(' <span class="sep">|</span> ')}</li>`;
    }).join('');

    return `
<section class="section marks-section compact-section">
  <h2 class="section-title">Documentary Marks</h2>
  <ul class="line-list marks-compact-list">${items}</ul>
</section>`;
  }

  const rows = elements
    .map((el) => {
      const type = escapeHtml(el.type ?? 'other_official_mark');
      const description = escapeHtml(el.description ?? '');
      const text = nonEmpty(el.text);
      const page = nonEmpty(el.page);
      return `<tr>
  <td>${type}</td>
  <td>${description}${text ? ` - <em>${escapeHtml(text)}</em>` : ''}</td>
  <td>${page ? escapeHtml(page) : ''}</td>
</tr>`;
    })
    .join('');

  return `
<section class="section marks-section">
  <h2 class="section-title">Documentary Marks</h2>
  <table class="grid-table marks-table">
    <thead><tr><th>Type</th><th>Description</th><th>Page</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildCss(
  orientation: 'portrait' | 'landscape',
  style: 'certificate_style' | 'registry_extract_style' | 'judgment_order_style',
): string {
  const pageRule =
    orientation === 'landscape'
      ? '@page { size: letter landscape; }'
      : '@page { size: letter portrait; }';

  const titleColor =
    style === 'judgment_order_style'
      ? '#0f172a'
      : style === 'registry_extract_style'
        ? '#1f2937'
        : '#111827';

  const headerBackground =
    style === 'registry_extract_style'
      ? '#f8fafc'
      : style === 'judgment_order_style'
        ? '#f9fafb'
        : '#ffffff';

  return `
${pageRule}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  color: #111827;
  font-size: 10pt;
  line-height: 1.3;
}
.document {
  width: 100%;
  padding: 0.02in;
}
.document.compact-one-page {
  font-size: 9.2pt;
  line-height: 1.2;
}
.doc-header {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: ${headerBackground};
}
.authority { font-weight: 700; font-size: 10.2pt; letter-spacing: 0.14px; }
.registry, .jurisdiction { font-size: 8.6pt; color: #374151; margin-top: 2px; }
.title-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; margin-top: 6px; }
.title { font-size: 11.6pt; letter-spacing: 0.38px; font-weight: 700; text-transform: uppercase; color: ${titleColor}; }
.subtype { font-size: 7.8pt; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 8px; font-weight: 700; color: #374151; }
.event-type { margin-top: 4px; font-size: 8.6pt; }
.rule { border-top: 1px solid #111827; margin-top: 6px; }

.section {
  margin-top: 7px;
  break-inside: auto;
  page-break-inside: auto;
}
.document.compact-one-page .section {
  margin-top: 5px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 8.7pt;
  letter-spacing: 0.55px;
  text-transform: uppercase;
  color: #1f2937;
  font-weight: 700;
}

.kv-table, .grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
}
.kv-table th, .kv-table td, .grid-table th, .grid-table td {
  border: 0.8px solid #d1d5db;
  padding: 3px 5px;
  vertical-align: top;
}
.kv-table th, .grid-table th {
  background: #f9fafb;
  text-align: left;
  font-weight: 700;
}
.kv-table th { width: 31%; }

tr { break-inside: avoid; page-break-inside: avoid; }

.compact-kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}
.document.compact-one-page .compact-kv-grid {
  gap: 3px;
}
.compact-kv-item {
  border: 0.8px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 5px;
  background: #fcfcfd;
  min-width: 0;
}
.kv-label {
  display: block;
  font-size: 7.2pt;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4b5563;
  font-weight: 700;
  margin-bottom: 2px;
}
.kv-value {
  display: block;
  font-size: 8.5pt;
  color: #111827;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.summary-box {
  border: 1px solid #d1d5db;
  background: #fcfcfd;
  border-radius: 6px;
  padding: 6px 8px;
  white-space: pre-wrap;
}

.people-compact-list {
  border: 0.8px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
}
.person-row {
  padding: 5px 7px;
  border-bottom: 0.8px solid #e5e7eb;
}
.person-row:last-child { border-bottom: none; }
.person-head {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.9fr);
  gap: 6px;
}
.person-role {
  font-size: 7.4pt;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  color: #4b5563;
  font-weight: 700;
}
.person-name {
  font-size: 8.7pt;
  color: #111827;
  font-weight: 700;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.person-meta {
  margin-top: 2px;
  font-size: 7.8pt;
  color: #374151;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.person-notes {
  margin-top: 2px;
  font-size: 7.7pt;
  color: #334155;
  white-space: pre-wrap;
}
.sep { color: #9ca3af; }

.line-list {
  margin: 0;
  padding-left: 16px;
  font-size: 8.2pt;
}
.line-list li {
  margin: 0 0 3px;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.document.compact-one-page .line-list li { margin: 0 0 2px; }

.judgment-section .judgment-metadata { margin-top: 4px; }
.judgment-operative {
  margin-top: 5px;
  border: 0.8px solid #d1d5db;
  border-left: 2px solid #6b7280;
  border-radius: 4px;
  padding: 6px 7px;
  white-space: pre-wrap;
}

.marks-table em { color: #374151; font-style: italic; }
.marks-compact-list .mark-type {
  text-transform: uppercase;
  font-weight: 700;
  font-size: 7.1pt;
  color: #374151;
}
`; 
}

export function renderCivilRecordGeneralHtml(
  data: CivilRecordGeneral,
  options: CivilRecordGeneralRenderOptions = {},
): string {
  const prepared = prepareCivilRecordGeneralForRender(data, {
    targetPageCount: options.pageCount,
  });
  const normalizedData = prepared.data;

  const style = inferStyle(normalizedData);
  const orientation =
    options.orientation && options.orientation !== 'unknown'
      ? options.orientation
      : normalizedData.orientation !== 'unknown'
        ? normalizedData.orientation
        : 'portrait';

  const compactOnePage = prepared.compactOnePage;

  const html = [
    renderHeader(normalizedData, style),
    renderMetadataSection(normalizedData, compactOnePage),
    renderEventSummary(normalizedData, compactOnePage),
    renderEventPersonData(normalizedData, compactOnePage),
    renderPeopleTable('Primary Parties', normalizedData.parties, 'parties-section', compactOnePage),
    renderPeopleTable(
      'Parent / Spouse / Witness Data',
      normalizedData.parent_spouse_witness_data,
      'related-parties-section',
      compactOnePage,
    ),
    compactOnePage
      ? renderCompactNotesSection(normalizedData)
      : renderLineList(
          'Annotations and Marginal Notes',
          normalizedData.annotations_marginal_notes,
          'annotations-section',
        ),
    compactOnePage
      ? ''
      : renderLineList('Documentary Notes', normalizedData.documentary_notes, 'notes-section'),
    renderJudgmentSection(normalizedData, compactOnePage),
    renderCertificationFooter(normalizedData, compactOnePage),
    renderVisualElements(normalizedData.visual_elements, compactOnePage),
  ]
    .filter(Boolean)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(nonEmpty(normalizedData.document_title) ?? 'Civil Record')}</title>
  <style>${buildCss(orientation, style)}</style>
</head>
<body>
  <main class="document ${compactOnePage ? 'compact-one-page' : 'standard-mode'}">${html}</main>
</body>
</html>`;
}
