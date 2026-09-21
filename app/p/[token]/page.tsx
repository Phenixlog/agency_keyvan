import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandBoard } from "@/components/brand/BrandBoard";
import { PrintButton } from "@/components/brand/BoardActions";
import { LogoMark } from "@/components/brand/Logo";
import { loadPublicBoard } from "@/lib/brand-board";
import { brandStyle } from "@/lib/tokens";

export const dynamic = "force-dynamic";

// A shared board is for the people who were given the link, not for search engines.
export const metadata: Metadata = { title: "Planche de marque", robots: { index: false, follow: false } };

export default async function PublicBoard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const board = await loadPublicBoard(token);
  // Unknown, malformed and revoked links all look the same from outside.
  if (!board) notFound();

  return (
    <main className="min-h-screen p-4 md:p-8 print:p-0" style={brandStyle(board.color) as CSSProperties}>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 rounded-shell bg-shell p-4 md:p-6 print:rounded-none print:p-0">
        <div className="flex items-center justify-between gap-4 px-2 print:hidden">
          <span className="font-mono text-meta text-mute">Planche de marque · lecture seule</span>
          <PrintButton />
        </div>
        <BrandBoard board={board} />
        <footer className="flex items-center justify-center gap-2 py-4 font-mono text-meta text-mute">
          <LogoMark size={20} /> Planche réalisée avec Brand OS
        </footer>
      </div>
    </main>
  );
}
