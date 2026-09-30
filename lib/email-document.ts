export type EmailColorScheme = 'dark' | 'light';

/** Wrap email-safe markup with an explicit client color-scheme preference. */
export function emailDocument(
  innerHtml: string,
  bg = '#0B0B10',
  scheme: EmailColorScheme = 'dark'
): string {
  const foreground = scheme === 'dark' ? '#FFFFFF' : '#172033';
  const oppositeScheme = scheme === 'dark' ? 'light' : 'dark';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="${scheme}">
    <meta name="supported-color-schemes" content="${scheme}">
    <style>
      :root { color-scheme:${scheme}; supported-color-schemes:${scheme}; }
      body { margin:0; padding:0; background-color:${bg} !important; color:${foreground} !important; }
      @media (prefers-color-scheme: ${oppositeScheme}) {
        :root { color-scheme:${scheme} !important; supported-color-schemes:${scheme} !important; }
        body { background-color:${bg} !important; color:${foreground} !important; }
      }
    </style>
  </head>
  <body bgcolor="${bg}" text="${foreground}" style="color-scheme:${scheme};background-color:${bg};color:${foreground};margin:0;padding:0;">
    ${innerHtml}
  </body>
</html>`;
}
