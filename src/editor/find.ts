import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

export const setFindMatches = StateEffect.define<{ ranges: { from: number; to: number }[]; current: number }>();

export const findHighlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setFindMatches)) {
        const { ranges, current } = effect.value;
        decorations = Decoration.set(ranges.filter(r => r.to > r.from).map((r, i) =>
          Decoration.mark({ class: i === current ? 'cm-find-current' : 'cm-find-match' }).range(r.from, r.to)), true);
      }
    }
    return decorations;
  },
  provide: field => EditorView.decorations.from(field)
});
