import * as React from 'react';
import MarkdownDocs from 'docs/src/modules/components/MarkdownDocs';
import * as pageProps from 'docsx/data/migration/migration-data-grid-v7/migration-data-grid-v7.md?muiMarkdown';

export default function Page() {
  return <MarkdownDocs {...pageProps} />;
}
