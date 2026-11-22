// Shared SVG icons from Tabler Icons (https://tabler.io/icons)
// @tabler/icons v3.52.0, MIT license, (c) Pawel Kuna - self-hosted for offline use.
// Regenerate rather than hand-editing path data.

import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
}

function icon(children: ReactNode, size: number) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlusIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </>,
    size
  );
}

export function ChevronRightIcon({ size = 24 }: IconProps) {
  return icon(
    <path d="M9 6l6 6l-6 6" />,
    size
  );
}

export function ChevronLeftIcon({ size = 24 }: IconProps) {
  return icon(
    <path d="M15 6l-6 6l6 6" />,
    size
  );
}

export function ChevronUpIcon({ size = 24 }: IconProps) {
  return icon(
    <path d="M6 15l6 -6l6 6" />,
    size
  );
}

export function ChevronDownIcon({ size = 24 }: IconProps) {
  return icon(
    <path d="M6 9l6 6l6 -6" />,
    size
  );
}

export function ReplaceIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M3 4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M15 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M21 11v-3a2 2 0 0 0 -2 -2h-6l3 3m0 -6l-3 3" />
      <path d="M3 13v3a2 2 0 0 0 2 2h6l-3 -3m0 6l3 -3" />
    </>,
    size
  );
}

export function KeyboardIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M2 8a2 2 0 0 1 2 -2h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2l0 -8" />
      <path d="M6 10l0 .01" />
      <path d="M10 10l0 .01" />
      <path d="M14 10l0 .01" />
      <path d="M18 10l0 .01" />
      <path d="M6 14l0 .01" />
      <path d="M18 14l0 .01" />
      <path d="M10 14l4 .01" />
    </>,
    size
  );
}

export function EncryptedIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
      <path d="M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M12 12l0 2.5" />
    </>,
    size
  );
}

export function DeleteIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M4 7l16 0" />
      <path d="M10 11l0 6" />
      <path d="M14 11l0 6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </>,
    size
  );
}

export function HistoryIcon({ size = 16 }: IconProps) {
  return icon(
    <>
      <path d="M12 8l0 4l2 2" />
      <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
    </>,
    size
  );
}

export function CopyIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" />
      <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
    </>,
    size
  );
}

export function UndoIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </>,
    size
  );
}

export function RedoIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M15 14l4 -4l-4 -4" />
      <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
    </>,
    size
  );
}

export function TaskListIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M3.5 5.5l1.5 1.5l2.5 -2.5" />
      <path d="M3.5 11.5l1.5 1.5l2.5 -2.5" />
      <path d="M3.5 17.5l1.5 1.5l2.5 -2.5" />
      <path d="M11 6l9 0" />
      <path d="M11 12l9 0" />
      <path d="M11 18l9 0" />
    </>,
    size
  );
}

export function BulletListIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M9 6l11 0" />
      <path d="M9 12l11 0" />
      <path d="M9 18l11 0" />
      <path d="M5 6l0 .01" />
      <path d="M5 12l0 .01" />
      <path d="M5 18l0 .01" />
    </>,
    size
  );
}

export function NumberedListIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M11 6h9" />
      <path d="M11 12h9" />
      <path d="M12 18h8" />
      <path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4" />
      <path d="M6 10v-6l-2 2" />
    </>,
    size
  );
}

export function BoldIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6l0 -7" />
      <path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7" />
    </>,
    size
  );
}

export function ItalicIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M11 5l6 0" />
      <path d="M7 19l6 0" />
      <path d="M14 5l-4 14" />
    </>,
    size
  );
}

export function CodeIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M7 8l-4 4l4 4" />
      <path d="M17 8l4 4l-4 4" />
      <path d="M14 4l-4 16" />
    </>,
    size
  );
}

export function CodeBlockIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M14.5 4h2.5a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3v-5" />
      <path d="M6 5l-2 2l2 2" />
      <path d="M10 9l2 -2l-2 -2" />
    </>,
    size
  );
}

export function QuoteIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M10 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5" />
      <path d="M19 11h-4a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h3a1 1 0 0 1 1 1v6c0 2.667 -1.333 4.333 -4 5" />
    </>,
    size
  );
}

export function LinkIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M9 15l6 -6" />
      <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" />
      <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463" />
    </>,
    size
  );
}

export function DownloadIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
      <path d="M7 11l5 5l5 -5" />
      <path d="M12 4l0 12" />
    </>,
    size
  );
}

export function CloseIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </>,
    size
  );
}

export function CheckIcon({ size = 14 }: IconProps) {
  return icon(
    <path d="M5 12l5 5l10 -10" />,
    size
  );
}

export function SortIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M3 9l4 -4l4 4m-4 -4v14" />
      <path d="M21 15l-4 4l-4 -4m4 4v-14" />
    </>,
    size
  );
}

export function TransferIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M17 3l0 18" />
      <path d="M10 18l-3 3l-3 -3" />
      <path d="M7 21l0 -18" />
      <path d="M20 6l-3 -3l-3 3" />
    </>,
    size
  );
}

export function ArticleIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
      <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
      <path d="M3 6l0 13" />
      <path d="M12 6l0 13" />
      <path d="M21 6l0 13" />
    </>,
    size
  );
}

export function CircleIcon({ size = 14 }: IconProps) {
  return icon(
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />,
    size
  );
}

export function LoaderCircleIcon({ size = 14 }: IconProps) {
  return icon(
    <path d="M12 3a9 9 0 1 0 9 9" />,
    size
  );
}

export function CircleAlertIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>,
    size
  );
}

export function RestoreIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M3.06 13a9 9 0 1 0 .49 -4.087" />
      <path d="M3 4.001v5h5" />
      <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    </>,
    size
  );
}

export function TrashXIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M4 7h16" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
      <path d="M10 12l4 4m0 -4l-4 4" />
    </>,
    size
  );
}

export function TagIcon({ size = 24 }: IconProps) {
  return icon(
    <>
      <path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3" />
    </>,
    size
  );
}

export function RefreshIcon({ size = 14 }: IconProps) {
  return icon(
    <>
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </>,
    size
  );
}
