// Figma component dump — paste the body of this file into the `use_figma` MCP tool
// (file key c9ds9j1tM48XCIvCDrIQKc, after loading the figma:figma-use skill) with
// the ids you want in the list at the bottom (Components page 2:4; ids in the
// Handoff/Components pages). Keep ≤4 component sets per call: the tool caps the
// return value at 20 KB. Not executed by Node — it is a Figma Plugin API script.
//
// Line format:
//   name TYPE WxH [H|V pad t,r,b,l gap n primary/counter] [sizing] fill:@token
//        stroke:@token/weight rN fx:style opN ts:type/style "text"
// TYPE: C component, F frame, I instance<main component>, T text, R rectangle,
// E ellipse. Sizing (children): first letter horizontal, second vertical —
// F fill, H hug, X fixed. `@token` is a Figma variable name = a key in this
// package (action/primary → CSS --color-action-primary, RN light.actionPrimary).
// `fill:@bg/media-scrim 55%` = paint opacity on top of the token.
const page = await figma.getNodeByIdAsync('2:4'); await figma.setCurrentPageAsync(page);
const vcache = {}; const vn = async id => { if (!vcache[id]) { const v = await figma.variables.getVariableByIdAsync(id); vcache[id] = v ? v.name : '?'; } return vcache[id]; };
const scache = {}; const sn = async id => { if (!scache[id]) { const s = await figma.getStyleByIdAsync(id); scache[id] = s ? s.name : '?'; } return scache[id]; };
const h = x => Math.round(x * 255).toString(16).padStart(2, '0');
const paint = async p => { if (!p || p.visible === false) return null; if (p.type === 'SOLID') { const b = p.boundVariables && p.boundVariables.color; return (b ? '@' + await vn(b.id) : '#' + h(p.color.r) + h(p.color.g) + h(p.color.b)) + (p.opacity < 1 ? ' ' + Math.round(p.opacity * 100) + '%' : ''); } return p.type; };
const dump = async (n, d) => {
  const parts = [n.name.replace(/\s+/g, ' '), n.type[0] + (n.type === 'INSTANCE' && n.mainComponent ? '<' + n.mainComponent.name + '>' : ''), Math.round(n.width) + 'x' + Math.round(n.height)];
  if (n.visible === false) parts.push('hidden');
  if (n.layoutMode && n.layoutMode !== 'NONE') parts.push(n.layoutMode[0] + ' pad' + [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join(',') + ' gap' + n.itemSpacing + ' ' + (n.primaryAxisAlignItems || '') + '/' + (n.counterAxisAlignItems || ''));
  if ('layoutSizingHorizontal' in n && d > 0) parts.push(n.layoutSizingHorizontal[0] + n.layoutSizingVertical[0]);
  if ('fills' in n && Array.isArray(n.fills)) { const f = []; for (const p of n.fills) { const s = await paint(p); if (s) f.push(s); } if (f.length) parts.push('fill:' + f.join('+')); }
  if ('strokes' in n && n.strokes.length) { const s = await paint(n.strokes[0]); if (s) parts.push('stroke:' + s + '/' + n.strokeWeight); }
  if ('cornerRadius' in n && n.cornerRadius && n.cornerRadius !== figma.mixed) parts.push('r' + n.cornerRadius);
  if ('effectStyleId' in n && n.effectStyleId) parts.push('fx:' + await sn(n.effectStyleId));
  if (n.opacity !== undefined && n.opacity < 1) parts.push('op' + Math.round(n.opacity * 100));
  if (n.type === 'TEXT') { parts.push(n.textStyleId && n.textStyleId !== figma.mixed ? 'ts:' + await sn(n.textStyleId) : 'ts:none'); parts.push('"' + n.characters.slice(0, 30) + '"'); }
  let line = '  '.repeat(d) + parts.join(' ');
  if ('children' in n && n.type !== 'INSTANCE' && n.type !== 'BOOLEAN_OPERATION' && n.type !== 'VECTOR') for (const c of n.children) line += '\n' + await dump(c, d + 1);
  return line;
};
const out = [];
for (const id of ['14:123', '14:166']) { const set = await figma.getNodeByIdAsync(id); out.push('## ' + set.name); if (set.type === 'COMPONENT_SET') { for (const v of set.children) out.push(await dump(v, 0)); } else out.push(await dump(set, 0)); }
return out.join('\n');
