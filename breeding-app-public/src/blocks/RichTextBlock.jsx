import React from 'react';
import SectionShell from './SectionShell.jsx';

/**
 * Structured prose. There is deliberately no raw-HTML escape hatch here: the
 * legal pages are the longest content on the site and the most likely to be
 * pasted in from elsewhere, which is precisely why they should not be able to
 * carry arbitrary markup into the page. Anything the node types below cannot
 * express needs a new node type, not a <div dangerouslySetInnerHTML>.
 *
 * Node shapes:
 *   { type: 'h2' | 'h3', text }
 *   { type: 'p', spans: [...] }
 *   { type: 'ul' | 'ol', items: [ spans, spans, ... ] }
 *   { type: 'table', head: [ text, ... ], rows: [ [ spans, ... ], ... ] }
 *
 * A `spans` value is a string, or an array whose entries are strings or:
 *   { text, bold?, italic?, href?, fill? }   inline run
 *   { br: true }                             line break
 *
 * `fill` marks an unfinished placeholder (company name, address) so it renders
 * highlighted and is impossible to miss on a page that has gone live.
 */

function Span({ span }) {
  if (typeof span === 'string') return <>{span}</>;
  if (!span) return null;
  if (span.br) return <br />;

  let node = <>{span.text}</>;
  if (span.bold) node = <strong>{node}</strong>;
  if (span.italic) node = <em>{node}</em>;
  if (span.fill) node = <span className="legal-fill">{node}</span>;
  if (span.href) {
    const external = /^(https?:|mailto:|tel:)/i.test(span.href);
    node = (
      <a href={span.href} {...(external && !/^(mailto:|tel:)/i.test(span.href) ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {node}
      </a>
    );
  }
  return node;
}

function Spans({ value }) {
  const list = Array.isArray(value) ? value : [value];
  return (
    <>
      {list.map((span, i) => (
        <Span key={i} span={span} />
      ))}
    </>
  );
}

function Node({ node }) {
  if (!node) return null;

  switch (node.type) {
    case 'h2':
      return <h2>{node.text}</h2>;
    case 'h3':
      return <h3>{node.text}</h3>;
    case 'p':
      return <p><Spans value={node.spans} /></p>;
    case 'ul':
      return (
        <ul>
          {(node.items || []).map((item, i) => (
            <li key={i}><Spans value={item} /></li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol>
          {(node.items || []).map((item, i) => (
            <li key={i}><Spans value={item} /></li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="legal-scroll">
          <table>
            {(node.head || []).length > 0 && (
              <thead>
                <tr>{node.head.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {(node.rows || []).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j}><Spans value={cell} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      if (import.meta.env.DEV) {
        console.warn(`[RichTextBlock] Unknown node type "${node.type}" — skipped.`);
      }
      return null;
  }
}

/** Just the prose, for callers that already provide their own shell. */
export function RichTextNodes({ nodes = [] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Node key={i} node={node} />
      ))}
    </>
  );
}

export default function RichTextBlock({
  background = 'soft',
  label,
  title,
  subtitle,
  align = 'left',
  nodes = [],
}) {
  return (
    <SectionShell background={background} label={label} title={title} subtitle={subtitle}>
      <div className="prose" style={{ textAlign: align }}>
        <RichTextNodes nodes={nodes} />
      </div>
    </SectionShell>
  );
}
