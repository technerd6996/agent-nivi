import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Agent Nivi - an SRE Triage Agent',
  description: 'Automated SRE incident triage agent. Paste error codes, metrics, or stack traces to classify severity, correlate corporate knowledge base SOPs, and execute step-by-step remediation procedures.',
  keywords: ['Agent Nivi', 'SRE triage', 'IT triage', 'incident response', 'SRE assistant', 'error classifier', 'knowledge base automation', 'runbook executor'],
  authors: [{ name: 'Enterprise SRE Platform Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
