import { redirect } from 'next/navigation';

// The Marketplace tab was merged into Shop. Preserve any incoming projectId
// so existing bookmarks/links land in Project mode of the Shop page.
export default function MarketplaceRedirect({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  const projectId = searchParams?.projectId;
  redirect(projectId ? `/dashboard/shop?projectId=${projectId}` : '/dashboard/shop');
}
