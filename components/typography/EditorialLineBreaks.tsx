export function EditorialLineBreaks({ text }: { text: string }) {
  const commas = Array.from(text.matchAll(/[，,]/gu));
  if (!commas.length) return text;
  const middle = text.length / 2;
  const selected = commas.reduce((best, current) =>
    Math.abs((current.index ?? 0) - middle) < Math.abs((best.index ?? 0) - middle)
      ? current : best,
  );
  const splitAt = (selected.index ?? 0) + selected[0].length;
  return <span aria-label={text}><span aria-hidden="true">{text.slice(0, splitAt)}<br />{text.slice(splitAt).replace(/^\s+/u, "")}</span></span>;
}
